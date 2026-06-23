def test_prescription_fields():
    medicine_name = "Paracetamol"
    instructions = "Twice daily"

    assert medicine_name
    assert instructions
    assert isinstance(medicine_name, str)
    assert isinstance(instructions, str)