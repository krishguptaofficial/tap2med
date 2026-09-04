import re
with open("frontend/clinic/settings.html", "r", encoding="utf-8") as f:
    html = f.read()

new_fields = """          <div style="display: grid; grid-template-columns: 1fr; gap: 20px; margin-bottom: 20px; padding-top: 20px; border-top: 1px dashed #cbd5e1;">
              <div class="field">
                  <label style="font-size: 13px; font-weight: 600; color: var(--text-muted); display: block; margin-bottom: 8px;">Doctor Qualifications (for Rx Print)</label>
                  <input type="text" id="doc-qualifications" class="input" placeholder="e.g. MBBS, MD (Medicine)">
              </div>
              <div class="field">
                  <label style="font-size: 13px; font-weight: 600; color: var(--text-muted); display: block; margin-bottom: 8px;">Clinic Address (for Rx Print)</label>
                  <input type="text" id="doc-address" class="input" placeholder="e.g. B-25, HIG, Sector-23, Sanjay Nagar">
              </div>
              <div class="field">
                  <label style="font-size: 13px; font-weight: 600; color: var(--text-muted); display: block; margin-bottom: 8px;">Extra Notes / Timings (for Rx Print)</label>
                  <input type="text" id="doc-extra" class="input" placeholder="e.g. Timings: 11:00am - 02:30pm">
              </div>
          </div>"""

html = html.replace('          <button onclick="saveFees()" class="btn btn-primary" id="btn-save-fees">Save Fees</button>', new_fields + '\n          <button onclick="saveFees()" class="btn btn-primary" id="btn-save-fees">Save Settings</button>')
html = html.replace('<h2>Fee Structure</h2>', '<h2>Clinic Profile & Fee Structure</h2>')

js_load_old = """                  document.getElementById("fee-days").value = data.followup_days || "";
              }"""
js_load_new = """                  document.getElementById("fee-days").value = data.followup_days || "";
                  document.getElementById("doc-qualifications").value = data.qualifications || "";
                  document.getElementById("doc-address").value = data.address || "";
                  document.getElementById("doc-extra").value = data.extra_notes || "";
              }"""
html = html.replace(js_load_old, js_load_new)

js_save_old = """              followup_fee: document.getElementById("fee-followup").value.trim(),
              followup_days: document.getElementById("fee-days").value.trim()
          };"""
js_save_new = """              followup_fee: document.getElementById("fee-followup").value.trim(),
              followup_days: document.getElementById("fee-days").value.trim(),
              qualifications: document.getElementById("doc-qualifications").value.trim(),
              address: document.getElementById("doc-address").value.trim(),
              extra_notes: document.getElementById("doc-extra").value.trim()
          };"""
html = html.replace(js_save_old, js_save_new)

html = html.replace('status.textContent = "Fees saved successfully!";', 'status.textContent = "Settings saved successfully!";')
html = html.replace('status.textContent = "Error saving fees.";', 'status.textContent = "Error saving settings.";')

with open("frontend/clinic/settings.html", "w", encoding="utf-8") as f:
    f.write(html)

