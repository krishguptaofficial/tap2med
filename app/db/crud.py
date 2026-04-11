from sqlalchemy.orm import Session
from app.core import hashing
from app.db import models
import uuid
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo



def create_clinic(db : Session, doctor_name : str, clinic_name : str ):
   
    new_salt = hashing.generate_clinic_salt()
    db_clinic= models.Clinic(
        doctor_name = doctor_name,
        clinic_name = clinic_name,
        clinic_salt = new_salt
    )
    db.add(db_clinic)
    db.commit()
    db.refresh(db_clinic)
    return db_clinic

def get_clinic(db: Session, clinic_id: uuid.UUID):
  
    return db.query(models.Clinic).filter(models.Clinic.clinic_id == clinic_id).first()


def create_patient_event(db:Session, clinic_id : uuid.UUID, local_token:str, network_token:str, daily_token_number :int, member_id: int=0):

    #getting the clinic to access its private salt
    clinic= db.query(models.Clinic).filter(models.Clinic.clinic_id==clinic_id).first()
    

    if clinic is None:
        return None


    db_event = models.Event(
        clinic_id= clinic_id,
        network_token = network_token,
        local_token = local_token,
        event_type = "visit",
        daily_token_number = daily_token_number
    )

    recent = db.query(models.Event).filter(
        models.Event.clinic_id == clinic_id,
        models.Event.local_token ==local_token,
        models.Event.timestamp>= datetime.now(timezone.utc) - timedelta(minutes =2)
    ).first()

    if recent:
        return recent

    db.add(db_event)
    db.commit()
    db.refresh(db_event)
    return db_event


def get_waiting_patients(db: Session, clinic_id = uuid.UUID):

    ist_tz= ZoneInfo("Asia/Delhi")
    midnight_ist = datetime.now(ist_tz).replace(hour= 0, minute = 0, second=0, microsecond=0)

    queue = db.query(models.Event).filter(
        models.Event.clinic_id == clinic_id,
        models.Event.status =="waiting",
        models.Event.timestamp>= midnight_ist,
    ).order_by(models.Event.timestamp.asc()).all()

    return queue


def complete_patient_event(db:Session, local_token:str ):
    event = db.query(models.Event).filter(
        models.Event.local_token==local_token,
        models.Event.status =="WAITING"
    ).first()

    if event:
        status ="COMPLETED"
        db.commit()
        db.refresh(event)
        db.close()

    return event

