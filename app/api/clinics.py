from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified
from pydantic import BaseModel
import uuid
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
    try:
        db.execute(text("ALTER TABLE clinics ADD COLUMN qualifications TEXT;"))
    except:
        pass
    try:
        db.execute(text("ALTER TABLE clinics ADD COLUMN address TEXT;"))
    except:
        pass
    try:
        db.execute(text("ALTER TABLE clinics ADD COLUMN extra_notes TEXT;"))
    except:
        pass
    try:
        db.execute(text("ALTER TABLE events ADD COLUMN advice TEXT;"))
    except:
        pass
    try:
        db.execute(text("ALTER TABLE events ADD COLUMN follow_up_days INTEGER DEFAULT 3;"))
    except:
        pass
    db.commit()
    return {"status": "ok"}


class ClinicCreate(BaseModel):
    doctor_name: str
    clinic_name: str

@router.post("/")
def onboard_clinic(payload: ClinicCreate, db: Session = Depends(get_db)):
    try:
        new_clinic = crud.create_clinic(db=db, doctor_name=payload.doctor_name, clinic_name=payload.clinic_name)
        return {
            "status": "success",
            "clinic_id": new_clinic.clinic_id,
            "doctor": new_clinic.doctor_name
        }
    except Exception as e:
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
                    "medicines": [{"name": rx.medicine_name, "instructions": rx.instructions} for rx in rx_list]
                })

        return {"status": "success", "feed": feed}
    except Exception as e:
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
                "extra_notes": clinic.extra_notes or ""
            }
        return {"appointment_fee": "", "walkin_fee": "", "followup_fee": "", "followup_days": "", "qualifications": "", "address": "", "extra_notes": ""}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))