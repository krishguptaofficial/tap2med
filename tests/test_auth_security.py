from app.core import security


def test_generate_and_verify_otp():
    otp = security.generate_otp()
    assert len(otp) == 6
    h = security.hash_otp(otp)
    assert security.verify_otp(otp, h)
    assert not security.verify_otp("000000", h)


def test_password_hash_and_verify():
    pw = "S3cureP@ss!"
    hashed = security.hash_password(pw)
    assert isinstance(hashed, str) and "$" in hashed
    assert security.verify_password(pw, hashed)
    assert not security.verify_password("wrong", hashed)
