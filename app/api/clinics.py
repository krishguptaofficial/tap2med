from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
import uuid

from app.db import crud
from app.db.database import get_db

router = APIRouter()

@router.get("/queue/{clinic_id}")
def get_clinic_queue(clinic_id: uuid.UUID, db: Session = Depends(get_db)):
    
    
    try:
        waiting_events = crud.get_waiting_patients(db=db, clinic_id=uuid.UUID)

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    
    formatted_queue = []
    for event in waiting_events:
        formatted_queue.append({
            "local_token": event.local_token,
            "status": event.status 
        })

    return {
        "status": "success",
        "queue": formatted_queue
    }