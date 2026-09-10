import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.api.events import StartVisitRequest, LookupRequest


def test_start_visit_request_accepts_age_and_lookup_request_uses_member_id():
    payload = StartVisitRequest(
        phone="9876543210",
        member_id=5,
        clinic_id="11111111-1111-1111-1111-111111111111",
        name="Test User",
        city="Delhi",
        age=34,
    )

    lookup = LookupRequest(
        phone="9876543210",
        member_id=5,
        clinic_id="11111111-1111-1111-1111-111111111111",
    )

    assert payload.age == 34
    assert lookup.member_id == 5
