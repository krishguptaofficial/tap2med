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

  static printRx(data) {
    const container = this.setupContainer();

    let medsHtml = "";
    if (data.prescriptions && data.prescriptions.length > 0) {
      data.prescriptions.forEach((med, index) => {
        const note = med.instructions
          ? `<div style="font-size: 12px; color: var(--text-muted); font-style: italic; padding-left: 20px;">Note : ${med.instructions}</div>`
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
            <div style="font-family: var(--font-family); color: var(--text-main); background: white; padding: 20px;">
                <!-- Header -->
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
                  <div>
                    <h1 style="margin: 0; font-size: 26px; font-weight: 800; color: var(--text-main);">${data.doctorName || "Dr. Faiz Ahmed"}</h1>
                    <p style="margin: 2px 0 0; font-size: 14px; font-weight: 600; color: var(--text-muted);">MBBS, MD (Medicine)<br>Regn. No.: MCI/23719</p>
                    <p style="margin: 12px 0 0; font-size: 13px; color: var(--text-muted);">
                      Formerly at -<br>
                      St. Luke's Roosevelt Hospital, NY<br>
                      Broadhurst Clinic, Africa<br>
                      Endocrinology, JNMCH, Aligarh
                    </p>
                  </div>
                  <div style="text-align: right; font-size: 13px; color: var(--text-main); font-weight: 500;">
                    <p style="margin: 0 0 4px;">Timings: 11:00am - 02:30pm, 5:30pm - 8:30pm<br>
                    <strong>Closed: Friday (Evening) & Sunday (Full Day)</strong></p>
                    <p style="margin: 0 0 4px;">Add: B-25, HIG, Sector-23, Sanjay Nagar, Ghaziabad</p>
                    <p style="margin: 0 0 4px;"><strong>For Appointment (9:00am - 8:00pm): 9911007141</strong><br>
                    <strong>Pharmacy: 8766236525</strong></p>
                  </div>
                </div>

                <!-- Thick Primary Colored Line -->
                <div style="height: 6px; background-color: var(--primary-color); margin-bottom: 20px;"></div>

                <!-- Patient Banner -->
                <div style="display: flex; justify-content: space-between; background: var(--bg-canvas); padding: 10px 15px; border-radius: 4px; margin-bottom: 15px; font-size: 14px; font-weight: 700;">
                  <div style="display: flex; gap: 5px; text-transform: uppercase;">
                     <span>${data.displayId}</span> : <span>${data.patientName}</span>
                  </div>
                  <div>Date: ${data.date}</div>
                </div>

                <!-- Clinical Notes -->
                <div style="margin-bottom: 15px; padding-bottom: 10px;">
                  ${vitalsHtml}
                  ${complaintsHtml}
                  ${diagnosisHtml}
                </div>

                <!-- Rx Symbol -->
                <div style="font-size: 36px; font-weight: bold; font-family: serif; color: var(--text-main); margin-bottom: 15px;">&#8471;</div>

                <!-- Medicines Table -->
                <table style="width: 100%; border-collapse: collapse; font-size: 13px; text-align: left; margin-bottom: 30px;">
                  <thead>
                    <tr style="border-top: 1px solid var(--text-muted); border-bottom: 1px solid var(--text-muted);">
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
                        <!-- Placeholder for QR Code (matching image placement) -->
                        <div style="margin-top: 15px; width: 80px; height: 80px; border: 1px solid #ccc; display: flex; align-items: center; justify-content: center; font-size: 10px; color: #999;">QR Code</div>
                    </div>
                    <div style="text-align: center; width: 200px;">
                        <div style="border-bottom: 1px solid var(--text-main); height: 50px; margin-bottom: 8px;"></div>
                        <span style="font-weight: 700;">${data.doctorName || "Dr Faiz Ahmed"}</span>
                    </div>
                </div>

                <!-- Bottom Footer Powered By -->
                <div style="margin-top: 30px; font-size: 12px; color: var(--text-muted); text-align: center; border-top: 1px solid #cbd5e1; padding-top: 10px;">
                    Download HealthPlix App from Google Play/Apple Appstore to view your prescriptions and consult with me online.<br>
                    <strong style="color: var(--primary-color);">Powered by Tap2Med EMR - www.tap2med.com</strong>
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
