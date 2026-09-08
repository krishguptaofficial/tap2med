with open("frontend/assets/js/pages/scan.js", "r", encoding="utf-8") as f:
    content = f.read()

scan_old = """  const phoneInput = document.getElementById("phone-input");
  const phone = phoneInput ? phoneInput.value.trim() : "";

  if (!/^\d{10}$/.test(phone)) {
    alert("Please enter a valid 10-digit phone number.");
    return;
  }"""

scan_new = """  const phoneInput = document.getElementById("phone-input");
  let phone = phoneInput ? phoneInput.value.trim() : "";

  if (!phone) {
    phone = Math.floor(1000000000 + Math.random() * 9000000000).toString();
  } else if (!/^\\d{10}$/.test(phone)) {
    alert("Please enter a valid 10-digit phone number or leave blank.");
    return;
  }"""

content = content.replace(scan_old, scan_new)

with open("frontend/assets/js/pages/scan.js", "w", encoding="utf-8") as f:
    f.write(content)
