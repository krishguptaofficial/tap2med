import re

with open('app/api/events.py', 'r', encoding='utf-8') as f:
    content = f.read()

# Models to add clinic_id to
models_to_fix = [
    "CompleteRequest",
    "CityUpdate",
    "VitalsUpdate",
    "LabUpdatePayload",
    "MoveQueuePayload",
    "RemoveQueuePayload",
    "TopQueuePayload",
    "VisitTypePayload"
]

for model in models_to_fix:
    pattern = r'(class ' + model + r'\(BaseModel\):\n)'
    replacement = r'\g<1>    clinic_id: uuid.UUID\n'
    content = re.sub(pattern, replacement, content)

with open('app/api/events.py', 'w', encoding='utf-8') as f:
    f.write(content)
