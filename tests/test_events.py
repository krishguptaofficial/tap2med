import pytest

def test_status_strings():
    waiting = "waiting"
    completed = "completed"

    assert waiting != completed
    assert waiting == "waiting"
    assert completed == "completed"