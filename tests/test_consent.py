import pytest
import uuid
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.dialects.postgresql import JSONB

# Ensure SQLite can compile PostgreSQL JSONB column for unit tests
@compiles(JSONB, "sqlite")
def compile_jsonb_sqlite(type_, compiler, **kw):
    return "JSON"

from app.main import app
from app.db.database import Base, get_db
from app.db import models, crud
from app.core import hashing
from app.api.events import rate_limit_records

# Setup in-memory SQLite for testing
engine = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False}
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

@pytest.fixture(scope="module", autouse=True)
def setup_test_db():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)

@pytest.fixture
def db_session():
    rate_limit_records.clear()
    connection = engine.connect()
    transaction = connection.begin()
    session = TestingSessionLocal(bind=connection)

    
    # Override get_db dependency in FastAPI app
    app.dependency_overrides[get_db] = lambda: session
    
    yield session
    
    session.close()
    transaction.rollback()
    connection.close()
    app.dependency_overrides.pop(get_db, None)

@pytest.fixture
def client(db_session):
    return TestClient(app)

def create_mock_clinic(db, doctor_name="Dr. Rao", clinic_name="City Health Clinic"):
    salt = hashing.generate_clinic_salt()
    clinic = models.Clinic(
        clinic_id=uuid.uuid4(),
        doctor_name=doctor_name,
        clinic_name=clinic_name,
        clinic_salt=salt,
        email_verified=True,
        doctor_email=f"doc_{uuid.uuid4().hex[:8]}@example.com",
        walkin_fee="500",
        appointment_fee="700",
        followup_fee="300",
        followup_days=5
    )
    db.add(clinic)
    db.commit()
    db.refresh(clinic)
    return clinic

# ==============================================================================
# TEST 1: New patient with checkbox unchecked
#         -> normal registration works
#         -> no cross-clinic history returned
# ==============================================================================
def test_1_patient_unchecked_normal_registration_and_no_history(client, db_session):
    clinic = create_mock_clinic(db_session, "Dr. Sharma", "Clinic Alpha")
    phone = "9876543210"

    res = client.post(
        "/api/events/visit/start",
        json={
            "phone": phone,
            "member_id": 0,
            "clinic_id": str(clinic.clinic_id),
            "name": "Aarav Gupta",
            "share_network_history": False
        }
    )
    assert res.status_code == 200
    data = res.json()
    assert "local_token" in data
    assert "queue_number" in data
    local_token = data["local_token"]

    # Verify no CrossClinicConsent record was created
    consent_record = db_session.query(models.CrossClinicConsent).filter(
        models.CrossClinicConsent.clinic_id == clinic.clinic_id
    ).first()
    assert consent_record is None

    # Query network history -> returns has_consent: False, history: []
    hist_res = client.get(
        f"/api/events/network-history/{local_token}?clinic_id={clinic.clinic_id}"
    )
    assert hist_res.status_code == 200
    hist_data = hist_res.json()
    assert hist_data["has_consent"] is False
    assert hist_data["history"] == []


# ==============================================================================
# TEST 2: New patient with checkbox checked
#         -> normal registration works
#         -> consent record is created
# ==============================================================================
def test_2_patient_checked_consent_record_created(client, db_session):
    clinic = create_mock_clinic(db_session, "Dr. Mehta", "Clinic Beta")
    phone = "9876543211"

    res = client.post(
        "/api/events/visit/start",
        json={
            "phone": phone,
            "member_id": 0,
            "clinic_id": str(clinic.clinic_id),
            "name": "Priya Patel",
            "share_network_history": True
        }
    )
    assert res.status_code == 200
    data = res.json()
    local_token = data["local_token"]

    # Consent record must exist in DB
    event = db_session.query(models.Event).filter(
        models.Event.clinic_id == clinic.clinic_id,
        models.Event.local_token == local_token
    ).first()
    assert event is not None

    consent_record = db_session.query(models.CrossClinicConsent).filter(
        models.CrossClinicConsent.event_id == event.event_id,
        models.CrossClinicConsent.clinic_id == clinic.clinic_id
    ).first()
    assert consent_record is not None
    assert consent_record.consent_given is True
    assert consent_record.network_token == event.network_token


# ==============================================================================
# TEST 3: Patient with consent
#         -> doctor can retrieve previous completed events using same network_token
# ==============================================================================
def test_3_patient_with_consent_can_retrieve_previous_completed_events(client, db_session):
    clinic_a = create_mock_clinic(db_session, "Dr. Alice", "Clinic A")
    clinic_b = create_mock_clinic(db_session, "Dr. Bob", "Clinic B")
    phone = "9876543212"

    # 1. Visit Clinic A, complete visit with diagnosis and prescription
    res_a = client.post(
        "/api/events/visit/start",
        json={
            "phone": phone,
            "member_id": 0,
            "clinic_id": str(clinic_a.clinic_id),
            "name": "Same Patient",
            "share_network_history": False
        }
    )
    assert res_a.status_code == 200
    local_token_a = res_a.json()["local_token"]

    comp_res = client.put(
        "/api/events/complete",
        json={
            "clinic_id": str(clinic_a.clinic_id),
            "local_token": local_token_a,
            "diagnosis": "Hypertension",
            "complaints": "Frequent headaches",
            "advice": "Low salt diet",
            "medicines": [
                {
                    "name": "Amlodipine 5 mg",
                    "dosage": "5 mg",
                    "instructions": "Once daily after food",
                    "duration": "30 days"
                }
            ]
        }
    )
    assert comp_res.status_code == 200

    # 2. Patient visits Clinic B, checks consent box
    res_b = client.post(
        "/api/events/visit/start",
        json={
            "phone": phone,
            "member_id": 0,
            "clinic_id": str(clinic_b.clinic_id),
            "name": "Same Patient",
            "share_network_history": True
        }
    )
    assert res_b.status_code == 200
    local_token_b = res_b.json()["local_token"]

    # 3. Doctor at Clinic B retrieves cross-clinic history
    net_res = client.get(
        f"/api/events/network-history/{local_token_b}?clinic_id={clinic_b.clinic_id}"
    )
    assert net_res.status_code == 200
    data = net_res.json()
    assert data["has_consent"] is True
    assert len(data["history"]) == 1

    past_visit = data["history"][0]
    assert past_visit["diagnosis"] == "Hypertension"
    assert past_visit["complaints"] == "Frequent headaches"
    assert past_visit["advice"] == "Low salt diet"
    assert len(past_visit["prescriptions"]) == 1
    assert past_visit["prescriptions"][0]["name"] == "Amlodipine 5 mg"


# ==============================================================================
# TEST 4: Patient without consent
#         -> doctor cannot retrieve network history
# ==============================================================================
def test_4_patient_without_consent_cannot_retrieve_network_history(client, db_session):
    clinic_a = create_mock_clinic(db_session, "Dr. Alice", "Clinic A")
    clinic_c = create_mock_clinic(db_session, "Dr. Charlie", "Clinic C")
    phone = "9876543213"

    # Clinic A visit completed
    res_a = client.post(
        "/api/events/visit/start",
        json={"phone": phone, "member_id": 0, "clinic_id": str(clinic_a.clinic_id), "name": "Patient X"}
    )
    local_a = res_a.json()["local_token"]
    client.put(
        "/api/events/complete",
        json={"clinic_id": str(clinic_a.clinic_id), "local_token": local_a, "diagnosis": "Fever"}
    )

    # Clinic C visit without consent
    res_c = client.post(
        "/api/events/visit/start",
        json={
            "phone": phone,
            "member_id": 0,
            "clinic_id": str(clinic_c.clinic_id),
            "name": "Patient X",
            "share_network_history": False
        }
    )
    local_c = res_c.json()["local_token"]

    # Doctor at Clinic C attempts network history query
    net_res = client.get(
        f"/api/events/network-history/{local_c}?clinic_id={clinic_c.clinic_id}"
    )
    assert net_res.status_code == 200
    data = net_res.json()
    assert data["has_consent"] is False
    assert data["history"] == []


# ==============================================================================
# TEST 5: Current visit is not included in historical results
# ==============================================================================
def test_5_current_visit_excluded_from_history(client, db_session):
    clinic = create_mock_clinic(db_session, "Dr. Singh", "General Hospital")
    phone = "9876543214"

    res = client.post(
        "/api/events/visit/start",
        json={
            "phone": phone,
            "member_id": 0,
            "clinic_id": str(clinic.clinic_id),
            "name": "New Patient",
            "share_network_history": True
        }
    )
    local_token = res.json()["local_token"]

    net_res = client.get(
        f"/api/events/network-history/{local_token}?clinic_id={clinic.clinic_id}"
    )
    assert net_res.status_code == 200
    data = net_res.json()
    assert data["has_consent"] is True
    # The active/current visit must NOT appear in history
    assert len(data["history"]) == 0


# ==============================================================================
# TEST 6: Results are sorted newest -> oldest
# ==============================================================================
def test_6_results_sorted_newest_to_oldest(client, db_session):
    clinic_a = create_mock_clinic(db_session, "Dr. DocA", "Clinic A")
    clinic_b = create_mock_clinic(db_session, "Dr. DocB", "Clinic B")
    phone = "9876543215"

    # First checkin to establish network_token
    res1 = client.post(
        "/api/events/visit/start",
        json={"phone": phone, "member_id": 0, "clinic_id": str(clinic_a.clinic_id), "name": "Patient Time"}
    )
    local1 = res1.json()["local_token"]
    event1 = db_session.query(models.Event).filter(models.Event.local_token == local1).first()
    event1.status = "completed"
    event1.diagnosis = "Older Visit"
    event1.timestamp = datetime.now(timezone.utc) - timedelta(days=60)
    db_session.commit()

    # Create a second past event manually with same network token but newer timestamp
    event2 = models.Event(
        clinic_id=clinic_a.clinic_id,
        network_token=event1.network_token,
        local_token="fake_local_token_old",
        daily_token_number=99,
        event_type="visit",
        status="completed",
        diagnosis="Newer Visit",
        timestamp=datetime.now(timezone.utc) - timedelta(days=10)
    )
    db_session.add(event2)
    db_session.commit()

    # New checkin at Clinic B with consent
    res2 = client.post(
        "/api/events/visit/start",
        json={
            "phone": phone,
            "member_id": 0,
            "clinic_id": str(clinic_b.clinic_id),
            "name": "Patient Time",
            "share_network_history": True
        }
    )
    local_b = res2.json()["local_token"]

    net_res = client.get(
        f"/api/events/network-history/{local_b}?clinic_id={clinic_b.clinic_id}"
    )
    assert net_res.status_code == 200
    data = net_res.json()
    assert len(data["history"]) == 2
    # Verify newest first
    assert data["history"][0]["diagnosis"] == "Newer Visit"
    assert data["history"][1]["diagnosis"] == "Older Visit"
    assert data["history"][0]["timestamp"] > data["history"][1]["timestamp"]


# ==============================================================================
# TEST 7 & 8: Doctor cannot see previous doctor name or previous clinic name
# ==============================================================================
def test_7_and_8_doctor_cannot_see_previous_doctor_or_clinic_name(client, db_session):
    clinic_a = create_mock_clinic(db_session, "Dr. SecretDoctor", "SecretClinicSpecial")
    clinic_b = create_mock_clinic(db_session, "Dr. ViewingDoctor", "ViewingClinic")
    phone = "9876543216"

    res_a = client.post(
        "/api/events/visit/start",
        json={"phone": phone, "member_id": 0, "clinic_id": str(clinic_a.clinic_id), "name": "Confidential"}
    )
    local_a = res_a.json()["local_token"]
    client.put(
        "/api/events/complete",
        json={"clinic_id": str(clinic_a.clinic_id), "local_token": local_a, "diagnosis": "Asthma"}
    )

    res_b = client.post(
        "/api/events/visit/start",
        json={
            "phone": phone,
            "member_id": 0,
            "clinic_id": str(clinic_b.clinic_id),
            "name": "Confidential",
            "share_network_history": True
        }
    )
    local_b = res_b.json()["local_token"]

    net_res = client.get(
        f"/api/events/network-history/{local_b}?clinic_id={clinic_b.clinic_id}"
    )
    assert net_res.status_code == 200
    data = net_res.json()
    assert len(data["history"]) == 1

    item = data["history"][0]
    # Check that forbidden fields are absent
    assert "doctor_name" not in item
    assert "clinic_name" not in item
    assert "clinic_id" not in item
    
    # Check that raw string content doesn't leak secrets
    raw_json = net_res.text
    assert "SecretDoctor" not in raw_json
    assert "SecretClinicSpecial" not in raw_json
    assert str(clinic_a.clinic_id) not in raw_json


# ==============================================================================
# TEST 9: Network token is not returned to frontend
# ==============================================================================
def test_9_network_token_not_returned_to_frontend(client, db_session):
    clinic_a = create_mock_clinic(db_session, "Dr. X", "Clinic X")
    clinic_b = create_mock_clinic(db_session, "Dr. Y", "Clinic Y")
    phone = "9876543217"

    res_a = client.post(
        "/api/events/visit/start",
        json={"phone": phone, "member_id": 0, "clinic_id": str(clinic_a.clinic_id), "name": "Token Check"}
    )
    local_a = res_a.json()["local_token"]
    client.put(
        "/api/events/complete",
        json={"clinic_id": str(clinic_a.clinic_id), "local_token": local_a, "diagnosis": "Cold"}
    )

    res_b = client.post(
        "/api/events/visit/start",
        json={
            "phone": phone,
            "member_id": 0,
            "clinic_id": str(clinic_b.clinic_id),
            "name": "Token Check",
            "share_network_history": True
        }
    )
    local_b = res_b.json()["local_token"]

    net_res = client.get(
        f"/api/events/network-history/{local_b}?clinic_id={clinic_b.clinic_id}"
    )
    raw_json = net_res.text
    assert "network_token" not in raw_json

    event = db_session.query(models.Event).filter(models.Event.local_token == local_b).first()
    assert event.network_token not in raw_json


# ==============================================================================
# TEST 10 & 11: local_token and network_token generation remain unchanged
# ==============================================================================
def test_10_and_11_token_generation_algorithms_unchanged():
    phone = "9876543218"
    member_id = 0
    clinic_salt = "c1c2c3c4c5c6c1c2c3c4c5c6c1c2c3c4"
    user_salt = "u1u2u3u4u5u6u1u2u3u4u5u6u1u2u3u4"

    local_tok = hashing.generate_local_token(phone, member_id, clinic_salt)
    net_tok = hashing.generate_network_token(phone, member_id, user_salt)

    assert len(local_tok) == 64
    assert len(net_tok) == 64
    assert local_tok == hashing.generate_local_token(phone, member_id, clinic_salt)
    assert net_tok == hashing.generate_network_token(phone, member_id, user_salt)
    assert local_tok != net_tok


# ==============================================================================
# TEST 12: Existing local patient-history endpoint continues to work
# ==============================================================================
def test_12_existing_local_patient_history_continues_to_work(client, db_session):
    clinic = create_mock_clinic(db_session, "Dr. Local", "Local Clinic")
    phone = "9876543219"

    res = client.post(
        "/api/events/visit/start",
        json={"phone": phone, "member_id": 0, "clinic_id": str(clinic.clinic_id), "name": "Local Pat"}
    )
    local_token = res.json()["local_token"]

    client.put(
        "/api/events/complete",
        json={"clinic_id": str(clinic.clinic_id), "local_token": local_token, "diagnosis": "Local Cold"}
    )

    # Call original GET /api/events/history/{local_token}
    hist_res = client.get(f"/api/events/history/{local_token}?clinic_id={clinic.clinic_id}")
    assert hist_res.status_code == 200
    data = hist_res.json()
    assert "history" in data
    assert "patient_name" in data
    assert "display_id" in data
    assert len(data["history"]) == 1
    assert data["history"][0]["diagnosis"] == "Local Cold"


# ==============================================================================
# TEST 13: Existing prescription functionality continues to work
# ==============================================================================
def test_13_existing_prescription_functionality_continues_to_work(client, db_session):
    clinic = create_mock_clinic(db_session, "Dr. Rx", "Rx Clinic")
    phone = "9876543220"

    res = client.post(
        "/api/events/visit/start",
        json={"phone": phone, "member_id": 0, "clinic_id": str(clinic.clinic_id), "name": "Rx Patient"}
    )
    local_token = res.json()["local_token"]

    complete_payload = {
        "clinic_id": str(clinic.clinic_id),
        "local_token": local_token,
        "diagnosis": "Type 2 Diabetes",
        "medicines": [
            {
                "name": "Metformin 500 mg",
                "dosage": "500 mg",
                "instructions": "Twice daily with food",
                "duration": "60 days"
            }
        ]
    }
    comp_res = client.put("/api/events/complete", json=complete_payload)
    assert comp_res.status_code == 200

    # Verify status check returns completed prescription
    stat_res = client.get(f"/api/events/status/{local_token}?clinic_id={clinic.clinic_id}")
    assert stat_res.status_code == 200
    stat_data = stat_res.json()
    assert stat_data["status"] == "Completed"
    assert "Metformin" in stat_data["prescription_text"]