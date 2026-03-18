import hmac
import hashlib 
from app.config import settings

def generate_network_token(phone:str) -> str:
    """
    Creates a global identifier for internal Tap2Med use.
    The same phone number + same secret = same hash everywhere.
    """
    # We use HMAC to 'sign' the phone number with our master secret
    hasher = hmac.new(settings.SECRET_KEY.encode(), phone.encode(), digestmod= hashlib.sha256)
    return hasher.hexdigest()

def generate_local_token(phone:str, clinic_salt:str) ->str:
    """
    Creates a clinic-specific identifier.
    The clinic salt ensures this hash is unique to only one clinic.
    """
    # We derive a unique key for this specific clinic
    
    combined_key = f"{settings.SECRET_KEY}:{clinic_salt}"

    hasher = hmac.new(combined_key.encode(), phone.encode(), digestmod= hashlib.sha256)
    return hasher.hexdigest()

def generate_identity_tokens(phone:str, clinic_salt:str) -> dict:
    """
    The 'Identity Wrapper'. This is the ONLY function the API calls.
    It generates the dual-token pair and effectively 'erases' the phone.
    """
    net_token = generate_network_token(phone)
    loc_token= generate_local_token(phone, clinic_salt)

    return{
        "network_token": net_token,
        "local_token": loc_token
    }
