from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session
from datetime import datetime, timedelta, timezone
import uuid

from app.db.database import get_db
from app.db import crud, models
from app.core import security, email as emailer

router = APIRouter()

class SendOtpPayload(BaseModel):
    clinic_id: uuid.UUID
    email: EmailStr


class VerifyOtpPayload(BaseModel):
    clinic_id: uuid.UUID
    otp: str


class SetPasswordPayload(BaseModel):
    clinic_id: uuid.UUID
    password: str


class LoginPayload(BaseModel):
    email: EmailStr
    password: str


class LoginOtpSendPayload(BaseModel):
    email: EmailStr


class LoginOtpVerifyPayload(BaseModel):
    email: EmailStr
    otp: str


@router.post("/send-otp")
def send_otp(payload: SendOtpPayload, db: Session = Depends(get_db)):
    clinic = crud.get_clinic(db, payload.clinic_id)
    if not clinic:
        raise HTTPException(status_code=404, detail="Clinic not found")

    # save/update doctor email
    clinic.doctor_email = str(payload.email)
    clinic.email_verified = False
    db.commit()

    otp = security.generate_otp()
    otp_hash = security.hash_otp(otp)
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=10)
    crud.create_email_otp(db=db, clinic_id=payload.clinic_id, otp_hash=otp_hash, expires_at=expires_at)

    try:
        emailer.send_otp_email(to_email=str(payload.email), to_name=clinic.doctor_name or "Doctor", otp=otp)
    except Exception as e:
        raise HTTPException(status_code=502, detail="Failed to send email")

    return {"status": "ok", "message": "OTP sent"}


@router.post("/verify-otp")
def verify_otp(payload: VerifyOtpPayload, db: Session = Depends(get_db)):
    verification = crud.get_active_verification(db, payload.clinic_id)
    if not verification:
        raise HTTPException(status_code=404, detail="No active OTP found or it expired")

    if not security.verify_otp(payload.otp, verification.otp_hash):
        crud.increment_verification_attempts(db, verification)
        raise HTTPException(status_code=400, detail="Invalid OTP")

    crud.mark_verification_verified(db, verification)
    return {"status": "ok", "message": "Email verified"}


@router.post("/set-password")
def set_password(payload: SetPasswordPayload, db: Session = Depends(get_db)):
    clinic = crud.get_clinic(db, payload.clinic_id)
    if not clinic:
        raise HTTPException(status_code=404, detail="Clinic not found")

    if not clinic.email_verified:
        raise HTTPException(status_code=403, detail="Email not verified")

    pw_hash = security.hash_password(payload.password)
    crud.set_clinic_password(db, payload.clinic_id, pw_hash)
    return {"status": "ok", "message": "Password set"}


@router.post("/login")
def login(payload: LoginPayload, db: Session = Depends(get_db)):
    clinic = crud.get_clinic_by_email(db, str(payload.email))
    if not clinic or not clinic.password_hash:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if not security.verify_password(payload.password, clinic.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    return {"status": "ok", "clinic_id": str(clinic.clinic_id)}


@router.post("/login/send-otp")
def login_send_otp(payload: LoginOtpSendPayload, db: Session = Depends(get_db)):
    clinic = crud.get_clinic_by_email(db, str(payload.email))
    if not clinic:
        raise HTTPException(status_code=404, detail="Clinic not found")

    otp = security.generate_otp()
    otp_hash = security.hash_otp(otp)
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=10)
    crud.create_email_otp(db=db, clinic_id=clinic.clinic_id, otp_hash=otp_hash, expires_at=expires_at)

    try:
        emailer.send_otp_email(to_email=str(payload.email), to_name=clinic.doctor_name or "Doctor", otp=otp, subject="Your Tap2Med login code")
    except Exception:
        raise HTTPException(status_code=502, detail="Failed to send email")

    return {"status": "ok", "message": "OTP sent"}


@router.post("/login/verify-otp")
def login_verify_otp(payload: LoginOtpVerifyPayload, db: Session = Depends(get_db)):
    clinic = crud.get_clinic_by_email(db, str(payload.email))
    if not clinic:
        raise HTTPException(status_code=404, detail="Clinic not found")

    verification = crud.get_active_verification(db, clinic.clinic_id)
    if not verification:
        raise HTTPException(status_code=404, detail="No active OTP found or it expired")

    if not security.verify_otp(payload.otp, verification.otp_hash):
        crud.increment_verification_attempts(db, verification)
        raise HTTPException(status_code=400, detail="Invalid OTP")

    crud.mark_verification_verified(db, verification)
    return {"status": "ok", "clinic_id": str(clinic.clinic_id)}


@router.post("/forgot/send-otp")
def forgot_send_otp(payload: LoginOtpSendPayload, db: Session = Depends(get_db)):
    clinic = crud.get_clinic_by_email(db, str(payload.email))
    if not clinic:
        raise HTTPException(status_code=404, detail="Clinic not found")

    otp = security.generate_otp()
    otp_hash = security.hash_otp(otp)
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=10)
    crud.create_email_otp(db=db, clinic_id=clinic.clinic_id, otp_hash=otp_hash, expires_at=expires_at)

    try:
        emailer.send_otp_email(to_email=str(payload.email), to_name=clinic.doctor_name or "Doctor", otp=otp, subject="Your Tap2Med password reset code")
    except Exception:
        raise HTTPException(status_code=502, detail="Failed to send email")

    return {"status": "ok", "message": "OTP sent"}


class ForgotResetPayload(BaseModel):
    email: EmailStr
    otp: str
    new_password: str


@router.post("/forgot/reset")
def forgot_reset(payload: ForgotResetPayload, db: Session = Depends(get_db)):
    clinic = crud.get_clinic_by_email(db, str(payload.email))
    if not clinic:
        raise HTTPException(status_code=404, detail="Clinic not found")

    verification = crud.get_active_verification(db, clinic.clinic_id)
    if not verification:
        raise HTTPException(status_code=404, detail="No active OTP found or it expired")

    if not security.verify_otp(payload.otp, verification.otp_hash):
        crud.increment_verification_attempts(db, verification)
        raise HTTPException(status_code=400, detail="Invalid OTP")

    # set new password regardless of previous email_verified
    pw_hash = security.hash_password(payload.new_password)
    crud.set_clinic_password(db, clinic.clinic_id, pw_hash)
    crud.mark_verification_verified(db, verification)
    return {"status": "ok", "message": "Password reset"}
