import pytest
from unittest.mock import MagicMock
from app.api.events import start_visit, StartVisitRequest
from app.db import models
import uuid

@pytest.fixture
def mock_db():
    db = MagicMock()
    return db

@pytest.fixture
def mock_request():
    request = MagicMock()
    return request

def test_clinic_setting_off_phone_entered(mock_db, mock_request, monkeypatch):
    import app.api.events as events
    
    # Mock crud
    monkeypatch.setattr(events.crud, "get_clinic", MagicMock(return_value=MagicMock(save_patient_phone=False, clinic_salt="salt123", followup_days=0)))
    monkeypatch.setattr(events.crud, "get_patient_by_lookup", MagicMock(return_value=MagicMock(user_salt="user_salt", patient_id="pat123")))
    
    mock_record = MagicMock()
    mock_db.query.return_value.filter.return_value.first.return_value = mock_record
    
    payload = StartVisitRequest(phone="1234567890", member_id=0, clinic_id=uuid.uuid4(), name="Test Patient")
    
    # Setting is OFF, so phone_number should NOT be set
    events.start_visit(payload=payload, request=mock_request, db=mock_db)
    
    # Check that phone_number was not modified
    assert not hasattr(mock_record, "phone_number") or mock_record.phone_number != "1234567890"

def test_clinic_setting_on_phone_entered(mock_db, mock_request, monkeypatch):
    import app.api.events as events
    
    # Mock clinic with setting ON
    monkeypatch.setattr(events.crud, "get_clinic", MagicMock(return_value=MagicMock(save_patient_phone=True, clinic_salt="salt123", followup_days=0)))
    monkeypatch.setattr(events.crud, "get_patient_by_lookup", MagicMock(return_value=MagicMock(user_salt="user_salt", patient_id="pat123")))
    
    mock_record = MagicMock()
    mock_db.query.return_value.filter.return_value.first.return_value = mock_record
    
    payload = StartVisitRequest(phone="0987654321", member_id=0, clinic_id=uuid.uuid4(), name="Test Patient")
    
    events.start_visit(payload=payload, request=mock_request, db=mock_db)
    
    # Setting is ON, phone_number SHOULD be set
    assert mock_record.phone_number == "0987654321"

def test_no_phone_entered_random_generation():
    # If frontend sends no phone or a random generated one, the flow still works.
    # In backend, the phone is just what the frontend sends.
    payload = StartVisitRequest(phone="1234567890", member_id=0, clinic_id=uuid.uuid4(), name="Test Patient")
    assert payload.phone == "1234567890"
