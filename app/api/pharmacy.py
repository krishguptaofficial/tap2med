import logging
import uuid
from typing import Optional, List
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session
from sqlalchemy import text, func

from app.db.database import get_db
from app.db import models
from app.core import security

logger = logging.getLogger(__name__)

router = APIRouter()


class PharmacyRegisterRequest(BaseModel):
    name: str
    email: EmailStr
    password: str
    phone: Optional[str] = None
    license_no: Optional[str] = None
    address: Optional[str] = None
    latitude: float
    longitude: float


class PharmacyLoginRequest(BaseModel):
    email: EmailStr
    password: str


class ConnectClinicRequest(BaseModel):
    pharmacy_id: uuid.UUID
    clinic_code_or_id: str


class UpdateLocationRequest(BaseModel):
    latitude: float
    longitude: float
    address: Optional[str] = None


@router.post("/register")
def register_pharmacy(payload: PharmacyRegisterRequest, db: Session = Depends(get_db)):
    norm_email = str(payload.email).strip().lower()

    # Check if pharmacy email exists
    existing = db.query(models.Pharmacy).filter(func.lower(models.Pharmacy.email) == norm_email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A pharmacy with this email is already registered."
        )

    # Hash password
    pw_hash = security.hash_password(payload.password)

    pharmacy = models.Pharmacy(
        pharmacy_id=uuid.uuid4(),
        name=payload.name.strip(),
        email=norm_email,
        password_hash=pw_hash,
        phone=payload.phone.strip() if payload.phone else None,
        license_no=payload.license_no.strip() if payload.license_no else None,
        address=payload.address.strip() if payload.address else None,
        latitude=payload.latitude,
        longitude=payload.longitude,
        is_active=True
    )
    db.add(pharmacy)
    db.commit()
    db.refresh(pharmacy)

    logger.info(f"Registered new pharmacy: {pharmacy.name} ({pharmacy.email})")

    return {
        "status": "success",
        "pharmacy_id": str(pharmacy.pharmacy_id),
        "name": pharmacy.name,
        "email": pharmacy.email
    }


@router.post("/login")
def login_pharmacy(payload: PharmacyLoginRequest, db: Session = Depends(get_db)):
    norm_email = str(payload.email).strip().lower()

    pharmacy = db.query(models.Pharmacy).filter(func.lower(models.Pharmacy.email) == norm_email).first()
    if not pharmacy:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password."
        )

    if not security.verify_password(payload.password, pharmacy.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password."
        )

    logger.info(f"Pharmacy logged in: {pharmacy.name} ({pharmacy.email})")

    return {
        "status": "success",
        "pharmacy_id": str(pharmacy.pharmacy_id),
        "name": pharmacy.name,
        "email": pharmacy.email,
        "phone": pharmacy.phone or "",
        "license_no": pharmacy.license_no or "",
        "address": pharmacy.address or "",
        "latitude": pharmacy.latitude,
        "longitude": pharmacy.longitude
    }


@router.get("/{pharmacy_id}/profile")
def get_pharmacy_profile(pharmacy_id: uuid.UUID, db: Session = Depends(get_db)):
    pharmacy = db.query(models.Pharmacy).filter(models.Pharmacy.pharmacy_id == pharmacy_id).first()
    if not pharmacy:
        raise HTTPException(status_code=404, detail="Pharmacy not found.")

    return {
        "status": "success",
        "pharmacy": {
            "pharmacy_id": str(pharmacy.pharmacy_id),
            "name": pharmacy.name,
            "email": pharmacy.email,
            "phone": pharmacy.phone or "",
            "license_no": pharmacy.license_no or "",
            "address": pharmacy.address or "",
            "latitude": pharmacy.latitude,
            "longitude": pharmacy.longitude,
            "is_active": pharmacy.is_active,
            "created_at": pharmacy.created_at.isoformat() if pharmacy.created_at else None
        }
    }


@router.put("/{pharmacy_id}/location")
def update_pharmacy_location(
    pharmacy_id: uuid.UUID,
    payload: UpdateLocationRequest,
    db: Session = Depends(get_db)
):
    pharmacy = db.query(models.Pharmacy).filter(models.Pharmacy.pharmacy_id == pharmacy_id).first()
    if not pharmacy:
        raise HTTPException(status_code=404, detail="Pharmacy not found.")

    pharmacy.latitude = payload.latitude
    pharmacy.longitude = payload.longitude
    if payload.address:
        pharmacy.address = payload.address.strip()
    db.commit()

    return {
        "status": "success",
        "latitude": pharmacy.latitude,
        "longitude": pharmacy.longitude,
        "address": pharmacy.address
    }


@router.post("/connect-clinic")
def connect_clinic(payload: ConnectClinicRequest, db: Session = Depends(get_db)):
    pharmacy = db.query(models.Pharmacy).filter(models.Pharmacy.pharmacy_id == payload.pharmacy_id).first()
    if not pharmacy:
        raise HTTPException(status_code=404, detail="Pharmacy not found.")

    raw_input = payload.clinic_code_or_id.strip()
    clean_code = raw_input.upper()
    if clean_code.startswith("CLINIC-"):
        clean_code = clean_code[len("CLINIC-"):]
    elif clean_code.startswith("CLINIC"):
        clean_code = clean_code[len("CLINIC"):]

    # Resolve clinic
    target_clinic = None

    # Try UUID parse
    try:
        parsed_uuid = uuid.UUID(raw_input)
        target_clinic = db.query(models.Clinic).filter(models.Clinic.clinic_id == parsed_uuid).first()
    except Exception:
        pass

    # Match by hex prefix (e.g. CLINIC-4A1B -> 4A1B matching start of clinic_id hex)
    if not target_clinic and len(clean_code) >= 3:
        all_clinics = db.query(models.Clinic).all()
        for c in all_clinics:
            c_hex = c.clinic_id.hex.upper()
            if c_hex.startswith(clean_code):
                target_clinic = c
                break

    # Match by doctor email or clinic name
    if not target_clinic:
        target_clinic = (
            db.query(models.Clinic)
            .filter(
                (func.lower(models.Clinic.doctor_email) == raw_input.lower()) |
                (func.lower(models.Clinic.clinic_name) == raw_input.lower())
            )
            .first()
        )

    if not target_clinic:
        raise HTTPException(
            status_code=404,
            detail=f"Clinic not found with code or identifier '{raw_input}'."
        )

    # Check if link exists
    link = db.query(models.ClinicPharmacyLink).filter(
        models.ClinicPharmacyLink.clinic_id == target_clinic.clinic_id,
        models.ClinicPharmacyLink.pharmacy_id == pharmacy.pharmacy_id
    ).first()

    if link:
        link.status = "connected"
        db.commit()
    else:
        new_link = models.ClinicPharmacyLink(
            link_id=uuid.uuid4(),
            clinic_id=target_clinic.clinic_id,
            pharmacy_id=pharmacy.pharmacy_id,
            status="connected"
        )
        db.add(new_link)
        db.commit()

    logger.info(f"Linked pharmacy '{pharmacy.name}' to clinic '{target_clinic.clinic_name}'")

    return {
        "status": "success",
        "clinic_id": str(target_clinic.clinic_id),
        "clinic_name": target_clinic.clinic_name,
        "doctor_name": target_clinic.doctor_name,
        "partner_code": f"CLINIC-{target_clinic.clinic_id.hex[:4].upper()}"
    }


@router.get("/{pharmacy_id}/connected-clinics")
def get_connected_clinics(pharmacy_id: uuid.UUID, db: Session = Depends(get_db)):
    pharmacy = db.query(models.Pharmacy).filter(models.Pharmacy.pharmacy_id == pharmacy_id).first()
    if not pharmacy:
        raise HTTPException(status_code=404, detail="Pharmacy not found.")

    links = (
        db.query(models.ClinicPharmacyLink)
        .filter(
            models.ClinicPharmacyLink.pharmacy_id == pharmacy_id,
            models.ClinicPharmacyLink.status == "connected"
        )
        .all()
    )

    results = []
    for link in links:
        clinic = db.query(models.Clinic).filter(models.Clinic.clinic_id == link.clinic_id).first()
        if clinic:
            results.append({
                "link_id": str(link.link_id),
                "clinic_id": str(clinic.clinic_id),
                "clinic_name": clinic.clinic_name,
                "doctor_name": clinic.doctor_name,
                "doctor_email": clinic.doctor_email,
                "partner_code": f"CLINIC-{clinic.clinic_id.hex[:4].upper()}",
                "status": link.status,
                "connected_at": link.created_at.isoformat() if link.created_at else None
            })

    return {
        "status": "success",
        "clinics": results
    }


class DispenseActionPayload(BaseModel):
    local_token: Optional[str] = None
    status: str = "dispensed"


@router.post("/{pharmacy_id}/dispense/{event_id}")
def mark_prescription_dispensed(
    pharmacy_id: uuid.UUID,
    event_id: uuid.UUID,
    payload: Optional[DispenseActionPayload] = None,
    db: Session = Depends(get_db)
):
    pharmacy = db.query(models.Pharmacy).filter(models.Pharmacy.pharmacy_id == pharmacy_id).first()
    if not pharmacy:
        raise HTTPException(status_code=404, detail="Pharmacy not found.")

    event = db.query(models.Event).filter(models.Event.event_id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Prescription event not found.")

    # Check connection
    link = db.query(models.ClinicPharmacyLink).filter(
        models.ClinicPharmacyLink.pharmacy_id == pharmacy_id,
        models.ClinicPharmacyLink.clinic_id == event.clinic_id,
        models.ClinicPharmacyLink.status == "connected"
    ).first()
    if not link:
        raise HTTPException(status_code=403, detail="Clinic is not connected to this pharmacy.")

    target_status = payload.status if payload and payload.status else "dispensed"

    record = (
        db.query(models.PharmacyDispense)
        .filter(models.PharmacyDispense.event_id == event.event_id)
        .first()
    )
    if record:
        record.status = target_status
    else:
        record = models.PharmacyDispense(
            dispense_id=uuid.uuid4(),
            clinic_id=event.clinic_id,
            event_id=event.event_id,
            local_token=event.local_token,
            status=target_status
        )
        db.add(record)

    event.status = target_status
    db.commit()

    logger.info(f"Pharmacy {pharmacy.name} set event {event_id} dispense status to '{target_status}'.")

    return {
        "status": "success",
        "message": f"Prescription marked as {target_status}.",
        "event_id": str(event.event_id),
        "dispense_status": target_status
    }


@router.get("/{pharmacy_id}/prescriptions")
def get_incoming_prescriptions(
    pharmacy_id: uuid.UUID,
    hours: int = 12,
    limit: int = 50,
    db: Session = Depends(get_db)
):
    try:
        pharmacy = db.query(models.Pharmacy).filter(models.Pharmacy.pharmacy_id == pharmacy_id).first()
        if not pharmacy:
            raise HTTPException(status_code=404, detail="Pharmacy not found.")

        # Get all clinics connected to this pharmacy
        links = (
            db.query(models.ClinicPharmacyLink)
            .filter(
                models.ClinicPharmacyLink.pharmacy_id == pharmacy_id,
                models.ClinicPharmacyLink.status == "connected"
            )
            .all()
        )
        clinic_ids = [l.clinic_id for l in links]

        if not clinic_ids:
            return {
                "status": "success",
                "prescriptions": [],
                "pending_count": 0,
                "dispensed_count": 0,
                "routing_window_hours": hours
            }

        # 12-hour active routing cutoff (only show that day's routing, prunes older visits)
        cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)

        # Fetch visit events from connected clinics within the 12-hour window
        events = (
            db.query(models.Event)
            .filter(
                models.Event.clinic_id.in_(clinic_ids),
                models.Event.timestamp >= cutoff,
                models.Event.status.in_(["completed", "active", "dispensed"])
            )
            .order_by(models.Event.timestamp.desc())
            .limit(limit)
            .all()
        )

        event_ids = [ev.event_id for ev in events]
        dispenses = {}
        if event_ids:
            d_records = (
                db.query(models.PharmacyDispense)
                .filter(models.PharmacyDispense.event_id.in_(event_ids))
                .all()
            )
            for d in d_records:
                dispenses[d.event_id] = d

        clinic_cache = {}
        results = []
        pending_count = 0
        dispensed_count = 0

        for ev in events:
            if ev.clinic_id not in clinic_cache:
                clinic_cache[ev.clinic_id] = db.query(models.Clinic).filter(models.Clinic.clinic_id == ev.clinic_id).first()
            clinic = clinic_cache[ev.clinic_id]

            # Fetch prescriptions for this event
            rxs = db.query(models.Prescription).filter(models.Prescription.event_id == ev.event_id).all()
            med_list = []
            for r in rxs:
                med_list.append({
                    "medicine_name": r.medicine_name,
                    "dosage": r.dosage or "",
                    "duration": r.duration or "",
                    "instructions": r.instructions or "",
                    "inferred_symptom": r.inferred_symptom or ""
                })

            d_rec = dispenses.get(ev.event_id)
            is_dispensed = (d_rec is not None and d_rec.status == "dispensed") or (ev.status == "dispensed")

            if is_dispensed:
                dispensed_count += 1
            else:
                pending_count += 1

            token_val = getattr(ev, "daily_token_number", None)
            if token_val is None:
                token_val = getattr(ev, "token_number", None)

            results.append({
                "event_id": str(ev.event_id),
                "clinic_id": str(ev.clinic_id),
                "clinic_name": clinic.clinic_name if clinic else "Clinic",
                "doctor_name": clinic.doctor_name if clinic else "Doctor",
                "local_token": ev.local_token,
                "token_number": token_val,
                "daily_token_number": token_val,
                "timestamp": ev.timestamp.isoformat() if ev.timestamp else None,
                "status": ev.status,
                "is_dispensed": is_dispensed,
                "dispense_status": "dispensed" if is_dispensed else "pending",
                "dispensed_at": d_rec.created_at.isoformat() if (d_rec and d_rec.created_at) else None,
                "advice": ev.advice or "",
                "medicines": med_list
            })

        # Pending items (0) come first, followed by Dispensed items (1)
        results.sort(key=lambda x: (1 if x["is_dispensed"] else 0, x["timestamp"] or ""))

        return {
            "status": "success",
            "prescriptions": results,
            "pending_count": pending_count,
            "dispensed_count": dispensed_count,
            "routing_window_hours": hours
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching prescriptions for pharmacy {pharmacy_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to fetch prescriptions: {str(e)}")
