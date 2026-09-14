const clinicId = localStorage.getItem("tap2med_clinic_id");
if (!clinicId) window.location.href = "/staff-login";

let currentClinicName = "Clinic";
let currentDoctorName = "Doctor";
window.currentWaitingTokens = [];

let patientLabData = [];
let labChartInstance = null;
let lookupRequest = null;
let lookupTimer = null;
let lookupSequence = 0;
const lookupCache = new Map();

function logout() {
  localStorage.removeItem("tap2med_clinic_id");
  localStorage.removeItem("tap2med_staff_role");
  window.location.href = "/staff-login";
}

function getShortCode(tokenNumber) {
  if (tokenNumber === undefined || tokenNumber === null) return "--";
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  let idx = (tokenNumber - 1) % 24;
  if (idx < 0) idx += 24;
  const letter = letters[idx];
  return `${letter}-${tokenNumber}`;
}

function numberToWords(num) {
  num = parseInt(num) || 0;
  const a = [
    "",
    "One ",
    "Two ",
    "Three ",
    "Four ",
    "Five ",
    "Six ",
    "Seven ",
    "Eight ",
    "Nine ",
    "Ten ",
    "Eleven ",
    "Twelve ",
    "Thirteen ",
    "Fourteen ",
    "Fifteen ",
    "Sixteen ",
    "Seventeen ",
    "Eighteen ",
    "Nineteen ",
  ];
  const b = [
    "",
    "",
    "Twenty",
    "Thirty",
    "Forty",
    "Fifty",
    "Sixty",
    "Seventy",
    "Eighty",
    "Ninety",
  ];
  if ((num = num.toString()).length > 9) return "OVERFLOW";
  let n = ("000000000" + num)
    .substr(-9)
    .match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/);
  if (!n) return "";
  let str = "";
  str +=
    n[1] != 0
      ? (a[Number(n[1])] || b[n[1][0]] + " " + a[n[1][1]]) + "Crore "
      : "";
  str +=
    n[2] != 0
      ? (a[Number(n[2])] || b[n[2][0]] + " " + a[n[2][1]]) + "Lakh "
      : "";
  str +=
    n[3] != 0
      ? (a[Number(n[3])] || b[n[3][0]] + " " + a[n[3][1]]) + "Thousand "
      : "";
  str +=
    n[4] != 0
      ? (a[Number(n[4])] || b[n[4][0]] + " " + a[n[4][1]]) + "Hundred "
      : "";
  str +=
    n[5] != 0
      ? (str != "" ? "and " : "") +
        (a[Number(n[5])] || b[n[5][0]] + " " + a[n[5][1]])
      : "";
  return str ? str.trim().toUpperCase() + " RUPEES ONLY" : "ZERO RUPEES ONLY";
}

function setLookupStatus(message, tone = "neutral") {
  const statusEl = document.getElementById("manual-status");
  if (!statusEl) return;

  statusEl.textContent = message;
  statusEl.className = "lookup-status";

  if (tone === "success") {
    statusEl.classList.add("lookup-status-success");
  } else if (tone === "error") {
    statusEl.classList.add("lookup-status-error");
  } else {
    statusEl.classList.add("lookup-status-neutral");
  }

  statusEl.style.display = message ? "inline-flex" : "none";
}

function clearLookupStatus() {
  const nameInput = document.getElementById("walkin-name");
  const cityInput = document.getElementById("walkin-city");
  const ageInput = document.getElementById("walkin-age");
  if (nameInput) nameInput.value = "";
  if (cityInput) cityInput.value = "";
  if (ageInput) ageInput.value = "";
  setLookupStatus("", "neutral");
}

window.attemptManualLookup = async function (memberId = null) {
  if (memberId !== null && typeof memberId === "object") {
    memberId = null; // Ignore Event objects
  }
  const phoneInput = document.getElementById("walkin-phone");
  const phone = phoneInput ? phoneInput.value.trim() : "";
  const memberInput = document.getElementById("manual-member-id");
  const selectedMember =
    memberId === null
      ? memberInput
        ? Number.parseInt(memberInput.value, 10)
        : 0
      : Number.parseInt(memberId, 10);
  const nameInput = document.getElementById("walkin-name");
  const cityInput = document.getElementById("walkin-city");
  const ageInput = document.getElementById("walkin-age");

  if (!/^\d{10}$/.test(phone)) {
    clearLookupStatus();
    return;
  }

  const requestKey = `${phone}:${selectedMember}`;
  const requestId = ++lookupSequence;
  if (lookupRequest) lookupRequest.abort();
  if (lookupTimer) clearTimeout(lookupTimer);

  const cachedPatient = lookupCache.get(requestKey);
  if (cachedPatient) {
    applyLookupResult(cachedPatient, nameInput, cityInput, ageInput);
    return;
  }

  setLookupStatus("Checking patient...", "neutral");

  try {
    const controller = new AbortController();
    lookupRequest = controller;
    const res = await new Promise((resolve, reject) => {
      lookupTimer = setTimeout(async () => {
        try {
          resolve(
            await fetch("/api/events/lookup", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                phone: phone,
                member_id: selectedMember,
                clinic_id: clinicId,
              }),
              signal: controller.signal,
            }),
          );
        } catch (error) {
          reject(error);
        }
      }, 75);
    });

    if (requestId !== lookupSequence) return;

    if (!res.ok) {
      applyLookupResult({ found: false }, nameInput, cityInput, ageInput);
      return;
    }

    const data = await res.json();
    lookupCache.set(requestKey, data);
    applyLookupResult(data, nameInput, cityInput, ageInput);
  } catch (e) {
    if (e.name === "AbortError" || requestId !== lookupSequence) return;
    console.error("Lookup failed", e);
    setLookupStatus("Specific patient not found", "error");
  } finally {
    if (requestId === lookupSequence) lookupRequest = null;
  }
};

function applyLookupResult(data, nameInput, cityInput, ageInput) {
  if (data.found && data.patient_name) {
    if (nameInput) nameInput.value = data.patient_name;
    if (cityInput) cityInput.value = data.city || "";
    if (ageInput)
      ageInput.value =
        data.age !== undefined && data.age !== null ? String(data.age) : "";
    if (nameInput) {
      nameInput.style.borderColor = "#22c55e";
      nameInput.style.backgroundColor = "#f0fdf4";
    }
    setLookupStatus(`Specific patient found: ${data.patient_name}`, "success");
  } else {
    if (nameInput) nameInput.value = "";
    if (cityInput) cityInput.value = "";
    if (ageInput) ageInput.value = "";
    if (nameInput) {
      nameInput.style.borderColor = "#cbd5e1";
      nameInput.style.backgroundColor = "#f8fafc";
    }
    setLookupStatus("Specific patient not found", "error");
  }
}

document.getElementById("walkin-phone")?.addEventListener("input", () => {
  lookupSequence += 1;
  if (lookupRequest) lookupRequest.abort();
  if (lookupTimer) clearTimeout(lookupTimer);
  lookupRequest = null;
  lookupCache.clear();
  if (document.getElementById("walkin-phone").value.trim().length < 10) {
    clearLookupStatus();
  }
});
document
  .getElementById("walkin-phone")
  ?.addEventListener("blur", attemptManualLookup);

const manualMemberSelect = document.getElementById("manual-member-id");
if (manualMemberSelect) {
  manualMemberSelect.addEventListener("change", () => {
    const phone = document.getElementById("walkin-phone")?.value.trim() || "";
    if (/^\d{10}$/.test(phone)) {
      attemptManualLookup();
    } else {
      clearLookupStatus();
    }
  });
  manualMemberSelect.addEventListener("mouseover", (event) => {
    const target = event.target;
    if (target && target.tagName === "OPTION") {
      manualMemberSelect.value = target.value;
      const phone = document.getElementById("walkin-phone")?.value.trim() || "";
      if (/^\d{10}$/.test(phone)) {
        attemptManualLookup(target.value);
      }
    }
  });
}

window.manualCheckIn = async function () {
  const phoneInput = document.getElementById("walkin-phone");
  const phone = phoneInput.value.trim();
  const statusEl = document.getElementById("manual-status");
  const btn = document.getElementById("btn-manual-checkin");
  const memberInput = document.getElementById("manual-member-id");
  const selectedMember = memberInput
    ? Number.parseInt(memberInput.value, 10)
    : 0;

  const nameInput = document.getElementById("walkin-name");
  const patientName = nameInput ? nameInput.value.trim() : "Walk-in Patient";

  const cityInput = document.getElementById("walkin-city");
  const patientCity = cityInput ? cityInput.value.trim() : null;

  const ageInput = document.getElementById("walkin-age");
  const patientAge = ageInput ? ageInput.value.trim() : "";

  const isAppt = document.getElementById("walkin-is-appt")?.checked || false;

  let finalPhone = phone;
  if (!finalPhone) {
    finalPhone = Math.floor(1000000000 + Math.random() * 9000000000).toString();
  } else if (!/^\d{10}$/.test(finalPhone)) {
    statusEl.textContent =
      "Please enter a valid 10-digit phone number or leave blank.";
    statusEl.style.color = "var(--error-color)";
    return;
  }
  if (!patientName) {
    statusEl.textContent = "Please enter the patient's name.";
    statusEl.style.color = "var(--error-color)";
    return;
  }

  btn.disabled = true;
  btn.textContent = "Generating...";
  statusEl.textContent = "";

  try {
    const response = await fetch("/api/events/visit/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone: phone,
        member_id: selectedMember,
        clinic_id: clinicId,
        name: patientName,
        city: patientCity,
        age: patientAge ? parseInt(patientAge, 10) : null,
        is_appointment: isAppt,
      }),
    });

    if (!response.ok) throw new Error("Check-in failed");
    const data = await response.json();
    const tokenStr = getShortCode(data.queue_number);

    statusEl.innerHTML = `Success! Token is <strong style="font-size: 18px; color: var(--primary-color);">#${tokenStr}</strong>`;
    statusEl.style.color = "var(--success-color)";
    phoneInput.value = "";
    if (nameInput) nameInput.value = "";
    if (cityInput) cityInput.value = "";
    if (ageInput) ageInput.value = "";
    if (document.getElementById("walkin-is-appt"))
      document.getElementById("walkin-is-appt").checked = false;

    loadStaffQueue();
  } catch (error) {
    statusEl.textContent = "Failed to add patient to queue.";
    statusEl.style.color = "var(--error-color)";
  } finally {
    btn.disabled = false;
    btn.textContent = "Generate Token";
  }
};

window.openVitalsModal = function (localToken, vitalsJSON) {
  document.getElementById("vitals-token").value = localToken;
  let vitals = {};
  try {
    vitals = JSON.parse(vitalsJSON || "{}");
  } catch (e) {}

  document.getElementById("vital-is-paid").value =
    vitals.is_paid === true ? "true" : "false";
  document.getElementById("vitals-modal").style.display = "flex";

  document.getElementById("vital-bp-sys").value = vitals.bp_sys || "";
  document.getElementById("vital-bp-dia").value = vitals.bp_dia || "";
  document.getElementById("vital-pr").value = vitals.pr || "";
  document.getElementById("vital-wt").value = vitals.wt || "";
  document.getElementById("vital-ht").value = vitals.ht || "";
  document.getElementById("vital-temp").value = vitals.temp || "";
  document.getElementById("vital-spo2").value = vitals.spo2 || "";
  document.getElementById("vital-waist").value = vitals.waist || "";
  document.getElementById("vital-hip").value = vitals.hip || "";
};

window.closeVitalsModal = function () {
  document.getElementById("vitals-modal").style.display = "none";
};

window.submitVitals = async function () {
  const localToken = document.getElementById("vitals-token").value;
  const payload = {
    is_paid: document.getElementById("vital-is-paid").value === "true",
    bp_sys: document.getElementById("vital-bp-sys").value.trim() || null,
    bp_dia: document.getElementById("vital-bp-dia").value.trim() || null,
    pr: document.getElementById("vital-pr").value.trim() || null,
    wt: document.getElementById("vital-wt").value.trim() || null,
    ht: document.getElementById("vital-ht").value.trim() || null,
    temp: document.getElementById("vital-temp").value.trim() || null,
    spo2: document.getElementById("vital-spo2").value.trim() || null,
    waist: document.getElementById("vital-waist").value.trim() || null,
    hip: document.getElementById("vital-hip").value.trim() || null,
  };

  try {
    const response = await fetch("/api/events/vitals", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clinic_id: clinicId,
        local_token: localToken,
        vitals: payload,
      }),
    });
    if (!response.ok) throw new Error("Vitals save failed");
    closeVitalsModal();
    loadStaffQueue();
  } catch (e) {
    alert("Failed to save vitals.");
  }
};

window.markAsPaid = async function (localToken, currentVitalsJSON) {
  let vitals = {};
  try {
    vitals = JSON.parse(currentVitalsJSON || "{}");
  } catch (e) {}
  vitals.is_paid = true;

  try {
    await fetch("/api/events/vitals", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clinic_id: clinicId,
        local_token: localToken,
        vitals: vitals,
      }),
    });
    loadStaffQueue();
  } catch (e) {
    alert("Failed to mark as paid.");
  }
};

window.openBillModal = function (
  patientName,
  displayId,
  tokenNum,
  fee,
  visitType,
) {
  document.getElementById("modal-bill-patient-name").value = patientName;
  document.getElementById("modal-bill-display-id").value = displayId;
  document.getElementById("modal-bill-token-num").value = tokenNum;

  document.getElementById("bill-modal-patient-info").textContent =
    `Patient: ${patientName} | ID: ${displayId} | Token: #${tokenNum}`;
  document.getElementById("modal-bill-service").value =
    `Dr. ${currentDoctorName}- ${visitType || "Consultation"}`;
  document.getElementById("modal-bill-amount").value = fee || "300";
  document.getElementById("modal-bill-mode").value = "CASH";

  document.getElementById("bill-modal").style.display = "flex";
};

window.executePrintBill = function () {
  const patientName = document.getElementById("modal-bill-patient-name").value;
  const displayId = document.getElementById("modal-bill-display-id").value;
  const tokenNum = document.getElementById("modal-bill-token-num").value;
  const serviceName =
    document.getElementById("modal-bill-service").value.trim() ||
    "Consultation";
  const amount =
    document.getElementById("modal-bill-amount").value.trim() || "0";
  const payMode = document.getElementById("modal-bill-mode").value;

  const now = new Date();
  const dateStr = now.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const timeStr = now.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  document.getElementById("bill-clinic-name").textContent = currentClinicName;
  document.getElementById("bill-patient-name").textContent = patientName;
  document.getElementById("bill-patient-id").textContent = displayId;
  document.getElementById("bill-date").textContent = `${dateStr} ${timeStr}`;
  document.getElementById("bill-number").textContent = `#${tokenNum}`;

  document.getElementById("bill-service-name").textContent = serviceName;
  document.getElementById("bill-price").textContent = amount;
  document.getElementById("bill-net-price").textContent = amount;

  document.getElementById("bill-payment-mode").textContent = payMode;
  document.getElementById("bill-amount-words").textContent =
    numberToWords(amount);

  document.getElementById("bill-total-1").textContent = amount;
  document.getElementById("bill-total-2").textContent = amount;
  document.getElementById("bill-total-3").textContent = amount;

  document.getElementById("bill-modal").style.display = "none";

  document.body.className = "mode-bill";
  window.print();
  setTimeout(() => (document.body.className = ""), 1000);
};

window.showQRCode = function () {
  try {
    const qrContainer = document.getElementById("dashboardQRCode");
    const printContainer = document.getElementById("print-qr-target");
    if (!qrContainer) return;
    qrContainer.innerHTML = "";
    if (printContainer) printContainer.innerHTML = "";

    if (!clinicId) return;
    const targetUrl = window.location.origin + "/scan?clinic=" + clinicId;

    new QRCode(qrContainer, {
      text: targetUrl,
      width: 220,
      height: 220,
      correctLevel: QRCode.CorrectLevel.H,
    });
    if (printContainer) {
      new QRCode(printContainer, {
        text: targetUrl,
        width: 380,
        height: 380,
        correctLevel: QRCode.CorrectLevel.H,
      });
    }
    document.getElementById("print-qr-clinic-name").textContent =
      currentClinicName;
    document.getElementById("qrModal").style.display = "flex";
  } catch (error) {}
};

window.printQRCode = function () {
  document.body.className = "mode-qr";
  window.print();
  setTimeout(() => (document.body.className = ""), 1000);
};

// --- STAFF LAB FLOWSHEET & TRENDS (DECOUPLED COMPONENT) ---
window.openLabsModal = async function (localToken, patientName) {
  if (window.Tap2MedLabs) {
    window.Tap2MedLabs.open(localToken, patientName || "Patient", clinicId);
  }
};

window.closeLabsModal = function () {
  if (window.Tap2MedLabs) {
    window.Tap2MedLabs.close();
  } else {
    const modal = document.getElementById("labs-modal");
    if (modal) modal.style.display = "none";
  }
};

window.moveQueue = async function (localToken, direction, event) {
  if (event) event.stopPropagation();
  try {
    await fetch("/api/events/queue/move", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clinic_id: clinicId,
        local_token: localToken,
        direction: direction,
      }),
    });
    loadStaffQueue();
  } catch (e) {
    console.error("Failed to move queue", e);
  }
};

let draggedQueueCard = null;
let queueDragActive = false;

function setupQueueDrag(card) {
  card.draggable = true;
  card.dataset.localToken = card.dataset.localToken || "";

  card.addEventListener("dragstart", (event) => {
    draggedQueueCard = card;
    queueDragActive = true;
    card.classList.add("queue-card-dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", card.dataset.localToken);
  });

  card.addEventListener("dragover", (event) => {
    event.preventDefault();
    if (!draggedQueueCard || draggedQueueCard === card) return;
    const bounds = card.getBoundingClientRect();
    const insertBefore = event.clientY < bounds.top + bounds.height / 2;
    card.parentNode.insertBefore(
      draggedQueueCard,
      insertBefore ? card : card.nextSibling,
    );
  });

  card.addEventListener("dragend", async () => {
    card.classList.remove("queue-card-dragging");
    draggedQueueCard = null;
    queueDragActive = false;
    await persistQueueOrder(card.parentNode);
  });
}

async function persistQueueOrder(list) {
  if (!list || queueDragActive) return;
  const localTokens = [
    ...list.querySelectorAll(".queue-card[data-local-token]"),
  ]
    .map((card) => card.dataset.localToken)
    .filter(Boolean);
  if (!localTokens.length) return;

  try {
    const response = await fetch(
      `/api/clinics/${encodeURIComponent(clinicId)}/queue/reorder`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ local_tokens: localTokens }),
      },
    );
    if (!response.ok) throw new Error("Queue reorder failed");
  } catch (error) {
    console.error("Failed to save queue order", error);
    loadStaffQueue();
  }
}

window.changeVisitType = async function (localToken, newType) {
  try {
    await fetch("/api/events/visit_type", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clinic_id: clinicId,
        local_token: localToken,
        visit_type: newType,
      }),
    });
    loadStaffQueue();
  } catch (e) {
    console.error("Failed to update visit type", e);
  }
};

window.removePatientFromQueue = async function (localToken, event) {
  if (event) event.stopPropagation();
  if (!confirm("Remove this patient from the queue?")) return;

  try {
    await fetch("/api/events/queue/remove", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clinic_id: clinicId, local_token: localToken }),
    });
    loadStaffQueue();
  } catch (e) {
    console.error("Failed to remove patient from queue", e);
    alert("Failed to remove patient from queue.");
  }
};

async function loadStaffQueue() {
  if (queueDragActive) return;
  try {
    const response = await fetch(
      `/api/clinics/queue/${encodeURIComponent(clinicId)}`,
    );
    if (!response.ok) return;

    const data = await response.json();
    currentClinicName = data.clinic_name || "Clinic";
    currentDoctorName = data.doctor_name || "Doctor";

    const list = document.getElementById("staff-queue-list");
    const completedList = document.getElementById("staff-completed-list");
    const waiting = data.queue.filter((p) => p.status === "waiting");
    const completed = data.queue.filter((p) => p.status === "completed");

    window.currentWaitingTokens = waiting.map((p) => p.local_token);
    document.getElementById("queue-count").textContent =
      `${waiting.length} Waiting`;
    document.getElementById("completed-count").textContent =
      `${completed.length} Completed`;

    list.innerHTML = "";
    completedList.innerHTML = "";

    if (waiting.length === 0) {
      list.innerHTML =
        '<div style="text-align: center; padding: 60px 20px; background: white; border-radius: 16px; border: 1px dashed #cbd5e1; color: #94a3b8; font-weight: 500;">Waiting room is empty.</div>';
    } else {
      waiting.forEach((patient, index) => {
        const shortCode = getShortCode(patient.daily_token_number);
        const isCurrent = index === 0;
        const displayName = patient.patient_name || "Patient";
        const displayId = patient.display_id || "--";
        const checkInTime = new Date(patient.timestamp).toLocaleTimeString(
          "en-IN",
          { hour: "2-digit", minute: "2-digit" },
        );

        const cityText = patient.city
          ? ` <span style="font-size: 13px; color: var(--primary-color); opacity: 0.8; margin-left: 4px;">(${patient.city})</span>`
          : "";

        let typeColors = "";
        let visitLabel = "New Consultation";

        if (patient.visit_type === "followup") {
          typeColors = "background: #fef08a; color: #b45309;";
          visitLabel = "Follow-up Consultation";
        } else if (patient.visit_type === "appointment") {
          typeColors = "background: #e0e7ff; color: #0369a1;";
          visitLabel = "Appointment Consultation";
        } else {
          typeColors = "background: #f1f5f9; color: #64748b;";
          visitLabel = "New Consultation";
        }

        const typeBadge = `
          <select onchange="changeVisitType('${patient.local_token}', this.value)" 
              style="font-size: 11px; padding: 4px 6px; border-radius: 4px; margin-left: 8px; font-weight: 800; text-transform: uppercase; border: 1px solid #cbd5e1; cursor: pointer; ${typeColors} outline: none;">
            <option value="walkin" ${patient.visit_type === "walkin" || !patient.visit_type ? "selected" : ""}>WALK-IN</option>
            <option value="appointment" ${patient.visit_type === "appointment" ? "selected" : ""}>APPOINTMENT</option>
            <option value="followup" ${patient.visit_type === "followup" ? "selected" : ""}>FOLLOW-UP</option>
          </select>
        `;

        const patientVitals = patient.vitals || {};
        const isPaid = patientVitals.is_paid === true;
        const safeVitals = JSON.stringify(patientVitals)
          .replace(/'/g, "\\'")
          .replace(/"/g, "&quot;");
        const feeText = patient.fee ? `Collect ₹${patient.fee}` : "Mark Paid";

        let markPaidBtn = "";
        if (!isPaid) {
          markPaidBtn = `<button onclick="markAsPaid('${patient.local_token}', '${safeVitals}')" class="btn btn-primary" style="padding: 6px 12px; font-size: 13px; background: #ea580c; border-color: #ea580c; box-shadow: 0 4px 10px rgba(234, 88, 12, 0.3);">${feeText}</button>`;
        } else {
          markPaidBtn = `<span style="font-size: 13px; color: var(--success-color); font-weight: 800; text-align: center; background: #dcfce7; padding: 4px 8px; border-radius: 6px;">Bill Paid</span>`;
        }

        const vitalsBtn = `<button onclick="openVitalsModal('${patient.local_token}', '${safeVitals}')" class="btn btn-secondary" style="padding: 6px 12px; font-size: 13px; background: white; border: 1px dashed #cbd5e1; box-shadow: none;">Vitals</button>`;
        const labsBtn = `<button onclick="openLabsModal('${patient.local_token}', '${displayName.replace(/'/g, "\\'")}')" class="btn btn-secondary" style="padding: 6px 12px; font-size: 13px; background: white; border: 1px dashed #cbd5e1; box-shadow: none;">Labs</button>`;
        const billBtn = `<button onclick="openBillModal('${displayName.replace(/'/g, "\\'")}', '${displayId}', '${shortCode}', '${patient.fee || 300}', '${visitLabel}')" class="btn btn-secondary" style="padding: 6px 12px; font-size: 13px; background: white; border: 1px dashed #cbd5e1; box-shadow: none;">Bill</button>`;

        const actionButtons = `
         <div style="display:flex; flex-direction: column; gap: 8px; margin-left: auto; border-left: 2px solid #f1f5f9; padding-left: 24px; min-width: 140px;">
           ${markPaidBtn}
           <div style="display: flex; gap: 8px;">
             ${vitalsBtn}
             ${labsBtn}
             ${billBtn}
           </div>
         </div>
        `;

        const card = document.createElement("div");
        card.className = `queue-card ${isCurrent ? "active-patient" : ""}`;
        card.style.position = "relative";
        card.dataset.localToken = patient.local_token;

        card.innerHTML = `
          <div style="display: flex; align-items: center; gap: 15px; flex-wrap: wrap; width: 100%;">
            <span class="queue-drag-handle" title="Drag to reorder" aria-label="Drag to reorder">☷</span>
            <div class="token-badge">#${shortCode}</div>
            <div>
              <strong style="display: flex; align-items: center; font-size: 18px; color: var(--text-main); margin-bottom: 4px;">
                ${isCurrent ? "Currently with Doctor" : "Waiting in Queue"} ${typeBadge}
              </strong>
              <span style="color: var(--text-muted); font-size: 13px; font-weight: 500;">In at ${checkInTime} • ID: ${displayId}</span>
            </div>
            <div style="display:flex; align-items:center; margin-left: 10px; background: #e0f2fe; padding: 6px 12px; border-radius: 8px;">
              <span style="font-size: 16px; font-weight: 700; color: var(--primary-color);">${displayName}${cityText}${patient.phone ? " | Phone: " + patient.phone : ""}</span>
            </div>
            ${actionButtons}
          </div>
          <button onclick="removePatientFromQueue('${patient.local_token}', event)" title="Remove patient from queue" style="position:absolute; right:12px; bottom:12px; width:28px; height:28px; border:none; border-radius:8px; display:inline-flex; align-items:center; justify-content:center; background:#fff1f2; color:#be123c; font-size:14px; cursor:pointer; box-shadow:0 6px 14px rgba(190,18,60,0.12); border:1px solid #fecdd3;">✕</button>
        `;
        list.appendChild(card);
        setupQueueDrag(card);
      });
    }

    if (completed.length === 0) {
      completedList.innerHTML =
        '<div style="text-align: center; padding: 40px 20px; color: #cbd5e1; font-weight: 500;">No completed visits yet.</div>';
    } else {
      completed.forEach((patient) => {
        const shortCode = getShortCode(patient.daily_token_number);
        const displayName = patient.patient_name || "Patient";
        const displayId = patient.display_id || "--";
        const cityText = patient.city
          ? ` <span style="font-size: 13px; color: #64748b; font-weight: 500; margin-left: 4px;">(${patient.city})</span>`
          : "";

        let typeBadge = "";
        let visitLabel = "New Consultation";

        if (patient.visit_type === "followup") {
          typeBadge = `<span style="font-size: 11px; background: #fef08a; color: #b45309; padding: 2px 6px; border-radius: 4px; margin-left: 8px; font-weight: 800; text-transform: uppercase;">Follow-up</span>`;
          visitLabel = "Follow-up Consultation";
        } else if (patient.visit_type === "appointment") {
          typeBadge = `<span style="font-size: 11px; background: #e0e7ff; color: #0369a1; padding: 2px 6px; border-radius: 4px; margin-left: 8px; font-weight: 800; text-transform: uppercase;">Appointment</span>`;
          visitLabel = "Appointment Consultation";
        } else {
          typeBadge = `<span style="font-size: 11px; background: #f1f5f9; color: #64748b; padding: 2px 6px; border-radius: 4px; margin-left: 8px; font-weight: 800; text-transform: uppercase;">Walk-in</span>`;
          visitLabel = "New Consultation";
        }

        const labsBtn = `<button onclick="openLabsModal('${patient.local_token}', '${displayName.replace(/'/g, "\\'")}')" class="btn btn-secondary" style="padding: 8px 20px; background: white; border-color: #cbd5e1; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">Labs</button>`;
        const billBtn = `<button onclick="openBillModal('${displayName.replace(/'/g, "\\'")}', '${displayId}', '${shortCode}', '${patient.fee || 300}', '${visitLabel}')" class="btn btn-secondary" style="padding: 8px 20px; background: white; border-color: #cbd5e1; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">Print Bill</button>`;

        const card = document.createElement("div");
        card.className = "queue-card";
        card.style.background = "#f1f5f9";
        card.style.borderColor = "#e2e8f0";
        card.style.boxShadow = "none";
        card.innerHTML = `
          <div style="display: flex; align-items: center; gap: 24px;">
            <div class="token-badge" style="background: #e2e8f0; color: #94a3b8;">#${shortCode}</div>
            <div>
              <strong style="display: flex; align-items: center; font-size: 16px; color: #475569; margin-bottom: 2px;">${displayName}${cityText}${patient.phone ? " | Phone: " + patient.phone : ""} (ID: ${displayId}) ${typeBadge}</strong>
              <span style="color: #94a3b8; font-size: 13px; font-weight: 500;">Consultation Completed</span>
            </div>
          </div>
          <div style="display: flex; gap: 10px;">
            <button onclick="printPrescription('${patient.local_token}', '${displayName.replace(/'/g, "\\'")}', '${displayId}')" class="btn btn-secondary" style="padding: 8px 20px; background: white; border-color: #cbd5e1; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">Print Rx</button>
            ${labsBtn}
            ${billBtn}
          </div>
        `;
        completedList.appendChild(card);
      });
    }
  } catch (error) {
    console.error("Queue error:", error);
  }
}

window.printPrescription = async function (localToken, patientName, displayId) {
  try {
    const response = await fetch(
      `/api/events/history/${encodeURIComponent(localToken)}?clinic_id=${clinicId}`,
    );
    const data = await response.json();
    if (!data.history || data.history.length === 0) {
      alert("No prescription found.");
      return;
    }

    const visit = data.history[0];
    const today = new Date(visit.timestamp)
      .toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
      .replace(/ /g, "-");

    if (window.PrintEngine) {
      window.PrintEngine.printRx({
        clinicName: currentClinicName,
        doctorName: currentDoctorName,
        patientName: patientName || "Patient",
        displayId: displayId || "--",
        date: today,
        vitals: visit.vitals || "",
        complaints: visit.complaints || "",
        diagnosis: visit.diagnosis || "",
        tests: visit.tests_suggested || "",
        prescriptions: visit.prescriptions || [],
      });
    } else {
      alert("PrintEngine not loaded.");
    }
  } catch (e) {
    console.error(e);
    alert("Failed to load prescription for printing.");
  }
};

loadStaffQueue();
setInterval(loadStaffQueue, 5000);
