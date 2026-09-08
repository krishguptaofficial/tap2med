import re

with open("frontend/clinic/settings.html", "r", encoding="utf-8") as f:
    content = f.read()

privacy_card = """        <!-- Patient Privacy Card -->
        <div class="consultation-card" style="margin-bottom: 24px">
          <div
            class="consultation-header"
            style="margin-bottom: 20px; padding-bottom: 15px"
          >
            <h2 style="font-size: 20px">Patient Privacy</h2>
          </div>
          <label
            style="
              display: flex;
              align-items: center;
              gap: 12px;
              cursor: pointer;
              font-size: 16px;
              font-weight: 500;
              color: var(--text-main);
            "
          >
            <input
              type="checkbox"
              id="save-patient-phone-toggle"
              style="
                width: 20px;
                height: 20px;
                accent-color: var(--primary-color);
              "
            />
            Save patient phone numbers
          </label>
          <p
            id="save-phone-status-text"
            style="
              margin-top: 8px;
              margin-left: 32px;
              font-size: 13px;
              color: var(--text-muted);
            "
          >
            Phone numbers are used for the current workflow but are not retained.
          </p>
        </div>

"""

content = content.replace("        <!-- Print Settings Card -->", privacy_card + "        <!-- Print Settings Card -->")

load_settings_script = """            document.getElementById("doc-extra").value = data.extra_notes || "";
            const phoneToggle = document.getElementById("save-patient-phone-toggle");
            phoneToggle.checked = data.save_patient_phone || false;
            updatePhoneStatusText(phoneToggle.checked);"""
content = content.replace('            document.getElementById("doc-extra").value = data.extra_notes || "";', load_settings_script)

save_settings_script = """          address: document.getElementById("doc-address").value.trim(),
          extra_notes: document.getElementById("doc-extra").value.trim(),
          save_patient_phone: document.getElementById("save-patient-phone-toggle").checked,"""
content = content.replace('          extra_notes: document.getElementById("doc-extra").value.trim(),', save_settings_script)

toggle_listener = """      const phoneToggle = document.getElementById("save-patient-phone-toggle");
      function updatePhoneStatusText(isChecked) {
        const p = document.getElementById("save-phone-status-text");
        if (isChecked) {
            p.textContent = "Phone numbers entered during registration can be stored in this clinic's patient records.";
        } else {
            p.textContent = "Phone numbers are used for the current workflow but are not retained.";
        }
      }
      phoneToggle.addEventListener("change", (e) => {
        updatePhoneStatusText(e.target.checked);
        saveSettings();
      });

      // Role Save Logic"""
content = content.replace('      // Role Save Logic', toggle_listener)

with open("frontend/clinic/settings.html", "w", encoding="utf-8") as f:
    f.write(content)
