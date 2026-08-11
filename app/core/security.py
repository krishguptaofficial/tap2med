import secrets
import hashlib
import hmac
from typing import Tuple
from datetime import datetime, timezone
from app.config import settings


def generate_otp(length: int = 6) -> str:
    return str(secrets.randbelow(10 ** length)).zfill(length)


def hash_otp(otp: str) -> str:
    return hmac.new(settings.SECRET_KEY.encode(), otp.encode(), hashlib.sha256).hexdigest()


def verify_otp(otp: str, otp_hash: str) -> bool:
    try:
        computed = hash_otp(otp)
        return hmac.compare_digest(computed, otp_hash)
    except Exception:
        return False


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    dk = hashlib.pbkdf2_hmac('sha256', password.encode(), salt.encode(), 200_000)
    return f"{salt}${dk.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        salt, dk_hex = stored.split('$', 1)
        new_dk = hashlib.pbkdf2_hmac('sha256', password.encode(), salt.encode(), 200_000)
        return hmac.compare_digest(new_dk.hex(), dk_hex)
    except Exception:
        return False


def now_utc() -> datetime:
    return datetime.now(timezone.utc)
