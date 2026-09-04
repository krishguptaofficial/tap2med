class PrintEngine {
    static setupContainer() {
        let container = document.getElementById('tap2med-print-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'tap2med-print-container';
            document.body.appendChild(container);
        }
        return container;
    }

    static printRx(data) {
        const container = this.setupContainer();
        
        // Build the medicine table rows
        let medsHtml = '';
        if (data.prescriptions && data.prescriptions.length > 0) {
            data.prescriptions.forEach((med, index) => {
                // Formatting instructions as remarks under the medicine name
                const remarks = med.instructions ? `<span class="rx-note">Note: ${med.instructions}</span>` : '';
                medsHtml += `
                    <tr>
                        <td style="width: 45%;">
                            ${index + 1}) <strong>${med.name}</strong>
                            ${remarks}
                        </td>
                        <td style="width: 20%;">${med.dosage || '--'}</td>
                        <td style="width: 35%;">${med.duration ? med.duration : 'As directed'}</td>
                    </tr>
                `;
            });
        }

        // Exact layout matching the physical photo
        container.innerHTML = `
            <div class="rx-header-grid">
                <div>
                    <h2 style="margin:0; font-size:22px;">${data.clinicName}</h2>
                    <p style="margin:4px 0 0; color:#444;">${data.doctorName}</p>
                </div>
                <div style="text-align:right;">
                    <p style="margin:0; font-weight:bold;">Powered by Tap2Med</p>
                </div>
            </div>

            <div class="rx-patient-banner">
                <div>${data.displayId} : <strong>${data.patientName.toUpperCase()}</strong></div>
                <div>Date: ${data.date}</div>
            </div>

            <div class="rx-vitals-row">
                ${data.vitals ? `<span><strong>Vitals:</strong> ${data.vitals}</span>` : ''}
            </div>

            ${data.diagnosis ? `<div class="rx-diagnosis-row"><strong>Diagnosis:</strong> ${data.diagnosis.toUpperCase()}</div>` : ''}

            <div class="rx-symbol">&#8471;</div>

            <table class="rx-med-table">
                <thead>
                    <tr>
                        <th>Medicine</th>
                        <th>Dosage</th>
                        <th>Timing - Freq. - Duration</th>
                    </tr>
                </thead>
                <tbody>
                    ${medsHtml}
                </tbody>
            </table>

            <div class="rx-footer-grid">
                <div style="width: 50%;">
                    ${data.complaints ? `<p><strong>Advice / Notes:</strong><br>${data.complaints}</p>` : ''}
                    ${data.tests ? `<p><strong>Tests Suggested:</strong><br>${data.tests}</p>` : ''}
                </div>
                <div class="rx-signature">
                    <div class="rx-signature-line"></div>
                    <strong>${data.doctorName}</strong>
                </div>
            </div>
        `;

        // Trigger the print dialogue
        window.print();
        
        // Clean up the DOM after printing
        setTimeout(() => {
            container.innerHTML = '';
        }, 1000);
    }
}

window.PrintEngine = PrintEngine;