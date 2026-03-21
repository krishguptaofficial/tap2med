from fastapi import FastAPI, Depends, HTTPException
from sqlalchemy.orm import Session
from app.db import database, models, crud
import uuid
from datetime import date,time
from sqlalchemy import func


app = FastAPI(title= "Tap2Med V0")

def get_db():

   db = database.SessionLocal()

   try:
      yield db

   finally:
      db.close()


@app.get("/")
def read_root():
   return {
      "status": "online",
      "project": "Tap2Med",
      "version": "0.1.0"
   }

@app.post("/clinics/")
def onboard_clinic(
   doctor_name : str,
   clinic_name: str,
   db : Session= Depends(get_db)
):
 try:
        new_clinic = crud.create_clinic(db=db, doctor_name=doctor_name, clinic_name=clinic_name)
        return {
            "status": "success",
            "clinic_id": new_clinic.clinic_id,
            "doctor": new_clinic.doctor_name
        }
 except Exception as e:
        
        raise HTTPException(status_code=500, detail=str(e))
 
@app.post("/scan/{clinic_id}")
def patient_scan(clinic_id: uuid.UUID, phone:str, member_id : int=0, db:Session =  Depends(get_db)):

    try:
        event = crud.create_patient_event(
            db = db,
            clinic_id= clinic_id,
            phone= phone,
            member_id = member_id
        )

        if event is None:
            raise HTTPException(status_code=404, detail= "Clinic not found")
        
        return {
            "status": "success",
            "message": "token generated",
            "network_token": event.network_token, 
            "local_token": event.local_token
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    

@app.get("/clinics/{clinic_id}/receptionist/queue")
def get_reception_view(clinic_id: uuid.UUID, db: Session = Depends(get_db)):
    
    try:
        today = date.today()
        queue = db.query(models.Event).filter(
        models.Event.clinic_id == clinic_id,
        func.date(models.Event.timestamp) == today
    ).order_by(models.Event.timestamp.asc()).all()
   
        return {
        "date": today,
        "total_waiting": len(queue),
        "queue": [{"position": i + 1, "status": "waiting"} for i, event in enumerate(queue)]
    }
    except Exception as e:
        raise HTTPException(status_code =500, detail=str(e))
    

@app.get("/clinics/{clinic_id}/doctor")
def get_doctor_view(clinic_id: uuid.UUID, db: Session = Depends(get_db)):
    try:
        today = date.today()
        # BLANK 2: Use the same filtering logic as above
        queue = db.query(models.Event).filter(
            models.Event.clinic_id == clinic_id,
            func.date(models.Event.timestamp) == today
        ).order_by(models.Event.timestamp.asc()).all()
        
        return {
            "status": "success",
            "date": today,
            # BLANK 3: Return the local_token paired with the position
            "patients": [
                {"pos": i + 1, "token": event.local_token} for i, event in enumerate(queue)
            ]
        }
    except Exception as e:
        # BLANK 4 & 5: Standard HTTP exception for errors
        raise HTTPException(status_code=500, detail=str(e))
    

# THE PATIENT'S TICKET: "How long until my turn?"
@app.get("/scan/status/{local_token}")
def get_patient_status(local_token: str, db: Session = Depends(get_db)):
    try:
        today = date.today()
        
        # 1. Find this specific patient's visit today
        current_visit = db.query(models.Event).filter(
            models.Event.local_token == local_token,
            func.date(models.Event.timestamp) == today
        ).first()

        if not current_visit:
            raise HTTPException(status_code=404, detail="Active visit not found for today")

        # 2. Count how many people scanned BEFORE this patient today
        # BLANK 1: Query the Event model
        # BLANK 2 & 3: Filter by same clinic AND earlier timestamp
        ahead = db.query(models.Event).filter(
            models.Event.clinic_id == current_visit.clinic_id,
            func.date(models.Event.timestamp) == today,
            models.Event.timestamp < current_visit.timestamp # BLANK 2: The "Who came first" logic
        ).count()

        # BLANK 4: Logic for current position (ahead + 1)
        return {
            "status": "In Queue",
            "your_position": ahead + 1,
            "people_ahead": ahead,
            "estimated_wait": f"{ahead * 10} mins" # BLANK 5: V0 simple estimate (10m per patient)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))