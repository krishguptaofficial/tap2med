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

from app.core import hashing
from app.db import crud, models
from app.db.database import get_db

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

class LookupRequest(BaseModel):
    phone: str
    member_id: int = 0
    clinic_id: uuid.UUID

class MedicineItem(BaseModel):
    name: str
    instructions: Optional[str] = None
    dosage: Optional[str] = None
    duration: Optional[str] = None

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
    is_appointment: bool = False

class CityUpdate(BaseModel):
    local_token: str
    city: str

class VitalsPayload(BaseModel):
    bp_sys: Optional[str] = None
    bp_dia: Optional[str] = None
    pr: Optional[str] = None
    wt: Optional[str] = None
    ht: Optional[str] = None
    temp: Optional[str] = None
    spo2: Optional[str] = None
    waist: Optional[str] = None
    hip: Optional[str] = None
    is_paid: Optional[bool] = False

class VitalsUpdate(BaseModel):
    local_token: str
    vitals: VitalsPayload

class LabRecordPayload(BaseModel):
    test_date: str 
    results: dict

class LabUpdatePayload(BaseModel):
    local_token: str
    lab_record: LabRecordPayload

@router.put("/city")
def update_patient_city(payload: CityUpdate, db: Session = Depends(get_db)):
    try:
        record = db.query(models.ClinicPatientRecord).filter(
            models.ClinicPatientRecord.local_token == payload.local_token
        ).first()
        
        if record:
            record.city = payload.city.strip()
            db.commit()

        return {"status": "success"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/lookup")
def lookup_patient(payload: LookupRequest, db: Session = Depends(get_db)):
    try:
        clinic = crud.get_clinic(db=db, clinic_id=payload.clinic_id)
        if not clinic:
            raise HTTPException(status_code=404, detail="Clinic not found")

        local_token = hashing.generate_local_token(payload.phone, payload.member_id, str(clinic.clinic_salt))

        record = db.query(models.ClinicPatientRecord).filter(
            models.ClinicPatientRecord.clinic_id == payload.clinic_id,
            models.ClinicPatientRecord.local_token == local_token
        ).first()

        if record:
            return {
                "found": True,
                "patient_name": record.patient_name,
                "city": record.city
            }
        
        return {"found": False}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

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
                    city=None
                )

        if not network_token:
            raise HTTPException(status_code=500, detail="Failed to generate network token")

        local_token = hashing.generate_local_token(phone, member_id, clinic_salt)

        record = db.query(models.ClinicPatientRecord).filter(
            models.ClinicPatientRecord.clinic_id == payload.clinic_id,
            models.ClinicPatientRecord.local_token == local_token
        ).first()

        if record:
            record.patient_name = payload.name
            if payload.city:
                record.city = payload.city.strip()
        else:
            new_record = models.ClinicPatientRecord(
                clinic_id=payload.clinic_id,
                local_token=local_token,
                patient_name=payload.name,
                city=payload.city.strip() if payload.city else None
            )
            db.add(new_record)
        
        db.commit()

        payload.phone = "DELETED"
        phone = "DELETED"

        now_ist = datetime.now(IST)
        today = now_ist.date()
        today_start = now_ist.replace(hour=0, minute=0, second=0, microsecond=0)
        today_end = now_ist.replace(hour=23, minute=59, second=59, microsecond=999999)
        
        followup_days = clinic.followup_days or 0
                
        last_visit = db.query(models.Event).filter(
            models.Event.local_token == local_token,
            models.Event.status == "completed"
        ).order_by(models.Event.timestamp.desc()).first()

        visit_type = "appointment" if payload.is_appointment else "walkin"

        if last_visit and followup_days > 0:
            last_date = last_visit.timestamp.astimezone(IST).date()
            if (today - last_date).days <= followup_days:
                visit_type = "followup"

        today_event_count = db.query(models.Event).filter(
            models.Event.clinic_id == payload.clinic_id,
            models.Event.timestamp >= today_start,
            models.Event.timestamp <= today_end
        ).count()
        assigned_token_number = today_event_count + 1
        
        new_event = crud.create_patient_event(
            db=db,
            clinic_id=payload.clinic_id,
            local_token=local_token,              
            network_token=network_token,
            daily_token_number=assigned_token_number
        )
        
        new_event.event_type = visit_type
        db.commit()
        
        if not new_event:
            raise HTTPException(status_code=500, detail="Failed to create patient event")
        
        ahead = db.query(models.Event).filter(
            models.Event.clinic_id == payload.clinic_id,
            models.Event.timestamp >= today_start,
            models.Event.timestamp <= today_end,
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
        now_ist = datetime.now(IST)
        today_start = now_ist.replace(hour=0, minute=0, second=0, microsecond=0)
        today_end = now_ist.replace(hour=23, minute=59, second=59, microsecond=999999)
        
        current_visit = db.query(models.Event).filter(
            models.Event.local_token == local_token,
            models.Event.timestamp >= today_start,
            models.Event.timestamp <= today_end
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
                    details = []
                    if rx.dosage: details.append(rx.dosage)
                    if rx.duration: details.append(rx.duration)
                    if rx.instructions: details.append(rx.instructions)
                    
                    if details:
                        rx_text += f"↳ _{' | '.join(details)}_\n"
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
            models.Event.timestamp >= today_start,
            models.Event.timestamp <= today_end,
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
        now_ist = datetime.now(IST)
        today_start = now_ist.replace(hour=0, minute=0, second=0, microsecond=0)
        today_end = now_ist.replace(hour=23, minute=59, second=59, microsecond=999999)

        event = db.query(models.Event).filter(
            models.Event.local_token == payload.local_token,
            models.Event.timestamp >= today_start,
            models.Event.timestamp <= today_end,
            models.Event.status.in_(["waiting", "completed"]) 
        ).first()

        if not event:
            raise HTTPException(status_code=404, detail="Active token not found")

        event.status = "completed" 
        
        event.complaints = payload.complaints.strip() if payload.complaints else None
        event.diagnosis = payload.diagnosis.strip() if payload.diagnosis else None
        event.tests_suggested = payload.tests_suggested.strip() if payload.tests_suggested else None

        db.query(models.Prescription).filter(models.Prescription.event_id == event.event_id).delete()

        for med in payload.medicines:
            if med.name.strip() != "":
                db.add(models.Prescription(
                    event_id=event.event_id, 
                    network_token=event.network_token, 
                    local_token=event.local_token, 
                    medicine_name=med.name, 
                    instructions=med.instructions,
                    dosage=med.dosage,
                    duration=med.duration,
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

        record = db.query(models.ClinicPatientRecord).filter(
            models.ClinicPatientRecord.local_token == local_token
        ).first()
        patient_name = record.patient_name if record else "Patient"
            
        display_id = local_token[:8].upper()

        formatted_history = []
        for visit in past_visits:
            visit_id_str = str(visit.event_id)
            
            matched_rx = []
            for rx in all_rx:
                if str(rx.event_id) == visit_id_str:
                    details = []
                    if rx.dosage: details.append(rx.dosage)
                    if rx.duration: details.append(rx.duration)
                    if rx.instructions: details.append(rx.instructions)
                    
                    matched_rx.append({
                        "name": rx.medicine_name,
                        "instructions": " | ".join(details) if details else "",
                        "dosage": rx.dosage,
                        "duration": rx.duration
                    })

            formatted_history.append({
                "event_id": visit_id_str,   
                "timestamp": visit.timestamp.isoformat(),
                "weight": visit.patient_weight,
                "vitals": visit.vitals,
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

@router.put("/vitals")
def update_patient_vitals(payload: VitalsUpdate, db: Session = Depends(get_db)):
    try:
        now_ist = datetime.now(IST)
        today_start = now_ist.replace(hour=0, minute=0, second=0, microsecond=0)
        today_end = now_ist.replace(hour=23, minute=59, second=59, microsecond=999999)
        
        event = db.query(models.Event).filter(
            models.Event.local_token == payload.local_token,
            models.Event.timestamp >= today_start,
            models.Event.timestamp <= today_end,
            models.Event.status == "waiting"
        ).first()

        if not event:
            raise HTTPException(status_code=404, detail="Active token not found")

        event.vitals = payload.vitals.model_dump(exclude_none=True)
        db.commit()

        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/labs")
def update_patient_labs(payload: LabUpdatePayload, db: Session = Depends(get_db)):
    try:
        record = db.query(models.ClinicPatientRecord).filter(
            models.ClinicPatientRecord.local_token == payload.local_token
        ).first()
        if not record:
            raise HTTPException(status_code=404, detail="Patient record not found")
            
        test_date_obj = datetime.strptime(payload.lab_record.test_date, "%Y-%m-%d").replace(tzinfo=IST)
        
        lab_record = db.query(models.ClinicPatientLabRecord).filter(
            models.ClinicPatientLabRecord.local_token == payload.local_token,
            func.date(models.ClinicPatientLabRecord.test_date) == test_date_obj.date()
        ).first()
        
        clean_results = {k: v for k, v in payload.lab_record.results.items() if v != ""}
        
        if lab_record:
            current_results = lab_record.results or {}
            current_results.update(clean_results)
            for k in list(current_results.keys()):
                if k not in clean_results and k in payload.lab_record.results:
                    del current_results[k]
            lab_record.results = current_results
        else:
            new_lab = models.ClinicPatientLabRecord(
                clinic_id=record.clinic_id,
                local_token=payload.local_token,
                test_date=test_date_obj,
                results=clean_results
            )
            db.add(new_lab)
            
        db.commit()
        return {"status": "success"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/labs/{local_token}")
def get_patient_labs(local_token: str, db: Session = Depends(get_db)):
    try:
        labs = db.query(models.ClinicPatientLabRecord).filter(
            models.ClinicPatientLabRecord.local_token == local_token
        ).order_by(models.ClinicPatientLabRecord.test_date.asc()).all()
        
        return {
            "status": "success",
            "labs": [
                {
                    "test_date": l.test_date.strftime("%Y-%m-%d"),
                    "results": l.results
                } for l in labs
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))