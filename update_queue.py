with open("frontend/clinic/directory.html", "r", encoding="utf-8") as f:
    content = f.read()

dir_old = """<strong style="display: block; font-size: 16px; color: var(--text-main); margin-bottom: 4px;">???? ${patient.patient_name}</strong>"""
dir_new = """<strong style="display: block; font-size: 16px; color: var(--text-main); margin-bottom: 4px;">???? ${patient.patient_name} ${patient.phone ? '| ???? ' + patient.phone : ''}</strong>"""
content = content.replace(dir_old, dir_new)

with open("frontend/clinic/directory.html", "w", encoding="utf-8") as f:
    f.write(content)

for js_file in ["frontend/assets/js/pages/dashboard.js", "frontend/assets/js/pages/staff_dashboard.js"]:
    with open(js_file, "r", encoding="utf-8") as f:
        js_content = f.read()
    
    js_old = """<strong style="display: block; font-size: 16px; color: var(--text-main); margin-bottom: 4px;">???? ${patient.patient_name}</strong>"""
    js_new = """<strong style="display: block; font-size: 16px; color: var(--text-main); margin-bottom: 4px;">???? ${patient.patient_name} ${patient.phone ? '| ???? ' + patient.phone : ''}</strong>"""
    js_content = js_content.replace(js_old, js_new)
    
    with open(js_file, "w", encoding="utf-8") as f:
        f.write(js_content)
