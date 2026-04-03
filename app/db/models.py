from sqlalchemy import DateTime, ForeignKey, Column,String, Text, Integer
from sqlalchemy.orm import DeclarativeMeta
from app.db.database import Base
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
import uuid
from sqlalchemy.dialects.postgresql import UUID

class Clinic(Base):

    __tablename__= "clinics"

    clinic_id = Column(UUID(as_uuid= True), primary_key=True, default=uuid.uuid4)
    doctor_name = Column(Text, nullable = False)
    clinic_name = Column(Text, nullable= False)
    clinic_salt = Column(Text, nullable = False, unique= True)
    #qr_code = Column(Text, nullable = True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    events = relationship("Event", back_populates="clinic")

    
class Event(Base):
    __tablename__ = "events"

    event_id = Column(UUID(as_uuid= True), primary_key=True, default=uuid.uuid4)
    clinic_id = Column(UUID(as_uuid = True), ForeignKey("clinics.clinic_id"),nullable = False )
    network_token = Column(Text, index= True, nullable = False )
    local_token = Column(Text, index = True, nullable = False)
    event_type = Column(String, nullable = False )
    timestamp= Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    status = Column(String, default="WAITING")
    clinic= relationship("Clinic", back_populates="events")
    prescriptions = relationship("Prescription", back_populates="events")


class Prescription(Base):

    __tablename__ = "prescriptions"
    
    prescription_id =  Column(UUID(as_uuid= True), primary_key= True, default=uuid.uuid4)
    event_id = Column(UUID(as_uuid= True), ForeignKey("events.event_id"),nullable = False)
    network_token = Column(Text, index= True, nullable = False )
    local_token = Column(Text, index = True, nullable = False)
    drug_category = Column(Text, nullable = True)
    inferred_symptom= Column(Text, nullable = False)
    timestamp= Column(DateTime(timezone=True), server_default=func.now())

    events = relationship("Event", back_populates="prescriptions" )


# 4. CONSENT_GRANTS (Future Implementation: Tracks purpose-bound data access)
# 5. PHARMACY_EVENTS (Future Implementation: Compliance and fulfillment logging)
