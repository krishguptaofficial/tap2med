from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
import uuid
from app.core import hashing
from app.db import crud, models,database
from app.db.database import get_db

router = APIRouter()

class CheckInPayload(BaseModel):
    phone: str
    member_id : int = 0
    clinic_id : uuid.UUID

@router.post("/checkin")
def create_a_patient_checkin(payload: CheckInPayload, db:Session = Depends(get_db)):

    clinic = db.query(models.Clinic).filter(models.Clinic.clinic_id == payload.clinic_id).first()

    if not clinic:
        raise HTTPException(status_code=404, detail="Clinic not found")
    
    try:
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
    
    return{

        "status": "success",
        "queue_number": 1,
        "local_token":tokens["local_token"]
    }


@router.get("/queue/{clinic_id}")
def get_clinic_queue(clinic_id: uuid.UUID, db:Session = Depends(get_db)):

    




