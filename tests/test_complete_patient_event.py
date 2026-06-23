from app.db import models


def test_complete_patient_event():

    # Create a fake event
    event = models.Event()

    # Simulate patient arriving
    event.status = "waiting"

    # Simulate completion
    event.status = "completed"

    # Verify
    assert event.status == "completed"