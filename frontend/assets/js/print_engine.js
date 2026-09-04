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

    let medsHtml = "";
    if (data.prescriptions && data.prescriptions.length > 0) {
      data.prescriptions.forEach((med, index) => {
        const note = med.instructions
          ? `<div style="font-size: 12px; color: #64748b; font-style: italic; padding-left: 20px;">Note : ${med.instructions}</div>`
          : "";
        medsHtml += `
                    <tr style="border-bottom: 1px solid #cbd5e1;">
                        <td style="padding: 10px 5px;">
                            ${index + 1}) <strong>${med.name.toUpperCase()}</strong>
                            ${note}
                        </td>
                        <td style="padding: 10px 5px;">${med.dosage || "--"}</td>
                        <td style="padding: 10px 5px;">${med.duration ? med.duration : "As directed"}</td>
                    </tr>
                `;
      });
    }

    const vitalsHtml = data.vitals
      ? `<div style="display: flex; gap: 20px; font-size: 13px; font-weight: 600; margin-bottom: 8px;">${data.vitals}</div>`
      : "";
    const diagnosisHtml = data.diagnosis
      ? `<div style="font-size: 14px; font-weight: 700; font-style: italic;">Diagnosis: ${data.diagnosis.toUpperCase()}</div>`
      : "";
    const complaintsHtml = data.complaints
      ? `<div style="font-size: 13px; margin-bottom: 8px;">Complaints: ${data.complaints}</div>`
      : "";

    container.innerHTML = `
            <style>
              @media print {
                #tap2med-print-container * {
                  -webkit-print-color-adjust: exact !important;
                  print-color-adjust: exact !important;
                }
              }
            </style>
            <div style="font-family: 'Inter', sans-serif; color: #0f172a; background: white; padding: 20px; -webkit-print-color-adjust: exact; print-color-adjust: exact;">
                <!-- Header -->
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
                  <div>
                    <h1 style="margin: 0; font-size: 26px; font-weight: 800; color: #0f172a;">${data.doctorName || "Doctor Name"}</h1>
                    ${data.qualifications ? `<p style="margin: 4px 0 0; font-size: 14px; font-weight: 600; color: #64748b; white-space: pre-wrap;">${data.qualifications}</p>` : ""}
                    ${data.extra_notes ? `<p style="margin: 8px 0 0; font-size: 13px; color: #64748b; white-space: pre-wrap;">${data.extra_notes}</p>` : ""}
                  </div>
                  <div style="text-align: right;">
                    <h2 style="margin: 0; font-size: 20px; font-weight: 700; color: #64748b;">${data.clinicName || "Clinic Name"}</h2>
                    ${data.address ? `<p style="margin: 4px 0 0; font-size: 13px; color: #0f172a; max-width: 250px; display: inline-block; white-space: pre-wrap;">${data.address}</p>` : ""}
                  </div>
                </div>

                <!-- Thick Primary Colored Line -->
                <div style="height: 6px; background-color: #0284c7; margin-bottom: 20px;"></div>

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
                <table style="width: 100%; border-collapse: collapse; font-size: 13px; text-align: left; margin-bottom: 30px;">
                  <thead style="background-color: transparent;">
                    <tr style="border-top: 1px solid #64748b; border-bottom: 1px solid #64748b;">
                      <th style="padding: 10px 5px; font-weight: 600;">Medicine</th>
                      <th style="padding: 10px 5px; font-weight: 600; width: 25%;">Dosage</th>
                      <th style="padding: 10px 5px; font-weight: 600; width: 35%;">Timing - Freq. - Duration</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${medsHtml}
                  </tbody>
                </table>

                <!-- Tests -->
                ${data.tests ? `<div style="font-size: 14px; margin-bottom: 20px;"><strong>Tests Suggested:</strong> ${data.tests}</div>` : ""}

                <!-- Footer / Advice / Signature -->
                <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-top: 40px; font-size: 14px;">
                    <div style="flex: 1;">
                        <div style="font-weight: 600; font-style: italic;">Advice:</div>
                        <div style="text-transform: uppercase;">BED REST 5 DAYS</div>
                    </div>
                    <div style="text-align: center; width: 200px;">
                        <div style="border-bottom: 1px solid #0f172a; height: 50px; margin-bottom: 8px;"></div>
                        <span style="font-weight: 700;">${data.doctorName || "Doctor Name"}</span>
                    </div>
                </div>

                <!-- Bottom Footer Powered By -->
                <div style="margin-top: 30px; font-size: 12px; color: #64748b; text-align: center; border-top: 1px solid #cbd5e1; padding-top: 10px;">
                    <strong style="color: #0284c7;">Powered by Tap2Med EMR - www.tap2med.com</strong>
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
