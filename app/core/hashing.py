import hmac 
import hashlib 
import secrets
from app.config import settings 

def normalize_phone(phone:str):
    phone = phone.strip().replace(" ","").replace("-","")

    if phone.startswith("+91"):
        phone = phone[3:]
    elif phone.startswith("91") and len(phone)==12:
        phone = phone[2:]
    elif phone.startswith("0") and len(phone)==11:
        phone = phone[1:]

    if len(phone)!=10 or not phone.isdigit():
        raise ValueError("Invalid Phone Number")
    return phone


def generate_user_salt() -> str:
    """Generates a permanent, random salt for a new patient."""
    return secrets.token_hex(16)


def generate_lookup_hash(phone: str, member_id: int) -> str:
    """Used strictly for lost-device recovery."""
    phone = normalize_phone(phone)
    combined_input = f"{phone}:{member_id}"
    
    return hmac.new(
        settings.LOOKUP_SECRET.encode(),
        combined_input.encode(),     
        digestmod=hashlib.sha256     
    ).hexdigest()


def generate_network_token(phone: str, member_id: int, user_salt: str) -> str:
    """Identifies a specific family member across the entire Tap2Med network."""
    phone = normalize_phone(phone)
    combined_input = f"{phone}:{member_id}:{user_salt}"
    
    return hmac.new(
        settings.SECRET_KEY.encode(),
        combined_input.encode(),     
        digestmod=hashlib.sha256     
    ).hexdigest()


def generate_local_token(phone: str, member_id: int, clinic_salt: str) -> str:
    """Identifies a specific family member ONLY within the specific clinic."""
    phone = normalize_phone(phone) 
    combined_key = f"{settings.SECRET_KEY}:{clinic_salt}"
    combined_input = f"{phone}:{member_id}"
    
    return hmac.new(
        combined_key.encode(),  
        combined_input.encode(), 
        digestmod=hashlib.sha256
    ).hexdigest()


def generate_identity_tokens(phone: str, member_id: int, clinic_salt: str, user_salt: str) -> dict:
    """Returns the tokens that will be stored in database."""
    phone = normalize_phone(phone)
    return {
        "network_token": generate_network_token(phone, member_id, user_salt), 
        "local_token": generate_local_token(phone, member_id, clinic_salt) 
    }


def generate_clinic_salt() -> str:
    return secrets.token_hex(32)