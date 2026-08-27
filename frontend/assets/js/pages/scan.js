const urlParams = new URLSearchParams(window.location.search);
const scannedClinicId = urlParams.get("clinic");

// Volatile session state (wiped quickly)
let currentSessionPhone = null;
let selectedMemberId = null;
let inactivityTimer = null;
let lastActivityTimestamp = Date.now();

const defaultMembers = [
    { id: 0, name: "Self" },
    { id: 1, name: "Mother" },
    { id: 2, name: "Father" },
    { id: 3, name: "Spouse" },
    { id: 4, name: "Son" },
    { id: 5, name: "Daughter"}
];

const savedMembers = localStorage.getItem("tap2med_family");
let familyMembers = savedMembers ? JSON.parse(savedMembers) : defaultMembers;

const screens = ["screen-phone", "screen-members", "screen-add-member", "screen-success"];

const phoneInput = document.getElementById("phone-input");
const newMemberInput = document.getElementById("new-member-name");
const memberListContainer = document.getElementById("member-list-container");
const tokenDisplay = document.getElementById("token-display");

function showScreen(screenId) {
    screens.forEach((id) => {
        document.getElementById(id).classList.add("hidden");
    });
    document.getElementById(screenId).classList.remove("hidden");
}

function goToMemberScreen() {
    if (!scannedClinicId) {
        alert("Invalid QR Code. Missing Clinic ID.");
        return;
    }

    const phone = phoneInput.value.trim();
    if (!/^\d{10}$/.test(phone)) {
        alert("Please enter a valid 10-digit number.");
        return;
    }

    currentSessionPhone = phone;
    renderMemberList();
    showScreen("screen-members");
}

function renderMemberList() {
    memberListContainer.innerHTML = "";
    familyMembers.forEach((member) => {
        const row = document.createElement("button");
        row.type = "button";
        row.className = "member-row";
        row.textContent = member.name;
        row.addEventListener("click", () => selectMember(member.id, row));
        memberListContainer.appendChild(row);
    });

    const addMember = document.createElement("button");
    addMember.type = "button";
    addMember.className = "member-row add-member";
    addMember.textContent = "+ Add New Member";
    addMember.addEventListener("click", showAddMemberScreen);
    memberListContainer.appendChild(addMember);
}

function selectMember(memberId, rowElement) {
    selectedMemberId = memberId;
    memberListContainer.querySelectorAll(".member-row").forEach((row) => {
        row.classList.remove("selected");
    });
    rowElement.classList.add("selected");
}

function showAddMemberScreen() {
    newMemberInput.value = "";
    showScreen("screen-add-member");
    newMemberInput.focus();
}

function saveNewMember() {
    const name = newMemberInput.value.trim();
    if (!name) {
        alert("Please enter a name.");
        return;
    }
    familyMembers.push({ id: Date.now(), name });
    localStorage.setItem("tap2med_family", JSON.stringify(familyMembers));
    renderMemberList();
    showScreen("screen-members");
}

function wipeVolatileMemory() {
    currentSessionPhone = null;
    selectedMemberId = null;
    console.log("Volatile memory wiped.");
}

// Auto-Resume Session on Page Load
window.addEventListener('DOMContentLoaded', async () => {
    const savedLocalToken = localStorage.getItem("tap2med_local_token");
    
    if (savedLocalToken) {
        try {
            const response = await fetch(`/api/events/status/${encodeURIComponent(savedLocalToken)}`);
            if (response.ok) {
                const data = await response.json();
                
                // If they are still in the queue, jump straight to the live status screen
                if (data.status === "In Queue") {
                    showScreen("screen-success");
                    startQueuePolling(savedLocalToken);
                }
                // If completed, we let them stay on the phone entry screen in case they need it again later
            }
        } catch (error) {
            console.error("Failed to resume session:", error);
        }
    }
});

async function submitCheckIn() {
    if (currentSessionPhone === null || selectedMemberId === null) {
        alert("Session timed out. Please enter your details again.");
        showScreen("screen-phone");
        return;
    }

    const payload = {
        phone: currentSessionPhone,
        member_id: selectedMemberId,
        clinic_id: scannedClinicId
    };

    const headers = { "Content-Type": "application/json" };
    const savedPatientId = localStorage.getItem("tap2med_patient_id");
    if (savedPatientId) {
        headers["X-Patient-ID"] = savedPatientId;
    }

    const button = document.getElementById("check-in-btn");
    button.disabled = true;
    button.textContent = "Checking in...";

    try {
        const response = await fetch("/api/events/visit/start", {
            method: "POST",
            headers: headers,
            body: JSON.stringify(payload)
        });

        if (!response.ok) throw new Error("Check-in failed");

        const data = await response.json();
        localStorage.setItem("tap2med_local_token", data.local_token);
        
        if (data.patient_id) {
            localStorage.setItem("tap2med_patient_id", data.patient_id);
        }

        tokenDisplay.textContent = `#${getShortCode(data.queue_number)}`;
        resetSessionTimeout(); 
        showScreen("screen-success");
        startQueuePolling(data.local_token); 

    } catch (error) {
        console.error(error);
        alert("Network error. Please try again.");
        wipeVolatileMemory();
        showScreen("screen-phone");
    } finally {
        button.disabled = false;
        button.textContent = "Check-in";
    }
}

function getShortCode(tokenNumber) {
    const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ"; 
    const letter = letters[(tokenNumber - 1) % 24]; 
    return `${letter}-${tokenNumber}`; 
}

document.getElementById("submit-phone-btn").addEventListener("click", goToMemberScreen);
document.getElementById("check-in-btn").addEventListener("click", submitCheckIn);
document.getElementById("save-member-btn").addEventListener("click", saveNewMember);
document.getElementById("cancel-member-btn").addEventListener("click", () => showScreen("screen-members"));

let pollingInterval = null;

function startQueuePolling(localToken) {
    if (pollingInterval) clearInterval(pollingInterval);
    
    pollingInterval = setInterval(async () => {
        try {
            const response = await fetch(`/api/events/status/${encodeURIComponent(localToken)}`);
            if (!response.ok) return;
            
            const data = await response.json();
            const waitStatusEl = document.getElementById("wait-status");
            
            if (data.status === "In Queue") {
                if (waitStatusEl) {
                    waitStatusEl.innerHTML = `Your Position: <strong>${data.your_position}</strong><br>Estimated Wait: <strong>${data.estimated_wait}</strong>`;
                }
            } 
            else if (data.status === "Completed") {
                clearInterval(pollingInterval);
                
                if (currentSessionPhone && data.prescription_text) {
                const waUrl = `whatsapp://send?phone=91${currentSessionPhone}&text=${encodeURIComponent(data.prescription_text)}`;                    window.location.href = waUrl; 
                    wipeVolatileMemory();
                }
                
                if (waitStatusEl) {
                    waitStatusEl.innerHTML = "Consultation Complete.<br>Opening WhatsApp...";
                    waitStatusEl.classList.add("text-green");
                }
            }
        } catch (error) {
            console.error("Polling error:", error);
        }
    }, 3000);
}