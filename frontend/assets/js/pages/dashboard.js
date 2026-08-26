// 1. Safely grab the clinic ID from storage
const clinicId = localStorage.getItem("tap2med_clinic_id");

// 2. Boot unauthenticated users or broken sessions back to login
if (!clinicId || clinicId === "undefined" || clinicId === "null") {
    window.location.href = "/login";
}

// 3. Initialize state variables
let currentLocalToken = null;
let isSaving = false;

// 4. Hook up HTML elements
const currentToken = document.getElementById("current-token");
const historyContent = document.getElementById("history-content");
const doctorName = document.getElementById("doc-name");
const clinicName = document.getElementById("clinic-name");
const prescriptionList = document.getElementById("rx-container");
const prescriptionStatus = document.getElementById("prescription-status");
const sidebar = document.getElementById("clinicSidebar");
const sidebarBackdrop = document.getElementById("sidebar-backdrop");
const menuToggleBtn = document.getElementById("sidebarToggle");

// Initialization & State persistence
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

    const medicineField = document.createElement("div");
    medicineField.className = "field";
    const medicineLabel = document.createElement("label");
    medicineLabel.htmlFor = `medicine-${number}`;
    medicineLabel.textContent = "Medicine Name";
    const medicineInput = document.createElement("input");
    medicineInput.id = `medicine-${number}`;
    medicineInput.className = "input rx-med";
    medicineInput.type = "text";
    medicineInput.placeholder = "e.g. Paracetamol 500mg";
    medicineInput.autocomplete = "off";
    medicineField.append(medicineLabel, medicineInput);

    const instructionField = document.createElement("div");
    instructionField.className = "field";
    const instructionLabel = document.createElement("label");
    instructionLabel.htmlFor = `instruction-${number}`;
    instructionLabel.textContent = "Dosage & Instructions";
    const instructionInput = document.createElement("input");
    instructionInput.id = `instruction-${number}`;
    instructionInput.className = "input rx-freq";
    instructionInput.type = "text";
    instructionInput.placeholder = "e.g. 1-0-1 After Meals";
    instructionInput.autocomplete = "off";
    instructionField.append(instructionLabel, instructionInput);

    row.append(medicineField, instructionField);
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

async function loadQueue() {
    if (!clinicId) return;

    try {
        const response = await fetch(`/api/clinics/queue/${encodeURIComponent(clinicId)}`);
        if (!response.ok) throw new Error("Queue request failed");
        
        const data = await response.json();
        
        doctorName.textContent = data.doctor_name || "Doctor";
        clinicName.textContent = data.clinic_name || "Clinic";
        
        const queueCountBadge = document.getElementById("queue-count");
        if (queueCountBadge) {
            queueCountBadge.textContent = `${data.queue ? data.queue.length : 0} Waiting`;
        }

        const queueList = document.getElementById("queue-list");
        queueList.innerHTML = ""; 

        if (!data.queue || data.queue.length === 0) {
            currentToken.textContent = "—";
            currentLocalToken = null;
            queueList.innerHTML = '<div class="queue-card text-muted" style="padding:16px;">No patients waiting</div>';
            return;
        }

        data.queue.forEach((patient) => {
            const shortCode = getShortCode(patient.daily_token_number);
            const card = document.createElement("div");
            
            card.className = `queue-card ${currentLocalToken === patient.local_token ? 'active' : ''}`;
            card.style.cursor = "pointer";
            
            card.innerHTML = `
                <div class="token-number">#${shortCode}</div>
                <div class="patient-details">
                    <strong>Waiting</strong>
                    <span>Status: Pending ${patient.weight ? ' | Wt: ' + patient.weight : ''}</span>
                </div>
            `;

            card.onclick = async () => {
                currentLocalToken = patient.local_token;
                document.getElementById("current-token").textContent = `#${shortCode}`;
                clearPrescription();
                await loadHistory(currentLocalToken);
                await loadQueue(); 
            };

            queueList.appendChild(card);
        });
        
        // Auto-select first patient if none selected
        if (!currentLocalToken && data.queue.length > 0) {
            const firstPatient = data.queue[0];
            currentLocalToken = firstPatient.local_token;
            currentToken.textContent = `#${getShortCode(firstPatient.daily_token_number)}`;
            clearPrescription();
            await loadHistory(currentLocalToken);
            // Re-render to show active state
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

            const weightBadge = visit.weight ? `<span class="badge badge-info" style="font-size: 11px; margin-left: 10px;">Wt: ${visit.weight}</span>` : "";

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
        const instructions = row.querySelector(".rx-freq").value.trim();
        if (name) medicines.push({ name, instructions });
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
        
        // Trigger print dialogue before clearing the view
        window.print();
        
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

window.showQRCode = function() {
    try {
        const qrContainer = document.getElementById("dashboardQRCode");
        if (!qrContainer) {
            console.error("Error: QR Container missing from DOM.");
            return;
        }
        qrContainer.innerHTML = ""; 
        
        // We just use the clinicId you already safely grabbed at the top of the file!
        if (!clinicId || clinicId === "undefined" || clinicId === "null") {
            console.error("Error: Clinic ID not found.");
            alert("Clinic ID not found. Please log out and log back in.");
            return;
        }

        const targetUrl = window.location.origin + "/scan?clinic=" + clinicId; 
        console.log("Success: Generating QR for URL ->", targetUrl);
        
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

// Event Listeners
document.getElementById("add-row-btn").addEventListener("click", addPrescriptionRow);
document.getElementById("print-btn").addEventListener("click", completeVisit);
menuToggleBtn.addEventListener("click", toggleSidebar);
sidebarBackdrop.addEventListener("click", toggleSidebar);

// Initialize
loadQueue();
setInterval(loadQueue, 5000);