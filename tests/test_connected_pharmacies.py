import pytest
import uuid
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.dialects.postgresql import JSONB

@compiles(JSONB, "sqlite")
def compile_jsonb_sqlite(type_, compiler, **kw):
    return "JSON"

from app.main import app
from app.db.database import Base, get_db
from app.db import models, crud

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
    connection = engine.connect()
    transaction = connection.begin()
    session = TestingSessionLocal(bind=connection)
    app.dependency_overrides[get_db] = lambda: session
    yield session
    session.close()
    transaction.rollback()
    connection.close()

@pytest.fixture
def client(db_session):
    return TestClient(app)

def test_pharmacy_registration_and_nearby_search(client, db_session):
    # 1. Create a mock clinic
    clinic1 = crud.create_clinic(db_session, "Dr. Gupta", "City Health Clinic")
    clinic2 = crud.create_clinic(db_session, "Dr. Sharma", "Metro Care Clinic")
    
    # 2. Register pharmacies for clinic 1
    # Center user coordinates: lat: 28.5672, lng: 77.2100
    # Pharmacy 1: ~100m away
    res1 = client.post(
        f"/api/clinics/{clinic1.clinic_id}/pharmacies/register",
        json={
            "name": "Apollo Pharmacy Clinic Gate",
            "address": "Gate 1, Ground Floor",
            "phone": "+91 9876543210",
            "latitude": 28.5680,
            "longitude": 77.2105
        }
    )
    assert res1.status_code == 200
    data1 = res1.json()
    assert data1["status"] == "success"
    assert "pharmacy_id" in data1
    assert data1["pharmacy"]["name"] == "Apollo Pharmacy Clinic Gate"

    # Pharmacy 2: ~400m away
    res2 = client.post(
        f"/api/clinics/{clinic1.clinic_id}/pharmacies/register",
        json={
            "name": "MedPlus Health",
            "address": "Crossroad 2",
            "phone": "+91 9876543211",
            "latitude": 28.5700,
            "longitude": 77.2120
        }
    )
    assert res2.status_code == 200

    # Pharmacy 3: ~3000m (3km) away (outside 1000m radius)
    res3 = client.post(
        f"/api/clinics/{clinic1.clinic_id}/pharmacies/register",
        json={
            "name": "Faraway Meds",
            "address": "Far Avenue",
            "phone": "+91 9876543212",
            "latitude": 28.5950,
            "longitude": 77.2300
        }
    )
    assert res3.status_code == 200

    # Pharmacy 4: Connected to clinic 2 (should NOT show up for clinic 1)
    res4 = client.post(
        f"/api/clinics/{clinic2.clinic_id}/pharmacies/register",
        json={
            "name": "Clinic 2 Local Pharmacy",
            "address": "Gate 2",
            "phone": "+91 9876543213",
            "latitude": 28.5675,
            "longitude": 77.2102
        }
    )
    assert res4.status_code == 200

    # 3. Query nearby pharmacies for clinic 1 with user at (28.5672, 77.2100) and radius 1000m
    nearby_res = client.get(
        f"/api/clinics/{clinic1.clinic_id}/pharmacies/nearby?lat=28.5672&lng=77.2100&radius_meters=1000"
    )
    assert nearby_res.status_code == 200
    nearby_data = nearby_res.json()
    assert nearby_data["status"] == "success"
    pharmacies = nearby_data["pharmacies"]

    # Should only contain Pharmacy 1 and Pharmacy 2 (Pharmacy 3 is > 1000m, Pharmacy 4 is Clinic 2)
    assert len(pharmacies) == 2
    assert pharmacies[0]["name"] == "Apollo Pharmacy Clinic Gate"
    assert pharmacies[1]["name"] == "MedPlus Health"
    # Verify sorted ascending by distance
    assert pharmacies[0]["distance"] <= pharmacies[1]["distance"]
    assert pharmacies[0]["distance"] <= 1000
    assert pharmacies[1]["distance"] <= 1000

    # 4. Check querying with smaller radius (e.g. 200m) returns only the closest one
    nearby_res_small = client.get(
        f"/api/clinics/{clinic1.clinic_id}/pharmacies/nearby?lat=28.5672&lng=77.2100&radius_meters=200"
    )
    assert nearby_res_small.status_code == 200
    small_pharmacies = nearby_res_small.json()["pharmacies"]
    assert len(small_pharmacies) == 1
    assert small_pharmacies[0]["name"] == "Apollo Pharmacy Clinic Gate"

    # 5. Check querying with non-existent clinic
    non_existent_id = uuid.uuid4()
    nearby_none = client.get(
        f"/api/clinics/{non_existent_id}/pharmacies/nearby?lat=28.5672&lng=77.2100&radius_meters=1000"
    )
    assert nearby_none.status_code == 200
    assert nearby_none.json()["pharmacies"] == []
