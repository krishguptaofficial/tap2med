from sqlalchemy import DateTime, ForeignKey, Column, String, Text, Integer, Boolean, UniqueConstraint, Float
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
    print_header = Column(Boolean, nullable=False, default=True)
    hfr_id = Column(Text, nullable=True)
    uhi_node_uri = Column(Text, nullable=True)
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

class EpharmacyOrder(Base):
    __tablename__ = "epharmacy_orders"

    order_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    clinic_id = Column(UUID(as_uuid=True), ForeignKey("clinics.clinic_id"), nullable=False, index=True)
    local_token = Column(Text, nullable=True)
    medicine_name = Column(Text, nullable=False)
    quantity = Column(Integer, nullable=False, default=1)
    reason = Column(Text, nullable=True)
    status = Column(String, nullable=False, default="routed")
    uhi_node_uri = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    clinic = relationship("Clinic")
    
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
    network_token = Column(Text, index=True, nullable=True)
    test_date = Column(DateTime(timezone=True), nullable=False)

    
    # Stores {"hba1c": 6.4, "tsh": 2.4, etc.}
    results = Column(JSONB, nullable=False, default=dict)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    clinic = relationship("Clinic")

class CrossClinicConsent(Base):
    __tablename__ = "cross_clinic_consents"

    consent_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    network_token = Column(Text, index=True, nullable=False)
    clinic_id = Column(UUID(as_uuid=True), ForeignKey("clinics.clinic_id"), nullable=False, index=True)
    event_id = Column(UUID(as_uuid=True), ForeignKey("events.event_id"), nullable=False, index=True)
    consent_given = Column(Boolean, nullable=False, default=False)
    granted_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    clinic = relationship("Clinic")
    event = relationship("Event")
    
class PharmacyStock(Base):
    """One row per medicine per clinic. Pharmacist edits quantity live."""
    __tablename__ = "pharmacy_stock"
    __table_args__ = (
        UniqueConstraint("clinic_id", "medicine_key", name="uq_pharmacy_stock_clinic_medicine"),
    )

    stock_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    clinic_id = Column(UUID(as_uuid=True), ForeignKey("clinics.clinic_id"), nullable=False, index=True)

    medicine_name = Column(Text, nullable=False)              # shown on screen
    medicine_key = Column(Text, nullable=False, index=True)   # lowercase, used for matching
    quantity = Column(Integer, nullable=False, default=0)
    substitute_name = Column(Text, nullable=True)             # suggested alternative

    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class PharmacyDispense(Base):
    """One row per visit (event) once the pharmacist has handled it."""
    __tablename__ = "pharmacy_dispenses"

    dispense_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    clinic_id = Column(UUID(as_uuid=True), ForeignKey("clinics.clinic_id"), nullable=False, index=True)
    event_id = Column(UUID(as_uuid=True), ForeignKey("events.event_id"), nullable=False, unique=True)
    local_token = Column(Text, nullable=False, index=True)

    # "dispensed" = given from local stock, "routed_epharmacy" = sent to UHI E-Pharmacy
    status = Column(Text, nullable=False, default="dispensed")
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class PrescriptionSubstitution(Base):
    """Log of every 1-click substitution the doctor made."""
    __tablename__ = "prescription_substitutions"

    substitution_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    clinic_id = Column(UUID(as_uuid=True), ForeignKey("clinics.clinic_id"), nullable=False, index=True)
    local_token = Column(Text, nullable=False, index=True)

    original_medicine = Column(Text, nullable=False)
    substitute_medicine = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class ConnectedPharmacy(Base):
    __tablename__ = "connected_pharmacies"

    pharmacy_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    clinic_id = Column(UUID(as_uuid=True), ForeignKey("clinics.clinic_id"), nullable=False, index=True)
    name = Column(Text, nullable=False)
    address = Column(Text, nullable=True)
    phone = Column(Text, nullable=True)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
