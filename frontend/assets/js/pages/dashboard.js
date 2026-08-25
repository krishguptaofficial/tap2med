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

async function loadQueue() {
    if (!clinicId) {
        currentToken.textContent = "#--";
        historyContent.innerHTML = '<p class="text-danger">Clinic ID is missing.</p>';
        return;
    }

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

        if (!data.queue || data.queue.length === 0) {
            currentToken.textContent = "—";
            currentLocalToken = null;
            historyContent.innerHTML = '<p class="text-muted text-sm">No patients waiting.</p>';
            return;
        }

        const patient = data.queue[0];
        const nextLocalToken = patient.local_token;
        currentToken.textContent = `#${patient.daily_token_number}`;

        if (currentLocalToken !== nextLocalToken) {
            currentLocalToken = nextLocalToken;
            prescriptionStatus.textContent = "Draft";
            prescriptionStatus.className = "badge badge-warning";
            clearPrescription();
            await loadHistory(currentLocalToken);
        }
    } catch (error) {
        console.error("Queue error:", error);
        historyContent.innerHTML = '<p class="text-danger text-sm">Unable to load queue.</p>';
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
            const date = new Date(visit.timestamp);
            const visitBlock = document.createElement("div");
            visitBlock.style.marginBottom = "16px";
            
            const dateHeader = document.createElement("strong");
            dateHeader.style.display = "block";
            dateHeader.style.fontSize = "13px";
            dateHeader.style.color = "var(--text-main)";
            dateHeader.textContent = date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
            visitBlock.appendChild(dateHeader);

            if (!visit.prescriptions || visit.prescriptions.length === 0) {
                const message = document.createElement("span");
                message.className = "text-muted text-sm";
                message.textContent = "No medicines recorded.";
                visitBlock.appendChild(message);
            } else {
                const list = document.createElement("ul");
                list.style.marginTop = "4px";
                list.style.fontSize = "13px";
                visit.prescriptions.forEach((prescription) => {
                    const item = document.createElement("li");
                    item.innerHTML = `<strong>${prescription.name}</strong> <span class="text-muted">— ${prescription.instructions || ""}</span>`;
                    list.appendChild(item);
                });
                visitBlock.appendChild(list);
            }
            historyContent.appendChild(visitBlock);
        });
    } catch (error) {
        console.error("History error:", error);
        historyContent.innerHTML = '<p class="text-danger text-sm">Unable to load visit history.</p>';
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
        
        currentLocalToken = null;
        clearPrescription();
        await loadQueue();
    } catch (error) {
        console.error("Complete visit error:", error);
        prescriptionStatus.textContent = "Failed to Send";
        prescriptionStatus.className = "badge badge-danger";
        alert("The prescription could not be saved. Please check the connection and try again.");
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