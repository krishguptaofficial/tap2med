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
from typing import List, Optional

router = APIRouter()

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

        today = date.today()
        today_event_count = db.query(models.Event).filter(
            models.Event.clinic_id == payload.clinic_id,
            func.date(models.Event.timestamp) == today
        ).count()

        assigned_token_number = today_event_count + 1
        
        new_event = crud.create_patient_event(
            db=db,
            clinic_id=payload.clinic_id,
            local_token=tokens["local_token"],              
            network_token=tokens["network_token"],
            daily_token_number = assigned_token_number
        )
        
        if not new_event:
            raise HTTPException(status_code=500, detail="Failed to create patient event")
        
        return {
            "status": "waiting",
            "queue_number": new_event.daily_token_number,
            "local_token": tokens["local_token"]
            
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
        
        
        event = db.query(models.Event).filter(
            models.Event.local_token == payload.local_token,
            func.date(models.Event.timestamp) == today, 
            models.Event.status == "waiting"
        ).first()
        
        if not event:
            raise HTTPException(status_code=404, detail="Active token not found")
            
        event.status = "completed" # type: ignore

        for med in payload.medicines:
            if med.name.strip()!="":
                new_rx = models.Prescription(
                    event_id = event.event_id,
                    network_token = event.network_token,
                    local_token = event.local_token,
                    medicine_name = med.name,
                    instructions = med.instructions,
                    inferred_symptom = "Not available in V0",
                    drug_category = "Not available in v0"
                )
                db.add(new_rx)
    
        db.commit()
        
        return {"status": "success", "message": "Patient visit completed"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    

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
                "prescriptions": matched_rx
            })

        return {"history": formatted_history}

    except Exception as e:       
        raise HTTPException(status_code=500, detail=str(e))