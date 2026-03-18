import pytest
from app.core.hashing import generate_identity_tokens, generate_local_token, generate_network_token

# Mock Data: 64-character hex strings (exactly what secrets.token_hex(32) produces)
CLINIC_A_SALT = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2"
CLINIC_B_SALT = "f6e5d4c3b2a1f6e5d4c3b2a1f6e5d4c3b2a1f6e5d4c3b2a1f6e5d4c3b2a1f6e5"
TEST_PHONE = "9810012345"

def test_network_token_consistency():
    """
    Ensures the same phone + same SECRET_KEY always produces the same Network ID.
    Failure Mode: If this changes, a patient's history across clinics is lost.
    """
    t1= generate_network_token(TEST_PHONE)
    t2= generate_network_token(TEST_PHONE)

    assert t1==t2
    assert len(t1)==64


def test_clinic_isolation():
    """
    Ensures the same phone produces DIFFERENT local IDs at different clinics.
    Failure Mode: If these match, Clinic A can track what patients do at Clinic B.
    """
    local_a = generate_local_token(TEST_PHONE, CLINIC_A_SALT)
    local_b = generate_local_token(TEST_PHONE, CLINIC_B_SALT)

    assert local_a!=local_b


def test_identity_wrapper_scrubbs_pii():
    """
    Verifies that the convenience function returns tokens but 'kills' the phone number.
    Failure Mode: If the phone number is returned in the dict, it might be logged/stored.
    """
    result = generate_identity_tokens(TEST_PHONE, CLINIC_A_SALT)

    assert "network_token" in result
    assert "local_token" in result

    assert TEST_PHONE not in result.values()
    assert len(result) ==2





