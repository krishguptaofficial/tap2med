from sqlalchemy import DateTime, ForeignKey, Column,String, Text, Integer
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.db.database import Base
import uuid
from sqlalchemy.dialects.postgresql import UUID

class Clinic(Base):

    __tablename__= "clinics"

    clinic_id = Column(UUID(as_uuid= True), primary_key=True, default=uuid.uuid4)
    doctor_name = Column(Text, nullable = False)
    clinic_name = Column(Text, nullable= False)
    clinic_salt = Column(Text, nullable = False, unique= True)
    qr_code = Column(Text, nullable = True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    events = relationship("Event", back_populates="clinic")

    

