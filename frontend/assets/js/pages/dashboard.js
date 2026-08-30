const originalFetch = window.fetch;
window.fetch = async function() {
    const response = await originalFetch.apply(this, arguments);
    if (arguments[0].includes('/api/clinics/queue/')) {
        const clone = response.clone();
        const data = await clone.json();
        if (data.queue) {
            data.queue = data.queue.filter(p => {
                if (p.status === 'waiting') {
                    // NEW LOGIC: Look for the clean is_paid flag from the database
                    return p.vitals && p.vitals.is_paid === true;
                }
                return true;
            });
        }
        return new Response(JSON.stringify(data), {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers
        });
    }
    return response;
};

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

    const enableVitals = localStorage.getItem("tap2med_enable_vitals") !== "false";
    const enableNotes = localStorage.getItem("tap2med_enable_clinical_notes") !== "false";

    if (!enableVitals) {
        const vitalsBtn = document.getElementById('btn-vitals-header');
        if(vitalsBtn) vitalsBtn.style.display = 'none';
    }
    if (!enableNotes) {
        const notesSec = document.getElementById('clinical-notes-section');
        const lifestyleSec = document.getElementById('lifestyle-notes-section');
        if(notesSec) notesSec.style.display = 'none';
        if(lifestyleSec) lifestyleSec.style.display = 'none';
    }

    setTimeout(() => {
        const addBtn = document.getElementById('add-row-btn');
        if (addBtn) {
            const newAddBtn = addBtn.cloneNode(true);
            addBtn.parentNode.replaceChild(newAddBtn, addBtn);
            newAddBtn.addEventListener('click', addPrescriptionRow);
        }
    }, 500);
});

function toggleSidebar() {
    sidebar.classList.toggle("sidebar-closed");
    document.querySelector('.main-content').classList.toggle('sidebar-closed');
    sidebarBackdrop.classList.toggle("open");

    const isClosed = sidebar.classList.contains("sidebar-closed");
    if(menuToggleBtn) menuToggleBtn.setAttribute("aria-expanded", !isClosed);
    localStorage.setItem('tap2med_sidebar_state', isClosed ? 'closed' : 'open');
}

window.updateFreq = function(el) {
    const row = el.closest('.prescription-row');
    const dosage = row.querySelector('.rx-dosage').value.trim();
    const days = row.querySelector('.rx-days').value.trim();
    let inst = dosage;
    if (days) inst += (inst ? ' for ' : '') + days;
    row.querySelector('.rx-freq').value = inst;
};

window.addPrescriptionRow = function() {
    const container = document.getElementById('rx-container');
    const row = document.createElement('div');
    row.className = 'prescription-row';
    row.style.display = 'grid';
    row.style.gridTemplateColumns = '2fr 1fr 1fr auto';
    row.style.gap = '15px';
    row.style.marginBottom = '15px';
    row.innerHTML = `
        <div class="field">
        <input type="text" class="input rx-med" placeholder="e.g. Paracetamol 500mg" autocomplete="off" />
        </div>
        <div class="field">
        <input type="text" class="input rx-dosage" placeholder="e.g. 1-0-1" autocomplete="off" oninput="updateFreq(this)" />
        </div>
        <div class="field">
        <input type="text" class="input rx-days" placeholder="e.g. 5 days" autocomplete="off" oninput="updateFreq(this)" />
        </div>
        <button type="button" class="btn btn-ghost" onclick="this.closest('.prescription-row').remove()" style="color: #ef4444; padding: 10px;">✕</button>
        <input type="hidden" class="rx-freq" />
    `;
    container.appendChild(row);
};

function clearPrescription() {
    prescriptionList.innerHTML = "";
    addPrescriptionRow();
    const cEl = document.getElementById("patient-complaints");
    const dEl = document.getElementById("patient-diagnosis");
    const tEl = document.getElementById("patient-tests");

    if(cEl) cEl.value = "";
    if(dEl) dEl.value = "";
    if(tEl) tEl.value = "";
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
        window.location.reload();
    } catch (err) {
        console.error("Reorder failed");
    }
};

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
            if (!currentLocalToken || !document.getElementById("current-token").innerHTML.includes("EDITING")) {
                currentToken.textContent = "—";
                currentLocalToken = null;
            }
            queueList.innerHTML = '<div class="queue-card text-muted" style="padding:16px;">No patients waiting</div>';
        } else {
            waitingQueue.forEach((patient) => {
                const shortCode = getShortCode(patient.daily_token_number);
                const card = document.createElement("div");

                card.dataset.token = patient.local_token;
                card.className = `queue-card ${currentLocalToken === patient.local_token ? 'active' : ''}`;
                card.style.cursor = "pointer";

                let typeBadge = "";
                if (patient.visit_type === "followup") typeBadge = `<span style="font-size: 11px; background: #fef08a; color: #b45309; padding: 2px 6px; border-radius: 4px; margin-left: 8px; font-weight: 800; text-transform: uppercase;">Follow-up</span>`;
                else if (patient.visit_type === "appointment") typeBadge = `<span style="font-size: 11px; background: #e0e7ff; color: #0369a1; padding: 2px 6px; border-radius: 4px; margin-left: 8px; font-weight: 800; text-transform: uppercase;">Appointment</span>`;
                else typeBadge = `<span style="font-size: 11px; background: #f1f5f9; color: #64748b; padding: 2px 6px; border-radius: 4px; margin-left: 8px; font-weight: 800; text-transform: uppercase;">Walk-in</span>`;

                let cityText = patient.city ? `<span style="font-size: 12px; color: var(--text-muted); font-weight: 500; margin-left: 6px;">(${patient.city})</span>` : "";

                card.innerHTML = `
                    <div style="display: flex; flex-direction: column; margin-right: 12px; gap: 4px; justify-content: center;">
                        <button onclick="moveQueue('${patient.local_token}', -1, event)" style="background:none; border:none; padding:0; cursor:pointer; color: var(--text-muted); font-size: 14px;">▲</button>
                        <button onclick="moveQueue('${patient.local_token}', 1, event)" style="background:none; border:none; padding:0; cursor:pointer; color: var(--text-muted); font-size: 14px;">▼</button>
                    </div>
                    <div class="token-number">#${shortCode}</div>
                    <div class="patient-details">
                        <strong style="font-size: 16px; ">${patient.patient_name || 'Patient'} ${cityText} ${typeBadge}</strong>
                        <span>ID: ${patient.display_id || '--'} ${patient.weight ? ' | Wt: ' + patient.weight : ''}</span>
                    </div>
                `;

                card.onclick = () => {
                    document.querySelectorAll('.queue-card').forEach(c => c.classList.remove('active'));
                    card.classList.add('active');

                    currentLocalToken = patient.local_token;
                    window.currentPatientName = patient.patient_name || 'Patient';
                    window.currentDisplayId = patient.display_id || '--';

                    document.getElementById("current-token").textContent = `#${shortCode}`;

                    const activeCityText = patient.city ? ` <span style="font-size: 14px; color: var(--text-muted);">(${patient.city})</span>` : "";
                    const headerEyebrow = document.querySelector(".eyebrow");
                    if(headerEyebrow) headerEyebrow.innerHTML = `Active Token: <strong style="color: var(--primary-color);">${window.currentPatientName}</strong>${activeCityText} (ID: ${window.currentDisplayId})
                    <button onclick="openLabsModal()" class="btn btn-sm btn-secondary" style="margin-left: 15px; background: white; font-size: 12px; height: 28px; box-shadow: none;">🧪 View Labs & Trends</button>`;

                    clearPrescription();
                    historyContent.innerHTML = '<p class="text-muted text-sm">Fetching secure records...</p>';

                    loadHistory(currentLocalToken);
                    fetchActiveVitals();
                };

                queueList.appendChild(card);
            });

            if (!currentLocalToken && waitingQueue.length > 0) {
                const firstPatient = waitingQueue[0];
                currentLocalToken = firstPatient.local_token;
                currentToken.textContent = `#${getShortCode(firstPatient.daily_token_number)}`;
                window.currentPatientName = firstPatient.patient_name || 'Patient';
                window.currentDisplayId = firstPatient.display_id || '--';

                const activeCityText = firstPatient.city ? ` <span style="font-size: 14px; color: var(--text-muted);">(${firstPatient.city})</span>` : "";
                const headerEyebrow = document.querySelector(".eyebrow");
                if(headerEyebrow) headerEyebrow.innerHTML = `Active Token: <strong style="color: var(--primary-color);">${window.currentPatientName}</strong>${activeCityText} (ID: ${window.currentDisplayId})
                <button onclick="openLabsModal()" class="btn btn-sm btn-secondary" style="margin-left: 15px; background: white; font-size: 12px; height: 28px; box-shadow: none;">🧪 View Labs & Trends</button>`;

                clearPrescription();
                loadHistory(currentLocalToken);
                const firstCard = queueList.firstChild;
                if(firstCard) firstCard.classList.add('active');
            }
        }

        const completedQueue = data.queue ? data.queue.filter(p => p.status === 'completed') : [];
        const completedList = document.getElementById("completed-list");
        if (completedList) {
            completedList.innerHTML = "";
            if (completedQueue.length === 0) {
                completedList.innerHTML = '<div class="queue-card text-muted" style="padding:16px; font-size:14px;">No completed patients</div>';
            } else {
                completedQueue.forEach((patient) => {
                    const shortCode = getShortCode(patient.daily_token_number);
                    const card = document.createElement("div");
                    card.className = "queue-card";
                    card.style.background = "#f8fafc";
                    card.style.cursor = "default";
                    card.innerHTML = `
                        <div class="token-number" style="color: #64748b; font-size: 18px;">#${shortCode}</div>
                        <div class="patient-details" style="flex: 1;">
                            <strong style="font-size: 15px; color: #475569;">${patient.patient_name || 'Patient'}</strong>
                            <span style="color: var(--success-color); font-size: 12px;">Completed</span>
                        </div>
                        <div style="display: flex; flex-direction: column; gap: 6px;">
                            <button onclick="editRx('${patient.local_token}', ${patient.daily_token_number}, '${patient.patient_name || 'Patient'}', '${patient.display_id || '--'}')" class="btn btn-ghost" style="padding: 4px 8px; font-size: 11px; color: #ef4444; border: 1px dashed #fca5a5;">✏️ Edit</button>
                            <button onclick="rePrintRx('${patient.local_token}', '${patient.patient_name || 'Patient'}', '${patient.display_id || '--'}')" class="btn btn-secondary" style="padding: 4px 8px; font-size: 11px; background: white;">🖨️ Print</button>
                        </div>
                    `;
                    completedList.appendChild(card);
                });
            }
        }

    } catch (error) {
        console.error("Queue error:", error);
    }
}

async function loadHistory(localToken) {
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

            let historyHTML = "";

            if(visit.complaints) historyHTML += `<div style="margin-bottom:8px; font-size:13px; color:#475569;"><strong>C/E:</strong> ${visit.complaints}</div>`;
            if(visit.diagnosis) historyHTML += `<div style="margin-bottom:12px; font-size:13px; color:#0f172a;"><strong>Dx:</strong> ${visit.diagnosis}</div>`;

            if(visit.prescriptions && visit.prescriptions.length > 0) {
                historyHTML += `<div style="margin-top:10px; font-size:13px; color:#0f172a;"><strong>Rx:</strong><ul style="margin:5px 0; padding-left:20px;">`;
                visit.prescriptions.forEach((rx) => {
                    historyHTML += `<li style="margin-bottom: 4px;"><strong>${rx.name}</strong> <br><span class="text-muted" style="font-size:12px;">${rx.instructions || ""}</span></li>`;
                });
                historyHTML += "</ul></div>";
            }
            if(visit.tests_suggested) historyHTML += `<div style="margin-top:12px; font-size:13px; color:#0284c7;"><strong>Tests:</strong> ${visit.tests_suggested}</div>`;

            const card = document.createElement("details");
            card.style.background = "#fff";
            card.style.border = "1px solid #e2e8f0";
            card.style.borderRadius = "8px";
            card.style.padding = "12px";
            card.style.marginBottom = "10px";
            card.style.cursor = "pointer";

            const weightBadge = visit.weight ? `<span class="badge badge-info" style="font-size: 11px; margin-left: 10px;">Wt: ${visit.weight}</span>` : "";

            card.innerHTML = `
                <summary style="font-weight: 600; color: var(--primary-color); outline: none; display: flex; align-items: center;">📅 ${date} ${weightBadge}</summary>
                <div style="padding-top: 10px; border-top: 1px solid #e2e8f0; margin-top: 10px;">
                    ${historyHTML || "<p class='text-muted text-sm'>No details recorded.</p>"}
                </div>
            `;

            historyContent.appendChild(card);
        });
    } catch (error) {
        console.error("History error:", error);
    }
}

window.rePrintRx = async function(localToken, patientName, displayId) {
    try {
        const response = await fetch(`/api/events/history/${encodeURIComponent(localToken)}`);
        const data = await response.json();
        if (!data.history || data.history.length === 0) return alert("No prescription found.");

        const visit = data.history[0];
        const today = new Date(visit.timestamp).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });

        document.getElementById("print-clinic-name").textContent = clinicName.textContent;
        document.getElementById("print-doctor-name").textContent = doctorName.textContent;
        document.getElementById("print-date").textContent = `Date: ${today}`;

        document.getElementById("print-patient-name").innerHTML = `<strong>Name:</strong> ${patientName}`;
        document.getElementById("print-patient-id").innerHTML = `<strong>Patient ID:</strong> ${displayId}`;

        const printNotesContainer = document.getElementById("print-clinical-notes");
        const printComplaints = document.getElementById("print-complaints");
        const printDiagnosis = document.getElementById("print-diagnosis");
        const printTests = document.getElementById("print-tests");

        if (visit.complaints || visit.diagnosis) {
            printNotesContainer.style.display = "block";
            printComplaints.innerHTML = visit.complaints ? `<strong>C/E:</strong> ${visit.complaints}` : "";
            printDiagnosis.innerHTML = visit.diagnosis ? `<strong>Diagnosis:</strong> ${visit.diagnosis}` : "";
        } else {
            printNotesContainer.style.display = "none";
        }

        if (visit.tests_suggested) {
            printTests.style.display = "block";
            printTests.innerHTML = `<strong>Tests Suggested:</strong> ${visit.tests_suggested}`;
        } else {
            printTests.style.display = "none";
        }

        const printMedContainer = document.getElementById("print-medicines");
        printMedContainer.innerHTML = "";
        if(visit.prescriptions) {
            visit.prescriptions.forEach(med => {
                printMedContainer.innerHTML += `
                    <div style="margin-bottom: 20px;">
                        <strong style="font-size: 16px; color: #000; display: block;">${med.name}</strong>
                        <span style="font-size: 14px; color: #444;">${med.instructions || ''}</span>
                    </div>
                `;
            });
        }
        window.print();
    } catch (e) {
        alert("Failed to load prescription for printing.");
    }
};

window.editRx = async function(localToken, tokenNumber, patientName, displayId) {
    try {
        const response = await fetch(`/api/events/history/${encodeURIComponent(localToken)}`);
        if (!response.ok) throw new Error("Server returned HTTP " + response.status);

        const data = await response.json();
        if (!data.history || data.history.length === 0) return alert("No history found to edit.");

        const visit = data.history[0];

        currentLocalToken = localToken;
        window.currentPatientName = patientName || 'Patient';
        window.currentDisplayId = displayId || '--';

        document.querySelectorAll('.queue-card').forEach(c => c.classList.remove('active'));

        const currentTokenEl = document.getElementById("current-token");
        if(currentTokenEl) currentTokenEl.innerHTML = `#${getShortCode(tokenNumber)} <span style="font-size:12px; color:#ef4444; background:#fee2e2; padding:2px 6px; border-radius:4px;">EDITING</span>`;

        const headerEyebrow = document.querySelector(".eyebrow");
        if(headerEyebrow) headerEyebrow.innerHTML = `Active Token: <strong style="color: var(--primary-color);">${window.currentPatientName}</strong> (ID: ${window.currentDisplayId}) - <span style="color:#ef4444;">EDIT MODE</span>`;

        const compEl = document.getElementById("patient-complaints");
        if(compEl) compEl.value = visit.complaints || "";

        const diagEl = document.getElementById("patient-diagnosis");
        if(diagEl) diagEl.value = visit.diagnosis || "";

        const testEl = document.getElementById("patient-tests");
        if(testEl) testEl.value = visit.tests_suggested || "";

        const rxContainer = document.getElementById("rx-container");
        if (rxContainer) {
            rxContainer.innerHTML = "";
            if (visit.prescriptions && Array.isArray(visit.prescriptions) && visit.prescriptions.length > 0) {
                visit.prescriptions.forEach(med => {
                    addPrescriptionRow();
                    const rows = rxContainer.querySelectorAll('.prescription-row');
                    if (rows.length > 0) {
                        const lastRow = rows[rows.length - 1];

                        const medInput = lastRow.querySelector('.rx-med');
                        if(medInput) medInput.value = med.name || "";

                        let dosage = med.instructions || "";
                        let days = "";
                        if (dosage && typeof dosage === 'string' && dosage.includes(' for ')) {
                            const parts = dosage.split(' for ');
                            dosage = parts[0];
                            days = parts[1];
                        }

                        const dosInput = lastRow.querySelector('.rx-dosage');
                        if(dosInput) dosInput.value = dosage || "";

                        const daysInput = lastRow.querySelector('.rx-days');
                        if(daysInput) daysInput.value = days || "";

                        const freqInput = lastRow.querySelector('.rx-freq');
                        if(freqInput) freqInput.value = med.instructions || "";
                    }
                });
            } else {
                addPrescriptionRow();
            }
        }

        if (typeof fetchActiveVitals === 'function') fetchActiveVitals();
        window.scrollTo({ top: 0, behavior: 'smooth' });

    } catch(e) {
        console.error("EditRx Error:", e);
        alert("Error pulling prescription: " + e.message);
    }
};

const printBtn = document.getElementById('print-btn');
if (printBtn) {
    printBtn.addEventListener('click', completeVisit);
}

async function completeVisit() {
    if (!currentLocalToken || isSaving) return;
    const medicines = [];

    prescriptionList.querySelectorAll(".prescription-row").forEach((row) => {
        const name = row.querySelector(".rx-med").value.trim();
        const instructions = row.querySelector(".rx-freq").value.trim();
        if (name) medicines.push({ name, instructions });
    });

    const complaints = document.getElementById("patient-complaints")?.value.trim();
    const diagnosis = document.getElementById("patient-diagnosis")?.value.trim();
    const tests_suggested = document.getElementById("patient-tests")?.value.trim();

    if (!medicines.length && !complaints && !diagnosis && !tests_suggested) {
        if (!confirm("No details have been entered. Complete this visit?")) return;
    }

    isSaving = true;
    prescriptionStatus.textContent = "Saving...";
    prescriptionStatus.className = "badge badge-warning";

    try {
        const response = await fetch("/api/events/complete", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                local_token: currentLocalToken,
                medicines: medicines,
                complaints: complaints,
                diagnosis: diagnosis,
                tests_suggested: tests_suggested
            })
        });

        if (!response.ok) throw new Error("Prescription save failed");

        prescriptionStatus.textContent = "Sent to WhatsApp";
        prescriptionStatus.className = "badge badge-success";

        const today = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
        document.getElementById("print-clinic-name").textContent = clinicName.textContent;
        document.getElementById("print-doctor-name").textContent = doctorName.textContent;
        document.getElementById("print-date").textContent = `Date: ${today}`;

        const printNameEl = document.getElementById("print-patient-name");
        if (printNameEl) printNameEl.innerHTML = `<strong>Name:</strong> ${window.currentPatientName || 'Patient'}`;

        const printIdEl = document.getElementById("print-patient-id");
        if (printIdEl) printIdEl.innerHTML = `<strong>Patient ID:</strong> ${window.currentDisplayId || '--'}`;

        const printNotesContainer = document.getElementById("print-clinical-notes");
        const printComplaints = document.getElementById("print-complaints");
        const printDiagnosis = document.getElementById("print-diagnosis");
        const printTests = document.getElementById("print-tests");

        if (complaints || diagnosis) {
            printNotesContainer.style.display = "block";
            printComplaints.innerHTML = complaints ? `<strong>C/E:</strong> ${complaints}` : "";
            printDiagnosis.innerHTML = diagnosis ? `<strong>Diagnosis:</strong> ${diagnosis}` : "";
        } else {
            printNotesContainer.style.display = "none";
        }

        if (tests_suggested) {
            printTests.style.display = "block";
            printTests.innerHTML = `<strong>Tests Suggested:</strong> ${tests_suggested}`;
        } else {
            printTests.style.display = "none";
        }

        const printMedContainer = document.getElementById("print-medicines");
        printMedContainer.innerHTML = "";
        medicines.forEach(med => {
            printMedContainer.innerHTML += `
                <div style="margin-bottom: 20px;">
                    <strong style="font-size: 16px; color: #000; display: block;">${med.name}</strong>
                    <span style="font-size: 14px; color: #444;">${med.instructions || ''}</span>
                </div>
            `;
        });

        setTimeout(async () => {
            if (localStorage.getItem("tap2med_auto_print") === "true") {
                window.print();
            }

            currentLocalToken = null;
            clearPrescription();

            const headerEyebrow = document.querySelector(".eyebrow");
            if(headerEyebrow) headerEyebrow.innerHTML = `Active Token`;
            document.getElementById("current-token").textContent = `#--`;

            await loadQueue();
        }, 150);

    } catch (error) {
        console.error("Complete visit error:", error);
        prescriptionStatus.textContent = "Failed to Send";
        prescriptionStatus.className = "badge badge-danger";
        alert("The prescription could not be saved.");
    } finally {
        isSaving = false;
    }
}

window.showQRCode = function() {
    try {
        const qrContainer = document.getElementById("dashboardQRCode");
        if (!qrContainer) return;
        qrContainer.innerHTML = "";

        if (!clinicId || clinicId === "undefined" || clinicId === "null") return;

        const targetUrl = window.location.origin + "/scan?clinic=" + clinicId;

        new QRCode(qrContainer, {
            text: targetUrl,
            width: 200,
            height: 200,
            correctLevel: QRCode.CorrectLevel.H
        });

        document.getElementById("qrModal").style.display = "flex";
    } catch (error) {}
}

if(menuToggleBtn) menuToggleBtn.addEventListener("click", toggleSidebar);
if(sidebarBackdrop) sidebarBackdrop.addEventListener("click", toggleSidebar);

window.openVitalsModal = async function() {
    document.getElementById('vitals-modal').style.display = 'flex';
    ['bp-sys', 'bp-dia', 'pr', 'wt', 'ht', 'temp', 'spo2', 'waist', 'hip'].forEach(id => {
        document.getElementById(`vital-${id}`).value = '';
    });

    try {
        const res = await fetch(`/api/clinics/queue/${clinicId}`);
        const data = await res.json();
        const activePatient = data.queue.find(p => p.local_token === currentLocalToken);

        if (activePatient && activePatient.vitals) {
            const v = activePatient.vitals;
            document.getElementById('vital-bp-sys').value = v.bp_sys || '';
            document.getElementById('vital-bp-dia').value = v.bp_dia || '';
            document.getElementById('vital-pr').value = v.pr || '';
            document.getElementById('vital-wt').value = v.wt || '';
            document.getElementById('vital-ht').value = v.ht || '';
            document.getElementById('vital-temp').value = v.temp || '';
            document.getElementById('vital-spo2').value = v.spo2 || '';
            document.getElementById('vital-waist').value = v.waist || '';
            document.getElementById('vital-hip').value = v.hip || '';
        }
    } catch (e) {
        console.error("Could not auto-fill vitals:", e);
    }
}
window.closeVitalsModal = function() {
    document.getElementById('vitals-modal').style.display = 'none';
}

window.submitVitals = async function() {
    const payload = {
        bp_sys: document.getElementById('vital-bp-sys').value.trim() || null,
        bp_dia: document.getElementById('vital-bp-dia').value.trim() || null,
        pr: document.getElementById('vital-pr').value.trim() || null,
        wt: document.getElementById('vital-wt').value.trim() || null,
        ht: document.getElementById('vital-ht').value.trim() || null,
        temp: document.getElementById('vital-temp').value.trim() || null,
        spo2: document.getElementById('vital-spo2').value.trim() || null,
        waist: document.getElementById('vital-waist').value.trim() || null,
        hip: document.getElementById('vital-hip').value.trim() || null
    };

    try {
        // Preserve the payment status
        const res = await fetch(`/api/clinics/queue/${clinicId}`);
        const data = await res.json();
        const activePatient = data.queue.find(p => p.local_token === currentLocalToken);
        payload.is_paid = (activePatient && activePatient.vitals && activePatient.vitals.is_paid) ? true : false;

        await fetch("/api/events/vitals", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ local_token: currentLocalToken, vitals: payload })
        });

        closeVitalsModal();
        fetchActiveVitals();
    } catch (e) {
        alert("Failed to save vitals.");
    }
}

async function fetchActiveVitals() {
    if (localStorage.getItem("tap2med_enable_vitals") === "false" || !currentLocalToken) return;

    try {
        const res = await fetch(`/api/clinics/queue/${clinicId}`);
        const data = await res.json();
        const activePatient = data.queue.find(p => p.local_token === currentLocalToken);
        const display = document.getElementById('doctor-vitals-display');

        if (activePatient && activePatient.vitals) {
            const v = activePatient.vitals;
            let compiled = [];
            
            if (v.bp_sys && v.bp_dia) compiled.push(`BP: ${v.bp_sys}/${v.bp_dia}`);
            if (v.pr) compiled.push(`PR: ${v.pr}`);
            if (v.wt) compiled.push(`Wt: ${v.wt}kg`);
            if (v.ht) compiled.push(`Ht: ${v.ht}cm`);
            if (v.temp) compiled.push(`T: ${v.temp}F`);
            if (v.spo2) compiled.push(`SpO2: ${v.spo2}%`);
            
            const displayWeight = compiled.join(' | ');

            if (displayWeight) {
                display.style.display = 'block';
                display.innerHTML = `<strong style="color: #475569;">Recorded Vitals:</strong> <span style="color: var(--primary-color); font-weight: 600;">${displayWeight}</span>`;
            } else {
                display.style.display = 'none';
            }
        } else {
            display.style.display = 'none';
        }
    } catch (e) {}
}

// --- LAB FLOWSHEET INTEGRATION ---
window.openLabsModal = async function() {
    if (!currentLocalToken) return alert("Please select a patient first.");
    document.getElementById("lab-modal-patient-name").textContent = window.currentPatientName || "Patient";
    document.getElementById("lab-local-token").value = currentLocalToken;
    document.getElementById("labs-modal").style.display = "flex";
    
    const today = new Date().toLocaleDateString('en-CA');
    document.getElementById("lab-date").value = today;
    
    await fetchLabData(currentLocalToken);
};

window.closeLabsModal = function() {
    document.getElementById("labs-modal").style.display = "none";
};

async function fetchLabData(token) {
    try {
        const res = await fetch(`/api/events/labs/${token}`);
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
    const localToken = document.getElementById("lab-local-token").value;
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
    
    const payload = { local_token: localToken, lab_record: { test_date: dateStr, results: results } };
    
    try {
        const btn = document.querySelector("#labs-modal .btn-primary");
        const originalText = btn.textContent;
        btn.textContent = "Saving...";
        await fetch("/api/events/labs", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        await fetchLabData(localToken);
        btn.textContent = "Saved ✓";
        setTimeout(() => btn.textContent = originalText, 2000);
    } catch(e) {
        alert("Failed to save labs.");
    }
};

window.checkRange = function(input, minStr, maxStr) {
    if (!minStr || !maxStr) return;
    const min = parseFloat(minStr);
    const max = parseFloat(maxStr);
    const val = parseFloat(input.value);
    
    if (!isNaN(val)) {
        if (val < min || val > max) input.classList.add("lab-input-abnormal");
        else input.classList.remove("lab-input-abnormal");
    } else {
        input.classList.remove("lab-input-abnormal");
    }
};

window.updateChart = function() {
    const param = document.getElementById("chart-parameter").value;
    const paramLabel = document.getElementById("chart-parameter").options[document.getElementById("chart-parameter").selectedIndex].text;
    const filteredData = patientLabData.filter(l => l.results && l.results[param] !== undefined && l.results[param] !== "");
    const labels = filteredData.map(l => new Date(l.test_date).toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "2-digit" }));
    const dataPoints = filteredData.map(l => parseFloat(l.results[param]));
    
    if (labChartInstance) labChartInstance.destroy();
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
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { callbacks: { label: function(context) { return context.parsed.y + " " + paramLabel; } } } },
            scales: { y: { beginAtZero: false, grid: { borderDash: [4, 4] } }, x: { grid: { display: false } } }
        }
    });
};

loadQueue();
fetchActiveVitals();
setInterval(fetchActiveVitals, 3000);
setInterval(loadQueue, 5000);