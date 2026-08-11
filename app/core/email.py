import httpx
from app.config import settings


BREVO_URL = "https://api.brevo.com/v3/smtp/email"


def send_otp_email(to_email: str, to_name: str, otp: str, subject: str = "Your Tap2Med verification code") -> dict:
    html = f"<html><body><p>Hi {to_name},</p><p>Your Tap2Med verification code is <strong>{otp}</strong>. It expires in 10 minutes.</p><p>If you didn't request this, ignore this email.</p></body></html>"
    text = f"Hi {to_name},\nYour Tap2Med verification code is {otp}. It expires in 10 minutes."

    payload = {
        "sender": {"name": settings.BREVO_SENDER_NAME, "email": settings.BREVO_SENDER_EMAIL},
        "to": [{"email": to_email, "name": to_name}],
        "subject": subject,
        "htmlContent": html,
        "textContent": text
    }

    headers = {
        "api-key": settings.BREVO_API_KEY,
        "Content-Type": "application/json"
    }

    resp = httpx.post(BREVO_URL, json=payload, headers=headers, timeout=10)
    try:
        resp.raise_for_status()
    except Exception as e:
        raise
    return resp.json()
