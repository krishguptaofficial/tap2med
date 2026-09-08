with open("frontend/clinic/staff_dashboard.html", "r", encoding="utf-8") as f:
    content = f.read()

content = content.replace('placeholder="10-digit number"', 'placeholder="10-digit number (Optional)"')
content = content.replace('<label>Patient Phone</label>', '<label>Patient Phone (Optional)</label>')

with open("frontend/clinic/staff_dashboard.html", "w", encoding="utf-8") as f:
    f.write(content)

with open("frontend/patient/scan.html", "r", encoding="utf-8") as f:
    scan_content = f.read()

scan_content = scan_content.replace('placeholder="10-digit number"', 'placeholder="10-digit number (Optional)"')

with open("frontend/patient/scan.html", "w", encoding="utf-8") as f:
    f.write(scan_content)
