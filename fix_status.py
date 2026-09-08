import re

with open('app/api/events.py', 'r', encoding='utf-8') as f:
    content = f.read()

content = re.sub(
    r'(@router\.get\("/status/\{local_token\}"\)\s*def get_patient_status.*?models\.Event\.clinic_id == )payload\.clinic_id(, models\.Event\.local_token == local_token)',
    r'\1clinic_id\2',
    content,
    flags=re.DOTALL
)

with open('app/api/events.py', 'w', encoding='utf-8') as f:
    f.write(content)
