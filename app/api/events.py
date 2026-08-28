from fastapi import APIRouter, Depends, HTTPException, Header, Request
from sqlalchemy.orm import Session
from pydantic import BaseModel
import uuid
from datetime import date, datetime
from zoneinfo import ZoneInfo
from sqlalchemy import func
import secrets
import time
import json
from collections import defaultdict
from typing import List, Optional
import redis

from app.core import hashing
from app.db import crud, models
from app.db.database import get_db

redis_client = redis.Redis(host='localhost', port=6379, db=0, decode_responses=True)

IST = ZoneInfo("Asia/Kolkata")
router = APIRouter()

rate_limit_records = defaultdict(list)

def check_rate_limit(request: Request):
    client_ip = request.client.host
    current_time = time.time()
    
    rate_limit_records[client_ip] = [
        ts for ts in rate_limit_records[client_ip] 
        if current_time - ts < 3600
    ]
    
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
    complaints: Optional[str] = None
    diagnosis: Optional[str] = None
    tests_suggested: Optional[str] = None

class StartVisitRequest(BaseModel):
    phone: str
    member_id: int = 0
    clinic_id: uuid.UUID
    name: str = "Walk-in Patient"
    city: Optional[str] = None
    is_appointment: bool = False # NEW FIELD

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
    
    if not x_patient_id:
        check_rate_limit(request)
    
    try:
        phone = payload.phone
        member_id = payload.member_id
        clinic_salt = str(clinic.clinic_salt)
        
        patient_id_to_return: str | None = None
        user_salt: str | None = None
        network_token: str | None = None
        
        if x_patient_id:
            patient = crud.get_patient_by_id(db, x_patient_id)
            if patient:
                user_salt = str(patient.user_salt)
                network_token = hashing.generate_network_token(phone, member_id, user_salt)
        
        if not user_salt:
            lookup_hash = hashing.generate_lookup_hash(phone, member_id)
            patient = crud.get_patient_by_lookup(db, lookup_hash)
            
            if patient:
                user_salt = str(patient.user_salt)
                patient_id_to_return = str(patient.patient_id) 
                network_token = hashing.generate_network_token(phone, member_id, user_salt)
            else:
                user_salt = hashing.generate_user_salt()
                patient_id_to_return = secrets.token_hex(16)
                network_token = hashing.generate_network_token(phone, member_id, user_salt)
                
                crud.create_patient(
                    db=db, 
                    patient_id=patient_id_to_return, 
                    lookup_hash=lookup_hash, 
                    user_salt=user_salt, 
                    network_token=network_token,
                    city=payload.city
                )

        if not network_token:
            raise HTTPException(status_code=500, detail="Failed to generate network token")

        local_token = hashing.generate_local_token(phone, member_id, clinic_salt)

        try:
            redis_client.set(f"name:{local_token}", payload.name, ex=43200)
        except Exception:
            pass 

        payload.phone = "DELETED"
        phone = "DELETED"

        today = datetime.now(IST).date()
        
        # --- FOLLOW-UP CALCULATION LOGIC ---
        prefs_str = redis_client.get(f"clinic_prefs:{str(clinic.clinic_id)}")
        followup_days = 0
        if prefs_str:
            try:
                prefs = json.loads(prefs_str)
                followup_days = int(prefs.get("followup_days") or 0)
            except Exception:
                pass
                
        last_visit = db.query(models.Event).filter(
            models.Event.local_token == local_token,
            models.Event.status == "completed"
        ).order_by(models.Event.timestamp.desc()).first()

        visit_type = "appointment" if payload.is_appointment else "walkin"

        if last_visit and followup_days > 0:
            last_date = last_visit.timestamp.astimezone(IST).date()
            # Calendar day difference builds in a natural buffer until midnight of the Nth day
            if (today - last_date).days <= followup_days:
                visit_type = "followup"

        # --- EVENT CREATION ---
        today_event_count = db.query(models.Event).filter(
            models.Event.clinic_id == payload.clinic_id,
            func.date(models.Event.timestamp) == today
        ).count()
        assigned_token_number = today_event_count + 1
        
        new_event = crud.create_patient_event(
            db=db,
            clinic_id=payload.clinic_id,
            local_token=local_token,              
            network_token=network_token,
            daily_token_number=assigned_token_number
        )
        
        # Override the default "clinic_visit" string with our dynamic status
        new_event.event_type = visit_type
        db.commit()
        
        if not new_event:
            raise HTTPException(status_code=500, detail="Failed to create patient event")
        
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
        
        if patient_id_to_return:
            response_data["patient_id"] = patient_id_to_return
            
        return response_data

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/status/{local_token}")
def get_patient_status(local_token: str, db: Session = Depends(get_db)):
    try:
        today = datetime.now(IST).date()
        
        current_visit = db.query(models.Event).filter(
            models.Event.local_token == local_token,
            func.date(models.Event.timestamp) == today
        ).order_by(models.Event.timestamp.desc()).first()

        if not current_visit:
            return {"status": "Not Found", "people_ahead": 0}

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
            
            rx_text = f"*{c_name}*\n"
            rx_text += "-----------------------------------\n"
            rx_text += f"🩺 {d_name}\n"
            rx_text += f"📅 {date_str}\n\n"
            
            if current_visit.complaints:
                rx_text += "*C/E (Complaints):*\n"
                rx_text += f"{current_visit.complaints}\n\n"
            if current_visit.diagnosis:
                rx_text += "*DIAGNOSIS:*\n"
                rx_text += f"{current_visit.diagnosis}\n\n"
                
            if rx_list:
                rx_text += "*Rx / MEDICINES:*\n"
                for idx, rx in enumerate(rx_list, 1):
                    rx_text += f"*{idx}. {rx.medicine_name}*\n"
                    if rx.instructions:
                        rx_text += f"↳ _{rx.instructions}_\n"
                rx_text += "\n"
                
            if current_visit.tests_suggested:
                rx_text += "*TESTS SUGGESTED:*\n"
                rx_text += f"{current_visit.tests_suggested}\n\n"
            
            rx_text += "-----------------------------------\n"
            rx_text += "_Powered by Tap2Med_"
            
            return {
                "status": "Completed",
                "prescription_text": rx_text
            }

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
            raise HTTPException(status_code=404, detail="Active token not found")

        event.status = "completed" 
        
        event.complaints = payload.complaints.strip() if payload.complaints else None
        event.diagnosis = payload.diagnosis.strip() if payload.diagnosis else None
        event.tests_suggested = payload.tests_suggested.strip() if payload.tests_suggested else None

        for med in payload.medicines:
            if med.name.strip() != "":
                db.add(models.Prescription(
                    event_id=event.event_id, 
                    network_token=event.network_token, 
                    local_token=event.local_token, 
                    medicine_name=med.name, 
                    instructions=med.instructions, 
                    drug_category="MEDICINE", 
                    inferred_symptom="Not available in V0"
                ))

        db.commit()
        return {"status": "success", "message": "Patient visit completed"}

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/history/{local_token}")
def get_patient_history(local_token: str, db: Session = Depends(get_db)):
    try:
        past_visits = db.query(models.Event).filter(
            models.Event.local_token == local_token,
            models.Event.status == "completed" 
        ).order_by(models.Event.timestamp.desc()).all()    
         
        all_rx = db.query(models.Prescription).filter(
            models.Prescription.local_token == local_token
        ).all()

        try:
            patient_name = redis_client.get(f"name:{local_token}") or "Patient"
        except Exception:
            patient_name = "Patient"
            
        display_id = local_token[:8].upper()

        formatted_history = []
        for visit in past_visits:
            visit_id_str = str(visit.event_id)
            matched_rx = [
                {
                    "name": rx.medicine_name, 
                    "instructions": rx.instructions
                }
                for rx in all_rx if str(rx.event_id) == visit_id_str 
            ]

            formatted_history.append({
                "event_id": visit_id_str,   
                "timestamp": visit.timestamp.isoformat(),
                "weight": visit.patient_weight, 
                "complaints": visit.complaints,
                "diagnosis": visit.diagnosis,
                "tests_suggested": visit.tests_suggested,
                "prescriptions": matched_rx
            })

        return {
            "history": formatted_history,
            "patient_name": patient_name,
            "display_id": display_id
        }

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