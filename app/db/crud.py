from sqlalchemy.orm import Session
from app.core import hashing
from app.db import models
import uuid
from datetime import datetime, timedelta, timezone



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

def create_patient_event(db:Session, clinic_id : uuid.UUID, local_token:str, network_token:str, member_id: int=0):

    #getting the clinic to access its private salt
    clinic= db.query(models.Clinic).filter(models.Clinic.clinic_id==clinic_id).first()
    

    if clinic is None:
        return None


    db_event = models.Event(
        clinic_id= clinic_id,
        network_token = network_token,
        local_token = local_token,
        event_type = "visit"
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

