with open('app/api/events.py', 'r') as f:
    content = f.read()

old_block = """        if record:
            return {
                "found": True,
                "patient_name": record.patient_name,
                "city": record.city,
                "age": record.age
            }"""

new_block = """        if record:
            return {
                "found": True,
                "patient_name": record.patient_name,
                "city": record.city,
                "age": record.age,
                "phone": getattr(record, 'phone_number', None)
            }"""

content = content.replace(old_block, new_block)

with open('app/api/events.py', 'w') as f:
    f.write(content)
