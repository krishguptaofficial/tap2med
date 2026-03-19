from sqlalchemy.orm import Session
from app.core import hashing
from app.db import models
import uuid



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

def create_patient_event(db:Session, clinic_id : uuid.UUID, phone: str, member_id: int=0):

    #getting the clinic to access its private salt
    clinic= db.query(models.Clinic).filter(models.Clinic.clinic_id==clinic_id).first()
    

    if clinic is None:
        return None
    
    net_token = hashing.generate_network_token(phone,member_id)

    loc_token = hashing.generate_local_token(phone, member_id, str(clinic.clinic_salt))

    db_event = models.Event(
        clinic_id= clinic_id,
        network_token = net_token,
        local_token = loc_token,
        event_type = "visit"
    )

    db.add(db_event)
    db.commit()
    db.refresh(db_event)
    return db_event

