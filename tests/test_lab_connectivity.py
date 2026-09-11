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

IST = ZoneInfo("Asia/Kolkata")

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
# TEST 1: Doctor saves tests_suggested on consultation completion
# ==============================================================================
def test_1_doctor_saves_tests_suggested_on_consultation(client, db_session):
    clinic = create_mock_clinic(db_session, "Dr. Gupta", "Gupta Clinic")
    phone = "9876543001"

    res = client.post(
        "/api/events/visit/start",
        json={
            "phone": phone,
            "member_id": 0,
            "clinic_id": str(clinic.clinic_id),
            "name": "Rohan Verma",
            "share_network_history": False
        }
    )
    assert res.status_code == 200
    local_token = res.json()["local_token"]

    comp_res = client.put(
        "/api/events/complete",
        json={
            "clinic_id": str(clinic.clinic_id),
            "local_token": local_token,
            "diagnosis": "Type 2 Diabetes",
            "complaints": "Polyuria, fatigue",
            "tests_suggested": "HbA1c, CBC, Fasting Blood Sugar",
            "advice": "Low carb diet"
        }
    )
    assert comp_res.status_code == 200

    event = db_session.query(models.Event).filter(
        models.Event.clinic_id == clinic.clinic_id,
        models.Event.local_token == local_token
    ).first()
    assert event is not None
    assert event.status == "completed"
    assert event.tests_suggested == "HbA1c, CBC, Fasting Blood Sugar"


# ==============================================================================
# TEST 2: Lab lookup finds patient & returns parsed suggested tests
# ==============================================================================
def test_2_lab_lookup_finds_patient_and_returns_suggested_tests(client, db_session):
    clinic = create_mock_clinic(db_session, "Dr. Gupta", "Gupta Clinic")
    phone = "9876543002"

    start_res = client.post(
        "/api/events/visit/start",
        json={
            "phone": phone,
            "member_id": 0,
            "clinic_id": str(clinic.clinic_id),
            "name": "Ananya Roy",
            "share_network_history": False
        }
    )
    local_token = start_res.json()["local_token"]

    client.put(
        "/api/events/complete",
        json={
            "clinic_id": str(clinic.clinic_id),
            "local_token": local_token,
            "tests_suggested": "HbA1c, CBC, Lipid Profile"
        }
    )

    lookup_res = client.post(
        "/api/integrations/labs/lookup",
        json={"phone": phone, "member_id": 0}
    )
    assert lookup_res.status_code == 200
    data = lookup_res.json()
    assert data["found"] is True
    assert data["patient_name"] == "Ananya Roy"
    assert "HbA1c" in data["tests_suggested"]
    assert "CBC" in data["tests_suggested"]
    assert "Lipid Profile" in data["tests_suggested"]
    assert len(data["tests_suggested"]) == 3


# ==============================================================================
# TEST 3: User Clarification 1 - Show ONLY tests from latest completed event
#         (No aggregation of old test suggestions across historical visits)
# ==============================================================================
def test_3_lab_lookup_latest_completed_only_no_aggregation(client, db_session):
    clinic = create_mock_clinic(db_session, "Dr. Roy", "Roy PolyClinic")
    phone = "9876543003"

    # Visit 1 (e.g. Sept 1): HbA1c + CBC
    v1_res = client.post(
        "/api/events/visit/start",
        json={"phone": phone, "member_id": 0, "clinic_id": str(clinic.clinic_id), "name": "Vikas Sen"}
    )
    local_token_1 = v1_res.json()["local_token"]
    client.put(
        "/api/events/complete",
        json={"clinic_id": str(clinic.clinic_id), "local_token": local_token_1, "tests_suggested": "HbA1c, CBC"}
    )

    # Set timestamp of Visit 1 to earlier
    event_1 = db_session.query(models.Event).filter(
        models.Event.clinic_id == clinic.clinic_id,
        models.Event.local_token == local_token_1
    ).first()
    event_1.timestamp = datetime.now(IST) - timedelta(days=7)
    db_session.commit()

    # Visit 2 (e.g. Sept 8): Lipid Profile only
    v2_res = client.post(
        "/api/events/visit/start",
        json={"phone": phone, "member_id": 0, "clinic_id": str(clinic.clinic_id), "name": "Vikas Sen"}
    )
    local_token_2 = v2_res.json()["local_token"]
    client.put(
        "/api/events/complete",
        json={"clinic_id": str(clinic.clinic_id), "local_token": local_token_2, "tests_suggested": "Lipid Profile"}
    )

    # Lab lookup on Sept 10 -> MUST show only Lipid Profile (NOT HbA1c or CBC)
    lookup_res = client.post(
        "/api/integrations/labs/lookup",
        json={"phone": phone, "member_id": 0}
    )
    assert lookup_res.status_code == 200
    data = lookup_res.json()
    assert data["found"] is True
    assert data["tests_suggested"] == ["Lipid Profile"]
    assert "HbA1c" not in data["tests_suggested"]
    assert "CBC" not in data["tests_suggested"]


# ==============================================================================
# TEST 4: Lab lookup fallback when event is waiting (not yet completed)
# ==============================================================================
def test_4_lab_lookup_fallback_when_event_waiting(client, db_session):
    clinic = create_mock_clinic(db_session, "Dr. K", "K Clinic")
    phone = "9876543004"

    start_res = client.post(
        "/api/events/visit/start",
        json={"phone": phone, "member_id": 0, "clinic_id": str(clinic.clinic_id), "name": "Waiting Patient"}
    )
    local_token = start_res.json()["local_token"]

    event = db_session.query(models.Event).filter(
        models.Event.clinic_id == clinic.clinic_id,
        models.Event.local_token == local_token
    ).first()
    event.tests_suggested = "Thyroid Profile"
    db_session.commit()

    lookup_res = client.post(
        "/api/integrations/labs/lookup",
        json={"phone": phone, "member_id": 0}
    )
    assert lookup_res.status_code == 200
    data = lookup_res.json()
    assert data["found"] is True
    assert data["tests_suggested"] == ["Thyroid Profile"]


# ==============================================================================
# TEST 5: Lab lookup when no tests were suggested
# ==============================================================================
def test_5_lab_lookup_no_tests_suggested(client, db_session):
    clinic = create_mock_clinic(db_session, "Dr. K", "K Clinic")
    phone = "9876543005"

    start_res = client.post(
        "/api/events/visit/start",
        json={"phone": phone, "member_id": 0, "clinic_id": str(clinic.clinic_id), "name": "Healthy Patient"}
    )
    local_token = start_res.json()["local_token"]
    client.put(
        "/api/events/complete",
        json={"clinic_id": str(clinic.clinic_id), "local_token": local_token, "diagnosis": "Healthy"}
    )

    lookup_res = client.post(
        "/api/integrations/labs/lookup",
        json={"phone": phone, "member_id": 0}
    )
    assert lookup_res.status_code == 200
    data = lookup_res.json()
    assert data["found"] is True
    assert data["tests_suggested"] == []


# ==============================================================================
# TEST 6: Lab lookup with invalid phone number returns 400
# ==============================================================================
def test_6_lab_lookup_invalid_phone_returns_400(client, db_session):
    lookup_res = client.post(
        "/api/integrations/labs/lookup",
        json={"phone": "123", "member_id": 0}
    )
    assert lookup_res.status_code == 400
    assert "Invalid Phone Number" in lookup_res.json()["detail"]


# ==============================================================================
# TEST 7: Lab lookup for non-existent patient returns found: False
# ==============================================================================
def test_7_lab_lookup_patient_not_found(client, db_session):
    lookup_res = client.post(
        "/api/integrations/labs/lookup",
        json={"phone": "9999999999", "member_id": 0}
    )
    assert lookup_res.status_code == 200
    data = lookup_res.json()
    assert data["found"] is False
    assert "not found" in data["message"].lower()


# ==============================================================================
# TEST 8: Lab lookup scrubs sensitive identifiers (no network_token or clinic)
# ==============================================================================
def test_8_lab_lookup_scrubs_sensitive_identifiers(client, db_session):
    clinic = create_mock_clinic(db_session, "Dr. Secret", "Secret Clinic")
    phone = "9876543008"

    start_res = client.post(
        "/api/events/visit/start",
        json={"phone": phone, "member_id": 0, "clinic_id": str(clinic.clinic_id), "name": "Confidential"}
    )
    local_token = start_res.json()["local_token"]
    client.put(
        "/api/events/complete",
        json={"clinic_id": str(clinic.clinic_id), "local_token": local_token, "tests_suggested": "CBC"}
    )

    lookup_res = client.post(
        "/api/integrations/labs/lookup",
        json={"phone": phone, "member_id": 0}
    )
    data = lookup_res.json()
    assert "network_token" not in data
    assert "local_token" not in data
    assert "clinic_id" not in data
    assert "doctor_name" not in data
    assert "clinic_name" not in data


# ==============================================================================
# TEST 9: Lab results submission stores results & associates network_token
# ==============================================================================
def test_9_lab_results_submission_stores_in_db(client, db_session):
    clinic = create_mock_clinic(db_session, "Dr. Rao", "Rao Clinic")
    phone = "9876543009"

    start_res = client.post(
        "/api/events/visit/start",
        json={"phone": phone, "member_id": 0, "clinic_id": str(clinic.clinic_id), "name": "Meera Joshi"}
    )
    local_token = start_res.json()["local_token"]

    submit_res = client.post(
        "/api/integrations/labs/results",
        json={
            "patient_lookup": {"phone": phone, "member_id": 0},
            "results": {
                "hba1c": 7.4,
                "cbc_hb": 13.8,
                "cbc_wbc": 7200,
                "lipid_ldl": 140
            },
            "test_date": "2026-09-11"
        }
    )
    assert submit_res.status_code == 200
    data = submit_res.json()
    assert data["status"] == "success"
    assert data["results_recorded"] == 4

    lab_record = db_session.query(models.ClinicPatientLabRecord).filter(
        models.ClinicPatientLabRecord.clinic_id == clinic.clinic_id,
        models.ClinicPatientLabRecord.local_token == local_token
    ).first()
    assert lab_record is not None
    assert lab_record.network_token is not None
    assert lab_record.results["diab_hba1c"] == 7.4
    assert lab_record.results["haem_hb"] == 13.8
    assert lab_record.results["haem_wbc"] == 7200
    assert lab_record.results["diab_ldl"] == 140


# ==============================================================================
# TEST 10: Results automatically appear in doctor's flowsheet with zero manual effort
# ==============================================================================
def test_10_results_appear_in_doctor_flowsheet_zero_effort(client, db_session):
    clinic = create_mock_clinic(db_session, "Dr. Rao", "Rao Clinic")
    phone = "9876543010"

    start_res = client.post(
        "/api/events/visit/start",
        json={"phone": phone, "member_id": 0, "clinic_id": str(clinic.clinic_id), "name": "Suresh Raina"}
    )
    local_token = start_res.json()["local_token"]

    # Lab submits results externally
    client.post(
        "/api/integrations/labs/results",
        json={
            "patient_lookup": {"phone": phone, "member_id": 0},
            "results": {"hba1c": 6.8, "fbs": 105},
            "test_date": "2026-09-11"
        }
    )

    # Doctor queries existing View Labs endpoint
    doctor_res = client.get(
        f"/api/events/labs/{local_token}?clinic_id={clinic.clinic_id}"
    )
    assert doctor_res.status_code == 200
    doc_data = doctor_res.json()
    assert "labs" in doc_data
    assert len(doc_data["labs"]) >= 1
    today_lab = doc_data["labs"][0]
    assert today_lab["results"]["diab_hba1c"] == 6.8
    assert today_lab["results"]["diab_fbs"] == 105


# ==============================================================================
# TEST 11: Lab result alias mapping (hb, wbc, creat, tsh, fbs, etc.)
# ==============================================================================
def test_11_lab_result_alias_mapping(client, db_session):
    clinic = create_mock_clinic(db_session, "Dr. Shah", "Shah Clinic")
    phone = "9876543011"

    start_res = client.post(
        "/api/events/visit/start",
        json={"phone": phone, "member_id": 0, "clinic_id": str(clinic.clinic_id), "name": "Alias Test"}
    )
    local_token = start_res.json()["local_token"]

    client.post(
        "/api/integrations/labs/results",
        json={
            "patient_lookup": {"phone": phone, "member_id": 0},
            "results": {
                "hb": 14.2,
                "wbc": 6800,
                "rbc": 4.8,
                "plt": 250000,
                "esr": 12,
                "fbs": 98,
                "chol": 190,
                "creat": 0.85,
                "tsh": 2.1
            },
            "test_date": "2026-09-11"
        }
    )

    lab_rec = db_session.query(models.ClinicPatientLabRecord).filter(
        models.ClinicPatientLabRecord.clinic_id == clinic.clinic_id,
        models.ClinicPatientLabRecord.local_token == local_token
    ).first()
    assert lab_rec is not None
    assert lab_rec.results["haem_hb"] == 14.2
    assert lab_rec.results["haem_wbc"] == 6800
    assert lab_rec.results["haem_rbc"] == 4.8
    assert lab_rec.results["haem_plt"] == 250000
    assert lab_rec.results["haem_esr"] == 12
    assert lab_rec.results["diab_fbs"] == 98
    assert lab_rec.results["diab_chol"] == 190
    assert lab_rec.results["diab_creat"] == 0.85
    assert lab_rec.results["thy_tsh"] == 2.1


# ==============================================================================
# TEST 12: Duplicate lab submission on same date updates cleanly
# ==============================================================================
def test_12_duplicate_submission_updates_cleanly(client, db_session):
    clinic = create_mock_clinic(db_session, "Dr. Shah", "Shah Clinic")
    phone = "9876543012"

    client.post(
        "/api/events/visit/start",
        json={"phone": phone, "member_id": 0, "clinic_id": str(clinic.clinic_id), "name": "Dup Test"}
    )

    # First submission: HbA1c
    client.post(
        "/api/integrations/labs/results",
        json={
            "patient_lookup": {"phone": phone, "member_id": 0},
            "results": {"hba1c": 7.1},
            "test_date": "2026-09-11"
        }
    )

    # Second submission same date: update HbA1c and add FBS
    res2 = client.post(
        "/api/integrations/labs/results",
        json={
            "patient_lookup": {"phone": phone, "member_id": 0},
            "results": {"hba1c": 7.3, "fbs": 115},
            "test_date": "2026-09-11"
        }
    )
    assert res2.status_code == 200

    # Ensure only 1 record exists for that date
    records = db_session.query(models.ClinicPatientLabRecord).filter(
        models.ClinicPatientLabRecord.clinic_id == clinic.clinic_id
    ).all()
    assert len(records) == 1
    assert records[0].results["diab_hba1c"] == 7.3
    assert records[0].results["diab_fbs"] == 115


# ==============================================================================
# TEST 13: Lab submission with specific test_date
# ==============================================================================
def test_13_lab_submission_custom_date(client, db_session):
    clinic = create_mock_clinic(db_session, "Dr. Shah", "Shah Clinic")
    phone = "9876543013"

    client.post(
        "/api/events/visit/start",
        json={"phone": phone, "member_id": 0, "clinic_id": str(clinic.clinic_id), "name": "Date Test"}
    )

    res = client.post(
        "/api/integrations/labs/results",
        json={
            "patient_lookup": {"phone": phone, "member_id": 0},
            "results": {"hba1c": 6.5},
            "test_date": "2026-08-15"
        }
    )
    assert res.status_code == 200
    assert res.json()["test_date"] == "2026-08-15"

    rec = db_session.query(models.ClinicPatientLabRecord).filter(
        models.ClinicPatientLabRecord.clinic_id == clinic.clinic_id
    ).first()
    assert rec.test_date.strftime("%Y-%m-%d") == "2026-08-15"


# ==============================================================================
# TEST 14: Lab submission with empty/invalid results or invalid date returns 400
# ==============================================================================
def test_14_lab_submission_invalid_data_returns_400(client, db_session):
    clinic = create_mock_clinic(db_session, "Dr. Shah", "Shah Clinic")
    phone = "9876543014"

    client.post(
        "/api/events/visit/start",
        json={"phone": phone, "member_id": 0, "clinic_id": str(clinic.clinic_id), "name": "Validation Test"}
    )

    # Empty results
    res_empty = client.post(
        "/api/integrations/labs/results",
        json={"patient_lookup": {"phone": phone, "member_id": 0}, "results": {}}
    )
    assert res_empty.status_code == 400

    # Invalid date format
    res_bad_date = client.post(
        "/api/integrations/labs/results",
        json={"patient_lookup": {"phone": phone, "member_id": 0}, "results": {"hba1c": 7.0}, "test_date": "11-09-2026"}
    )
    assert res_bad_date.status_code == 400

    # Invalid phone
    res_bad_phone = client.post(
        "/api/integrations/labs/results",
        json={"patient_lookup": {"phone": "abc", "member_id": 0}, "results": {"hba1c": 7.0}}
    )
    assert res_bad_phone.status_code == 400


# ==============================================================================
# TEST 15: Lab submission for non-existent patient returns 404
# ==============================================================================
def test_15_lab_submission_patient_not_found(client, db_session):
    res = client.post(
        "/api/integrations/labs/results",
        json={"patient_lookup": {"phone": "9998887776", "member_id": 0}, "results": {"hba1c": 7.0}}
    )
    assert res.status_code == 404
    assert "not found" in res.json()["detail"].lower()


# ==============================================================================
# TEST 16: Cross-clinic history includes labs when consent is granted
# ==============================================================================
def test_16_cross_clinic_history_includes_labs_with_consent(client, db_session):
    clinic_a = create_mock_clinic(db_session, "Dr. A", "Clinic A")
    clinic_b = create_mock_clinic(db_session, "Dr. B", "Clinic B")
    phone = "9876543016"

    # Visit Clinic A, lab results recorded
    client.post(
        "/api/events/visit/start",
        json={"phone": phone, "member_id": 0, "clinic_id": str(clinic_a.clinic_id), "name": "Cross Patient"}
    )
    client.post(
        "/api/integrations/labs/results",
        json={
            "patient_lookup": {"phone": phone, "member_id": 0},
            "results": {"hba1c": 7.9, "ldl": 155},
            "test_date": "2026-09-05"
        }
    )

    # Visit Clinic B with consent
    res_b = client.post(
        "/api/events/visit/start",
        json={
            "phone": phone,
            "member_id": 0,
            "clinic_id": str(clinic_b.clinic_id),
            "name": "Cross Patient",
            "share_network_history": True
        }
    )
    local_token_b = res_b.json()["local_token"]

    net_res = client.get(
        f"/api/events/network-history/{local_token_b}?clinic_id={clinic_b.clinic_id}"
    )
    assert net_res.status_code == 200
    data = net_res.json()
    assert data["has_consent"] is True
    assert "labs" in data
    assert len(data["labs"]) >= 1
    lab = data["labs"][0]
    assert lab["test_date"] == "2026-09-05"
    assert lab["results"]["diab_hba1c"] == 7.9
    assert lab["results"]["diab_ldl"] == 155


# ==============================================================================
# TEST 17: Cross-clinic history excludes labs when consent is NOT granted
# ==============================================================================
def test_17_cross_clinic_history_excludes_labs_without_consent(client, db_session):
    clinic_a = create_mock_clinic(db_session, "Dr. A", "Clinic A")
    clinic_b = create_mock_clinic(db_session, "Dr. B", "Clinic B")
    phone = "9876543017"

    # Clinic A: labs recorded
    client.post(
        "/api/events/visit/start",
        json={"phone": phone, "member_id": 0, "clinic_id": str(clinic_a.clinic_id), "name": "Private Patient"}
    )
    client.post(
        "/api/integrations/labs/results",
        json={"patient_lookup": {"phone": phone, "member_id": 0}, "results": {"hba1c": 7.2}}
    )

    # Clinic B: consent NOT granted
    res_b = client.post(
        "/api/events/visit/start",
        json={
            "phone": phone,
            "member_id": 0,
            "clinic_id": str(clinic_b.clinic_id),
            "name": "Private Patient",
            "share_network_history": False
        }
    )
    local_token_b = res_b.json()["local_token"]

    net_res = client.get(
        f"/api/events/network-history/{local_token_b}?clinic_id={clinic_b.clinic_id}"
    )
    assert net_res.status_code == 200
    data = net_res.json()
    assert data["has_consent"] is False
    assert data["history"] == []
    assert data["labs"] == []


# ==============================================================================
# TEST 18: Doctor manual lab update populates network_token
# ==============================================================================
def test_18_doctor_manual_lab_update_populates_network_token(client, db_session):
    clinic = create_mock_clinic(db_session, "Dr. Manual", "Manual Clinic")
    phone = "9876543018"

    start_res = client.post(
        "/api/events/visit/start",
        json={"phone": phone, "member_id": 0, "clinic_id": str(clinic.clinic_id), "name": "Manual Lab Patient"}
    )
    local_token = start_res.json()["local_token"]

    # Doctor manually saves lab values via PUT /api/events/labs
    put_res = client.put(
        "/api/events/labs",
        json={
            "clinic_id": str(clinic.clinic_id),
            "local_token": local_token,
            "lab_record": {
                "test_date": "2026-09-11",
                "results": {"diab_hba1c": 6.9, "haem_hb": 14.0}
            }
        }
    )
    assert put_res.status_code == 200

    rec = db_session.query(models.ClinicPatientLabRecord).filter(
        models.ClinicPatientLabRecord.clinic_id == clinic.clinic_id,
        models.ClinicPatientLabRecord.local_token == local_token
    ).first()
    assert rec is not None
    assert rec.network_token is not None
    assert rec.results["diab_hba1c"] == 6.9


# ==============================================================================
# TEST 19: EXPLICIT PATIENT ISOLATION TEST (User Clarification 2)
#          Patient A cannot retrieve or receive Patient B's:
#          - suggested tests
#          - lab results
#          - network history
#          The backend independently resolves patient identity and never
#          trusts a network_token or internal identifier from client.
# ==============================================================================
def test_19_explicit_patient_isolation_strict(client, db_session):
    clinic_1 = create_mock_clinic(db_session, "Dr. Isolation 1", "Clinic 1")
    clinic_2 = create_mock_clinic(db_session, "Dr. Isolation 2", "Clinic 2")

    phone_a = "9876543019"
    phone_b = "9876543020"

    # --- Patient A at Clinic 1 ---
    res_a = client.post(
        "/api/events/visit/start",
        json={"phone": phone_a, "member_id": 0, "clinic_id": str(clinic_1.clinic_id), "name": "Patient Alpha"}
    )
    local_token_a = res_a.json()["local_token"]
    client.put(
        "/api/events/complete",
        json={
            "clinic_id": str(clinic_1.clinic_id),
            "local_token": local_token_a,
            "diagnosis": "Condition A",
            "tests_suggested": "HbA1c, Complete Blood Count"
        }
    )

    # --- Patient B at Clinic 2 ---
    res_b = client.post(
        "/api/events/visit/start",
        json={"phone": phone_b, "member_id": 0, "clinic_id": str(clinic_2.clinic_id), "name": "Patient Beta"}
    )
    local_token_b = res_b.json()["local_token"]
    client.put(
        "/api/events/complete",
        json={
            "clinic_id": str(clinic_2.clinic_id),
            "local_token": local_token_b,
            "diagnosis": "Condition B",
            "tests_suggested": "Lipid Profile, Thyroid TSH"
        }
    )

    # 1. Isolation in Partner Lab Lookup
    lookup_a = client.post("/api/integrations/labs/lookup", json={"phone": phone_a, "member_id": 0}).json()
    lookup_b = client.post("/api/integrations/labs/lookup", json={"phone": phone_b, "member_id": 0}).json()

    assert lookup_a["patient_name"] == "Patient Alpha"
    assert "HbA1c" in lookup_a["tests_suggested"]
    assert "Lipid Profile" not in lookup_a["tests_suggested"]
    assert "Thyroid TSH" not in lookup_a["tests_suggested"]

    assert lookup_b["patient_name"] == "Patient Beta"
    assert "Lipid Profile" in lookup_b["tests_suggested"]
    assert "HbA1c" not in lookup_b["tests_suggested"]
    assert "Complete Blood Count" not in lookup_b["tests_suggested"]

    # 2. Lab submits results for Patient A
    client.post(
        "/api/integrations/labs/results",
        json={
            "patient_lookup": {"phone": phone_a, "member_id": 0},
            "results": {"hba1c": 8.5, "cbc_hb": 12.5},
            "test_date": "2026-09-11"
        }
    )

    # Lab submits results for Patient B
    client.post(
        "/api/integrations/labs/results",
        json={
            "patient_lookup": {"phone": phone_b, "member_id": 0},
            "results": {"lipid_ldl": 165, "tsh": 5.2},
            "test_date": "2026-09-11"
        }
    )

    # 3. Isolation in Doctor Labs Endpoint
    labs_a = client.get(f"/api/events/labs/{local_token_a}?clinic_id={clinic_1.clinic_id}").json()
    labs_b = client.get(f"/api/events/labs/{local_token_b}?clinic_id={clinic_2.clinic_id}").json()

    # Patient A's doctor sees ONLY Patient A's results
    a_results = labs_a["labs"][0]["results"]
    assert a_results.get("diab_hba1c") == 8.5
    assert "diab_ldl" not in a_results
    assert "thy_tsh" not in a_results

    # Patient B's doctor sees ONLY Patient B's results
    b_results = labs_b["labs"][0]["results"]
    assert b_results.get("diab_ldl") == 165
    assert b_results.get("thy_tsh") == 5.2
    assert "diab_hba1c" not in b_results
    assert "haem_hb" not in b_results

    # 4. Cross-Clinic Isolation
    # Patient A visits Clinic 2 with consent
    res_a_visit2 = client.post(
        "/api/events/visit/start",
        json={
            "phone": phone_a,
            "member_id": 0,
            "clinic_id": str(clinic_2.clinic_id),
            "name": "Patient Alpha",
            "share_network_history": True
        }
    )
    local_token_a_v2 = res_a_visit2.json()["local_token"]

    net_a = client.get(f"/api/events/network-history/{local_token_a_v2}?clinic_id={clinic_2.clinic_id}").json()
    assert net_a["has_consent"] is True
    # Patient A's network history should contain Patient A's visit and labs, NEVER Patient B's
    for item in net_a["history"]:
        assert item.get("diagnosis") == "Condition A"
        assert item.get("diagnosis") != "Condition B"
    for lab in net_a["labs"]:
        assert "diab_hba1c" in lab["results"]
        assert "thy_tsh" not in lab["results"]


# ==============================================================================
# TEST 20: Lab portal web route & endpoint path parity
# ==============================================================================
def test_20_lab_portal_route_and_parity(client, db_session):
    clinic = create_mock_clinic(db_session, "Dr. Web", "Web Clinic")
    phone = "9876543021"

    client.post(
        "/api/events/visit/start",
        json={"phone": phone, "member_id": 0, "clinic_id": str(clinic.clinic_id), "name": "Web Patient"}
    )

    # 1. Verify GET /lab returns HTML portal
    portal_res = client.get("/lab")
    assert portal_res.status_code == 200
    assert "Tap2Med Partner Laboratory" in portal_res.text

    # 2. Verify POST /api/integrations/labs/lookup works directly
    res1 = client.post(
        "/api/integrations/labs/lookup",
        json={"phone": phone, "member_id": 0}
    )
    assert res1.status_code == 200
    assert res1.json()["found"] is True

    # 3. Verify POST /api/events/integrations/labs/lookup also works
    res2 = client.post(
        "/api/events/integrations/labs/lookup",
        json={"phone": phone, "member_id": 0}
    )
    assert res2.status_code == 200
    assert res2.json()["found"] is True
