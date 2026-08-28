from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
import uuid
import json
from datetime import datetime
from zoneinfo import ZoneInfo
from sqlalchemy import func
import redis

from app.core import security
from app.db import crud, models
from app.db.database import get_db

redis_client = redis.Redis(host='localhost', port=6379, db=0, decode_responses=True)

router = APIRouter()
IST = ZoneInfo("Asia/Kolkata")

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
        today = datetime.now(IST).date()
        
        # Fetch the clinic preferences for fee calculation
        prefs_data = redis_client.get(f"clinic_prefs:{str(clinic_id)}")
        prefs = {}
        if prefs_data:
            try:
                prefs = json.loads(prefs_data)
            except Exception:
                pass
                
        queue = db.query(models.Event).filter(
            models.Event.clinic_id == clinic_id,
            func.date(models.Event.timestamp) == today,
            models.Event.status.in_(["waiting", "completed"]) 
        ).order_by(models.Event.timestamp.asc()).all()

        formatted_queue = []
        for event in queue:
            try:
                patient_name = redis_client.get(f"name:{event.local_token}") or "Patient"
            except Exception:
                patient_name = "Patient"
                
            patient_display_id = event.local_token[:8].upper()
            
            # Map visit type & fee
            visit_type = event.event_type if event.event_type else "walkin"
            if visit_type == "clinic_visit": visit_type = "walkin" # Handle legacy strings
            
            fee = ""
            if visit_type == "walkin":
                fee = prefs.get("walkin_fee", "")
            elif visit_type == "appointment":
                fee = prefs.get("appointment_fee", "")
            elif visit_type == "followup":
                fee = prefs.get("followup_fee", "")

            formatted_queue.append({
                "event_id": str(event.event_id), 
                "local_token": event.local_token,
                "daily_token_number": event.daily_token_number, 
                "status": event.status,
                "weight": event.patient_weight,
                "patient_name": patient_name,
                "display_id": patient_display_id,
                "timestamp": event.timestamp.isoformat(),
                "visit_type": visit_type,
                "fee": fee
            })
            
        try:
            order_data = redis_client.get(f"queue_order:{str(clinic_id)}")
            if order_data:
                order_list = json.loads(order_data)
                waiting = [q for q in formatted_queue if q['status'] == 'waiting']
                completed = [q for q in formatted_queue if q['status'] == 'completed']
                
                waiting.sort(key=lambda x: order_list.index(x['local_token']) if x['local_token'] in order_list else 99999)
                formatted_queue = waiting + completed
        except Exception:
            pass
        
        clinic = db.query(models.Clinic).filter(models.Clinic.clinic_id == clinic_id).first()

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
def reorder_queue(clinic_id: uuid.UUID, payload: ReorderPayload):
    try:
        redis_client.set(f"queue_order:{str(clinic_id)}", json.dumps(payload.local_tokens), ex=43200) 
        return {"status": "success"}
    except Exception as e:
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
        today = datetime.now(IST).date()
        
        completed_events = db.query(models.Event).filter(
            models.Event.clinic_id == clinic_id,
            func.date(models.Event.timestamp) == today,
            models.Event.status == "completed"
        ).order_by(models.Event.timestamp.desc()).all() 

        feed = []
        for event in completed_events:
            rx_list = db.query(models.Prescription).filter(
                models.Prescription.event_id == event.event_id,
                models.Prescription.drug_category.in_(["MEDICINE", "Not available in v0", None])
            ).all()
            
            if rx_list:
                try:
                    patient_name = redis_client.get(f"name:{event.local_token}") or "Patient"
                except Exception:
                    patient_name = "Patient"
                    
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
            else:
                target_date = datetime.now(IST).date()
            query = query.filter(func.date(models.Event.timestamp) == target_date)
            
        events = query.order_by(models.Event.timestamp.desc()).all()
        
        seen_tokens = set()
        results = []
        for e in events:
            if e.local_token not in seen_tokens:
                seen_tokens.add(e.local_token)
                try:
                    name = redis_client.get(f"name:{e.local_token}")
                except:
                    name = None
                    
                results.append({
                    "display_id": e.local_token[:8].upper(),
                    "local_token": e.local_token,
                    "timestamp": e.timestamp.isoformat(),
                    "patient_name": name or "Archived Patient",
                    "vitals": e.patient_weight
                })
                
        return {"status": "success", "results": results}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class ClinicSettingsPayload(BaseModel):
    walkin_fee: str
    appointment_fee: str
    followup_fee: str
    followup_days: str

@router.put("/{clinic_id}/preferences")
def update_preferences(clinic_id: uuid.UUID, payload: ClinicSettingsPayload):
    try:
        redis_client.set(f"clinic_prefs:{str(clinic_id)}", payload.model_dump_json())
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{clinic_id}/preferences")
def get_preferences(clinic_id: uuid.UUID):
    try:
        data = redis_client.get(f"clinic_prefs:{str(clinic_id)}")
        if data:
            return json.loads(data)
        return {"appointment_fee": "", "walkin_fee": "", "followup_fee": "", "followup_days": ""}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))