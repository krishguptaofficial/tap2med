from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
import uuid
from datetime import datetime
from zoneinfo import ZoneInfo
from sqlalchemy import func

from app.core import security
from app.db import crud, models
from app.db.database import get_db

router = APIRouter()

IST = ZoneInfo("Asia/Kolkata")


class ClinicCreate(BaseModel):
    doctor_name: str
    clinic_name: str

@router.post("/")
def onboard_clinic(payload: ClinicCreate, db: Session = Depends(get_db)):
    try:
        new_clinic = crud.create_clinic(db=db, doctor_name=payload.doctor_name, clinic_name=payload.clinic_name)
        return {
            "status": "success",
            "clinic_id": new_clinic.clinic_id,
            "doctor": new_clinic.doctor_name
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/queue/{clinic_id}")
def get_clinic_queue(clinic_id: uuid.UUID, db: Session = Depends(get_db)):
    try:
        today = datetime.now(IST).date()
        
        queue = db.query(models.Event).filter(
            models.Event.clinic_id == clinic_id,
            func.date(models.Event.timestamp) == today,
            models.Event.status == "waiting"
        ).order_by(models.Event.timestamp.asc()).all()

        formatted_queue = [
            {
                "event_id": str(event.event_id), 
                "local_token": event.local_token,
                "daily_token_number": event.daily_token_number, 
                "status": event.status,
                "weight": event.patient_weight 
            } 
            for event in queue
        ]
        
        clinic = db.query(models.Clinic).filter(models.Clinic.clinic_id == clinic_id).first()

        safe_clinic_name = clinic.clinic_name if clinic else "Clinic"
        safe_doctor_name = clinic.doctor_name if clinic and hasattr(clinic, 'doctor_name') else "Dr. Sharma"

        return {
            "status": "success",
            "queue": formatted_queue,
            "clinic_name": safe_clinic_name,
            "doctor_name": safe_doctor_name
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

   

class RoleUpdate(BaseModel):
    role_type: str # 'reception' or 'pharmacy'
    username: str
    passcode: str

@router.put("/{clinic_id}/roles")
def update_clinic_roles(clinic_id: uuid.UUID, payload: RoleUpdate, db: Session = Depends(get_db)):
    clinic = db.query(models.Clinic).filter(models.Clinic.clinic_id == clinic_id).first()
    if not clinic:
        raise HTTPException(status_code=404, detail="Clinic not found")
    
    hashed_pin = security.hash_password(payload.passcode)
    
    if payload.role_type == "staff":
        clinic.staff_username = payload.username
        clinic.staff_passcode_hash = hashed_pin
    elif payload.role_type == "pharmacy":
        clinic.pharmacy_username = payload.username
        clinic.pharmacy_passcode_hash = hashed_pin
    else:
        raise HTTPException(status_code=400, detail="Invalid role type")
        
    db.commit()
    return {"status": "success"}