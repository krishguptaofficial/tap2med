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

    ist_tz = ZoneInfo("Asia/Kolkata")

    midnight_ist = datetime.now(ist_tz).replace(
    hour=0,
    minute=0,
    second=0,
    microsecond=0
)

    queue = db.query(models.Event).filter(
    models.Event.clinic_id == clinic_id,
    models.Event.status == "waiting",
    models.Event.timestamp >= midnight_ist,
).order_by(
    models.Event.timestamp.asc()
).all()

    return queue


def complete_patient_event(db:Session, local_token:str ):
    event = db.query(models.Event).filter(
        models.Event.local_token==local_token,
        models.Event.status =="waiting"
    ).first()

    if event:
        event.status ="completed" #type:ignore
        db.commit()
        db.refresh(event)

    return event


def create_email_otp(db: Session, clinic_id: uuid.UUID, otp_hash: str, expires_at: datetime):
    db_ver = models.EmailVerification(
        clinic_id=clinic_id,
        otp_hash=otp_hash,
        expires_at=expires_at,
        attempts=0
    )
    db.add(db_ver)
    db.commit()
    db.refresh(db_ver)
    return db_ver


def get_active_verification(db: Session, clinic_id: uuid.UUID):
    now = datetime.now(timezone.utc)
    return db.query(models.EmailVerification).filter(
        models.EmailVerification.clinic_id == clinic_id,
        models.EmailVerification.expires_at >= now,
        models.EmailVerification.verified_at == None
    ).order_by(models.EmailVerification.created_at.desc()).first()


def mark_verification_verified(db: Session, verification: models.EmailVerification):
    # set the verified_at timestamp dynamically to avoid static type issues
    setattr(verification, "verified_at", datetime.now(timezone.utc))
    # also mark clinic as email_verified
    clinic = db.query(models.Clinic).filter(models.Clinic.clinic_id == verification.clinic_id).first()
    if clinic:
        setattr(clinic, "email_verified", True)
    db.commit()
    db.refresh(verification)
    return verification


def increment_verification_attempts(db: Session, verification: models.EmailVerification):
    current = getattr(verification, "attempts", 0) or 0
    setattr(verification, "attempts", current + 1)
    db.commit()
    db.refresh(verification)
    return verification


def set_clinic_password(db: Session, clinic_id: uuid.UUID, password_hash: str):
    clinic = db.query(models.Clinic).filter(models.Clinic.clinic_id == clinic_id).first()
    if clinic:
        setattr(clinic, "password_hash", password_hash)
        db.commit()
        db.refresh(clinic)
    return clinic


def get_clinic_by_email(db: Session, email: str):
    return db.query(models.Clinic).filter(models.Clinic.doctor_email == email).first()


def authenticate_clinic(db: Session, email: str, verify_password_fn):
    clinic = get_clinic_by_email(db, email)
    if clinic is None or not getattr(clinic, "password_hash", None):
        return None
    stored = getattr(clinic, "password_hash")
    if verify_password_fn(stored):
        return clinic
    return None

