from sqlalchemy import DateTime, ForeignKey, Column, String, Text, Integer, Boolean
from sqlalchemy.orm import DeclarativeMeta, relationship
from app.db.database import Base
from sqlalchemy.sql import func
import uuid
from sqlalchemy.dialects.postgresql import UUID, JSONB

class Clinic(Base):
    __tablename__= "clinics"

    clinic_id = Column(UUID(as_uuid= True), primary_key=True, default=uuid.uuid4)
    doctor_name = Column(Text, nullable = False)
    doctor_email = Column(Text, nullable=True, index=True)
    email_verified = Column(Boolean, nullable=False, default=False)
    password_hash = Column(Text, nullable=True)
    clinic_name = Column(Text, nullable= False)
    clinic_salt = Column(Text, nullable = False, unique= True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    events = relationship("Event", back_populates="clinic")
    email_verifications = relationship("EmailVerification", back_populates="clinic", cascade="all, delete-orphan")
    
    staff_username = Column(Text, nullable=True, unique=True)
    staff_passcode_hash = Column(Text, nullable=True)
    pharmacy_username = Column(Text, nullable=True, unique=True)
    pharmacy_passcode_hash = Column(Text, nullable=True)
    
    walkin_fee = Column(Text, nullable=True)
    appointment_fee = Column(Text, nullable=True)
    followup_fee = Column(Text, nullable=True)
    followup_days = Column(Integer, nullable=True, default=0)

    qualifications = Column(Text, nullable=True)
    address = Column(Text, nullable=True)
    extra_notes = Column(Text, nullable=True)
    save_patient_phone = Column(Boolean, nullable=False, default=False)
    
class EmailVerification(Base):
    __tablename__ = "email_verifications"
    verification_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    clinic_id = Column(UUID(as_uuid=True), ForeignKey("clinics.clinic_id"), nullable=False, index=True)
    otp_hash = Column(Text, nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    attempts = Column(Integer, nullable=False, default=0)
    verified_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    clinic = relationship("Clinic", back_populates="email_verifications")
    
class Event(Base):
    __tablename__ = "events"

    event_id = Column(UUID(as_uuid= True), primary_key=True, default=uuid.uuid4)
    clinic_id = Column(UUID(as_uuid = True), ForeignKey("clinics.clinic_id"), nullable = False )
    network_token = Column(Text, index= True, nullable = False)
    local_token = Column(Text, index = True, nullable = False)

    patient_weight = Column(Text, nullable=True)
    vitals = Column(JSONB, nullable=True)

    complaints = Column(Text, nullable=True)
    diagnosis = Column(Text, nullable=True)
    tests_suggested = Column(Text, nullable=True)
    
    advice = Column(Text, nullable=True)
    follow_up_days = Column(Integer, nullable=True, default=3)

    daily_token_number = Column(Integer, nullable= False)
    event_type = Column(String, default ="clinic_visit", nullable = False )
    timestamp= Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    status = Column(String, default="waiting", index = True)
    
    clinic= relationship("Clinic", back_populates="events")
    prescriptions = relationship("Prescription", back_populates="events")

class Prescription(Base):
    __tablename__ = "prescriptions"

    prescription_id = Column(UUID(as_uuid= True), primary_key= True, default=uuid.uuid4)
    event_id = Column(UUID(as_uuid= True), ForeignKey("events.event_id"), nullable = False)
    network_token = Column(Text, index= True, nullable = False )
    local_token = Column(Text, index = True, nullable = False)
    
    medicine_name = Column(Text, nullable = False)
    instructions = Column(Text, nullable = True)
    
    dosage = Column(Text, nullable=True)
    duration = Column(Text, nullable=True)
    
    drug_category = Column(Text, nullable = True)
    inferred_symptom= Column(Text, nullable = False)
    timestamp= Column(DateTime(timezone=True), server_default=func.now())

    events = relationship("Event", back_populates="prescriptions")

class Patient(Base):
    __tablename__ = "patients"

    patient_id = Column(String, primary_key=True)
    lookup_hash = Column(String, unique=True, index=True, nullable=False)
    lookup_version = Column(Integer, nullable=False, default=1)
    user_salt = Column(String, nullable=False)
    network_token = Column(String, nullable=False)
    
    abha_token = Column(String, nullable=True, default=None)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class ClinicPatientRecord(Base):
    __tablename__ = "clinic_patient_records"

    record_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    clinic_id = Column(UUID(as_uuid=True), ForeignKey("clinics.clinic_id"), nullable=False, index=True)
    local_token = Column(Text, index=True, nullable=False)
    
    patient_name = Column(Text, nullable=False)
    city = Column(Text, nullable=True)
    age = Column(Integer, nullable=True)
    phone_number = Column(Text, nullable=True)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    clinic = relationship("Clinic")

class ClinicPatientLabRecord(Base):
    __tablename__ = "clinic_patient_lab_records"

    record_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    clinic_id = Column(UUID(as_uuid=True), ForeignKey("clinics.clinic_id"), nullable=False, index=True)
    local_token = Column(Text, index=True, nullable=False)
    test_date = Column(DateTime(timezone=True), nullable=False)
    
    # Stores {"hba1c": 6.4, "tsh": 2.4, etc.}
    results = Column(JSONB, nullable=False, default=dict)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    clinic = relationship("Clinic")