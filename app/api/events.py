from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
import uuid
from app.core import hashing
from app.db import crud
from app.db.database import get_db

router = APIRouter()

class CheckInPayload(BaseModel):
    phone: str
    member_id: int = 0
    clinic_id: uuid.UUID


@router.post("/checkin")
def create_a_patient_checkin(payload: CheckInPayload, db: Session = Depends(get_db)):
    
    # Ask CRUD for the clinic to get the salt
    clinic = crud.get_clinic(db=db, clinic_id=payload.clinic_id)
    if not clinic:
        raise HTTPException(status_code=404, detail="Clinic not found")
    
    try:
        # Generate tokens
        tokens = hashing.generate_identity_tokens(
            phone=payload.phone,
            member_id=payload.member_id,
            clinic_salt=str(clinic.clinic_salt)
        )

        
        del payload.phone
        
        new_event = crud.create_patient_event(
            db=db,
            clinic_id=payload.clinic_id,
            local_token=tokens["local_token"],              
            network_token=tokens["network_token"],
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    
    return {
        "status": "success",
        "queue_number": 1, # Hardcoded until the queue counter is built
        "local_token": tokens["local_token"]
    }