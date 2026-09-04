// Intercept fetch to enforce financial gatekeeper (only show paid patients in queue)
const originalFetch = window.fetch;
window.fetch = async function () {
  const response = await originalFetch.apply(this, arguments);
  if (
    arguments[0] &&
    typeof arguments[0] === "string" &&
    arguments[0].includes("/api/clinics/queue/")
  ) {
    const clone = response.clone();
    const data = await clone.json();
    if (data.queue) {
      data.queue = data.queue.filter((p) => {
        if (p.status === "waiting") {
          return p.vitals && p.vitals.is_paid === true;
        }
        return true;
      });
    }
    return new Response(JSON.stringify(data), {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
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
const activePatientStorageKey = "tap2med_active_patient_token";

const currentToken = document.getElementById("current-token");
const historyContent = document.getElementById("history-content");
const doctorName = document.getElementById("doc-name");
const clinicName = document.getElementById("clinic-name");
const prescriptionList = document.getElementById("rx-container");
const prescriptionStatus = document.getElementById("prescription-status");
const sidebar = document.getElementById("clinicSidebar");
const sidebarBackdrop = document.getElementById("sidebar-backdrop");
const menuToggleBtn = document.getElementById("sidebarToggle");

function setPrescriptionStatus(message, tone = "warning") {
  if (!prescriptionStatus) return;
  const allowedTones = ["warning", "success", "danger", "info"];
  const safeTone = allowedTones.includes(tone) ? tone : "warning";
  prescriptionStatus.textContent = message;
  prescriptionStatus.className = `badge badge-${safeTone}`;
}

window.currentWaitingTokens = [];

function getDraftStorageKey(localToken) {
  return `tap2med_consultation_draft_${localToken}`;
}

function savePrescriptionDraft() {
  if (!currentLocalToken) return;

  const medicines = [
    ...prescriptionList.querySelectorAll(".prescription-row"),
  ].map((row) => ({
    name: row.querySelector(".rx-med")?.value || "",
    dosage: row.querySelector(".rx-dosage")?.value || "",
    duration: row.querySelector(".rx-days")?.value || "",
    remarks: row.querySelector(".rx-remarks")?.value || "",
    instructions: row.querySelector(".rx-freq")?.value || "",
  }));

  const draft = {
    complaints: document.getElementById("patient-complaints")?.value || "",
    diagnosis: document.getElementById("patient-diagnosis")?.value || "",
    testsSuggested: document.getElementById("patient-tests")?.value || "",
    medicines,
  };

  sessionStorage.setItem(
    getDraftStorageKey(currentLocalToken),
    JSON.stringify(draft),
  );
  sessionStorage.setItem(activePatientStorageKey, currentLocalToken);
}

function restorePrescriptionDraft(localToken) {
  if (!localToken) return false;

  try {
    const storedDraft = sessionStorage.getItem(getDraftStorageKey(localToken));
    if (!storedDraft) return false;
    const draft = JSON.parse(storedDraft);

    const complaints = document.getElementById("patient-complaints");
    const diagnosis = document.getElementById("patient-diagnosis");
    const tests = document.getElementById("patient-tests");
    if (complaints) complaints.value = draft.complaints || "";
    if (diagnosis) diagnosis.value = draft.diagnosis || "";
    if (tests) tests.value = draft.testsSuggested || "";
    populatePrescriptionPad(draft.medicines);
    return true;
  } catch (error) {
    sessionStorage.removeItem(getDraftStorageKey(localToken));
    return false;
  }
}

document.addEventListener("input", (event) => {
  if (
    event.target.closest(
      "#patient-complaints, #patient-diagnosis, #patient-tests, #rx-container",
    )
  ) {
    savePrescriptionDraft();
  }
});

document.addEventListener("DOMContentLoaded", () => {
  const savedState = localStorage.getItem("tap2med_sidebar_state");
  if (savedState === "closed" && sidebar) {
    sidebar.classList.add("sidebar-closed");
    document.querySelector(".main-content")?.classList.add("sidebar-closed");
  }

  setTimeout(() => {
    const addBtn = document.getElementById("add-row-btn");
    if (addBtn) {
      const newAddBtn = addBtn.cloneNode(true);
      addBtn.parentNode.replaceChild(newAddBtn, addBtn);
      newAddBtn.addEventListener("click", addPrescriptionRow);
    }
  }, 500);
});

function toggleSidebar() {
  sidebar.classList.toggle("sidebar-closed");
  document.querySelector(".main-content")?.classList.toggle("sidebar-closed");
  sidebarBackdrop?.classList.toggle("open");
  const isClosed = sidebar.classList.contains("sidebar-closed");
  if (menuToggleBtn) menuToggleBtn.setAttribute("aria-expanded", !isClosed);
  localStorage.setItem("tap2med_sidebar_state", isClosed ? "closed" : "open");
}

window.updateFreq = function (el) {
  const row = el.closest(".prescription-row");
  const dosage = row.querySelector(".rx-dosage").value.trim();
  const days = row.querySelector(".rx-days").value.trim();
  const remarks = row.querySelector(".rx-remarks").value.trim();

  let inst = dosage;
  if (days) inst += (inst ? " for " : "") + days;
  if (remarks) inst += (inst ? " | " : "") + remarks;

  row.querySelector(".rx-freq").value = inst;
};

window.addPrescriptionRow = function () {
  const container = document.getElementById("rx-container");
  const row = document.createElement("div");
  row.className = "prescription-row";
  row.style.display = "grid";
  // Adjusted grid to fit the new remarks column
  row.style.gridTemplateColumns = "2fr 1fr 1fr 1.5fr auto";
  row.style.gap = "10px";
  row.style.marginBottom = "15px";
  row.innerHTML = `
        <div class="field"><input type="text" class="input rx-med" placeholder="Medicine" autocomplete="off" /></div>
        <div class="field"><input type="text" class="input rx-dosage" placeholder="Dosage" autocomplete="off" oninput="updateFreq(this)" /></div>
        <div class="field"><input type="text" class="input rx-days" placeholder="Days" autocomplete="off" oninput="updateFreq(this)" /></div>
        <div class="field"><input type="text" class="input rx-remarks" placeholder="Remarks (e.g. after food)" autocomplete="off" oninput="updateFreq(this)" /></div>
        <button type="button" class="btn btn-ghost" onclick="this.closest('.prescription-row').remove()" style="color: #ef4444; padding: 8px;">✕</button>
        <input type="hidden" class="rx-freq" />
    `;
  container.appendChild(row);
};

function populatePrescriptionPad(prescriptions) {
  const container = document.getElementById("rx-container");
  if (!container) return;

  container.innerHTML = "";
  if (!Array.isArray(prescriptions) || prescriptions.length === 0) {
    addPrescriptionRow();
    return;
  }

  prescriptions.forEach((med) => {
    addPrescriptionRow();
    const row = container.lastElementChild;
    const dosage = med.dosage || "";
    const duration = med.duration || "";
    let instructions = med.raw_instructions || "";

    if (!instructions) {
      const parts = (med.instructions || "").split(" | ");
      if (dosage && parts[0] === dosage) parts.shift();
      if (duration && parts[0] === duration) parts.shift();
      instructions = parts.join(" | ");
    }

    row.querySelector(".rx-med").value = med.name || "";
    row.querySelector(".rx-dosage").value = dosage;
    row.querySelector(".rx-days").value = duration;
    row.querySelector(".rx-remarks").value = instructions;
    updateFreq(row.querySelector(".rx-remarks"));
  });
}

window.copyVisitToPad = function (prescriptions) {
  if (!Array.isArray(prescriptions) || prescriptions.length === 0) {
    setPrescriptionStatus("No medicines to copy", "warning");
    return;
  }

  populatePrescriptionPad(prescriptions);
  savePrescriptionDraft();
  setPrescriptionStatus("Copied to pad", "success");
};

function clearPrescription() {
  if (prescriptionList) prescriptionList.innerHTML = "";
  addPrescriptionRow();
  const cEl = document.getElementById("patient-complaints");
  const dEl = document.getElementById("patient-diagnosis");
  const tEl = document.getElementById("patient-tests");
  if (cEl) cEl.value = "";
  if (dEl) dEl.value = "";
  if (tEl) tEl.value = "";
  setPrescriptionStatus("Waiting...", "warning");
}

function getShortCode(tokenNumber) {
  if (tokenNumber === undefined || tokenNumber === null) return "--";
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  let idx = (tokenNumber - 1) % 24;
  if (idx < 0) idx += 24;
  const letter = letters[idx];
  return `${letter}-${tokenNumber}`;
}

function renderActiveHeader({
  patientName,
  displayId,
  cityText = "",
  modeLabel = "",
}) {
  const headerEyebrow = document.querySelector(".eyebrow");
  if (!headerEyebrow) return;

  const cityMarkup = cityText
    ? ` <span style="font-size: 14px; color: var(--text-muted);">(${cityText})</span>`
    : "";
  const modeMarkup = modeLabel
    ? ` - <span style="color:#ef4444;">${modeLabel}</span>`
    : "";

  headerEyebrow.innerHTML = `Active Token: <strong style="color: var(--primary-color);">${patientName}</strong>${cityMarkup} (ID: ${displayId})${modeMarkup}
    <button onclick="openLabsModal()" class="btn btn-sm btn-secondary" style="margin-left: 15px; background: white; font-size: 12px; height: 28px; box-shadow: none;">🧪 View Labs & Trends</button>`;
}

async function loadQueue() {
  if (!clinicId) return;

  try {
    const response = await fetch(
      `/api/clinics/queue/${encodeURIComponent(clinicId)}`,
    );
    if (!response.ok) throw new Error("Queue request failed");

    const data = await response.json();
    doctorName.textContent = data.doctor_name || "Doctor";
    clinicName.textContent = data.clinic_name || "Clinic";

    const waitingQueue = data.queue
      ? data.queue.filter((p) => p.status === "waiting")
      : [];
    window.currentWaitingTokens = waitingQueue.map((p) => p.local_token);

    const queueCountBadge = document.getElementById("queue-count");
    if (queueCountBadge)
      queueCountBadge.textContent = `${waitingQueue.length} Waiting`;

    const queueList = document.getElementById("queue-list");
    queueList.innerHTML = "";

    if (waitingQueue.length === 0) {
      const currentTokenElement = document.getElementById("current-token");
      if (
        (!currentLocalToken ||
          !currentTokenElement ||
          !currentTokenElement.innerHTML.includes("EDITING")) &&
        currentTokenElement
      ) {
        currentTokenElement.textContent = "—";
        currentLocalToken = null;
      }
      setPrescriptionStatus("Waiting...", "warning");
      queueList.innerHTML =
        '<div class="queue-card text-muted" style="padding:16px;">No patients waiting</div>';
    } else {
      waitingQueue.forEach((patient) => {
        const shortCode = getShortCode(patient.daily_token_number);
        const card = document.createElement("div");
        card.dataset.token = patient.local_token;
        card.className = `queue-card ${currentLocalToken === patient.local_token ? "active" : ""}`;
        card.style.cursor = "pointer";

        let typeBadge = "";
        if (patient.visit_type === "followup")
          typeBadge = `<span style="font-size: 11px; background: #fef08a; color: #b45309; padding: 2px 6px; border-radius: 4px; margin-left: 8px; font-weight: 800; text-transform: uppercase;">Follow-up</span>`;
        else if (patient.visit_type === "appointment")
          typeBadge = `<span style="font-size: 11px; background: #e0e7ff; color: #0369a1; padding: 2px 6px; border-radius: 4px; margin-left: 8px; font-weight: 800; text-transform: uppercase;">Appointment</span>`;
        else
          typeBadge = `<span style="font-size: 11px; background: #f1f5f9; color: #64748b; padding: 2px 6px; border-radius: 4px; margin-left: 8px; font-weight: 800; text-transform: uppercase;">Walk-in</span>`;

        let cityText = patient.city
          ? `<span style="font-size: 12px; color: var(--text-muted); font-weight: 500; margin-left: 6px;">(${patient.city})</span>`
          : "";

        card.innerHTML = `
                    <div class="token-number">#${shortCode}</div>
                    <div class="patient-details">
                        <strong style="font-size: 16px;">${patient.patient_name || "Patient"} ${cityText} ${typeBadge}</strong>
                        <span>ID: ${patient.display_id || "--"}</span>
                    </div>
                    <button onclick="removePatientFromQueue('${patient.local_token}', event)" title="Remove patient from queue" style="position:absolute; right:12px; bottom:12px; width:28px; height:28px; border:none; border-radius:8px; display:inline-flex; align-items:center; justify-content:center; background:#fff1f2; color:#be123c; font-size:14px; cursor:pointer; box-shadow:0 6px 14px rgba(190,18,60,0.12); border:1px solid #fecdd3;">🗑</button>
                `;

        card.onclick = async () => {
          // 1. VISUAL LOCK: Create an overlay to physically block typing and show a massive loading state
          let overlay = document.getElementById("consultation-overlay");
          if (!overlay) {
            overlay = document.createElement("div");
            overlay.id = "consultation-overlay";
            overlay.style.cssText =
              "position:absolute; inset:0; background:rgba(255,255,255,0.85); backdrop-filter:blur(4px); z-index:50; display:flex; flex-direction:column; align-items:center; justify-content:center; border-radius:16px; font-size:20px; font-weight:800; color:var(--primary-color);";

            const consultCard = document.querySelector(".consultation-card");
            if (consultCard) {
              consultCard.style.position = "relative";
              consultCard.appendChild(overlay);
            }
          }
          overlay.innerHTML =
            '<span style="font-size:32px; margin-bottom:10px;">⚡</span> Loading Patient Data...';
          overlay.style.display = "flex";

          // Visually update the left queue
          document
            .querySelectorAll(".queue-card")
            .forEach((c) => c.classList.remove("active"));
          card.classList.add("active");
          card.parentNode.prepend(card);

          currentLocalToken = patient.local_token;
          const selectedToken = currentLocalToken;
          sessionStorage.setItem(activePatientStorageKey, currentLocalToken);
          window.currentPatientName = patient.patient_name || "Patient";
          window.currentDisplayId = patient.display_id || "--";
          setPrescriptionStatus("Loading...", "info");

          if (currentToken) currentToken.textContent = `#${shortCode}`;

          renderActiveHeader({
            patientName: window.currentPatientName,
            displayId: window.currentDisplayId,
            cityText: patient.city || "",
          });

          // Clear form
          clearPrescription();
          historyContent.innerHTML =
            '<p class="text-muted text-sm">Fetching secure records...</p>';

          // Await both backend requests before unlocking the UI
          try {
            await Promise.all([
              fetch("/api/events/queue/top", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ local_token: patient.local_token }),
              }),
              loadHistory(selectedToken).then(() =>
                restorePrescriptionDraft(selectedToken),
              ),
              fetchActiveVitals(),
            ]);
          } catch (e) {
            console.error(e);
          }

          // Remove lock and set cursor
          overlay.style.display = "none";
          window.scrollTo({ top: 0, behavior: "smooth" });
          const cEl = document.getElementById("patient-complaints");
          if (cEl) cEl.focus();
        };

        queueList.appendChild(card);
      });

      if (!currentLocalToken && waitingQueue.length > 0) {
        const savedToken = sessionStorage.getItem(activePatientStorageKey);
        const firstPatient =
          waitingQueue.find((patient) => patient.local_token === savedToken) ||
          waitingQueue[0];
        currentLocalToken = firstPatient.local_token;
        sessionStorage.setItem(activePatientStorageKey, currentLocalToken);
        setPrescriptionStatus("Waiting...", "warning");
        if (currentToken)
          currentToken.textContent = `#${getShortCode(firstPatient.daily_token_number)}`;
        window.currentPatientName = firstPatient.patient_name || "Patient";
        window.currentDisplayId = firstPatient.display_id || "--";

        renderActiveHeader({
          patientName: window.currentPatientName,
          displayId: window.currentDisplayId,
          cityText: firstPatient.city || "",
        });

        clearPrescription();
        loadHistory(currentLocalToken).then(() =>
          restorePrescriptionDraft(currentLocalToken),
        );
        const firstCard = queueList.firstChild;
        if (firstCard) firstCard.classList.add("active");
      }
    }

    const completedQueue = data.queue
      ? data.queue.filter((p) => p.status === "completed")
      : [];
    const completedList = document.getElementById("completed-list");
    if (completedList) {
      completedList.innerHTML = "";
      if (completedQueue.length === 0) {
        completedList.innerHTML =
          '<div class="queue-card text-muted" style="padding:16px; font-size:14px;">No completed patients</div>';
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
                            <strong style="font-size: 15px; color: #475569;">${patient.patient_name || "Patient"}</strong>
                            <span style="color: var(--success-color); font-size: 12px;">Completed</span>
                        </div>
                        <div style="display: flex; flex-direction: column; gap: 6px;">
                            <button onclick="editRx('${patient.local_token}', ${patient.daily_token_number}, '${patient.patient_name || "Patient"}', '${patient.display_id || "--"}')" class="btn btn-ghost" style="padding: 4px 8px; font-size: 11px; color: #ef4444; border: 1px dashed #fca5a5;">✏️ Edit</button>
                            <button onclick="rePrintRx('${patient.local_token}', '${patient.patient_name || "Patient"}', '${patient.display_id || "--"}')" class="btn btn-secondary" style="padding: 4px 8px; font-size: 11px; background: white;">🖨️ Print</button>
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
    const response = await fetch(
      `/api/events/history/${encodeURIComponent(localToken)}`,
    );
    if (!response.ok) throw new Error("History request failed");

    const data = await response.json();
    if (!data.history || data.history.length === 0) {
      historyContent.innerHTML =
        '<p class="text-muted text-sm">No previous visits recorded.</p>';
      return;
    }

    historyContent.innerHTML = "";
    data.history.forEach((visit) => {
      const date = new Date(visit.timestamp).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
      let historyHTML = "";

      if (visit.complaints)
        historyHTML += `<div style="margin-bottom:8px; font-size:13px; color:#475569;"><strong>C/E:</strong> ${visit.complaints}</div>`;
      if (visit.diagnosis)
        historyHTML += `<div style="margin-bottom:12px; font-size:13px; color:#0f172a;"><strong>Dx:</strong> ${visit.diagnosis}</div>`;

      if (visit.prescriptions && visit.prescriptions.length > 0) {
        historyHTML += `<div style="margin-top:10px; font-size:13px; color:#0f172a;"><strong>Rx:</strong><ul style="margin:5px 0; padding-left:20px;">`;
        visit.prescriptions.forEach((rx) => {
          historyHTML += `<li style="margin-bottom: 4px;"><strong>${rx.name}</strong> <br><span class="text-muted" style="font-size:12px;">${rx.instructions || ""}</span></li>`;
        });
        historyHTML += "</ul></div>";
      }
      if (visit.tests_suggested)
        historyHTML += `<div style="margin-top:12px; font-size:13px; color:#0284c7;"><strong>Tests:</strong> ${visit.tests_suggested}</div>`;

      const card = document.createElement("details");
      card.style.background = "#fff";
      card.style.border = "1px solid #e2e8f0";
      card.style.borderRadius = "8px";
      card.style.padding = "12px";
      card.style.marginBottom = "10px";
      card.style.cursor = "pointer";

      card.innerHTML = `
                <summary style="font-weight: 600; color: var(--primary-color); outline: none; display: flex; align-items: center; justify-content: space-between; gap: 12px;">📅 ${date}<button type="button" class="btn btn-secondary copy-to-pad-btn" style="height: 30px; padding: 0 10px; font-size: 12px; color: var(--primary-color);">↻ Copy to Pad</button></summary>
                <div style="padding-top: 10px; border-top: 1px solid #e2e8f0; margin-top: 10px;">
                    ${historyHTML || "<p class='text-muted text-sm'>No details recorded.</p>"}
                </div>
            `;
      const copyButton = card.querySelector(".copy-to-pad-btn");
      copyButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        copyVisitToPad(visit.prescriptions);
      });
      historyContent.appendChild(card);
    });
  } catch (error) {
    console.error("History error:", error);
  }
}

window.removePatientFromQueue = async function (localToken, event) {
  if (event) event.stopPropagation();
  if (!confirm("Remove this patient from the queue?")) return;

  try {
    const response = await fetch("/api/events/queue/remove", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ local_token: localToken }),
    });

    if (!response.ok) throw new Error("Failed to remove patient from queue");
    await loadQueue();
  } catch (e) {
    console.error("Failed to remove patient from queue", e);
    alert("Failed to remove patient from queue.");
  }
};

window.rePrintRx = async function (localToken, patientName, displayId) {
  try {
    const response = await fetch(
      `/api/events/history/${encodeURIComponent(localToken)}`,
    );
    const data = await response.json();
    if (!data.history || data.history.length === 0)
      return alert("No prescription found.");

    const visit = data.history[0];
    const today = new Date(visit.timestamp).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });

    document.getElementById("print-clinic-name").textContent =
      clinicName.textContent;
    document.getElementById("print-doctor-name").textContent =
      doctorName.textContent;
    document.getElementById("print-date").textContent = `Date: ${today}`;
    document.getElementById("print-patient-name").innerHTML =
      `<strong>Name:</strong> ${patientName}`;
    document.getElementById("print-patient-id").innerHTML =
      `<strong>Patient ID:</strong> ${displayId}`;

    const printNotesContainer = document.getElementById("print-clinical-notes");
    const printComplaints = document.getElementById("print-complaints");
    const printDiagnosis = document.getElementById("print-diagnosis");
    const printTests = document.getElementById("print-tests");

    if (visit.complaints || visit.diagnosis) {
      printNotesContainer.style.display = "block";
      printComplaints.innerHTML = visit.complaints
        ? `<strong>C/E:</strong> ${visit.complaints}`
        : "";
      printDiagnosis.innerHTML = visit.diagnosis
        ? `<strong>Diagnosis:</strong> ${visit.diagnosis}`
        : "";
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
    if (visit.prescriptions) {
      visit.prescriptions.forEach((med) => {
        printMedContainer.innerHTML += `
                    <div style="margin-bottom: 20px;">
                        <strong style="font-size: 16px; color: #000; display: block;">${med.name}</strong>
                        <span style="font-size: 14px; color: #444;">${med.instructions || ""}</span>
                    </div>
                `;
      });
    }

    document.body.className = "mode-rx";
    window.print();
    setTimeout(() => (document.body.className = "dashboard-body"), 1000);
  } catch (e) {
    alert("Failed to load prescription for printing.");
  }
};

window.editRx = async function (
  localToken,
  tokenNumber,
  patientName,
  displayId,
) {
  try {
    const response = await fetch(
      `/api/events/history/${encodeURIComponent(localToken)}`,
    );
    if (!response.ok)
      throw new Error("Server returned HTTP " + response.status);
    const data = await response.json();
    if (!data.history || data.history.length === 0)
      return alert("No history found to edit.");

    const visit = data.history[0];
    currentLocalToken = localToken;
    window.currentPatientName = patientName || "Patient";
    window.currentDisplayId = displayId || "--";
    setPrescriptionStatus("Editing...", "info");

    document
      .querySelectorAll(".queue-card")
      .forEach((c) => c.classList.remove("active"));
    const currentTokenEl = document.getElementById("current-token");
    if (currentTokenEl)
      currentTokenEl.innerHTML = `#${getShortCode(tokenNumber)} <span style="font-size:12px; color:#ef4444; background:#fee2e2; padding:2px 6px; border-radius:4px;">EDITING</span>`;

    renderActiveHeader({
      patientName: window.currentPatientName,
      displayId: window.currentDisplayId,
      modeLabel: "EDIT MODE",
    });

    const compEl = document.getElementById("patient-complaints");
    if (compEl) compEl.value = visit.complaints || "";
    const diagEl = document.getElementById("patient-diagnosis");
    if (diagEl) diagEl.value = visit.diagnosis || "";
    const testEl = document.getElementById("patient-tests");
    if (testEl) testEl.value = visit.tests_suggested || "";

    const rxContainer = document.getElementById("rx-container");
    if (rxContainer) {
      rxContainer.innerHTML = "";
      if (
        visit.prescriptions &&
        Array.isArray(visit.prescriptions) &&
        visit.prescriptions.length > 0
      ) {
        visit.prescriptions.forEach((med) => {
          addPrescriptionRow();
          const rows = rxContainer.querySelectorAll(".prescription-row");
          if (rows.length > 0) {
            const lastRow = rows[rows.length - 1];
            if (lastRow.querySelector(".rx-med"))
              lastRow.querySelector(".rx-med").value = med.name || "";

            let fullInstructions = med.instructions || "";
            let dosage = "",
              days = "",
              remarks = "";

            // Parse out the remarks if they exist
            if (fullInstructions.includes(" | ")) {
              const parts = fullInstructions.split(" | ");
              remarks = parts[1];
              fullInstructions = parts[0];
            }

            // Parse out the days if they exist
            if (fullInstructions.includes(" for ")) {
              const parts = fullInstructions.split(" for ");
              dosage = parts[0];
              days = parts[1];
            } else {
              dosage = fullInstructions;
            }

            if (lastRow.querySelector(".rx-dosage"))
              lastRow.querySelector(".rx-dosage").value = dosage || "";
            if (lastRow.querySelector(".rx-days"))
              lastRow.querySelector(".rx-days").value = days || "";
            if (lastRow.querySelector(".rx-remarks"))
              lastRow.querySelector(".rx-remarks").value = remarks || "";
            if (lastRow.querySelector(".rx-freq"))
              lastRow.querySelector(".rx-freq").value = med.instructions || "";
          }
        });
      } else {
        addPrescriptionRow();
      }
    }

    fetchActiveVitals();
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (e) {
    console.error("EditRx Error:", e);
  }
};

window.openSendConfirmModal = function () {
  const modal = document.getElementById("send-confirm-modal");
  const patientNameEl = document.getElementById("send-confirm-patient-name");
  if (patientNameEl) {
    patientNameEl.textContent = window.currentPatientName || "Current patient";
  }
  if (modal) modal.style.display = "flex";
};

window.closeSendConfirmModal = function () {
  const modal = document.getElementById("send-confirm-modal");
  if (modal) modal.style.display = "none";
};

window.confirmSendPrescription = async function () {
  closeSendConfirmModal();
  await completeVisit();
};

document.getElementById("print-btn")?.addEventListener("click", () => {
  openSendConfirmModal();
});

async function completeVisit() {
  if (!currentLocalToken || isSaving) return;
  const medicines = [];

  prescriptionList.querySelectorAll(".prescription-row").forEach((row) => {
    const name = row.querySelector(".rx-med")?.value.trim() || "";
    const instructions = row.querySelector(".rx-freq")?.value.trim() || "";
    if (name) medicines.push({ name, instructions });
  });

  const complaints =
    document.getElementById("patient-complaints")?.value.trim() || "";
  const diagnosis =
    document.getElementById("patient-diagnosis")?.value.trim() || "";
  const tests_suggested =
    document.getElementById("patient-tests")?.value.trim() || "";

  if (!medicines.length && !complaints && !diagnosis && !tests_suggested) {
    if (!confirm("No details have been entered. Complete this visit?")) return;
  }

  isSaving = true;
  setPrescriptionStatus("Saving...", "warning");

  try {
    const response = await fetch("/api/events/complete", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        local_token: currentLocalToken,
        medicines: medicines,
        complaints: complaints,
        diagnosis: diagnosis,
        tests_suggested: tests_suggested,
      }),
    });

    if (!response.ok) throw new Error("Prescription save failed");

    setPrescriptionStatus("Sent to WhatsApp", "success");

    const today = new Date().toLocaleDateString("en-IN", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });

    // Safe null-checked DOM assignments
    const printClinic = document.getElementById("print-clinic-name");
    if (printClinic)
      printClinic.textContent = clinicName ? clinicName.textContent : "Clinic";

    const printDoc = document.getElementById("print-doctor-name");
    if (printDoc)
      printDoc.textContent = doctorName ? doctorName.textContent : "Doctor";

    const printDate = document.getElementById("print-date");
    if (printDate) printDate.textContent = `Date: ${today}`;

    const printPatient = document.getElementById("print-patient-name");
    if (printPatient)
      printPatient.innerHTML = `<strong>Name:</strong> ${window.currentPatientName || "Patient"}`;

    const printId = document.getElementById("print-patient-id");
    if (printId)
      printId.innerHTML = `<strong>Patient ID:</strong> ${window.currentDisplayId || "--"}`;

    const printNotesContainer = document.getElementById("print-clinical-notes");
    const printComplaints = document.getElementById("print-complaints");
    const printDiagnosis = document.getElementById("print-diagnosis");
    const printTests = document.getElementById("print-tests");

    if (complaints || diagnosis) {
      if (printNotesContainer) printNotesContainer.style.display = "block";
      if (printComplaints)
        printComplaints.innerHTML = complaints
          ? `<strong>C/E:</strong> ${complaints}`
          : "";
      if (printDiagnosis)
        printDiagnosis.innerHTML = diagnosis
          ? `<strong>Diagnosis:</strong> ${diagnosis}`
          : "";
    } else {
      if (printNotesContainer) printNotesContainer.style.display = "none";
    }

    if (tests_suggested) {
      if (printTests) {
        printTests.style.display = "block";
        printTests.innerHTML = `<strong>Tests Suggested:</strong> ${tests_suggested}`;
      }
    } else {
      if (printTests) printTests.style.display = "none";
    }

    const printMedContainer = document.getElementById("print-medicines");
    if (printMedContainer) {
      printMedContainer.innerHTML = "";
      medicines.forEach((med) => {
        printMedContainer.innerHTML += `
                    <div style="margin-bottom: 20px;">
                        <strong style="font-size: 16px; color: #000; display: block;">${med.name}</strong>
                        <span style="font-size: 14px; color: #444;">${med.instructions || ""}</span>
                    </div>
                `;
      });
    }

    if (localStorage.getItem("tap2med_auto_print") === "true") {
      document.body.className = "mode-rx";
      window.print();
      setTimeout(() => (document.body.className = "dashboard-body"), 1000);
    }

    const completedToken = currentLocalToken;
    currentLocalToken = null;
    sessionStorage.removeItem(activePatientStorageKey);
    sessionStorage.removeItem(getDraftStorageKey(completedToken));
    clearPrescription();
    const headerEyebrow = document.querySelector(".eyebrow");
    if (headerEyebrow) headerEyebrow.innerHTML = `Active Token`;
    const currentTokenEl = document.getElementById("current-token");
    if (currentTokenEl) currentTokenEl.textContent = `#--`;

    await loadQueue();
  } catch (error) {
    console.error("Complete visit error:", error);
    setPrescriptionStatus("Failed to Send", "danger");
    alert("The prescription could not be saved.");
  } finally {
    isSaving = false;
  }
}

// QR Code Display & High-Res Standee Printing
window.showQRCode = function () {
  try {
    const qrContainer = document.getElementById("dashboardQRCode");
    const printContainer = document.getElementById("print-qr-target");
    if (!qrContainer) return;
    qrContainer.innerHTML = "";
    if (printContainer) printContainer.innerHTML = "";

    if (!clinicId || clinicId === "undefined" || clinicId === "null") return;
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
      clinicName.textContent;
    document.getElementById("qrModal").style.display = "flex";
  } catch (error) {}
};

window.printQRCode = function () {
  document.body.className = "mode-qr";
  window.print();
  setTimeout(() => (document.body.className = "dashboard-body"), 1000);
};

// Vitals Modal Logic
function calculateBMI(weight, height) {
  const weightKg = Number.parseFloat(weight);
  const heightCm = Number.parseFloat(height);
  if (
    !Number.isFinite(weightKg) ||
    !Number.isFinite(heightCm) ||
    weightKg <= 0 ||
    heightCm <= 0
  ) {
    return null;
  }
  const heightMeters = heightCm / 100;
  return weightKg / (heightMeters * heightMeters);
}

function updateBMIDisplay() {
  const bmiDisplay = document.getElementById("vital-bmi");
  if (!bmiDisplay) return;
  const bmi = calculateBMI(
    document.getElementById("vital-wt")?.value,
    document.getElementById("vital-ht")?.value,
  );
  bmiDisplay.textContent = bmi === null ? "--" : bmi.toFixed(1);
}

window.openVitalsModal = async function () {
  document.getElementById("vitals-modal").style.display = "flex";
  [
    "bp-sys",
    "bp-dia",
    "pr",
    "wt",
    "ht",
    "temp",
    "spo2",
    "waist",
    "hip",
  ].forEach((id) => {
    document.getElementById(`vital-${id}`).value = "";
  });
  updateBMIDisplay();

  try {
    const res = await fetch(`/api/clinics/queue/${clinicId}`);
    const data = await res.json();
    const activePatient = data.queue.find(
      (p) => p.local_token === currentLocalToken,
    );

    if (activePatient && activePatient.vitals) {
      const v = activePatient.vitals;
      document.getElementById("vital-bp-sys").value = v.bp_sys || "";
      document.getElementById("vital-bp-dia").value = v.bp_dia || "";
      document.getElementById("vital-pr").value = v.pr || "";
      document.getElementById("vital-wt").value = v.wt || "";
      document.getElementById("vital-ht").value = v.ht || "";
      updateBMIDisplay();
      document.getElementById("vital-temp").value = v.temp || "";
      document.getElementById("vital-spo2").value = v.spo2 || "";
      document.getElementById("vital-waist").value = v.waist || "";
      document.getElementById("vital-hip").value = v.hip || "";
    }
  } catch (e) {}
};

document
  .getElementById("vital-wt")
  ?.addEventListener("input", updateBMIDisplay);
document
  .getElementById("vital-ht")
  ?.addEventListener("input", updateBMIDisplay);

window.closeVitalsModal = function () {
  document.getElementById("vitals-modal").style.display = "none";
};

window.submitVitals = async function () {
  const payload = {
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
    const res = await fetch(`/api/clinics/queue/${clinicId}`);
    const data = await res.json();
    const activePatient = data.queue.find(
      (p) => p.local_token === currentLocalToken,
    );
    payload.is_paid =
      activePatient && activePatient.vitals && activePatient.vitals.is_paid
        ? true
        : false;

    await fetch("/api/events/vitals", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ local_token: currentLocalToken, vitals: payload }),
    });

    closeVitalsModal();
    fetchActiveVitals();
  } catch (e) {
    alert("Failed to save vitals.");
  }
};

async function fetchActiveVitals() {
  if (!currentLocalToken) return;
  try {
    const res = await fetch(`/api/clinics/queue/${clinicId}`);
    const data = await res.json();
    const activePatient = data.queue.find(
      (p) => p.local_token === currentLocalToken,
    );
    const display = document.getElementById("doctor-vitals-display");

    if (activePatient && activePatient.vitals) {
      const v = activePatient.vitals;
      let compiled = [];
      if (v.bp_sys && v.bp_dia) compiled.push(`BP: ${v.bp_sys}/${v.bp_dia}`);
      if (v.pr) compiled.push(`PR: ${v.pr} bpm`);
      if (v.wt) compiled.push(`Wt: ${v.wt} kg`);
      if (v.ht) compiled.push(`Ht: ${v.ht} cm`);
      const bmi = calculateBMI(v.wt, v.ht);
      if (bmi !== null) compiled.push(`BMI: ${bmi.toFixed(1)}`);
      if (v.temp) compiled.push(`T: ${v.temp} °F`);
      if (v.spo2) compiled.push(`SpO2: ${v.spo2}%`);

      const displayWeight = compiled.join(" | ");
      if (displayWeight) {
        display.style.display = "block";
        display.innerHTML = `<strong style="color: #475569;">Recorded Vitals:</strong> <span style="color: var(--primary-color); font-weight: 600;">${displayWeight}</span>`;
      } else {
        display.style.display = "none";
      }
    } else {
      display.style.display = "none";
    }
  } catch (e) {}
}

setInterval(fetchActiveVitals, 2000);

// --- EXPANDED LAB FLOWSHEET ENGINE ---
const ALL_LAB_KEYS = [
  "diab_sap",
  "diab_fbs",
  "diab_hba1c",
  "diab_creat",
  "diab_egfr",
  "diab_sacr",
  "diab_chol",
  "diab_tg",
  "diab_ldl",
  "diab_hdl",
  "haem_aec",
  "haem_hb",
  "haem_wbc",
  "haem_pcv",
  "haem_neut",
  "haem_lymph",
  "haem_eos",
  "haem_mono",
  "haem_baso",
  "haem_rbc",
  "haem_esr",
  "haem_rbcs",
  "haem_wbcs",
  "haem_plt",
  "haem_para",
  "haem_imp",
  "haem_mcv",
  "haem_mch",
  "haem_mchc",
  "bio_fus",
  "bio_ppbs",
  "bio_ppus",
  "bio_mbg",
  "bio_rbs",
  "bio_rus",
  "bio_ket",
  "bio_prot",
  "bio_urea",
  "bio_na",
  "bio_k",
  "bio_cl",
  "bio_uric",
  "bio_bun",
  "bio_hco3",
  "bio_cal",
  "lft_bili_tot",
  "lft_bili_dir",
  "lft_bili_ind",
  "lft_prot_tot",
  "lft_prot_alb",
  "lft_prot_glob",
  "lft_sgot",
  "lft_sgpt",
  "lft_ggt",
  "lft_mg",
  "uacr_alb",
  "uacr_malb",
  "uacr_creat",
  "ur_app",
  "ur_reac",
  "ur_alb",
  "ur_pus",
  "ur_rbc",
  "ur_casts",
  "ur_cryst",
  "ur_bact",
  "thy_tsh",
  "thy_tsh_ultra",
  "thy_t3",
  "thy_t4",
  "thy_ft3",
  "thy_ft4",
  "thy_tpo",
  "thy_tg_ab",
  "thy_anti_tg",
  "pcos_lh",
  "pcos_fsh",
  "pcos_prol",
  "pcos_testo",
  "pcos_dheas",
  "pcos_shbg",
  "pcos_oest",
  "pcos_fgw",
  "oth_ecg",
  "oth_usg",
  "oth_fnac",
  "oth_trop",
  "oth_pft",
  "oth_vpt",
  "oth_vitb12",
  "oth_echo",
  "oth_iron_prof",
  "oth_serum_iron",
  "oth_tibc",
  "oth_vitd3",
  "oth_crp",
  "oth_hscrp",
  "oth_ferritin",
  "oth_mri",
  "oth_ct",
  "oth_fibro",
  "oth_ttg",
  "oth_cect",
  "oth_mri_brain",
  "oth_ige",
  "oth_ptinr",
  "oth_pth",
  "oth_anti_tpo",
];

window.openLabsModal = async function () {
  if (!currentLocalToken) return alert("Please select a patient first.");
  document.getElementById("lab-modal-patient-name").textContent =
    window.currentPatientName || "Patient";
  document.getElementById("lab-local-token").value = currentLocalToken;
  document.getElementById("labs-modal").style.display = "flex";

  const today = new Date().toLocaleDateString("en-CA");
  document.getElementById("lab-date").value = today;
  await fetchLabData(currentLocalToken);
};

window.closeLabsModal = function () {
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

window.filterLabFields = function () {
  const searchTerm =
    document.getElementById("lab-search-input")?.value.trim().toLowerCase() ||
    "";

  document.querySelectorAll(".lab-input-group").forEach((group) => {
    const input = group.querySelector("input");
    const label = group.querySelector("label")?.textContent || "";
    const key = input ? input.id.replace(/^lab-/, "") : "";
    const match =
      !searchTerm || `${key} ${label}`.toLowerCase().includes(searchTerm);
    group.style.display = match ? "" : "none";
  });

  document.querySelectorAll(".lab-section-header").forEach((heading) => {
    const grid = heading.nextElementSibling;
    if (!grid || !grid.classList.contains("lab-grid")) return;

    const hasVisible = [...grid.querySelectorAll(".lab-input-group")].some(
      (group) => group.style.display !== "none",
    );

    heading.style.display = !searchTerm || hasVisible ? "" : "none";
    grid.style.display = !searchTerm || hasVisible ? "" : "none";
  });
};

window.populateLabInputsForDate = function (dateStr) {
  ALL_LAB_KEYS.forEach((id) => {
    const el = document.getElementById(`lab-${id}`);
    if (el) {
      el.value = "";
      checkRange(el, el.getAttribute("data-min"), el.getAttribute("data-max"));
    }
  });

  const record = patientLabData.find((l) => l.test_date === dateStr);
  if (record && record.results) {
    ALL_LAB_KEYS.forEach((id) => {
      if (record.results[id] !== undefined) {
        const el = document.getElementById(`lab-${id}`);
        if (el) {
          el.value = record.results[id];
          checkRange(
            el,
            el.getAttribute("data-min"),
            el.getAttribute("data-max"),
          );
        }
      }
    });
  }
};

window.saveLabs = async function () {
  const localToken = document.getElementById("lab-local-token").value;
  const dateStr = document.getElementById("lab-date").value;
  if (!dateStr) return alert("Please select a date.");

  const results = {};
  ALL_LAB_KEYS.forEach((id) => {
    const el = document.getElementById(`lab-${id}`);
    if (el && el.value.trim() !== "") results[id] = el.value.trim();
  });

  const payload = {
    local_token: localToken,
    lab_record: { test_date: dateStr, results: results },
  };

  try {
    const btn = document.querySelector("#labs-modal .btn-primary");
    const originalText = btn.textContent;
    btn.textContent = "Saving...";
    await fetch("/api/events/labs", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    await fetchLabData(localToken);
    btn.textContent = "Saved ✓";
    setTimeout(() => (btn.textContent = originalText), 2000);
  } catch (e) {
    alert("Failed to save labs.");
  }
};

window.checkRange = function (input, minStr, maxStr) {
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

window.filterChartOptions = function () {
  const select = document.getElementById("chart-parameter");
  if (!select) return;

  const searchTerm =
    document.getElementById("chart-search-input")?.value.trim().toLowerCase() ||
    "";
  const groups = select.querySelectorAll("optgroup");
  const visibleOptions = [];

  groups.forEach((group) => {
    const options = [...group.querySelectorAll("option")];

    options.forEach((option) => {
      const match =
        !searchTerm ||
        option.textContent.toLowerCase().includes(searchTerm) ||
        option.value.toLowerCase().includes(searchTerm);
      option.hidden = Boolean(searchTerm) && !match;
      if (match) visibleOptions.push(option);
    });

    const hasVisible = options.some((option) => !option.hidden);
    group.hidden = Boolean(searchTerm) && !hasVisible;
  });

  if (
    visibleOptions.length &&
    !visibleOptions.some((option) => option.value === select.value)
  ) {
    select.value = visibleOptions[0].value;
  }

  select.disabled = Boolean(searchTerm) && visibleOptions.length === 0;
  updateChart();
};

window.updateChart = function () {
  const select = document.getElementById("chart-parameter");
  if (!select) return;

  const param = select.value;
  if (!param) {
    if (labChartInstance) {
      labChartInstance.destroy();
      labChartInstance = null;
    }
    return;
  }

  const paramLabel = select.options[select.selectedIndex]?.text || "Lab Value";

  const filteredData = patientLabData
    .filter(
      (l) =>
        l.results &&
        l.results[param] !== undefined &&
        l.results[param] !== "" &&
        !Number.isNaN(parseFloat(l.results[param])),
    )
    .sort((a, b) => new Date(a.test_date) - new Date(b.test_date));

  const labels = filteredData.map((l) =>
    new Date(l.test_date).toLocaleDateString("en-IN", {
      month: "short",
      day: "numeric",
      year: "2-digit",
    }),
  );
  const dataPoints = filteredData.map((l) => parseFloat(l.results[param]));

  if (labChartInstance) labChartInstance.destroy();
  const ctx = document.getElementById("labChart");
  if (!ctx || typeof Chart === "undefined") return;

  labChartInstance = new Chart(ctx, {
    type: "line",
    data: {
      labels: labels,
      datasets: [
        {
          label: paramLabel,
          data: dataPoints,
          borderColor: "#0284c7",
          backgroundColor: "rgba(2, 132, 199, 0.1)",
          borderWidth: 3,
          pointBackgroundColor: "#fff",
          pointBorderColor: "#0284c7",
          pointRadius: 5,
          pointHoverRadius: 7,
          fill: true,
          tension: 0.3,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function (context) {
              return `${context.parsed.y} ${paramLabel}`;
            },
          },
        },
      },
      scales: {
        y: { beginAtZero: false, grid: { borderDash: [4, 4] } },
        x: { grid: { display: false } },
      },
    },
  });
};

window.checkRange = function (input) {
  const val = parseFloat(input.value);
  if (isNaN(val)) {
    input.classList.remove("lab-input-abnormal");
    return;
  }

  const min = parseFloat(input.getAttribute("data-min"));
  const max = parseFloat(input.getAttribute("data-max"));

  let isAbnormal = false;
  if (!isNaN(min) && val < min) isAbnormal = true;
  if (!isNaN(max) && val > max) isAbnormal = true;

  if (isAbnormal) {
    input.classList.add("lab-input-abnormal");
  } else {
    input.classList.remove("lab-input-abnormal");
  }
};

loadQueue();
setInterval(loadQueue, 5000);
