# In tests/test_hashing.py, update the test variables and function calls

import pytest 
from app.core.hashing import generate_network_token, generate_local_token, generate_identity_tokens

CLINIC_A_SALT = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2"
USER_SALT = "f1e2d3c4b5a6f1e2d3c4b5a6f1e2d3c4" # Add dummy user salt for testing
TEST_PHONE = "9810012345"
MEMBER_1 = 1 
MEMBER_2 = 2 

def test_network_token_consistency():
    """
    Test: Does the same family member always get the same global ID?
    Failure Mode: If this changes, the patient's history disappears.
    """
    t1 = generate_network_token(TEST_PHONE, MEMBER_1, USER_SALT)
    t2 = generate_network_token(TEST_PHONE, MEMBER_1, USER_SALT)
    
    assert t1 == t2
    assert len(t1) == 64

def test_family_member_separation():
    """
    Test: Do different family members on the SAME phone get DIFFERENT IDs?
    Failure Mode: If they match, the Doctor sees a mixed medical history.
    """
    father_token = generate_network_token(TEST_PHONE, MEMBER_1, USER_SALT)
    mother_token = generate_network_token(TEST_PHONE, MEMBER_2, USER_SALT)
    
    assert father_token != mother_token

def test_local_family_isolation():
    """
    Test: Does the clinic-specific ID also separate family members?
    Failure Mode: Mixing identities within the clinic dashboard.
    """
    local_1 = generate_local_token(TEST_PHONE, MEMBER_1, CLINIC_A_SALT)
    local_2 = generate_local_token(TEST_PHONE, MEMBER_2, CLINIC_A_SALT)
    
    assert local_1 != local_2

def test_identity_wrapper_scrubs_pii():
    """
    Test: Does our main function successfully hide the phone and member_id?
    Failure Mode: Accidental leakage of raw PII into the database or logs.
    """
    result = generate_identity_tokens(TEST_PHONE, MEMBER_1, CLINIC_A_SALT, USER_SALT)
    
    assert TEST_PHONE not in result.values()
    assert MEMBER_1 not in result.values()
    assert len(result) == 2