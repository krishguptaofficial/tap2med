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
    { id: 3, name: "Wife" },
    { id: 4, name: "Son" },
    { id: 5, name: "Daughter" }
];

// Load saved family members or fallback to defaults
const savedMembers = localStorage.getItem("tap2med_family");
let familyMembers = savedMembers ? JSON.parse(savedMembers) : defaultMembers;

const screens = [
    "screen-phone",
    "screen-members",
    "screen-add-member",
    "screen-success"
];

// DOM Elements
const phoneInput = document.getElementById("phone-input");
const newMemberInput = document.getElementById("new-member-name");
const memberListContainer = document.getElementById("member-list-container");
const tokenDisplay = document.getElementById("token-display");

// Router-lite for UI screens
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

    // Temporarily hold phone in memory for the API call
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

        row.addEventListener("click", () => {
            selectMember(member.id, row);
        });

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

    familyMembers.push({
        id: Date.now(),
        name
    });

    localStorage.setItem("tap2med_family", JSON.stringify(familyMembers));

    renderMemberList();
    showScreen("screen-members");
}

// --- PII Memory Management ---
function wipeVolatileMemory() {
    // Flush sensitive data from JS memory
    currentSessionPhone = null;
    selectedMemberId = null;
    
    // Note: Leaving localStorage.getItem("tap2med_patient_id") intact for return visits
    console.log("Volatile memory wiped.");
}


function resetSessionTimeout() {
    clearTimeout(inactivityTimer);
    lastActivityTimestamp = Date.now(); // <-- ADD THIS LINE
    inactivityTimer = setTimeout(wipeVolatileMemory, 60000); // 60s idle timeout
}

// Bind memory wipe to inactivity and visibility changes (Keep this exactly as is)
['touchstart', 'mousemove', 'keypress', 'scroll'].forEach(evt => 
    window.addEventListener(evt, resetSessionTimeout, { passive: true })
);

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
        wipeVolatileMemory();
    } else if (document.visibilityState === 'visible') {
       
        // Check if 60 seconds passed while frozen in the background
        if (Date.now() - lastActivityTimestamp > 60000) {
            wipeVolatileMemory();
        }
    }
});

window.addEventListener('beforeunload', wipeVolatileMemory);

// --- Core Check-in Flow ---
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

    const headers = {
        "Content-Type": "application/json"
    };

    // Attach existing patient ID if this is a return visit
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

        if (!response.ok) {
            throw new Error("Check-in failed");
        }

        const data = await response.json();

        localStorage.setItem("tap2med_local_token", data.local_token);
        
        // Save new identity if server issued one (new patient or lost-device recovery)
        if (data.patient_id) {
            localStorage.setItem("tap2med_patient_id", data.patient_id);
        }

        tokenDisplay.textContent = `#${data.queue_number}`;

        // Start countdown to wipe phone number, giving WhatsApp time to trigger if needed
        resetSessionTimeout(); 

        showScreen("screen-success");
        
        // startQueuePolling(data.local_token); // TODO: implement polling

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

// --- Event Listeners ---
document.getElementById("submit-phone-btn").addEventListener("click", goToMemberScreen);
document.getElementById("check-in-btn").addEventListener("click", submitCheckIn);
document.getElementById("save-member-btn").addEventListener("click", saveNewMember);
document.getElementById("cancel-member-btn").addEventListener("click", () => showScreen("screen-members"));

window.addEventListener("load", () => {
    // If they refresh the page, see if they already have a token for today
    const savedToken = localStorage.getItem("tap2med_daily_token_number");
    if (savedToken) {
        tokenDisplay.textContent = `#${savedToken}`;
        showScreen("screen-success");
        // TODO: resume polling here if needed
    }
});