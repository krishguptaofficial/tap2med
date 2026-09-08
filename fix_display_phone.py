for js_file in ["frontend/assets/js/pages/dashboard.js", "frontend/assets/js/pages/staff_dashboard.js"]:
    with open(js_file, "r", encoding="utf-8") as f:
        js_content = f.read()
    
    # Replace ${displayName}${cityText} with ${displayName}${cityText}${patient.phone ? ' | ?? ' + patient.phone : ''}
    js_content = js_content.replace('${displayName}${cityText}', '${displayName}${cityText}${patient.phone ? " | ?? " + patient.phone : ""}')
    
    with open(js_file, "w", encoding="utf-8") as f:
        f.write(js_content)

print("Done")
