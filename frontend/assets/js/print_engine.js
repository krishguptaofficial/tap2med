class PrintEngine {
  static setupContainer() {
    let container = document.getElementById("tap2med-print-container");
    if (!container) {
      container = document.createElement("div");
      container.id = "tap2med-print-container";
      container.className = "print-only";
      document.body.appendChild(container);
    }
    return container;
  }

  static async printRx(data) {
    const container = this.setupContainer();

    // Dynamically fetch clinic preferences for the header (qualifications, address, extra_notes)
    const clinicId = localStorage.getItem("tap2med_clinic_id");
    let prefs = {};
    if (clinicId) {
      try {
        const res = await fetch(`/api/clinics/${clinicId}/preferences`);
        if (res.ok) {
          prefs = await res.json();
        }
      } catch (e) {
        console.error("Failed to fetch clinic preferences for print", e);
      }
    }

    // Merge fetched preferences with the provided data (data overrides prefs)
    data.qualifications = data.qualifications || prefs.qualifications || "";
    data.address = data.address || prefs.address || "";
    data.extra_notes = data.extra_notes || prefs.extra_notes || "";
    const printHeader = prefs.print_header !== false;

    let medsHtml = "";
    if (data.prescriptions && data.prescriptions.length > 0) {
      data.prescriptions.forEach((med, index) => {
        let fullInstructions = (med.instructions || "").trim();
        let dosageText = (med.dosage || "").trim();
        let durationText = (med.duration || "").trim();
        let remarksText = "";

        // 1. Extract remarks/notes (after " | ")
        if (fullInstructions.includes(" | ")) {
          const parts = fullInstructions.split(" | ");
          if (!dosageText) dosageText = parts[0].trim();
          remarksText = parts.slice(1).join(" | ").trim();
        } else if (!dosageText) {
          dosageText = fullInstructions;
        }

        // 2. Extract duration (e.g. "for 5 Days")
        if (dosageText.includes(" for ")) {
          const dParts = dosageText.split(" for ");
          dosageText = dParts[0].trim();
          if (!durationText) durationText = dParts[1].trim();
        }

        // 3. Extract when/timing (e.g. "(After Food)" or known options)
        let whenText = "";
        const parenMatch = dosageText.match(/\((.*?)\)/);
        if (parenMatch) {
          whenText = parenMatch[1].trim();
          dosageText = dosageText.replace(parenMatch[0], "").trim();
        } else {
          const whenOptions = [
            "After Food",
            "Before Food",
            "With Food",
            "Empty Stomach",
            "At Bedtime",
            "Anytime",
          ];
          for (const w of whenOptions) {
            if (dosageText.includes(w)) {
              whenText = w;
              dosageText = dosageText.replace(w, "").trim();
              break;
            }
          }
        }

        // 4. Extract frequency
        const freqList = [
          "1-0-1-0",
          "1-0-1",
          "1-1-1",
          "1-0-0",
          "0-0-1",
          "0-1-0",
          "Once Daily",
          "Twice Daily",
          "Thrice Daily",
          "SOS / As needed",
          "SOS",
          "Alternate Days",
          "Weekly",
        ];
        let freqText = "";
        for (const f of freqList) {
          if (dosageText.includes(f)) {
            freqText = f === "SOS / As needed" ? "SOS" : f;
            dosageText = dosageText.replace(f, "").trim();
            break;
          }
        }

        let doseQty = dosageText.trim();

        // Build clean display strings
        let doseDisplay = doseQty || "--";
        let freqDisplay = freqText || "--";
        let whenDisplay = whenText || "--";
        let durationDisplay = durationText || "--";
        let remarksDisplay = remarksText || "";

        medsHtml += `
          <tr style="border-bottom: 1px solid #e2e8f0;">
            <td style="padding: 8px 6px; text-align: center; font-weight: 600; color: #64748b; vertical-align: middle;">
              ${index + 1}
            </td>
            <td style="padding: 8px 8px; vertical-align: middle;">
              <strong style="color: #0f172a; font-size: 13px;">${med.name.toUpperCase()}</strong>
            </td>
            <td style="padding: 8px 8px; text-align: center; font-weight: 600; color: #0f172a; vertical-align: middle;">
              ${doseDisplay}
            </td>
            <td style="padding: 8px 8px; color: #334155; vertical-align: middle;">
              ${whenDisplay}
            </td>
            <td style="padding: 8px 8px; text-align: center; font-weight: 600; color: #0284c7; vertical-align: middle;">
              ${freqDisplay}
            </td>
            <td style="padding: 8px 8px; text-align: center; color: #334155; font-weight: 500; vertical-align: middle;">
              ${durationDisplay}
            </td>
            <td style="padding: 8px 8px; color: #475569; vertical-align: middle;">
              ${remarksDisplay}
            </td>
          </tr>
        `;
      });
    }

    const vitalsHtml = data.vitals
      ? `<div style="font-size: 13px; color: #334155; margin-bottom: 6px;"><strong>Vitals:</strong> ${data.vitals}</div>`
      : "";
    const complaintsHtml = data.complaints
      ? `<div style="font-size: 13px; color: #334155; margin-bottom: 6px;"><strong>Complaints:</strong> ${data.complaints}</div>`
      : "";
    const diagnosisHtml = data.diagnosis
      ? `<div style="font-size: 14px; color: #0f172a; margin-bottom: 8px;"><strong>Diagnosis:</strong> <span style="font-weight: 700; text-transform: uppercase;">${data.diagnosis}</span></div>`
      : "";

    container.innerHTML = `
      <style>
       @media print {
        body * { visibility: hidden; }
        #tap2med-print-container, #tap2med-print-container * {
         visibility: visible;
         -webkit-print-color-adjust: exact !important;
         print-color-adjust: exact !important;
        }
        #tap2med-print-container {
         position: absolute;
         left: 0;
         top: 0;
         width: 100%;
         padding: 20px;
         display: block !important;
        }
       }
      </style>
      <div style="font-family: 'Inter', sans-serif; color: #0f172a; background: white; padding: 20px; -webkit-print-color-adjust: exact; print-color-adjust: exact;">
        ${
          printHeader
            ? `
        <!-- Header -->
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
         <div>
          <h1 style="margin: 0; font-size: 26px; font-weight: 800; color: #0f172a;">${data.doctorName || "Doctor Name"}</h1>
          ${data.qualifications ? `<p style="margin: 4px 0 0; font-size: 14px; font-weight: 600; color: #64748b; white-space: pre-wrap;">${data.qualifications}</p>` : ""}
         </div>
         <div style="text-align: right;">
          <h2 style="margin: 0; font-size: 20px; font-weight: 700; color: #64748b;">${data.clinicName || "Clinic Name"}</h2>
          ${data.address ? `<p style="margin: 4px 0 0; font-size: 13px; color: #0f172a; max-width: 250px; display: inline-block; white-space: pre-wrap;">${data.address}</p>` : ""}
          ${data.extra_notes ? `<p style="margin: 8px 0 0; font-size: 13px; color: #64748b; white-space: pre-wrap;">${data.extra_notes}</p>` : ""}
         </div>
        </div>

        <!-- Thick Primary Colored Line -->
        <div style="height: 6px; background-color: #0284c7; margin-bottom: 20px;"></div>
        `
            : `
        <!-- Pre-printed Letterhead Margin Spacer -->
        <div style="height: 140px; width: 100%;"></div>
        `
        }

        <!-- Patient Banner -->
        <div style="display: flex; justify-content: space-between; background-color: #f8fafc; padding: 10px 15px; border-radius: 4px; margin-bottom: 15px; font-size: 14px; font-weight: 700;">
         <div style="display: flex; gap: 5px; text-transform: uppercase;">
           <span>${data.displayId || "--"}</span> : <span>${data.patientName || "Patient"}</span>
         </div>
         <div>Date: ${data.date || "--"}</div>
        </div>

        <!-- Clinical Notes -->
        <div style="margin-bottom: 15px; padding-bottom: 10px;">
         ${vitalsHtml}
         ${complaintsHtml}
         ${diagnosisHtml}
        </div>

        <!-- Rx Symbol -->
        <div style="font-size: 36px; font-weight: bold; font-family: serif; color: #0f172a; margin-bottom: 15px;">&#8471;</div>

        <!-- Medicines Table -->
        <table style="width: 100%; border-collapse: collapse; font-size: 12.5px; text-align: left; margin-bottom: 25px;">
         <thead>
          <tr style="border-top: 1.5px solid #0f172a; border-bottom: 1.5px solid #0f172a; background-color: #f8fafc;">
           <th style="padding: 8px 6px; font-weight: 700; width: 26px; text-align: center; color: #1e293b;">#</th>
           <th style="padding: 8px 8px; font-weight: 700; color: #1e293b;">Medicine</th>
           <th style="padding: 8px 8px; font-weight: 700; width: 12%; text-align: center; color: #1e293b;">Dosage</th>
           <th style="padding: 8px 8px; font-weight: 700; width: 15%; color: #1e293b;">When</th>
           <th style="padding: 8px 8px; font-weight: 700; width: 13%; text-align: center; color: #1e293b;">Frequency</th>
           <th style="padding: 8px 8px; font-weight: 700; width: 12%; text-align: center; color: #1e293b;">Duration</th>
           <th style="padding: 8px 8px; font-weight: 700; width: 18%; color: #1e293b;">Instructions</th>
          </tr>
         </thead>
         <tbody>
          ${medsHtml || '<tr><td colspan="7" style="padding: 12px; text-align: center; color: #64748b;">No medicines prescribed</td></tr>'}
         </tbody>
        </table>

        <!-- Tests -->
        ${data.tests ? `<div style="font-size: 13.5px; color: #0f172a; margin-bottom: 20px; padding: 10px 14px; background: #f8fafc; border-left: 3px solid #0284c7; border-radius: 4px;"><strong>Tests Suggested:</strong> ${data.tests}</div>` : ""}

        <!-- Footer / Advice / Signature -->
        <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-top: 35px; font-size: 13.5px;">
          <div style="flex: 1; padding-right: 25px;">
            ${data.advice ? `<div style="margin-bottom: 12px;"><strong style="color: #0f172a;">Advice:</strong><div style="color: #334155; white-space: pre-wrap; margin-top: 3px;">${data.advice}</div></div>` : ""}
            ${data.follow_up_days && data.follow_up_days > 0 ? `<div><strong style="color: #0f172a;">Follow-up Date:</strong> <span style="font-weight: 600; color: #0284c7;">${new Date(Date.now() + data.follow_up_days * 24 * 60 * 60 * 1000).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })} (${data.follow_up_days} Days)</span></div>` : ""}
          </div>
          <div style="text-align: center; width: 200px;">
            <div style="border-bottom: 1px solid #0f172a; height: 50px; margin-bottom: 8px;"></div>
            <span style="font-weight: 700;">${data.doctorName || "Doctor Name"}</span>
          </div>
        </div>

        <!-- Bottom Footer Powered By -->
        <div style="margin-top: 30px; font-size: 12px; color: #64748b; text-align: center; border-top: 1px solid #cbd5e1; padding-top: 10px;">
          <strong style="color: #0284c7;">Powered by Tap2Med - www.tap2med.com</strong>
        </div>
      </div>
    `;

    window.print();

    setTimeout(() => {
      container.innerHTML = "";
    }, 1000);
  }
}

window.PrintEngine = PrintEngine;
