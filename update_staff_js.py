with open("frontend/assets/js/pages/staff_dashboard.js", "r", encoding="utf-8") as f:
    content = f.read()

manual_checkin_old = """  if (!/^\d{10}$/.test(phone)) {
    statusEl.textContent = "Please enter a valid 10-digit phone number.";
    statusEl.style.color = "var(--error-color)";
    return;
  }"""

manual_checkin_new = """  let finalPhone = phone;
  if (!finalPhone) {
    finalPhone = Math.floor(1000000000 + Math.random() * 9000000000).toString();
  } else if (!/^\\d{10}$/.test(finalPhone)) {
    statusEl.textContent = "Please enter a valid 10-digit phone number or leave blank.";
    statusEl.style.color = "var(--error-color)";
    return;
  }"""
content = content.replace(manual_checkin_old, manual_checkin_new)

# Make sure we use finalPhone
content = content.replace('phone: phone,', 'phone: finalPhone,', 1)

# Display phone number in lookup
lookup_old = """    if (data.found) {
      setLookupStatus(`Found returning patient: ${data.patient_name}`, "success");
      nameInput.value = data.patient_name || "";"""
lookup_new = """    if (data.found) {
      const phoneText = data.phone ? ` | Phone: ${data.phone}` : "";
      setLookupStatus(`Found returning patient: ${data.patient_name}${phoneText}`, "success");
      nameInput.value = data.patient_name || "";"""
content = content.replace(lookup_old, lookup_new)

with open("frontend/assets/js/pages/staff_dashboard.js", "w", encoding="utf-8") as f:
    f.write(content)
