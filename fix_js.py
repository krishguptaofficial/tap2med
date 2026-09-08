with open("frontend/assets/js/pages/staff_dashboard.js", "r", encoding="utf-8") as f:
    content = f.read()

# In lookup, we must use `phone: phone,`
# So let's replace all `phone: finalPhone,` with `phone: phone,` globally first to reset.
content = content.replace('phone: finalPhone,', 'phone: phone,')

# Now carefully replace ONLY inside manualCheckIn
manual_checkin_idx = content.find('function manualCheckIn')
if manual_checkin_idx != -1:
    before = content[:manual_checkin_idx]
    after = content[manual_checkin_idx:]
    after = after.replace('phone: phone,', 'phone: finalPhone,', 1)
    content = before + after

with open("frontend/assets/js/pages/staff_dashboard.js", "w", encoding="utf-8") as f:
    f.write(content)
