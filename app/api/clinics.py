from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional
from sqlalchemy.orm.attributes import flag_modified
from pydantic import BaseModel
import uuid
import math
import json
from datetime import datetime
from zoneinfo import ZoneInfo
from sqlalchemy import func, text

from app.core import security
from app.db import crud, models
from app.db.database import get_db

router = APIRouter()
IST = ZoneInfo("Asia/Kolkata")

@router.get("/fix_db")
def fix_db(db: Session = Depends(get_db)):
    queries = [
        "ALTER TABLE clinics ADD COLUMN qualifications TEXT;",
        "ALTER TABLE clinics ADD COLUMN address TEXT;",
        "ALTER TABLE clinics ADD COLUMN extra_notes TEXT;",
        "ALTER TABLE clinics ADD COLUMN IF NOT EXISTS save_patient_phone BOOLEAN NOT NULL DEFAULT FALSE;",
        "ALTER TABLE clinics ADD COLUMN IF NOT EXISTS print_header BOOLEAN NOT NULL DEFAULT TRUE;",
        "ALTER TABLE clinics ADD COLUMN IF NOT EXISTS hfr_id TEXT;",
        "ALTER TABLE clinics ADD COLUMN IF NOT EXISTS uhi_node_uri TEXT;",
        "ALTER TABLE clinic_patient_records ADD COLUMN IF NOT EXISTS phone_number TEXT;",
        "ALTER TABLE events ADD COLUMN advice TEXT;",
        "ALTER TABLE events ADD COLUMN follow_up_days INTEGER DEFAULT 3;",
        """CREATE TABLE IF NOT EXISTS connected_pharmacies (
            pharmacy_id UUID PRIMARY KEY,
            clinic_id UUID NOT NULL REFERENCES clinics(clinic_id),
            name TEXT NOT NULL,
            address TEXT,
            phone TEXT,
            latitude DOUBLE PRECISION NOT NULL,
            longitude DOUBLE PRECISION NOT NULL,
            is_active BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );""",
        "CREATE INDEX IF NOT EXISTS ix_connected_pharmacies_clinic_id ON connected_pharmacies(clinic_id);",
        """CREATE TABLE IF NOT EXISTS pharmacies (
            pharmacy_id UUID PRIMARY KEY,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            phone TEXT,
            license_no TEXT,
            address TEXT,
            latitude DOUBLE PRECISION NOT NULL,
            longitude DOUBLE PRECISION NOT NULL,
            is_active BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );""",
        "CREATE INDEX IF NOT EXISTS ix_pharmacies_email ON pharmacies(email);",
        """CREATE TABLE IF NOT EXISTS clinic_pharmacy_links (
            link_id UUID PRIMARY KEY,
            clinic_id UUID NOT NULL REFERENCES clinics(clinic_id),
            pharmacy_id UUID NOT NULL REFERENCES pharmacies(pharmacy_id),
            status TEXT DEFAULT 'connected',
            created_at TIMESTAMPTZ DEFAULT NOW()
        );""",
        "CREATE INDEX IF NOT EXISTS ix_clinic_pharmacy_links_clinic_id ON clinic_pharmacy_links(clinic_id);",
        "CREATE INDEX IF NOT EXISTS ix_clinic_pharmacy_links_pharmacy_id ON clinic_pharmacy_links(pharmacy_id);"
    ]
    for q in queries:
        try:
            db.execute(text(q))
            db.commit()
        except Exception:
            db.rollback()
    
    return {"status": "ok"}


class ClinicCreate(BaseModel):
    doctor_name: str
    clinic_name: str

@router.post("/")
def onboard_clinic(payload: ClinicCreate, db: Session = Depends(get_db)):
    try:
        new_clinic = crud.create_clinic(db=db, doctor_name=payload.doctor_name, clinic_name=payload.clinic_name)

        # UHI 30-second onboarding: provisional identifiers
        new_clinic.hfr_id = f"IN-HFR-{new_clinic.clinic_id.hex[:5].upper()}"
        new_clinic.uhi_node_uri = f"uhi://tap2med.com/hspa/{new_clinic.clinic_id}"
        db.commit()
        db.refresh(new_clinic)

        return {
            "status": "success",
            "clinic_id": new_clinic.clinic_id,
            "doctor": new_clinic.doctor_name,
            "hfr_id": new_clinic.hfr_id,
            "uhi_node_uri": new_clinic.uhi_node_uri
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/queue/{clinic_id}")
def get_clinic_queue(clinic_id: uuid.UUID, db: Session = Depends(get_db)):
    try:
        clinic = db.query(models.Clinic).filter(models.Clinic.clinic_id == clinic_id).first()
        if not clinic:
            raise HTTPException(status_code=404, detail="Clinic not found")

        now_ist = datetime.now(IST)
        today_start = now_ist.replace(hour=0, minute=0, second=0, microsecond=0)
        today_end = now_ist.replace(hour=23, minute=59, second=59, microsecond=999999)
        
        queue = db.query(models.Event).filter(
            models.Event.clinic_id == clinic_id,
            models.Event.timestamp >= today_start,
            models.Event.timestamp <= today_end,
            models.Event.status.in_(["waiting", "completed"]) 
        ).all()

        # Sort dynamically using hidden queue_pos so token numbers remain unchanged
        def get_sort_key(event):
            try:
                if event.vitals and isinstance(event.vitals, dict):
                    if "queue_pos" in event.vitals:
                        return float(event.vitals["queue_pos"])
                return float(event.timestamp.timestamp()) if event.timestamp else 0.0
            except Exception:
                return 0.0

        queue.sort(key=get_sort_key)

        patient_records = {
            rec.local_token: rec 
            for rec in db.query(models.ClinicPatientRecord).filter(models.ClinicPatientRecord.clinic_id == clinic_id).all()
        }

        formatted_queue = []
        for event in queue:
            rec = patient_records.get(event.local_token)
            patient_name = rec.patient_name if rec else "Patient"
            patient_city = rec.city if rec and rec.city else ""
            patient_display_id = event.local_token[:8].upper()
            
            visit_type = event.event_type if event.event_type else "walkin"
            if visit_type == "clinic_visit": visit_type = "walkin" 
            
            fee = ""
            if visit_type == "walkin": fee = clinic.walkin_fee or ""
            elif visit_type == "appointment": fee = clinic.appointment_fee or ""
            elif visit_type == "followup": fee = clinic.followup_fee or ""

            formatted_queue.append({
                "event_id": str(event.event_id), 
                "local_token": event.local_token,
                "daily_token_number": event.daily_token_number, 
                "status": event.status,
                "weight": event.patient_weight,
                "vitals": event.vitals,
                "patient_name": patient_name,
                "city": patient_city,
                "age": rec.age if rec else None,
                "phone": getattr(rec, 'phone_number', None) if rec else None,
                "display_id": patient_display_id,
                "timestamp": event.timestamp.isoformat(),
                "visit_type": visit_type,
                "fee": fee
            })
            
        waiting = [q for q in formatted_queue if q['status'] == 'waiting']
        completed = [q for q in formatted_queue if q['status'] == 'completed']
        formatted_queue = waiting + completed
        
        safe_clinic_name = clinic.clinic_name if clinic else "Clinic"
        safe_doctor_name = clinic.doctor_name if clinic and hasattr(clinic, 'doctor_name') else "Doctor"

        return {
            "status": "success",
            "queue": formatted_queue,
            "clinic_name": safe_clinic_name,
            "doctor_name": safe_doctor_name
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class ReorderPayload(BaseModel):
    local_tokens: list[str]

@router.put("/{clinic_id}/queue/reorder")
def reorder_queue(clinic_id: uuid.UUID, payload: ReorderPayload, db: Session = Depends(get_db)):
    try:
        now_ist = datetime.now(IST)
        today_start = now_ist.replace(hour=0, minute=0, second=0, microsecond=0)
        today_end = now_ist.replace(hour=23, minute=59, second=59, microsecond=999999)

        waiting = db.query(models.Event).filter(
            models.Event.clinic_id == clinic_id,
            models.Event.timestamp >= today_start,
            models.Event.timestamp <= today_end,
            models.Event.status == "waiting",
        ).all()
        events_by_token = {event.local_token: event for event in waiting}
        ordered_tokens = [token for token in payload.local_tokens if token in events_by_token]
        remaining_tokens = [str(event.local_token) for event in waiting if event.local_token not in ordered_tokens]
        ordered_tokens.extend(remaining_tokens)

        for position, token in enumerate(ordered_tokens):
            event = events_by_token[token]
            vitals = dict(event.vitals) if isinstance(event.vitals, dict) else {}
            vitals["queue_pos"] = position
            event.vitals = vitals
            flag_modified(event, "vitals")

        db.commit()
        return {"status": "success"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

class RoleUpdate(BaseModel):
    role_type: str 
    username: str
    passcode: str

@router.put("/{clinic_id}/roles")
def update_clinic_roles(clinic_id: uuid.UUID, payload: RoleUpdate, db: Session = Depends(get_db)):
    clinic = db.query(models.Clinic).filter(models.Clinic.clinic_id == clinic_id).first()
    if not clinic:
        raise HTTPException(status_code=404, detail="Clinic not found")
    
    hashed_pin = security.hash_password(payload.passcode)
    
    if payload.role_type == "staff":
        clinic.staff_username = payload.username
        clinic.staff_passcode_hash = hashed_pin
    elif payload.role_type == "pharmacy":
        clinic.pharmacy_username = payload.username
        clinic.pharmacy_passcode_hash = hashed_pin
    else:
        raise HTTPException(status_code=400, detail="Invalid role type")
        
    db.commit()
    return {"status": "success"}

@router.get("/pharmacy/{clinic_id}")
def get_pharmacy_feed(clinic_id: uuid.UUID, db: Session = Depends(get_db)):
    try:
        now_ist = datetime.now(IST)
        today_start = now_ist.replace(hour=0, minute=0, second=0, microsecond=0)
        today_end = now_ist.replace(hour=23, minute=59, second=59, microsecond=999999)
        
        completed_events = db.query(models.Event).filter(
            models.Event.clinic_id == clinic_id,
            models.Event.timestamp >= today_start,
            models.Event.timestamp <= today_end,
            models.Event.status == "completed"
        ).order_by(models.Event.timestamp.desc()).all() 

        patient_records = {
            rec.local_token: rec 
            for rec in db.query(models.ClinicPatientRecord).filter(models.ClinicPatientRecord.clinic_id == clinic_id).all()
        }

        feed = []
        dispense_map = {
            d.event_id: d.status
            for d in db.query(models.PharmacyDispense).filter(models.PharmacyDispense.clinic_id == clinic_id).all()
        }
        for event in completed_events:
            rx_list = db.query(models.Prescription).filter(
                models.Prescription.event_id == event.event_id,
                models.Prescription.drug_category.in_(["MEDICINE", "Not available in v0", None])
            ).all()
            
            if rx_list:
                rec = patient_records.get(event.local_token)
                patient_name = rec.patient_name if rec else "Patient"
                display_id = event.local_token[:8].upper()
                
                feed.append({
                    "local_token": event.local_token,
                    "token_number": event.daily_token_number,
                    "display_id": display_id,
                    "patient_name": patient_name,
                    "medicines": [{"name": rx.medicine_name, "instructions": rx.instructions} for rx in rx_list],
                    "dispense_status": dispense_map.get(event.event_id)
                })

        return {"status": "success", "feed": feed}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class EpharmacyRoutePayload(BaseModel):
    clinic_id: uuid.UUID
    medicine_name: str
    quantity: int = 1
    local_token: Optional[str] = None
    reason: Optional[str] = "Out of stock at local retail pharmacy"


@router.post("/pharmacy/route-epharmacy")
def route_epharmacy(payload: EpharmacyRoutePayload, db: Session = Depends(get_db)):
    clinic = crud.get_clinic(db, payload.clinic_id)
    if not clinic:
        raise HTTPException(status_code=404, detail="Clinic not found")
    if payload.quantity < 1:
        raise HTTPException(status_code=400, detail="quantity must be at least 1")

    name = (payload.medicine_name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="medicine_name is required")

    try:
        order = models.EpharmacyOrder(
            clinic_id=payload.clinic_id,
            local_token=payload.local_token,
            medicine_name=name,
            quantity=payload.quantity,
            reason=payload.reason,
            status="routed",
            uhi_node_uri=clinic.uhi_node_uri,
        )
        db.add(order)
        db.commit()
        db.refresh(order)
        return {
            "status": "success",
            "order_id": str(order.order_id),
            "order_status": order.status,
            "medicine": order.medicine_name,
            "quantity": order.quantity,
            "routed_via": "UHI E-Pharmacy",
            "origin_node": order.uhi_node_uri,
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    
@router.get("/{clinic_id}/directory")
def get_clinic_directory(clinic_id: uuid.UUID, date_filter: str = None, search: str = None, db: Session = Depends(get_db)):
    try:
        query = db.query(models.Event).filter(
            models.Event.clinic_id == clinic_id, 
            models.Event.status == "completed"
        )
        
        if search:
            query = query.filter(models.Event.local_token.ilike(f"{search.lower()}%"))
        else:
            if date_filter:
                target_date = datetime.strptime(date_filter, "%Y-%m-%d").date()
                target_start = datetime.combine(target_date, datetime.min.time(), tzinfo=IST)
                target_end = datetime.combine(target_date, datetime.max.time(), tzinfo=IST)
            else:
                now_ist = datetime.now(IST)
                target_start = now_ist.replace(hour=0, minute=0, second=0, microsecond=0)
                target_end = now_ist.replace(hour=23, minute=59, second=59, microsecond=999999)
                
            query = query.filter(
                models.Event.timestamp >= target_start, 
                models.Event.timestamp <= target_end
            )
            
        events = query.order_by(models.Event.timestamp.desc()).all()
        
        patient_records = {
            rec.local_token: rec 
            for rec in db.query(models.ClinicPatientRecord).filter(models.ClinicPatientRecord.clinic_id == clinic_id).all()
        }
        clinic = db.query(models.Clinic).filter(models.Clinic.clinic_id == clinic_id).first()
        
        seen_tokens = set()
        results = []
        for e in events:
            if e.local_token not in seen_tokens:
                seen_tokens.add(e.local_token)
                
                rec = patient_records.get(e.local_token)
                name = rec.patient_name if rec else "Archived Patient"
                    
                results.append({
                    "display_id": e.local_token[:8].upper(),
                    "local_token": e.local_token,
                    "timestamp": e.timestamp.isoformat(),
                    "daily_token_number": e.daily_token_number,
                    "event_type": e.event_type,
                    "fee": (
                        clinic.walkin_fee if e.event_type == "walkin"
                        else clinic.appointment_fee if e.event_type == "appointment"
                        else clinic.followup_fee
                    ),
                    "patient_name": name,
                    "vitals": e.patient_weight
                })
                
        return {"status": "success", "results": results}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class ClinicSettingsPayload(BaseModel):
    walkin_fee: str = ""
    appointment_fee: str = ""
    followup_fee: str = ""
    followup_days: str = ""
    qualifications: str = ""
    address: str = ""
    extra_notes: str = ""
    save_patient_phone: bool = False
    print_header: bool = True

@router.put("/{clinic_id}/preferences")
def update_preferences(clinic_id: uuid.UUID, payload: ClinicSettingsPayload, db: Session = Depends(get_db)):
    try:
        clinic = db.query(models.Clinic).filter(models.Clinic.clinic_id == clinic_id).first()
        if not clinic:
            raise HTTPException(status_code=404, detail="Clinic not found")
        
        clinic.walkin_fee = payload.walkin_fee
        clinic.appointment_fee = payload.appointment_fee
        clinic.followup_fee = payload.followup_fee
        clinic.followup_days = int(payload.followup_days) if payload.followup_days.isdigit() else 0
        clinic.qualifications = payload.qualifications
        clinic.address = payload.address
        clinic.extra_notes = payload.extra_notes
        clinic.save_patient_phone = payload.save_patient_phone
        clinic.print_header = payload.print_header
        
        db.commit()
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{clinic_id}/preferences")
def get_preferences(clinic_id: uuid.UUID, db: Session = Depends(get_db)):
    try:
        clinic = db.query(models.Clinic).filter(models.Clinic.clinic_id == clinic_id).first()
        if clinic:
            return {
                "walkin_fee": clinic.walkin_fee or "",
                "appointment_fee": clinic.appointment_fee or "",
                "followup_fee": clinic.followup_fee or "",
                "followup_days": str(clinic.followup_days) if clinic.followup_days else "",
                "qualifications": clinic.qualifications or "",
                "address": clinic.address or "",
                "extra_notes": clinic.extra_notes or "",
                "save_patient_phone": getattr(clinic, 'save_patient_phone', False),
                "print_header": getattr(clinic, 'print_header', True)
            }
        return {"appointment_fee": "", "walkin_fee": "", "followup_fee": "", "followup_days": "", "qualifications": "", "address": "", "extra_notes": "", "save_patient_phone": False, "print_header": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
# ===============================================================
# PHARMACY STOCK / DISPENSE / SUBSTITUTION ENDPOINTS  (Person 3)
# Paste this whole block at the BOTTOM of app/api/clinics.py
# (no new imports needed: uuid, func, BaseModel, models, IST,
#  HTTPException, Depends, Session, datetime are already imported there)
# ===============================================================


def _norm_key(text_value: str) -> str:
    """Lowercase + single spaces. Same rule the seed script uses."""
    return " ".join((text_value or "").lower().split())


def _find_stock_row(db: Session, clinic_id: uuid.UUID, medicine: str):
    """
    Match what the doctor typed against this clinic's stock list.
    Spaces are ignored, so 'paracetamol500mg' matches 'Paracetamol 500mg'.
    Order: exact match, then starts-with, then contains (3+ letters only).
    """
    typed = _norm_key(medicine).replace(" ", "")
    if len(typed) < 2:
        return None

    no_space = func.replace(models.PharmacyStock.medicine_key, " ", "")
    base = db.query(models.PharmacyStock).filter(models.PharmacyStock.clinic_id == clinic_id)

    row = base.filter(no_space == typed).first()
    if row:
        return row

    row = base.filter(no_space.startswith(typed, autoescape=True)).order_by(
        func.length(models.PharmacyStock.medicine_key)
    ).first()
    if row:
        return row

    if len(typed) >= 3:
        row = base.filter(no_space.contains(typed, autoescape=True)).order_by(
            func.length(models.PharmacyStock.medicine_key)
        ).first()
    return row


@router.get("/pharmacy/{clinic_id}/check-stock")
def check_stock(clinic_id: uuid.UUID, medicine: str, db: Session = Depends(get_db)):
    """
    Used by the doctor's prescription pad while typing a medicine.
    status is one of: "in_stock", "out_of_stock", "unknown".
    A substitute is only suggested if the substitute itself is in stock.
    """
    row = _find_stock_row(db, clinic_id, medicine)
    if not row:
        return {"status": "unknown", "medicine": medicine, "quantity": None, "substitute": None}

    if row.quantity > 0:
        return {
            "status": "in_stock",
            "medicine": row.medicine_name,
            "quantity": row.quantity,
            "substitute": None,
        }

    substitute = None
    if row.substitute_name:
        sub_row = _find_stock_row(db, clinic_id, row.substitute_name)
        if sub_row and sub_row.quantity > 0:
            substitute = sub_row.medicine_name

    return {
        "status": "out_of_stock",
        "medicine": row.medicine_name,
        "quantity": 0,
        "substitute": substitute,
    }


@router.get("/pharmacy/{clinic_id}/stock")
def get_stock_list(clinic_id: uuid.UUID, db: Session = Depends(get_db)):
    """Full stock list for the pharmacist's page."""
    rows = (
        db.query(models.PharmacyStock)
        .filter(models.PharmacyStock.clinic_id == clinic_id)
        .order_by(models.PharmacyStock.medicine_name)
        .all()
    )
    return {
        "status": "success",
        "stock": [
            {
                "medicine_name": r.medicine_name,
                "quantity": r.quantity,
                "substitute": r.substitute_name,
            }
            for r in rows
        ],
    }


class StockUpdate(BaseModel):
    medicine_name: str
    quantity: int


@router.put("/pharmacy/{clinic_id}/stock")
def set_stock(clinic_id: uuid.UUID, payload: StockUpdate, db: Session = Depends(get_db)):
    """Pharmacist sets a medicine's quantity (e.g. to 0 to fake a stockout)."""
    if payload.quantity < 0:
        raise HTTPException(status_code=400, detail="Quantity cannot be negative")

    key = _norm_key(payload.medicine_name)
    if not key:
        raise HTTPException(status_code=400, detail="Medicine name is required")

    row = (
        db.query(models.PharmacyStock)
        .filter(
            models.PharmacyStock.clinic_id == clinic_id,
            models.PharmacyStock.medicine_key == key,
        )
        .first()
    )
    if row:
        row.quantity = payload.quantity
    else:
        row = models.PharmacyStock(
            clinic_id=clinic_id,
            medicine_name=payload.medicine_name.strip(),
            medicine_key=key,
            quantity=payload.quantity,
        )
        db.add(row)

    db.commit()
    return {"status": "success", "medicine_name": row.medicine_name, "quantity": row.quantity}


class DispensePayload(BaseModel):
    local_token: str
    # "dispensed" = handed over from local stock, "routed_epharmacy" = sent to UHI E-Pharmacy
    status: str = "dispensed"


@router.post("/pharmacy/{clinic_id}/dispense")
def mark_dispensed(clinic_id: uuid.UUID, payload: DispensePayload, db: Session = Depends(get_db)):
    """Pharmacist clicks 'Mark Dispensed' for today's completed visit of this patient."""
    if payload.status not in ("dispensed", "routed_epharmacy"):
        raise HTTPException(status_code=400, detail="Invalid status")

    now_ist = datetime.now(IST)
    today_start = now_ist.replace(hour=0, minute=0, second=0, microsecond=0)
    today_end = now_ist.replace(hour=23, minute=59, second=59, microsecond=999999)

    event = (
        db.query(models.Event)
        .filter(
            models.Event.clinic_id == clinic_id,
            models.Event.local_token == payload.local_token,
            models.Event.status == "completed",
            models.Event.timestamp >= today_start,
            models.Event.timestamp <= today_end,
        )
        .order_by(models.Event.timestamp.desc())
        .first()
    )
    if not event:
        raise HTTPException(status_code=404, detail="No completed visit found for this patient today")

    record = (
        db.query(models.PharmacyDispense)
        .filter(models.PharmacyDispense.event_id == event.event_id)
        .first()
    )
    if record:
        record.status = payload.status
    else:
        record = models.PharmacyDispense(
            clinic_id=clinic_id,
            event_id=event.event_id,
            local_token=payload.local_token,
            status=payload.status,
        )
        db.add(record)

    db.commit()
    return {"status": "success", "dispense_status": record.status}


class SubstitutionPayload(BaseModel):
    local_token: str
    original_medicine: str
    substitute_medicine: str


@router.post("/pharmacy/{clinic_id}/substitution")
def record_substitution(clinic_id: uuid.UUID, payload: SubstitutionPayload, db: Session = Depends(get_db)):
    """Doctor clicked the green substitute button: log the swap."""
    db.add(
        models.PrescriptionSubstitution(
            clinic_id=clinic_id,
            local_token=payload.local_token,
            original_medicine=payload.original_medicine.strip(),
            substitute_medicine=payload.substitute_medicine.strip(),
        )
    )
    db.commit()
    return {"status": "success"}



class ConnectedPharmacyRegister(BaseModel):
    name: str
    address: Optional[str] = None
    phone: Optional[str] = None
    latitude: float
    longitude: float


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371000.0  # Earth radius in meters
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = (
        math.sin(delta_phi / 2.0) ** 2
        + math.cos(phi1) * math.cos(phi2) * (math.sin(delta_lambda / 2.0) ** 2)
    )
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return R * c


@router.post("/{clinic_id}/pharmacies/register")
def register_connected_pharmacy(
    clinic_id: uuid.UUID,
    payload: ConnectedPharmacyRegister,
    db: Session = Depends(get_db),
):
    clinic = db.query(models.Clinic).filter(models.Clinic.clinic_id == clinic_id).first()
    if not clinic:
        raise HTTPException(status_code=404, detail="Clinic not found")

    try:
        models.ConnectedPharmacy.__table__.create(db.get_bind(), checkfirst=True)
    except Exception:
        pass

    pharmacy = models.ConnectedPharmacy(
        clinic_id=clinic_id,
        name=payload.name.strip(),
        address=payload.address.strip() if payload.address else None,
        phone=payload.phone.strip() if payload.phone else None,
        latitude=payload.latitude,
        longitude=payload.longitude,
        is_active=True,
    )
    db.add(pharmacy)
    db.commit()
    db.refresh(pharmacy)

    return {
        "status": "success",
        "pharmacy_id": str(pharmacy.pharmacy_id),
        "clinic_id": str(pharmacy.clinic_id),
        "pharmacy": {
            "pharmacy_id": str(pharmacy.pharmacy_id),
            "clinic_id": str(pharmacy.clinic_id),
            "name": pharmacy.name,
            "address": pharmacy.address,
            "phone": pharmacy.phone,
            "latitude": pharmacy.latitude,
            "longitude": pharmacy.longitude,
            "is_active": pharmacy.is_active,
            "created_at": pharmacy.created_at.isoformat() if pharmacy.created_at else None,
        },
    }


class PartnerPharmacyStatusUpdate(BaseModel):
    status: str


@router.get("/{clinic_id}/partner-code")
def get_clinic_partner_code(clinic_id: uuid.UUID, db: Session = Depends(get_db)):
    clinic = db.query(models.Clinic).filter(models.Clinic.clinic_id == clinic_id).first()
    if not clinic:
        raise HTTPException(status_code=404, detail="Clinic not found")
    partner_code = f"CLINIC-{clinic_id.hex[:4].upper()}"
    return {
        "status": "success",
        "partner_code": partner_code,
        "clinic_id": str(clinic_id),
        "clinic_name": clinic.clinic_name,
        "doctor_name": clinic.doctor_name
    }


@router.get("/{clinic_id}/partner-pharmacies")
def get_clinic_partner_pharmacies(clinic_id: uuid.UUID, db: Session = Depends(get_db)):
    clinic = db.query(models.Clinic).filter(models.Clinic.clinic_id == clinic_id).first()
    if not clinic:
        raise HTTPException(status_code=404, detail="Clinic not found")

    pharmacy_map = {}

    try:
        links = db.query(models.ClinicPharmacyLink).filter(models.ClinicPharmacyLink.clinic_id == clinic_id).all()
        for l in links:
            pharm = db.query(models.Pharmacy).filter(models.Pharmacy.pharmacy_id == l.pharmacy_id).first()
            if pharm:
                pharmacy_map[str(pharm.pharmacy_id)] = {
                    "pharmacy_id": str(pharm.pharmacy_id),
                    "name": pharm.name,
                    "email": pharm.email,
                    "phone": pharm.phone or "",
                    "license_no": pharm.license_no or "",
                    "address": pharm.address or "",
                    "latitude": pharm.latitude,
                    "longitude": pharm.longitude,
                    "status": l.status or "connected",
                    "connected_at": l.created_at.isoformat() if l.created_at else None,
                }
    except Exception as e:
        logger.warning(f"Error querying ClinicPharmacyLink in partner-pharmacies: {e}")
        db.rollback()

    try:
        legacy = db.query(models.ConnectedPharmacy).filter(models.ConnectedPharmacy.clinic_id == clinic_id).all()
        for lp in legacy:
            p_id = str(lp.pharmacy_id)
            if p_id not in pharmacy_map:
                pharmacy_map[p_id] = {
                    "pharmacy_id": p_id,
                    "name": lp.name,
                    "email": "",
                    "phone": lp.phone or "",
                    "license_no": "",
                    "address": lp.address or "",
                    "latitude": lp.latitude,
                    "longitude": lp.longitude,
                    "status": "connected" if lp.is_active else "disconnected",
                    "connected_at": lp.created_at.isoformat() if lp.created_at else None,
                }
    except Exception as e:
        logger.warning(f"Error querying legacy ConnectedPharmacy: {e}")
        db.rollback()

    return {
        "status": "success",
        "partner_code": f"CLINIC-{clinic_id.hex[:4].upper()}",
        "pharmacies": list(pharmacy_map.values())
    }


@router.put("/{clinic_id}/partner-pharmacies/{pharmacy_id}")
def update_partner_pharmacy_status(
    clinic_id: uuid.UUID,
    pharmacy_id: uuid.UUID,
    payload: PartnerPharmacyStatusUpdate,
    db: Session = Depends(get_db)
):
    clinic = db.query(models.Clinic).filter(models.Clinic.clinic_id == clinic_id).first()
    if not clinic:
        raise HTTPException(status_code=404, detail="Clinic not found")

    new_status = payload.status.lower().strip()
    if new_status not in ["connected", "rejected", "disconnected", "pending"]:
        raise HTTPException(status_code=400, detail="Invalid status value")

    link = db.query(models.ClinicPharmacyLink).filter(
        models.ClinicPharmacyLink.clinic_id == clinic_id,
        models.ClinicPharmacyLink.pharmacy_id == pharmacy_id
    ).first()

    if link:
        link.status = new_status
        db.commit()
    else:
        lp = db.query(models.ConnectedPharmacy).filter(
            models.ConnectedPharmacy.clinic_id == clinic_id,
            models.ConnectedPharmacy.pharmacy_id == pharmacy_id
        ).first()
        if lp:
            lp.is_active = (new_status == "connected")
            db.commit()
        else:
            pharm = db.query(models.Pharmacy).filter(models.Pharmacy.pharmacy_id == pharmacy_id).first()
            if pharm:
                new_l = models.ClinicPharmacyLink(
                    link_id=uuid.uuid4(),
                    clinic_id=clinic_id,
                    pharmacy_id=pharmacy_id,
                    status=new_status
                )
                db.add(new_l)
                db.commit()
            else:
                raise HTTPException(status_code=404, detail="Pharmacy link not found")

    return {
        "status": "success",
        "pharmacy_id": str(pharmacy_id),
        "new_status": new_status
    }


@router.get("/{clinic_id}/pharmacies/nearby")
def get_nearby_connected_pharmacies(
    clinic_id: uuid.UUID,
    lat: float,
    lng: float,
    radius_meters: float = 1000.0,
    db: Session = Depends(get_db),
):
    clinic = db.query(models.Clinic).filter(models.Clinic.clinic_id == clinic_id).first()
    if not clinic:
        return {"status": "success", "pharmacies": []}

    results = []
    seen_ids = set()

    # 1. Query verified connected pharmacies via ClinicPharmacyLink
    try:
        links = (
            db.query(models.ClinicPharmacyLink)
            .filter(
                models.ClinicPharmacyLink.clinic_id == clinic_id,
                models.ClinicPharmacyLink.status == "connected"
            )
            .all()
        )
        pharmacy_ids = [l.pharmacy_id for l in links]
        if pharmacy_ids:
            pharmacies = (
                db.query(models.Pharmacy)
                .filter(
                    models.Pharmacy.pharmacy_id.in_(pharmacy_ids),
                    models.Pharmacy.is_active == True
                )
                .all()
            )
            for p in pharmacies:
                p_id = str(p.pharmacy_id)
                seen_ids.add(p_id)
                dist = haversine_distance(lat, lng, p.latitude, p.longitude)
                if dist <= radius_meters:
                    results.append({
                        "pharmacy_id": p_id,
                        "clinic_id": str(clinic_id),
                        "name": p.name,
                        "address": p.address or "Near Clinic",
                        "phone": p.phone or "",
                        "license_no": p.license_no or "",
                        "latitude": p.latitude,
                        "longitude": p.longitude,
                        "distance": round(dist),
                        "distance_meters": round(dist),
                        "is_active": p.is_active,
                    })
    except Exception as e:
        logger.warning(f"Error querying ClinicPharmacyLink: {e}")
        db.rollback()

    # 2. Fallback check on legacy ConnectedPharmacy table
    try:
        legacy_pharmacies = (
            db.query(models.ConnectedPharmacy)
            .filter(
                models.ConnectedPharmacy.clinic_id == clinic_id,
                models.ConnectedPharmacy.is_active == True
            )
            .all()
        )
        for lp in legacy_pharmacies:
            p_id = str(lp.pharmacy_id)
            if p_id not in seen_ids:
                seen_ids.add(p_id)
                dist = haversine_distance(lat, lng, lp.latitude, lp.longitude)
                if dist <= radius_meters:
                    results.append({
                        "pharmacy_id": p_id,
                        "clinic_id": str(clinic_id),
                        "name": lp.name,
                        "address": lp.address or "Near Clinic",
                        "phone": lp.phone or "",
                        "license_no": "",
                        "latitude": lp.latitude,
                        "longitude": lp.longitude,
                        "distance": round(dist),
                        "distance_meters": round(dist),
                        "is_active": lp.is_active,
                    })
    except Exception as e:
        logger.warning(f"Error querying legacy ConnectedPharmacy: {e}")
        db.rollback()

    results.sort(key=lambda item: item["distance"])

    return {
        "status": "success",
        "pharmacies": results,
    }
