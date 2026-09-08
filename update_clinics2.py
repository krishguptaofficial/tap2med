with open('app/api/clinics.py', 'r') as f:
    content = f.read()

# For get_queue
q_old = """                "city": patient_city,
                "age": rec.age if rec else None,"""
q_new = """                "city": patient_city,
                "age": rec.age if rec else None,
                "phone": getattr(rec, 'phone_number', None) if rec else None,"""
content = content.replace(q_old, q_new)

# For get_directory
d_old = """                results.append({
                    "local_token": e.local_token,
                    "patient_name": name,
                    "city": rec.city if rec and rec.city else "",
                    "age": rec.age if rec else None,
                    "display_id": e.local_token[:8].upper(),
                    "last_visit": e.timestamp.isoformat(),"""
d_new = """                results.append({
                    "local_token": e.local_token,
                    "patient_name": name,
                    "city": rec.city if rec and rec.city else "",
                    "age": rec.age if rec else None,
                    "phone": getattr(rec, 'phone_number', None) if rec else None,
                    "display_id": e.local_token[:8].upper(),
                    "last_visit": e.timestamp.isoformat(),"""
content = content.replace(d_old, d_new)

with open('app/api/clinics.py', 'w') as f:
    f.write(content)
