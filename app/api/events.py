from fastapi import APIRouter, Depends, HTTPException, Header, Request
from sqlalchemy.orm import Session
from pydantic import BaseModel
import uuid
from datetime import date, datetime
from zoneinfo import ZoneInfo
from sqlalchemy import func
import secrets
import time
from collections import defaultdict

from app.core import hashing
from app.db import crud, models
from app.db.database import get_db
from typing import List, Optional

IST = ZoneInfo("Asia/Kolkata")
router = APIRouter()

#rate limiter

rate_limit_records = defaultdict(list)

def check_rate_limit(request: Request):
    client_ip = request.client.host
    current_time = time.time()
    
    # Clean up timestamps older than 1 hour (3600 seconds)
    rate_limit_records[client_ip] = [
        ts for ts in rate_limit_records[client_ip] 
        if current_time - ts < 3600
    ]
    
    # Check if they exceeded 5 requests in the last hour
    if len(rate_limit_records[client_ip]) >= 5:
        raise HTTPException(status_code=429, detail="Too many recovery attempts. Try again later.")
        
    rate_limit_records[client_ip].append(current_time)

class ScanRequest(BaseModel):
    phone: str
    member_id: int = 0
    clinic_id: uuid.UUID

class MedicineItem(BaseModel):
    name: str
    instructions: str

class CompleteRequest(BaseModel):
    local_token : str
    medicines: List[MedicineItem]=[]

class StartVisitRequest(BaseModel):
    phone: str
    member_id: int = 0
    clinic_id: uuid.UUID

@router.post("/visit/start")
def start_visit(
    payload: StartVisitRequest, 
    request: Request,
    db: Session = Depends(get_db),
    x_patient_id: Optional[str] = Header(None)
):
    clinic = crud.get_clinic(db=db, clinic_id=payload.clinic_id)
    if not clinic:
        raise HTTPException(status_code=404, detail="Clinic not found")
    
    # Apply rate limiting ONLY if this is a lost-device recovery attempt (no X-Patient-ID header)
    if not x_patient_id:
        check_rate_limit(request)
    
    try:
        phone = payload.phone
        member_id = payload.member_id
        clinic_salt = str(clinic.clinic_salt)
        
        patient_id_to_return: str | None = None
        user_salt: str | None = None
        network_token: str | None = None
        
        # FLOW 1: RETURN VISIT, SAME DEVICE
        if x_patient_id:
            patient = crud.get_patient_by_id(db, x_patient_id)
            if patient:
                user_salt = str(patient.user_salt)
                network_token = hashing.generate_network_token(phone, member_id, user_salt)
        
        # If no valid patient found via header, check lookup hash
        if not user_salt:
            lookup_hash = hashing.generate_lookup_hash(phone, member_id)
            patient = crud.get_patient_by_lookup(db, lookup_hash)
            
            # FLOW 2: RETURN VISIT, LOST DEVICE
            if patient:
                user_salt = str(patient.user_salt)
                patient_id_to_return = str(patient.patient_id) 
                network_token = hashing.generate_network_token(phone, member_id, user_salt)
            
            # FLOW 3: NEW PATIENT
            else:
                user_salt = hashing.generate_user_salt()
                patient_id_to_return = secrets.token_hex(16)
                network_token = hashing.generate_network_token(phone, member_id, user_salt)
                
                # Save new patient to DB
                crud.create_patient(
                    db=db, 
                    patient_id=patient_id_to_return, 
                    lookup_hash=lookup_hash, 
                    user_salt=user_salt, 
                    network_token=network_token
                )

        if not network_token:
            raise HTTPException(status_code=500, detail="Failed to generate network token")

        # Generate local token for this specific clinic
        local_token = hashing.generate_local_token(phone, member_id, clinic_salt)

        # OVERWRITE PHONE IN MEMORY IMMEDIATELY
        payload.phone = "DELETED"
        phone = "DELETED"

        # Calculate Queue Number
        today = datetime.now(IST).date()
        today_event_count = db.query(models.Event).filter(
            models.Event.clinic_id == payload.clinic_id,
            func.date(models.Event.timestamp) == today
        ).count()
        assigned_token_number = today_event_count + 1
        
        # Create Event
        new_event = crud.create_patient_event(
            db=db,
            clinic_id=payload.clinic_id,
            local_token=local_token,              
            network_token=network_token,
            daily_token_number=assigned_token_number
        )
        
        if not new_event:
            raise HTTPException(status_code=500, detail="Failed to create patient event")
        
        # Calculate queue position
        ahead = db.query(models.Event).filter(
            models.Event.clinic_id == payload.clinic_id,
            func.date(models.Event.timestamp) == today,
            models.Event.status == "waiting",
            models.Event.timestamp < new_event.timestamp 
        ).count()
        
        response_data = {
            "queue_number": new_event.daily_token_number,
            "queue_position": ahead + 1,
            "local_token": local_token
        }
        
        # Only return patient_id if it's a new patient or a lost device recovery
        if patient_id_to_return:
            response_data["patient_id"] = patient_id_to_return
            
        return response_data

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/status/{local_token}")
def get_patient_status(local_token: str, db: Session = Depends(get_db)):
    """Called by the patient's phone to check their live wait time and get prescriptions."""
    try:
        today = datetime.now(IST).date()
        
        # Look for today's visit regardless of status
        current_visit = db.query(models.Event).filter(
            models.Event.local_token == local_token,
            func.date(models.Event.timestamp) == today
        ).order_by(models.Event.timestamp.desc()).first()

        if not current_visit:
            return {"status": "Not Found", "people_ahead": 0}

        # If completed, fetch the medicines and format the text for WhatsApp
        # If completed, fetch the medicines and format the text for WhatsApp
        if current_visit.status == "completed":
            rx_list = db.query(models.Prescription).filter(
                models.Prescription.event_id == current_visit.event_id
            ).all()
            
            clinic = db.query(models.Clinic).filter(
                models.Clinic.clinic_id == current_visit.clinic_id
            ).first()
            
            c_name = clinic.clinic_name.upper() if clinic else "CLINIC"
            d_name = clinic.doctor_name if clinic else "Doctor"
            date_str = datetime.now(IST).strftime("%d %b %Y")
            
            # Formatted Digital Receipt
            rx_text = f"*{c_name}*\n"
            rx_text += "-----------------------------------\n"
            rx_text += f"🩺 {d_name}\n"
            rx_text += f"📅 {date_str}\n\n"
            rx_text += "*YOUR PRESCRIPTION*\n\n"
            
            for idx, rx in enumerate(rx_list, 1):
                rx_text += f"*{idx}. {rx.medicine_name}*\n"
                if rx.instructions:
                    rx_text += f"↳ _{rx.instructions}_\n\n"
            
            rx_text += "-----------------------------------\n"
            rx_text += "_Powered by Tap2Med_"
            
            return {
                "status": "Completed",
                "prescription_text": rx_text
            }

        # If still waiting, calculate live queue position
        ahead = db.query(models.Event).filter(
            models.Event.clinic_id == current_visit.clinic_id,
            func.date(models.Event.timestamp) == today,
            models.Event.status == "waiting",
            models.Event.timestamp < current_visit.timestamp 
        ).count()

        return {
            "status": "In Queue",
            "token_number": current_visit.daily_token_number,  
            "your_position": ahead + 1,
            "people_ahead": ahead,
            "estimated_wait": f"{ahead * 10} mins"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/complete")
def complete_event(payload: CompleteRequest, db: Session = Depends(get_db)):
    try:
        today = datetime.now(IST).date()

        event = db.query(models.Event).filter(
            models.Event.local_token == payload.local_token,
            func.date(models.Event.timestamp) == today,
            models.Event.status == "waiting"
        ).first()

        if not event:
            raise HTTPException(
                status_code=404,
                detail="Active token not found"
            )

        event.status = "completed" 

        for med in payload.medicines:
            if med.name.strip() != "":
                new_rx = models.Prescription(
                    event_id=event.event_id,
                    network_token=event.network_token,
                    local_token=event.local_token,
                    medicine_name=med.name,
                    instructions=med.instructions,
                    inferred_symptom="Not available in V0",
                    drug_category="Not available in v0"
                )
                db.add(new_rx)

        db.commit()

        return {
            "status": "success",
            "message": "Patient visit completed"
        }

    except HTTPException:
        raise

    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=str(e)
        )

@router.get("/history/{local_token}")
def get_patient_history( local_token:str, db :Session =Depends(get_db)):
    
    try:
        past_visits = db.query(models.Event).filter(
            models.Event.local_token == local_token,
            models.Event.status == "completed" 
        ).order_by(models.Event.timestamp.desc()).all()    
         
        all_rx = db.query(models.Prescription).filter(
            models.Prescription.local_token == local_token
        ).all()

        formatted_history = []
        
        for visit in past_visits:
            visit_id_str = str(visit.event_id)

            matched_rx = [
                {
                    "name": rx.medicine_name,     
                    "instructions": rx.instructions
                }
                for rx in all_rx 
                if str(rx.event_id) == visit_id_str 
            ]

            formatted_history.append({
                "event_id": visit_id_str,   
                "timestamp": visit.timestamp.isoformat(),
                "weight": visit.patient_weight, 
                "prescriptions": matched_rx
            })

        return {"history": formatted_history}

    except Exception as e:       
        raise HTTPException(status_code=500, detail=str(e))

class WeightUpdate(BaseModel):
    local_token: str
    weight: str

@router.put("/weight")
def update_patient_weight(payload: WeightUpdate, db: Session = Depends(get_db)):
    try:
        today = datetime.now(IST).date()
        event = db.query(models.Event).filter(
            models.Event.local_token == payload.local_token,
            func.date(models.Event.timestamp) == today,
            models.Event.status == "waiting"
        ).first()

        if not event:
            raise HTTPException(status_code=404, detail="Active token not found")

        event.patient_weight = payload.weight
        db.commit()

        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))