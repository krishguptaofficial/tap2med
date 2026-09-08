with open('app/api/clinics.py', 'r') as f:
    content = f.read()

content = content.replace(
    'extra_notes: str = ""',
    'extra_notes: str = ""\n    save_patient_phone: bool = False'
)

update_block_old = """    clinic.qualifications = payload.qualifications
    clinic.address = payload.address
    clinic.extra_notes = payload.extra_notes

    db.commit()"""

update_block_new = """    clinic.qualifications = payload.qualifications
    clinic.address = payload.address
    clinic.extra_notes = payload.extra_notes
    clinic.save_patient_phone = payload.save_patient_phone

    db.commit()"""

content = content.replace(update_block_old, update_block_new)

get_block_old = """        "address": clinic.address or "",
        "extra_notes": clinic.extra_notes or ""
    }"""

get_block_new = """        "address": clinic.address or "",
        "extra_notes": clinic.extra_notes or "",
        "save_patient_phone": getattr(clinic, 'save_patient_phone', False)
    }"""

content = content.replace(get_block_old, get_block_new)

with open('app/api/clinics.py', 'w') as f:
    f.write(content)
