const urlParams = new URLSearchParams(window.location.search);
const scannedClinicId = urlParams.get("clinic");

let currentSessionPhone = localStorage.getItem("tap2med_last_phone") || null;
let selectedMemberId = null;

const familyMembers = [
    { id: 0, name: "Self" },
    { id: 1, name: "Spouse" },
    { id: 2, name: "Father" },
    { id: 3, name: "Mother" },
    { id: 4, name: "Eldest Child" },
    { id: 5, name: "Middle Child" },
    { id: 6, name: "Youngest Child" },
    { id: 7, name: "Grandfather" },
    { id: 8, name: "Grandmother" },
    { id: 9, name: "Other Relative 1" },
    { id: 10, name: "Other Relative 2" }
];

const screens = ["screen-phone", "screen-member", "screen-details", "screen-success"];

function showScreen(screenId) {
    screens.forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.classList.add("hidden");
    });
    const activeScreen = document.getElementById(screenId);
    if (activeScreen) activeScreen.classList.remove("hidden");
}

// ----------------- WIZARD NAVIGATION -----------------

document.getElementById("btn-phone-next")?.addEventListener("click", () => {
    if (!scannedClinicId) {
        alert("Invalid QR Code. Missing Clinic ID. Please scan the official clinic QR.");
        return;
    }

    const phoneInput = document.getElementById("phone-input");
    const phone = phoneInput ? phoneInput.value.trim() : "";
    
    if (!/^\d{10}$/.test(phone)) {
        alert("Please enter a valid 10-digit phone number.");
        return;
    }

    currentSessionPhone = phone;
    localStorage.setItem("tap2med_last_phone", phone); 
    renderMemberGrid();
    showScreen("screen-member");
});

document.getElementById("btn-member-back")?.addEventListener("click", () => {
    showScreen("screen-phone");
});

document.getElementById("btn-details-back")?.addEventListener("click", () => {
    showScreen("screen-member");
});

function renderMemberGrid() {
    const grid = document.getElementById("member-grid");
    if (!grid) return;
    grid.innerHTML = "";
    
    familyMembers.forEach((member) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "member-btn";
        btn.textContent = member.name;
        btn.addEventListener("click", async () => {
            selectedMemberId = member.id;
            showScreen("screen-details");
            
            const nameInput = document.getElementById("patient-name-input");
            const cityInput = document.getElementById("patient-city-input");
            
            if (nameInput) nameInput.placeholder = "Loading...";
            
            try {
                const res = await fetch("/api/events/lookup", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        phone: currentSessionPhone,
                        member_id: selectedMemberId,
                        clinic_id: scannedClinicId
                    })
                });
                
                if (res.ok) {
                    const data = await res.json();
                    if (data.found && data.patient_name) {
                        nameInput.value = data.patient_name;
                        if (data.city && cityInput) cityInput.value = data.city;
                        nameInput.style.borderColor = "var(--success-color)";
                        setTimeout(() => nameInput.style.borderColor = "var(--border-color)", 1500);
                    } else {
                        nameInput.value = "";
                        if (cityInput) cityInput.value = "";
                    }
                }
            } catch(e) {
                console.error("Lookup failed silently", e);
            }
            
            if (nameInput) nameInput.placeholder = "Full Name";
            setTimeout(() => document.getElementById("patient-name-input")?.focus(), 50);
        });
        grid.appendChild(btn);
    });
}

// ----------------- RESUME SESSION / POLLING -----------------

window.addEventListener('DOMContentLoaded', async () => {
    const savedLocalToken = localStorage.getItem("tap2med_local_token");
    if (savedLocalToken) {
        try {
            const response = await fetch(`/api/events/status/${encodeURIComponent(savedLocalToken)}`);
            if (response.ok) {
                const data = await response.json();
                if (data.status === "In Queue") {
                    const activeToken = data.token_number || data.queue_number;
                    const tokenDisplay = document.getElementById("token-display");
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

// ----------------- SUBMIT CHECK IN -----------------

document.getElementById("check-in-btn")?.addEventListener("click", async () => {
    if (currentSessionPhone === null || selectedMemberId === null) {
        alert("Session lost. Please start over.");
        showScreen("screen-phone");
        return;
    }

    const nameInput = document.getElementById("patient-name-input");
    const cityInput = document.getElementById("patient-city-input");
    const patientName = nameInput ? nameInput.value.trim() : "";
    
    if (!patientName) {
        alert("Please enter the patient's name.");
        if (nameInput) nameInput.focus();
        return;
    }

    const payload = {
        phone: currentSessionPhone,
        member_id: selectedMemberId,
        clinic_id: scannedClinicId,
        name: patientName,
        city: cityInput ? cityInput.value.trim() : null
    };

    const headers = { "Content-Type": "application/json" };
    const savedPatientId = localStorage.getItem("tap2med_patient_id");
    if (savedPatientId) {
        headers["X-Patient-ID"] = savedPatientId;
    }

    const button = document.getElementById("check-in-btn");
    if (button) {
        button.disabled = true;
        button.textContent = "Generating...";
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
        const tokenDisplay = document.getElementById("token-display");
        if (tokenDisplay && activeToken) {
            tokenDisplay.textContent = `#${getShortCode(activeToken)}`;
        }
        
        showScreen("screen-success");
        startQueuePolling(data.local_token);
    } catch (error) {
        console.error("Check-in Error:", error);
        alert(`Error: ${error.message}\n\nPlease scan the QR again.`);
    } finally {
        if (button) {
            button.disabled = false;
            button.textContent = "Generate Token";
        }
    }
});

function getShortCode(tokenNumber) {
    if (!tokenNumber) return "--";
    const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
    const letter = letters[(tokenNumber - 1) % 24];
    return `${letter}-${tokenNumber}`; 
}

// ----------------- QUEUE POLLING LOGIC -----------------

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
                    waitStatusEl.innerHTML = `Queue Position: <strong style="font-size: 22px;">${data.your_position}</strong>`;
                }
            } 
            else if (data.status === "Completed") {
                clearInterval(pollingInterval);
                
                const savedPhone = currentSessionPhone || localStorage.getItem("tap2med_last_phone");
                let waUrl = "whatsapp://"; 
                if (savedPhone && data.prescription_text) {
                    waUrl = `whatsapp://send?phone=91${savedPhone}&text=${encodeURIComponent(data.prescription_text)}`;
                }
                
                if (waitStatusEl) {
                    waitStatusEl.className = "status-live text-green";
                    waitStatusEl.innerHTML = `
                        <div style="font-weight: 800; margin-bottom: 15px; font-size: 20px;">Consultation Complete!</div>
                        <p style="font-size: 14px; color: #64748b; margin-bottom: 20px; font-weight: 500;">Your prescription is ready. Tap below to get it directly on WhatsApp.</p>
                        <a href="${waUrl}" style="background: #25D366; color: white; padding: 14px 24px; border-radius: 12px; text-decoration: none; font-size: 16px; font-weight: bold; width: 100%; box-sizing: border-box; box-shadow: 0 4px 12px rgba(37, 211, 102, 0.3); display: flex; align-items: center; justify-content: center; gap: 10px;">
                            Open WhatsApp
                        </a>
                    `;
                }
                
                currentSessionPhone = null;
                selectedMemberId = null;
                localStorage.removeItem("tap2med_local_token"); 
            }
        } catch (error) {
            console.error("Polling error:", error);
        }
    }, 3000);
}