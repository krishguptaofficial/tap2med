const clinicId = localStorage.getItem("tap2med_clinic_id");

if (!clinicId || clinicId === "undefined" || clinicId === "null") {
    window.location.href = "/login";
}

let currentLocalToken = null;
let isSaving = false;
let patientLabData = [];
let labChartInstance = null;

const currentToken = document.getElementById("current-token");
const historyContent = document.getElementById("history-content");
const doctorName = document.getElementById("doc-name");
const clinicName = document.getElementById("clinic-name");
const prescriptionList = document.getElementById("rx-container");
const prescriptionStatus = document.getElementById("prescription-status");
const sidebar = document.getElementById("clinicSidebar");
const sidebarBackdrop = document.getElementById("sidebar-backdrop");
const menuToggleBtn = document.getElementById("sidebarToggle");

window.currentWaitingTokens = [];

document.addEventListener('DOMContentLoaded', () => {
    const savedState = localStorage.getItem('tap2med_sidebar_state');
    if (savedState === 'closed') {
        sidebar.classList.add('sidebar-closed');
        document.querySelector('.main-content').classList.add('sidebar-closed');
    }
});

function toggleSidebar() {
    sidebar.classList.toggle("sidebar-closed");
    document.querySelector('.main-content').classList.toggle('sidebar-closed');
    sidebarBackdrop.classList.toggle("open");
    
    const isClosed = sidebar.classList.contains("sidebar-closed");
    menuToggleBtn.setAttribute("aria-expanded", !isClosed);
    localStorage.setItem('tap2med_sidebar_state', isClosed ? 'closed' : 'open');
}

function addPrescriptionRow() {
    const number = prescriptionList.querySelectorAll(".prescription-row").length + 1;
    const row = document.createElement("div");
    row.className = "prescription-row";
    row.style.gridTemplateColumns = "2fr 1fr 1fr 1.5fr";

    const medicineField = document.createElement("div");
    medicineField.className = "field";
    medicineField.innerHTML = `
        <label for="medicine-${number}">Medicine Name</label>
        <input id="medicine-${number}" class="input rx-med" type="text" placeholder="e.g. Paracetamol 500mg" autocomplete="off">
    `;

    const dosageField = document.createElement("div");
    dosageField.className = "field";
    dosageField.innerHTML = `
        <label for="dosage-${number}">Dosage</label>
        <input id="dosage-${number}" class="input rx-dosage" type="text" placeholder="e.g. 1-0-1" autocomplete="off">
    `;

    const durationField = document.createElement("div");
    durationField.className = "field";
    durationField.innerHTML = `
        <label for="duration-${number}">Duration</label>
        <input id="duration-${number}" class="input rx-duration" type="text" placeholder="e.g. 5 Days" autocomplete="off">
    `;

    const instructionField = document.createElement("div");
    instructionField.className = "field";
    instructionField.innerHTML = `
        <label for="instruction-${number}">Instructions</label>
        <input id="instruction-${number}" class="input rx-inst" type="text" placeholder="e.g. After Meals" autocomplete="off">
    `;

    row.append(medicineField, dosageField, durationField, instructionField);
    prescriptionList.appendChild(row);
}

function clearPrescription() {
    prescriptionList.innerHTML = "";
    addPrescriptionRow();
}

function getShortCode(tokenNumber) {
    const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ"; 
    const letter = letters[(tokenNumber - 1) % 24]; 
    return `${letter}-${tokenNumber}`; 
}

window.moveQueue = async function(localToken, direction, e) {
    if (e) e.stopPropagation();
    let tokens = [...window.currentWaitingTokens];
    const index = tokens.indexOf(localToken);
    if (index < 0) return;
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= tokens.length) return;
    
    [tokens[index], tokens[newIndex]] = [tokens[newIndex], tokens[index]];
    window.currentWaitingTokens = tokens; 
    
    try {
        await fetch(`/api/clinics/${clinicId}/queue/reorder`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ local_tokens: tokens })
        });
        loadQueue();
    } catch (err) {
        console.error("Reorder failed");
    }
}

async function loadQueue() {
    if (!clinicId) return;

    try {
        const response = await fetch(`/api/clinics/queue/${encodeURIComponent(clinicId)}`);
        if (!response.ok) throw new Error("Queue request failed");
        
        const data = await response.json();
        
        doctorName.textContent = data.doctor_name || "Doctor";
        clinicName.textContent = data.clinic_name || "Clinic";
        
        const waitingQueue = data.queue ? data.queue.filter(p => p.status === 'waiting') : [];
        window.currentWaitingTokens = waitingQueue.map(p => p.local_token);

        const queueCountBadge = document.getElementById("queue-count");
        if (queueCountBadge) {
            queueCountBadge.textContent = `${waitingQueue.length} Waiting`;
        }

        const queueList = document.getElementById("queue-list");
        queueList.innerHTML = ""; 

        if (waitingQueue.length === 0) {
            currentToken.textContent = "—";
            currentLocalToken = null;
            queueList.innerHTML = '<div class="queue-card text-muted" style="padding:16px;">No patients waiting</div>';
            return;
        }

        waitingQueue.forEach((patient) => {
            const shortCode = getShortCode(patient.daily_token_number);
            const card = document.createElement("div");
            
            card.className = `queue-card ${currentLocalToken === patient.local_token ? 'active' : ''}`;
            card.style.cursor = "pointer";
            
            card.innerHTML = `
                <div style="display: flex; flex-direction: column; margin-right: 12px; gap: 4px; justify-content: center;">
                    <button onclick="moveQueue('${patient.local_token}', -1, event)" style="background:none; border:none; padding:0; cursor:pointer; color: var(--text-muted); font-size: 14px;">▲</button>
                    <button onclick="moveQueue('${patient.local_token}', 1, event)" style="background:none; border:none; padding:0; cursor:pointer; color: var(--text-muted); font-size: 14px;">▼</button>
                </div>
                <div class="token-number">#${shortCode}</div>
                <div class="patient-details">
                    <strong style="font-size: 16px;">${patient.patient_name || 'Patient'}</strong>
                    <span>ID: ${patient.display_id || '--'} ${patient.weight ? ' | Wt: ' + patient.weight : ''}</span>
                </div>
            `;

            card.onclick = async () => {
                currentLocalToken = patient.local_token;
                
                window.currentPatientName = patient.patient_name || 'Patient';
                window.currentDisplayId = patient.display_id || '--';
                
                document.getElementById("current-token").textContent = `#${shortCode}`;
                
                const headerEyebrow = document.querySelector(".eyebrow");
                if(headerEyebrow) {
                    headerEyebrow.innerHTML = `Active Token: <strong style="color: var(--primary-color);">${window.currentPatientName}</strong> (ID: ${window.currentDisplayId})
                    <button onclick="openLabsModal()" class="btn btn-sm btn-secondary" style="margin-left: 15px; background: white; font-size: 12px; height: 28px; box-shadow: none;">🧪 View Labs & Trends</button>`;
                }

                clearPrescription();
                await loadHistory(currentLocalToken);
                await loadQueue(); 
            };

            queueList.appendChild(card);
        });
        
        if (!currentLocalToken && waitingQueue.length > 0) {
            const firstPatient = waitingQueue[0];
            currentLocalToken = firstPatient.local_token;
            currentToken.textContent = `#${getShortCode(firstPatient.daily_token_number)}`;
            
            window.currentPatientName = firstPatient.patient_name || 'Patient';
            window.currentDisplayId = firstPatient.display_id || '--';
            
            const headerEyebrow = document.querySelector(".eyebrow");
            if(headerEyebrow) {
                headerEyebrow.innerHTML = `Active Token: <strong style="color: var(--primary-color);">${window.currentPatientName}</strong> (ID: ${window.currentDisplayId})
                <button onclick="openLabsModal()" class="btn btn-sm btn-secondary" style="margin-left: 15px; background: white; font-size: 12px; height: 28px; box-shadow: none;">🧪 View Labs & Trends</button>`;
            }

            clearPrescription();
            await loadHistory(currentLocalToken);
            const firstCard = queueList.firstChild;
            if(firstCard) firstCard.classList.add('active');
        }

    } catch (error) {
        console.error("Queue error:", error);
    }
}

async function loadHistory(localToken) {
    historyContent.innerHTML = '<p class="text-muted text-sm">Loading history...</p>';
    try {
        const response = await fetch(`/api/events/history/${encodeURIComponent(localToken)}`);
        if (!response.ok) throw new Error("History request failed");
        
        const data = await response.json();
        if (!data.history || data.history.length === 0) {
            historyContent.innerHTML = '<p class="text-muted text-sm">No previous visits recorded.</p>';
            return;
        }

        historyContent.innerHTML = "";
        data.history.forEach((visit) => {
            const date = new Date(visit.timestamp).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
            
            let medListHTML = "";
            if (!visit.prescriptions || visit.prescriptions.length === 0) {
                medListHTML = "<p class='text-muted text-sm'>No medicines recorded.</p>";
            } else {
                medListHTML = "<ul style='margin-top: 10px; padding-left: 15px;'>";
                visit.prescriptions.forEach((rx) => {
                    medListHTML += `<li style="margin-bottom: 5px;"><strong>${rx.name}</strong> <br><span class="text-muted text-sm">${rx.instructions || ""}</span></li>`;
                });
                medListHTML += "</ul>";
            }

            const card = document.createElement("details");
            card.style.background = "#fff";
            card.style.border = "1px solid #e2e8f0";
            card.style.borderRadius = "8px";
            card.style.padding = "12px";
            card.style.marginBottom = "10px";
            card.style.cursor = "pointer";

            let weightStr = "";
            if (visit.vitals && visit.vitals.wt) weightStr = visit.vitals.wt + "kg";
            else if (visit.weight && visit.weight.includes('Wt:')) weightStr = visit.weight.split('Wt:')[1].split('|')[0].trim();
            
            const weightBadge = weightStr ? `<span class="badge badge-info" style="font-size: 11px; margin-left: 10px;">Wt: ${weightStr}</span>` : "";

            card.innerHTML = `
                <summary style="font-weight: 600; color: var(--primary-color); outline: none; display: flex; align-items: center;">📅 ${date} ${weightBadge}</summary>
                <div style="padding-top: 10px; border-top: 1px solid #e2e8f0; margin-top: 10px;">
                    ${medListHTML}
                </div>
            `;
            
            historyContent.appendChild(card);
        });
    } catch (error) {
        console.error("History error:", error);
    }
}

async function completeVisit() {
    if (!currentLocalToken || isSaving) return;
    const medicines = [];

    prescriptionList.querySelectorAll(".prescription-row").forEach((row) => {
        const name = row.querySelector(".rx-med").value.trim();
        const dosage = row.querySelector(".rx-dosage").value.trim();
        const duration = row.querySelector(".rx-duration").value.trim();
        const instructions = row.querySelector(".rx-inst").value.trim();
        if (name) medicines.push({ name, dosage, duration, instructions });
    });

    if (!medicines.length) {
        if (!confirm("No medicines have been entered. Complete this visit?")) return;
    }

    isSaving = true;
    prescriptionStatus.textContent = "Saving...";
    prescriptionStatus.className = "badge badge-warning";

    try {
        const response = await fetch("/api/events/complete", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ local_token: currentLocalToken, medicines })
        });

        if (!response.ok) throw new Error("Prescription save failed");
        
        prescriptionStatus.textContent = "Sent to WhatsApp";
        prescriptionStatus.className = "badge badge-success";
        
        const today = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
        document.getElementById("print-clinic-name").textContent = clinicName.textContent;
        document.getElementById("print-doctor-name").textContent = doctorName.textContent;
        document.getElementById("print-date").textContent = `Date: ${today}`;
        
        const printNameEl = document.getElementById("print-patient-name");
        if (printNameEl) {
            printNameEl.innerHTML = `<strong>Name:</strong> ${window.currentPatientName || 'Patient'}`;
        }
        
        const printIdEl = document.getElementById("print-patient-id");
        if (printIdEl) {
            printIdEl.innerHTML = `<strong>Patient ID:</strong> ${window.currentDisplayId || '--'}`;
        }

        const printMedContainer = document.getElementById("print-medicines");
        printMedContainer.innerHTML = "";
        medicines.forEach(med => {
            const details = [med.dosage, med.duration, med.instructions].filter(Boolean).join(" | ");
            printMedContainer.innerHTML += `
                <div style="margin-bottom: 20px;">
                    <strong style="font-size: 16px; color: #000; display: block;">${med.name}</strong>
                    <span style="font-size: 14px; color: #444;">${details}</span>
                </div>
            `;
        });

        if (localStorage.getItem("tap2med_auto_print") === "true") {
            window.print();
        }
        
        currentLocalToken = null;
        clearPrescription();
        await loadQueue();
    } catch (error) {
        console.error("Complete visit error:", error);
        prescriptionStatus.textContent = "Failed to Send";
        prescriptionStatus.className = "badge badge-danger";
        alert("The prescription could not be saved.");
    } finally {
        isSaving = false;
    }
}

window.openLabsModal = async function() {
    if (!currentLocalToken) return alert("Please select a patient first.");
    document.getElementById("lab-modal-patient-name").textContent = window.currentPatientName || "Patient";
    document.getElementById("labs-modal").style.display = "flex";
    
    const today = new Date().toLocaleDateString('en-CA');
    document.getElementById("lab-date").value = today;
    
    await fetchLabData();
};

window.closeLabsModal = function() {
    document.getElementById("labs-modal").style.display = "none";
};

async function fetchLabData() {
    try {
        const res = await fetch(`/api/events/labs/${currentLocalToken}`);
        const data = await res.json();
        patientLabData = data.labs || [];
        
        populateLabInputsForDate(document.getElementById("lab-date").value);
        updateChart();
    } catch (e) {
        console.error("Failed to load labs", e);
    }
}

window.populateLabInputsForDate = function(dateStr) {
    const inputs = ['hba1c', 'fbs', 'ppbs', 'tsh', 'ft3', 'creat', 'hb'];
    inputs.forEach(id => {
        const el = document.getElementById(`lab-${id}`);
        if(el) {
            el.value = "";
            checkRange(el, el.getAttribute('data-min'), el.getAttribute('data-max'));
        }
    });
    
    const record = patientLabData.find(l => l.test_date === dateStr);
    if (record && record.results) {
        inputs.forEach(id => {
            if (record.results[id] !== undefined) {
                const el = document.getElementById(`lab-${id}`);
                if(el) {
                    el.value = record.results[id];
                    checkRange(el, el.getAttribute('data-min'), el.getAttribute('data-max'));
                }
            }
        });
    }
};

window.saveLabs = async function() {
    const dateStr = document.getElementById("lab-date").value;
    if (!dateStr) return alert("Please select a date.");
    
    const results = {
        hba1c: document.getElementById("lab-hba1c").value,
        fbs: document.getElementById("lab-fbs").value,
        ppbs: document.getElementById("lab-ppbs").value,
        tsh: document.getElementById("lab-tsh").value,
        ft3: document.getElementById("lab-ft3").value,
        creat: document.getElementById("lab-creat").value,
        hb: document.getElementById("lab-hb").value,
    };
    
    const payload = {
        local_token: currentLocalToken,
        lab_record: { test_date: dateStr, results: results }
    };
    
    try {
        const btn = document.querySelector("#labs-modal .btn-primary");
        btn.textContent = "Saving...";
        await fetch("/api/events/labs", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        await fetchLabData();
        btn.textContent = "Saved ✓";
        setTimeout(() => btn.textContent = "Save Values", 2000);
    } catch(e) {
        alert("Failed to save labs.");
    }
};

// Toggle CSS class instead of inline styles
window.checkRange = function(input, minStr, maxStr) {
    if (!minStr || !maxStr) return;
    const min = parseFloat(minStr);
    const max = parseFloat(maxStr);
    const val = parseFloat(input.value);
    
    if (!isNaN(val)) {
        if (val < min || val > max) {
            input.classList.add("lab-input-abnormal");
        } else {
            input.classList.remove("lab-input-abnormal");
        }
    } else {
        input.classList.remove("lab-input-abnormal");
    }
};

window.updateChart = function() {
    const param = document.getElementById("chart-parameter").value;
    const paramLabel = document.getElementById("chart-parameter").options[document.getElementById("chart-parameter").selectedIndex].text;
    
    const filteredData = patientLabData.filter(l => l.results && l.results[param] !== undefined && l.results[param] !== "");
    
    const labels = filteredData.map(l => {
        const d = new Date(l.test_date);
        return d.toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "2-digit" });
    });
    
    const dataPoints = filteredData.map(l => parseFloat(l.results[param]));
    
    if (labChartInstance) {
        labChartInstance.destroy();
    }
    
    const ctx = document.getElementById('labChart');
    if(!ctx || typeof Chart === 'undefined') return;

    labChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: paramLabel,
                data: dataPoints,
                borderColor: '#0284c7', 
                backgroundColor: 'rgba(2, 132, 199, 0.1)',
                borderWidth: 3,
                pointBackgroundColor: '#fff',
                pointBorderColor: '#0284c7',
                pointRadius: 5,
                pointHoverRadius: 7,
                fill: true,
                tension: 0.3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(context) { return context.parsed.y + " " + paramLabel; }
                    }
                }
            },
            scales: {
                y: { beginAtZero: false, grid: { borderDash: [4, 4] } },
                x: { grid: { display: false } }
            }
        }
    });
};

window.showQRCode = function() {
    try {
        const qrContainer = document.getElementById("dashboardQRCode");
        if (!qrContainer) {
            console.error("Error: QR Container missing from DOM.");
            return;
        }
        qrContainer.innerHTML = ""; 
        
        if (!clinicId || clinicId === "undefined" || clinicId === "null") {
            console.error("Error: Clinic ID not found.");
            alert("Clinic ID not found. Please log out and log back in.");
            return;
        }

        const targetUrl = window.location.origin + "/scan?clinic=" + clinicId; 
        
        new QRCode(qrContainer, {
            text: targetUrl, 
            width: 200, 
            height: 200, 
            correctLevel: QRCode.CorrectLevel.H
        });
        
        document.getElementById("qrModal").style.display = "flex";
    } catch (error) {
        console.error("QR Generation Error:", error);
        alert("Failed to load QR code. Please check the console.");
    }
}

document.getElementById("add-row-btn").addEventListener("click", addPrescriptionRow);
document.getElementById("print-btn").addEventListener("click", completeVisit);
menuToggleBtn.addEventListener("click", toggleSidebar);
sidebarBackdrop.addEventListener("click", toggleSidebar);

loadQueue();
setInterval(loadQueue, 5000);