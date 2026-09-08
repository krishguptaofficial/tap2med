const urlParams = new URLSearchParams(window.location.search);
const scannedClinicId = urlParams.get("clinic");

let currentSessionPhone = localStorage.getItem("tap2med_last_phone") || null;
let selectedMemberId = null;

const defaultMembers = [
  { id: 0, name: "Self" },
  { id: 1, name: "Spouse" },
  { id: 2, name: "Father" },
  { id: 3, name: "Mother" },
  { id: 4, name: "Child 1 (Eldest)" },
  { id: 5, name: "Child 2" },
  { id: 6, name: "Child 3" },
  { id: 7, name: "Child 4 (Youngest)" },
];
const savedMembers = localStorage.getItem("tap2med_family");
let familyMembers = savedMembers ? JSON.parse(savedMembers) : defaultMembers;

const screens = [
  "screen-phone",
  "screen-members",
  "screen-add-member",
  "screen-details",
  "screen-success",
];

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
    alert(
      "Invalid QR Code. Missing Clinic ID. Please scan the official clinic QR.",
    );
    return;
  }

  const phoneInput = document.getElementById("phone-input");
  let phone = phoneInput ? phoneInput.value.trim() : "";

  if (!phone) {
    phone = Math.floor(1000000000 + Math.random() * 9000000000).toString();
  } else if (!/^\d{10}$/.test(phone)) {
    alert("Please enter a valid 10-digit phone number or leave blank.");
    return;
  }

  currentSessionPhone = phone;
  localStorage.setItem("tap2med_last_phone", phone);
  renderMemberList();
  showScreen("screen-members");
});

document.getElementById("btn-details-back")?.addEventListener("click", () => {
  showScreen("screen-members");
});

function renderMemberList() {
  const list = document.getElementById("member-list-container");
  if (!list) return;
  list.innerHTML = "";
  familyMembers.forEach((member) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "member-row";
    btn.textContent = member.name;
    btn.addEventListener("click", () => {
      selectedMemberId = member.id;
      list
        .querySelectorAll(".member-row")
        .forEach((row) => row.classList.remove("selected"));
      btn.classList.add("selected");
      loadSelectedMember();
    });
    list.appendChild(btn);
  });
  const addMember = document.createElement("button");
  addMember.type = "button";
  addMember.className = "member-row add-member";
  addMember.textContent = "+ Add New Member";
  addMember.addEventListener("click", () => {
    document.getElementById("new-member-name").value = "";
    showScreen("screen-add-member");
  });
  list.appendChild(addMember);
}

async function loadSelectedMember() {
  const nameInput = document.getElementById("patient-name-input");
  const cityInput = document.getElementById("patient-city-input");
  const ageInput = document.getElementById("patient-age-input");

  if (!currentSessionPhone || selectedMemberId === null) return;
  if (nameInput) {
    nameInput.value = "";
    nameInput.placeholder = "Loading...";
  }
  if (cityInput) cityInput.value = "";
  if (ageInput) ageInput.value = "";
  showScreen("screen-details");

  try {
    const response = await fetch("/api/events/lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone: currentSessionPhone,
        member_id: selectedMemberId,
        clinic_id: scannedClinicId,
      }),
    });
    if (response.ok) {
      const data = await response.json();
      if (data.found) {
        if (nameInput) nameInput.value = data.patient_name || "";
        if (cityInput) cityInput.value = data.city || "";
        if (ageInput)
          ageInput.value =
            data.age !== undefined && data.age !== null ? String(data.age) : "";
      }
    }
  } catch (error) {
    console.error("Patient lookup failed", error);
  } finally {
    if (nameInput) {
      nameInput.placeholder = "Full Name";
      nameInput.focus();
    }
  }
}

document.getElementById("save-member-btn")?.addEventListener("click", () => {
  const input = document.getElementById("new-member-name");
  const name = input.value.trim();
  if (!name) return alert("Please enter a name.");
  familyMembers.push({ id: Date.now(), name });
  localStorage.setItem("tap2med_family", JSON.stringify(familyMembers));
  renderMemberList();
  showScreen("screen-members");
});

document
  .getElementById("cancel-member-btn")
  ?.addEventListener("click", () => showScreen("screen-phone"));
document
  .getElementById("cancel-add-member-btn")
  ?.addEventListener("click", () => showScreen("screen-members"));

// ----------------- RESUME SESSION / POLLING -----------------

window.addEventListener("DOMContentLoaded", async () => {
  const savedLocalToken = localStorage.getItem("tap2med_local_token");
  if (savedLocalToken) {
    try {
      const response = await fetch(
        `/api/events/status/${encodeURIComponent(savedLocalToken)}?clinic_id=${clinicId}`,
      );
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
  const ageInput = document.getElementById("patient-age-input");
  const patientName = nameInput ? nameInput.value.trim() : "";
  const patientAge = ageInput ? ageInput.value.trim() : "";

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
    city: cityInput ? cityInput.value.trim() : null,
    age: patientAge ? parseInt(patientAge, 10) : null,
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
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(
        `Server rejected check-in: ${response.status} ${errText}`,
      );
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
      const response = await fetch(
        `/api/events/status/${encodeURIComponent(localToken)}?clinic_id=${clinicId}`,
      );
      if (!response.ok) return;

      const data = await response.json();
      const waitStatusEl = document.getElementById("wait-status");

      if (data.status === "In Queue") {
        if (waitStatusEl) {
          waitStatusEl.innerHTML = `Queue Position: <strong style="font-size: 22px;">${data.your_position}</strong>`;
        }
      } else if (data.status === "Completed") {
        clearInterval(pollingInterval);

        const savedPhone =
          currentSessionPhone || localStorage.getItem("tap2med_last_phone");
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
