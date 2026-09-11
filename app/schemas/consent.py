import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel

class CrossClinicConsentResponse(BaseModel):
    consent_id: uuid.UUID
    clinic_id: uuid.UUID
    event_id: uuid.UUID
    network_token: str
    consent_given: bool
    granted_at: datetime

    class Config:
        from_attributes = True

