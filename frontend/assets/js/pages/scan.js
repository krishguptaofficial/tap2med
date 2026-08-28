const urlParams = new URLSearchParams(window.location.search);
const scannedClinicId = urlParams.get("clinic");

// Volatile session state
let currentSessionPhone = localStorage.getItem("tap2med_last_phone") || null;
let selectedMemberId = null;

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
        const el = document.getElementById(id);
        if(el) el.classList.add("hidden");
    });
    const activeScreen = document.getElementById(screenId);
    if(activeScreen) activeScreen.classList.remove("hidden");
}

function goToMemberScreen() {
    if (!scannedClinicId) {
        alert("Invalid QR Code. Missing Clinic ID. Please scan the official clinic QR.");
        return;
    }

    const phone = phoneInput.value.trim();
    if (!/^\d{10}$/.test(phone)) {
        alert("Please enter a valid 10-digit phone number.");
        return;
    }

    currentSessionPhone = phone;
    localStorage.setItem("tap2med_last_phone", phone); // Remember phone for WhatsApp routing
    renderMemberList();
    showScreen("screen-members");
}

function renderMemberList() {
    if (!memberListContainer) return;
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
    if (newMemberInput) newMemberInput.value = "";
    showScreen("screen-add-member");
    if (newMemberInput) newMemberInput.focus();
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
}

// Auto-Resume Session on Page Load
window.addEventListener('DOMContentLoaded', async () => {
    const savedLocalToken = localStorage.getItem("tap2med_local_token");
    
    if (savedLocalToken) {
        try {
            const response = await fetch(`/api/events/status/${encodeURIComponent(savedLocalToken)}`);
            if (response.ok) {
                const data = await response.json();
                
                if (data.status === "In Queue") {
                    const activeToken = data.token_number || data.queue_number;
                    if (tokenDisplay && activeToken) {
                        tokenDisplay.textContent = `#${getShortCode(activeToken)}`;
                    }
                    showScreen("screen-success");
                    startQueuePolling(savedLocalToken);
                }
            }
        } catch (error) {
            console.error("Failed to resume session:", error);
        }
    }
});

async function submitCheckIn() {
    if (currentSessionPhone === null || selectedMemberId === null) {
        alert("Please select a family member first.");
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
    if(button) {
        button.disabled = true;
        button.textContent = "Checking in...";
    }

    try {
        const response = await fetch("/api/events/visit/start", {
            method: "POST",
            headers: headers,
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Server rejected check-in: ${response.status} ${errText}`);
        }

        const data = await response.json();
        localStorage.setItem("tap2med_local_token", data.local_token);
        
        if (data.patient_id) {
            localStorage.setItem("tap2med_patient_id", data.patient_id);
        }

        const activeToken = data.token_number || data.queue_number;
        if (tokenDisplay && activeToken) {
            tokenDisplay.textContent = `#${getShortCode(activeToken)}`;
        }
        
        showScreen("screen-success");
        startQueuePolling(data.local_token);

    } catch (error) {
        console.error("Check-in Error:", error);
        // REAL ERROR LOGGING: If it fails now, it tells you exactly why!
        alert(`Error: ${error.message}\n\nPlease try scanning the QR again.`);
    } finally {
        if(button) {
            button.disabled = false;
            button.textContent = "Check-in";
        }
    }
}

function getShortCode(tokenNumber) {
    if (!tokenNumber) return "--";
    const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
    const letter = letters[(tokenNumber - 1) % 24];
    return `${letter}-${tokenNumber}`; 
}

// Safely attach event listeners
const btnSubmitPhone = document.getElementById("submit-phone-btn");
const btnCheckIn = document.getElementById("check-in-btn");
const btnSaveMember = document.getElementById("save-member-btn");
const btnCancelMember = document.getElementById("cancel-member-btn");

if(btnSubmitPhone) btnSubmitPhone.addEventListener("click", goToMemberScreen);
if(btnCheckIn) btnCheckIn.addEventListener("click", submitCheckIn);
if(btnSaveMember) btnSaveMember.addEventListener("click", saveNewMember);
if(btnCancelMember) btnCancelMember.addEventListener("click", () => showScreen("screen-members"));

let pollingInterval = null;

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
                
                // 1. Build the correct WhatsApp URL with the prescription text
                const savedPhone = currentSessionPhone || localStorage.getItem("tap2med_last_phone");
                let waUrl = "whatsapp://"; // fallback
                if (savedPhone && data.prescription_text) {
                    waUrl = `whatsapp://send?phone=91${savedPhone}&text=${encodeURIComponent(data.prescription_text)}`;
                }
                
                // 2. Add the native WhatsApp link styled as a beautiful button
                if (waitStatusEl) {
                    waitStatusEl.innerHTML = `
                        <div style="color: #16a34a; font-weight: 800; margin-bottom: 15px; font-size: 20px;">Consultation Complete!</div>
                        <p style="font-size: 14px; color: #64748b; margin-bottom: 20px;">Your prescription is ready. Tap below to get it directly on WhatsApp.</p>
                        <a href="${waUrl}" style="background: #25D366; color: white; padding: 14px 24px; border-radius: 12px; text-decoration: none; font-size: 16px; font-weight: bold; width: 100%; box-sizing: border-box; box-shadow: 0 4px 12px rgba(37, 211, 102, 0.3); display: flex; align-items: center; justify-content: center; gap: 10px;">
                            <svg style="width: 24px; height: 24px;" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>
                            Open WhatsApp
                        </a>
                    `;
                }
                
                // 3. Clear memory
                wipeVolatileMemory();
                localStorage.removeItem("tap2med_local_token"); 
            }
        } catch (error) {
            console.error("Polling error:", error);
        }
    }, 3000);
}