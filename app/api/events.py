# tap2med/app/api/events.py

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
import uuid
from datetime import date
from sqlalchemy import func

from app.core import hashing
from app.db import crud, models
from app.db.database import get_db

router = APIRouter()

class ScanRequest(BaseModel):
    phone: str
    member_id: int = 0
    clinic_id: uuid.UUID

class CompleteRequest(BaseModel):
    local_token: str

@router.post("/checkin")
def create_a_patient_checkin(payload: ScanRequest, db: Session = Depends(get_db)):
    clinic = crud.get_clinic(db=db, clinic_id=payload.clinic_id)
    if not clinic:
        raise HTTPException(status_code=404, detail="Clinic not found")
    
    try:
        tokens = hashing.generate_identity_tokens(
            phone=payload.phone,
            member_id=payload.member_id,
            clinic_salt=str(clinic.clinic_salt)
        )

        
        payload.phone = "DELETED"
        
        new_event = crud.create_patient_event(
            db=db,
            clinic_id=payload.clinic_id,
            local_token=tokens["local_token"],              
            network_token=tokens["network_token"],
        )
        
        return {
            "status": "success",
            "queue_number": 1, # Frontend handles display logic for V0
            "local_token": tokens["local_token"],
            "network_token": tokens["network_token"]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/status/{local_token}")
def get_patient_status(local_token: str, db: Session = Depends(get_db)):
    """Called by the patient's phone to check their live wait time."""
    try:
        today = date.today()
        
        current_visit = db.query(models.Event).filter(
            models.Event.local_token == local_token,
            func.date(models.Event.timestamp) == today,
            models.Event.status == "waiting"
        ).first()

        if not current_visit:
            return {"status": "Completed or Not Found", "people_ahead": 0}

        # Count how many people arrived BEFORE them who are still waiting
        ahead = db.query(models.Event).filter(
            models.Event.clinic_id == current_visit.clinic_id,
            func.date(models.Event.timestamp) == today,
            models.Event.status == "waiting",
            models.Event.timestamp < current_visit.timestamp 
        ).count()

        return {
            "status": "In Queue",
            "your_position": ahead + 1,
            "people_ahead": ahead,
            "estimated_wait": f"{ahead * 10} mins" 
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/complete")
def complete_event(payload: CompleteRequest, db: Session = Depends(get_db)):
    try:
        today = date.today()
        
        # We query the DB directly here so we can guarantee we are marking TODAY'S event as complete
        event = db.query(models.Event).filter(
            models.Event.local_token == payload.local_token,
            func.date(models.Event.timestamp) == today,
            models.Event.status == "waiting"
        ).first()
        
        if not event:
            raise HTTPException(status_code=404, detail="Active token not found")
            
        event.status = "completed" # type: ignore
        db.commit()
        
        return {"status": "success", "message": "Patient visit completed"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))