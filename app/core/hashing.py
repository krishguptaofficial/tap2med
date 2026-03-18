import hmac 
import hashlib 
from app.config import settings 


def generate_network_token(phone: str, member_id: int) -> str:
    """
    Identifies a specific family member across the entire Tap2Med network.
    Input: '9810012345' + 1 (Father) vs '9810012345' + 2 (Mother).
    """
   
    combined_input = f"{phone}:{member_id}"
    
    return hmac.new(
        settings.SECRET_KEY.encode(),
        combined_input.encode(),     
        digestmod=hashlib.sha256     
    ).hexdigest()


def generate_local_token(phone: str, member_id: int, clinic_salt: str) -> str:
    """
    Identifies a specific family member ONLY within one specific clinic.
    The clinic_salt ensures this hash is useless to any other clinic.
    """
   
    combined_key = f"{settings.SECRET_KEY}:{clinic_salt}"
   
    combined_input = f"{phone}:{member_id}"
    
    return hmac.new(
        combined_key.encode(),  
        combined_input.encode(), 
        digestmod=hashlib.sha256
    ).hexdigest()


def generate_identity_tokens(phone: str, member_id: int, clinic_salt: str) -> dict:
    """
    Convenience wrapper for the API. 
    Returns the 'Ghosts' that will be stored in PostgreSQL.
    """
    return {
        "network_token": generate_network_token(phone, member_id), 
        "local_token": generate_local_token(phone, member_id, clinic_salt) 
    }
