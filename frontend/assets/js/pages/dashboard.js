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
    advice: document.getElementById("patient-advice")?.value || "",
    followup: document.getElementById("patient-followup")?.value || "3",
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
    const advice = document.getElementById("patient-advice");
    const followup = document.getElementById("patient-followup");

    if (complaints) complaints.value = draft.complaints || "";
    if (diagnosis) diagnosis.value = draft.diagnosis || "";
    if (tests) tests.value = draft.testsSuggested || "";
    if (window.syncTestChips) window.syncTestChips();
    if (advice) advice.value = draft.advice || "";
    if (followup) followup.value = draft.followup || "3";

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

window.removePrescriptionRow = function (btn) {
  const row = btn.closest(".prescription-row");
  if (row) {
    row.remove();
    updateRowNumbers();
    if (typeof savePrescriptionDraft === "function") savePrescriptionDraft();
  }
};

function updateRowNumbers() {
  const container = document.getElementById("rx-container");
  if (!container) return;
  const rows = container.querySelectorAll(".prescription-row");
  rows.forEach((row, index) => {
    const idxEl = row.querySelector(".rx-index");
    if (idxEl) idxEl.textContent = index + 1;
  });
}

window.handleOtherToggle = function (selectEl) {
  if (selectEl.value === "__OTHER__") {
    const wrapper = selectEl.closest(".rx-dropdown-wrap");
    if (wrapper) {
      const customContainer = wrapper.querySelector(".rx-custom-container");
      const customInput = wrapper.querySelector(".rx-custom-input");
      selectEl.style.display = "none";
      if (customContainer) customContainer.style.display = "block";
      if (customInput) {
        customInput.value = "";
        customInput.focus();
      }
    }
  }
  updateFreq(selectEl);
};

window.revertToSelect = function (btn) {
  const wrapper = btn.closest(".rx-dropdown-wrap");
  if (wrapper) {
    const selectEl = wrapper.querySelector("select");
    const customContainer = wrapper.querySelector(".rx-custom-container");
    const customInput = wrapper.querySelector(".rx-custom-input");
    if (customInput) customInput.value = "";
    if (customContainer) customContainer.style.display = "none";
    if (selectEl) {
      selectEl.style.display = "block";
      selectEl.value = "";
      updateFreq(selectEl);
    }
  }
};

window.updateFreq = function (el) {
  const row = el.closest(".prescription-row");
  if (!row) return;

  const dose = row.querySelector(".rx-dose")?.value.trim() || "";

  // When: custom or select
  let when = "";
  const whenSelect = row.querySelector(".rx-when");
  const whenCustom = row.querySelector(".rx-when-custom");
  if (
    whenSelect &&
    whenSelect.value === "__OTHER__" &&
    whenCustom &&
    whenCustom.value.trim()
  ) {
    when = whenCustom.value.trim();
  } else if (whenSelect && whenSelect.value !== "__OTHER__") {
    when = whenSelect.value;
  }

  // Freq: custom or select
  let freq = "";
  const freqSelect = row.querySelector(".rx-freq-select");
  const freqCustom = row.querySelector(".rx-freq-custom");
  if (
    freqSelect &&
    freqSelect.value === "__OTHER__" &&
    freqCustom &&
    freqCustom.value.trim()
  ) {
    freq = freqCustom.value.trim();
  } else if (freqSelect && freqSelect.value !== "__OTHER__") {
    freq = freqSelect.value;
  }

  const days = row.querySelector(".rx-days")?.value.trim() || "";
  const remarks = row.querySelector(".rx-remarks")?.value.trim() || "";

  let dosageParts = [];
  if (dose) dosageParts.push(dose);
  if (freq) dosageParts.push(freq);
  if (when) dosageParts.push(`(${when})`);

  let dosageStr = dosageParts.join(" ");
  if (days) {
    dosageStr += (dosageStr ? " for " : "") + days;
  }

  const dosageHidden = row.querySelector(".rx-dosage");
  if (dosageHidden) dosageHidden.value = dosageStr;

  let fullInstructions = dosageStr;
  if (remarks) {
    fullInstructions += (fullInstructions ? " | " : "") + remarks;
  }

  const freqHidden = row.querySelector(".rx-freq");
  if (freqHidden) freqHidden.value = fullInstructions;
};

window.addPrescriptionRow = function () {
  const container = document.getElementById("rx-container");
  if (!container) return;
  const count = container.querySelectorAll(".prescription-row").length + 1;

  const row = document.createElement("div");
  row.className = "prescription-row";
  row.style.display = "grid";
  row.style.gridTemplateColumns =
    "22px 64px minmax(100px, 2fr) 44px 86px 82px 60px minmax(80px, 1.2fr) 26px";
  row.style.gap = "5px";
  row.style.padding = "5px 6px";
  row.style.borderBottom = "1px solid #f1f5f9";
  row.style.alignItems = "center";
  row.style.width = "100%";
  row.style.minWidth = "0";
  row.style.boxSizing = "border-box";

  row.innerHTML = `
    <div class="rx-index" style="min-width: 0; font-size: 11px; font-weight: 700; color: #64748b; text-align: center;">${count}</div>
    <div class="rx-dropdown-wrap" style="min-width: 0; position: relative;">
      <select class="input rx-type" onchange="handleOtherToggle(this)" style="min-width: 0; height: 32px; padding: 4px 2px 4px 4px; font-size: 11.5px; font-weight: 600; background: white; width: 100%; box-sizing: border-box;">
        <option value="" selected></option>
        <option value="TAB">TAB</option>
        <option value="CAP">CAP</option>
        <option value="SYP">SYP</option>
        <option value="INJ">INJ</option>
        <option value="OINT">OINT</option>
        <option value="GEL">GEL</option>
        <option value="CRM">CRM</option>
        <option value="DROPS">DROPS</option>
        <option value="SUSP">SUSP</option>
        <option value="INH">INH</option>
        <option value="RESP">RESP</option>
        <option value="POW">POW</option>
        <option value="LOT">LOT</option>
        <option value="SACH">SACH</option>
        <option value="__OTHER__">+ Other</option>
      </select>
      <div class="rx-custom-container" style="display: none; width: 100%; position: relative;">
        <input type="text" class="input rx-custom-input rx-type-custom" placeholder="Type" style="min-width: 0; height: 32px; padding: 4px 18px 4px 4px; font-size: 11.5px; font-weight: 600; width: 100%; box-sizing: border-box;" oninput="updateFreq(this)" />
        <span onclick="revertToSelect(this)" title="Back to dropdown" style="position: absolute; right: 4px; top: 50%; transform: translateY(-50%); cursor: pointer; color: #94a3b8; font-size: 11px; font-weight: bold;">✕</span>
      </div>
    </div>
    <div style="min-width: 0;">
      <input type="text" class="input rx-med" placeholder="Medicine Name" autocomplete="off" oninput="updateFreq(this)" style="min-width: 0; height: 32px; padding: 4px 6px; font-size: 12px; font-weight: 600; width: 100%; box-sizing: border-box;" />
    </div>
    <div style="min-width: 0;">
      <input type="text" class="input rx-dose" placeholder="1" autocomplete="off" oninput="updateFreq(this)" style="min-width: 0; height: 32px; padding: 4px 2px; font-size: 12px; text-align: center; width: 100%; box-sizing: border-box;" />
    </div>
    <div class="rx-dropdown-wrap" style="min-width: 0; position: relative;">
      <select class="input rx-when" onchange="handleOtherToggle(this)" style="min-width: 0; height: 32px; padding: 4px 2px 4px 4px; font-size: 11.5px; background: white; width: 100%; box-sizing: border-box;">
        <option value="" selected></option>
        <option value="After Food">After Food</option>
        <option value="Before Food">Before Food</option>
        <option value="With Food">With Food</option>
        <option value="Empty Stomach">Empty Stomach</option>
        <option value="At Bedtime">At Bedtime</option>
        <option value="Anytime">Anytime</option>
        <option value="__OTHER__">+ Other</option>
      </select>
      <div class="rx-custom-container" style="display: none; width: 100%; position: relative;">
        <input type="text" class="input rx-custom-input rx-when-custom" placeholder="e.g. 4h" style="min-width: 0; height: 32px; padding: 4px 18px 4px 4px; font-size: 11.5px; width: 100%; box-sizing: border-box;" oninput="updateFreq(this)" />
        <span onclick="revertToSelect(this)" title="Back to dropdown" style="position: absolute; right: 4px; top: 50%; transform: translateY(-50%); cursor: pointer; color: #94a3b8; font-size: 11px; font-weight: bold;">✕</span>
      </div>
    </div>
    <div class="rx-dropdown-wrap" style="min-width: 0; position: relative;">
      <select class="input rx-freq-select" onchange="handleOtherToggle(this)" style="min-width: 0; height: 32px; padding: 4px 2px 4px 4px; font-size: 11.5px; background: white; width: 100%; box-sizing: border-box;">
        <option value="" selected></option>
        <option value="1-0-1">1-0-1</option>
        <option value="1-1-1">1-1-1</option>
        <option value="1-0-0">1-0-0</option>
        <option value="0-0-1">0-0-1</option>
        <option value="0-1-0">0-1-0</option>
        <option value="1-0-1-0">1-0-1-0</option>
        <option value="Once Daily">Once Daily</option>
        <option value="Twice Daily">Twice Daily</option>
        <option value="Thrice Daily">Thrice Daily</option>
        <option value="SOS">SOS</option>
        <option value="Alternate Days">Alternate Days</option>
        <option value="Weekly">Weekly</option>
        <option value="__OTHER__">+ Other</option>
      </select>
      <div class="rx-custom-container" style="display: none; width: 100%; position: relative;">
        <input type="text" class="input rx-custom-input rx-freq-custom" placeholder="e.g. 1-0-1-1" style="min-width: 0; height: 32px; padding: 4px 18px 4px 4px; font-size: 11.5px; width: 100%; box-sizing: border-box;" oninput="updateFreq(this)" />
        <span onclick="revertToSelect(this)" title="Back to dropdown" style="position: absolute; right: 4px; top: 50%; transform: translateY(-50%); cursor: pointer; color: #94a3b8; font-size: 11px; font-weight: bold;">✕</span>
      </div>
    </div>
    <div style="min-width: 0;">
      <input type="text" class="input rx-days" placeholder="5 Days" autocomplete="off" oninput="updateFreq(this)" style="min-width: 0; height: 32px; padding: 4px 2px; font-size: 12px; text-align: center; width: 100%; box-sizing: border-box;" />
    </div>
    <div style="min-width: 0;">
      <input type="text" class="input rx-remarks" placeholder="Notes (optional)" autocomplete="off" oninput="updateFreq(this)" style="min-width: 0; height: 32px; padding: 4px 6px; font-size: 12px; width: 100%; box-sizing: border-box;" />
    </div>
    <div style="min-width: 0; text-align: center;">
      <button type="button" class="btn btn-ghost" onclick="removePrescriptionRow(this)" style="color: #ef4444; padding: 0; width: 24px; height: 24px; display: inline-flex; align-items: center; justify-content: center; border-radius: 4px; font-size: 12px;" title="Remove row">✕</button>
    </div>
    <input type="hidden" class="rx-freq" />
    <input type="hidden" class="rx-dosage" />
  `;
  container.appendChild(row);
  updateFreq(row.querySelector(".rx-med"));
};

function populatePrescriptionPad(prescriptions) {
  const container = document.getElementById("rx-container");
  if (!container) return;

  container.innerHTML = "";
  if (!Array.isArray(prescriptions) || prescriptions.length === 0) {
    addPrescriptionRow();
    return;
  }

  const typesList = [
    "TAB",
    "CAP",
    "SYP",
    "INJ",
    "OINT",
    "GEL",
    "CRM",
    "DROPS",
    "SUSP",
    "INH",
    "RESP",
    "POW",
    "LOT",
    "SACH",
  ];

  prescriptions.forEach((med) => {
    addPrescriptionRow();
    const row = container.lastElementChild;
    let name = (med.name || "").trim();

    let detectedType = null;
    for (const t of typesList) {
      const regex = new RegExp(`^${t}\\.?\\s*`, "i");
      if (regex.test(name)) {
        detectedType = t;
        name = name.replace(regex, "");
        break;
      }
    }

    const typeSelect = row.querySelector(".rx-type");
    const typeWrap = typeSelect?.closest(".rx-dropdown-wrap");
    const typeCustom = typeWrap?.querySelector(".rx-type-custom");
    const typeCustomCont = typeWrap?.querySelector(".rx-custom-container");

    if (detectedType) {
      if (typeSelect) typeSelect.value = detectedType;
    } else {
      const prefixMatch = name.match(/^([A-Za-z0-9]+)\.\s*(.*)/);
      if (prefixMatch) {
        if (typeSelect) {
          typeSelect.value = "__OTHER__";
          typeSelect.style.display = "none";
        }
        if (typeCustomCont) typeCustomCont.style.display = "block";
        if (typeCustom) typeCustom.value = prefixMatch[1].toUpperCase();
        name = prefixMatch[2];
      } else {
        if (typeSelect) typeSelect.value = "";
      }
    }

    if (row.querySelector(".rx-med")) row.querySelector(".rx-med").value = name;

    let fullInstructions = med.instructions || "";
    let remarks = "";
    let dosage = med.dosage || "";
    let days = med.duration || "";

    if (fullInstructions.includes(" | ")) {
      const parts = fullInstructions.split(" | ");
      dosage = parts[0].trim();
      remarks = parts.slice(1).join(" | ").trim();
    } else {
      dosage = fullInstructions.trim();
    }

    if (dosage.includes(" for ")) {
      const dParts = dosage.split(" for ");
      dosage = dParts[0].trim();
      days = dParts[1].trim();
    }

    const whenOptions = [
      "After Food",
      "Before Food",
      "With Food",
      "Empty Stomach",
      "At Bedtime",
      "Anytime",
    ];
    let detectedWhen = "";
    for (const w of whenOptions) {
      if (dosage.includes(w)) {
        detectedWhen = w;
        dosage = dosage.replace(`(${w})`, "").replace(w, "").trim();
        break;
      }
    }
    if (!detectedWhen) {
      const parenMatch = dosage.match(/\((.*?)\)/);
      if (parenMatch) {
        detectedWhen = parenMatch[1].trim();
        dosage = dosage.replace(parenMatch[0], "").trim();
      }
    }

    const freqOptions = [
      "1-0-1-0",
      "1-0-1",
      "1-1-1",
      "1-0-0",
      "0-0-1",
      "0-1-0",
      "Once Daily",
      "Twice Daily",
      "Thrice Daily",
      "SOS / As needed",
      "SOS",
      "Alternate Days",
      "Weekly",
    ];
    let detectedFreq = "";
    for (const f of freqOptions) {
      if (dosage.includes(f)) {
        detectedFreq = f === "SOS / As needed" ? "SOS" : f;
        dosage = dosage.replace(f, "").trim();
        break;
      }
    }

    if (row.querySelector(".rx-dose"))
      row.querySelector(".rx-dose").value = dosage.trim();

    const whenSelect = row.querySelector(".rx-when");
    const whenWrap = whenSelect?.closest(".rx-dropdown-wrap");
    const whenCustom = whenWrap?.querySelector(".rx-when-custom");
    const whenCustomCont = whenWrap?.querySelector(".rx-custom-container");

    if (detectedWhen) {
      if (whenOptions.includes(detectedWhen)) {
        if (whenSelect) whenSelect.value = detectedWhen;
      } else {
        if (whenSelect) {
          whenSelect.value = "__OTHER__";
          whenSelect.style.display = "none";
        }
        if (whenCustomCont) whenCustomCont.style.display = "block";
        if (whenCustom) whenCustom.value = detectedWhen;
      }
    } else {
      if (whenSelect) whenSelect.value = "";
    }

    const freqSelect = row.querySelector(".rx-freq-select");
    const freqWrap = freqSelect?.closest(".rx-dropdown-wrap");
    const freqCustom = freqWrap?.querySelector(".rx-freq-custom");
    const freqCustomCont = freqWrap?.querySelector(".rx-custom-container");

    if (detectedFreq) {
      if (freqSelect) freqSelect.value = detectedFreq;
    } else {
      if (freqSelect) freqSelect.value = "";
    }

    if (row.querySelector(".rx-days"))
      row.querySelector(".rx-days").value = days;
    if (row.querySelector(".rx-remarks"))
      row.querySelector(".rx-remarks").value = remarks;

    updateFreq(row.querySelector(".rx-med"));
  });
  updateRowNumbers();
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
  const aEl = document.getElementById("patient-advice");
  const fEl = document.getElementById("patient-followup");
  if (cEl) cEl.value = "";
  if (dEl) dEl.value = "";
  if (tEl) tEl.value = "";
  if (aEl) aEl.value = "";
  if (fEl) fEl.value = "3";
  updateRowNumbers();
  setPrescriptionStatus("Waiting...", "warning");
  if (window.syncTestChips) window.syncTestChips();
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
  age = null,
  modeLabel = "",
}) {
  const headerEyebrow = document.querySelector(".eyebrow");
  if (!headerEyebrow) return;

  const cityMarkup = cityText
    ? ` <span style="font-size: 14px; color: var(--text-muted);">(${cityText})</span>`
    : "";
  const ageMarkup =
    age !== null && age !== undefined && age !== ""
      ? ` <span style="font-size: 14px; color: var(--text-muted);">Age: ${age}</span>`
      : "";
  const modeMarkup = modeLabel
    ? ` - <span style="color:#ef4444;">${modeLabel}</span>`
    : "";

  headerEyebrow.innerHTML = `Active Token: <strong style="color: var(--primary-color);">${patientName}</strong>${cityMarkup}${ageMarkup} (ID: ${displayId})${modeMarkup}
  <button onclick="openLabsModal()" class="btn btn-sm btn-secondary" style="margin-left: 15px; background: white; font-size: 12px; height: 28px; box-shadow: none;">View Labs & Trends</button>`;
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
          <button onclick="removePatientFromQueue('${patient.local_token}', event)" title="Remove patient from queue" style="position:absolute; right:12px; bottom:12px; width:28px; height:28px; border:none; border-radius:8px; display:inline-flex; align-items:center; justify-content:center; background:#fff1f2; color:#be123c; font-size:14px; cursor:pointer; box-shadow:0 6px 14px rgba(190,18,60,0.12); border:1px solid #fecdd3;">✕</button>
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
            '<span style="font-size:32px; margin-bottom:10px;"></span> Loading Patient Data...';
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
            age: patient.age,
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
                body: JSON.stringify({
                  clinic_id: clinicId,
                  local_token: patient.local_token,
                }),
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
          age: firstPatient.age,
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
              <button onclick="editRx('${patient.local_token}', ${patient.daily_token_number}, '${patient.patient_name || "Patient"}', '${patient.display_id || "--"}')" class="btn btn-ghost" style="padding: 4px 8px; font-size: 11px; color: #ef4444; border: 1px dashed #fca5a5;">Edit</button>
              <button onclick="rePrintRx('${patient.local_token}', '${patient.patient_name || "Patient"}', '${patient.display_id || "--"}')" class="btn btn-secondary" style="padding: 4px 8px; font-size: 11px; background: white;">Print</button>
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
      `/api/events/history/${encodeURIComponent(localToken)}?clinic_id=${clinicId}`,
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
        <summary style="font-weight: 600; color: var(--primary-color); outline: none; display: flex; align-items: center; justify-content: space-between; gap: 12px;">${date}<button type="button" class="btn btn-secondary copy-to-pad-btn" style="height: 30px; padding: 0 10px; font-size: 12px; color: var(--primary-color);">↻ Copy to Pad</button></summary>
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
      body: JSON.stringify({ clinic_id: clinicId, local_token: localToken }),
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
      `/api/events/history/${encodeURIComponent(localToken)}?clinic_id=${clinicId}`,
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

    // Package the data for the new Print Engine
    const printData = {
      clinicName: clinicName.textContent || "Clinic",
      doctorName: doctorName.textContent || "Doctor",
      patientName: patientName || "Patient",
      displayId: displayId || "--",
      date: today,
      vitals: visit.weight || "",
      complaints: visit.complaints || "",
      diagnosis: visit.diagnosis || "",
      tests: visit.tests_suggested || "",
      advice: visit.advice || "",
      follow_up_days: visit.follow_up_days || 0,
      prescriptions: visit.prescriptions || [],
    };

    // Call the isolated print engine
    window.PrintEngine.printRx(printData);
  } catch (e) {
    alert("Failed to load prescription for printing.");
    console.error(e);
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
      `/api/events/history/${encodeURIComponent(localToken)}?clinic_id=${clinicId}`,
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
    if (window.syncTestChips) window.syncTestChips();
    const advEl = document.getElementById("patient-advice");
    if (advEl) advEl.value = visit.advice || "";
    const fEl = document.getElementById("patient-followup");
    if (fEl)
      fEl.value =
        visit.follow_up_days !== null && visit.follow_up_days !== undefined
          ? visit.follow_up_days
          : "3";

    populatePrescriptionPad(visit.prescriptions);

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
    let name = row.querySelector(".rx-med")?.value.trim() || "";

    let type = "";
    const typeSelect = row.querySelector(".rx-type");
    const typeCustom = row.querySelector(".rx-type-custom");
    if (
      typeSelect &&
      typeSelect.value === "__OTHER__" &&
      typeCustom &&
      typeCustom.value.trim()
    ) {
      type = typeCustom.value.trim();
    } else if (typeSelect && typeSelect.value !== "__OTHER__") {
      type = typeSelect.value;
    }

    const instructions = row.querySelector(".rx-freq")?.value.trim() || "";
    if (name) {
      let prefix = type ? `${type}. ` : "";
      if (prefix && name.toUpperCase().startsWith(type.toUpperCase())) {
        medicines.push({ name, instructions });
      } else {
        medicines.push({ name: `${prefix}${name}`.trim(), instructions });
      }
    }
  });

  const complaints =
    document.getElementById("patient-complaints")?.value.trim() || "";
  const diagnosis =
    document.getElementById("patient-diagnosis")?.value.trim() || "";
  const tests_suggested =
    document.getElementById("patient-tests")?.value.trim() || "";
  const advice = document.getElementById("patient-advice")?.value.trim() || "";
  const follow_up_days = parseInt(
    document.getElementById("patient-followup")?.value.trim() || "3",
    10,
  );

  if (
    !medicines.length &&
    !complaints &&
    !diagnosis &&
    !tests_suggested &&
    !advice
  ) {
    if (!confirm("No details have been entered. Complete this visit?")) return;
  }

  isSaving = true;
  setPrescriptionStatus("Saving...", "warning");

  try {
    const response = await fetch("/api/events/complete", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clinic_id: clinicId,
        local_token: currentLocalToken,
        medicines: medicines,
        complaints: complaints,
        diagnosis: diagnosis,
        tests_suggested: tests_suggested,
        advice: advice,
        follow_up_days: follow_up_days,
      }),
    });

    if (!response.ok) throw new Error("Prescription save failed");

    setPrescriptionStatus("Sent to WhatsApp", "success");

    const today = new Date().toLocaleDateString("en-IN", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });

    if (localStorage.getItem("tap2med_auto_print") === "true") {
      const printData = {
        clinicName: clinicName.textContent || "Clinic",
        doctorName: doctorName.textContent || "Doctor",
        patientName: window.currentPatientName || "Patient",
        displayId: window.currentDisplayId || "--",
        date: today,
        vitals: "",
        complaints: complaints,
        diagnosis: diagnosis,
        tests: tests_suggested,
        advice: advice,
        follow_up_days: follow_up_days,
        prescriptions: medicines,
      };
      window.PrintEngine.printRx(printData);
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
      body: JSON.stringify({
        clinic_id: clinicId,
        local_token: currentLocalToken,
        vitals: payload,
      }),
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

/**
 * Tap2Med Comprehensive Clinical Medical Tests Database
 * Contains standard clinical laboratory investigations across all major medical specialties
 * with standardized units, normal reference ranges, and search keywords.
 */

(function () {
  const TEST_DATABASE = [
    // ==========================================
    // 1. HAEMATOLOGY & COAGULATION
    // ==========================================
    {
      key: "haem_cbc",
      name: "Complete Blood Count (CBC)",
      category: "Haematology",
      unit: "Profile",
      min: null,
      max: null,
      aliases: [
        "cbc",
        "hemogram",
        "blood count",
        "complete blood picture",
        "cbp",
      ],
    },
    {
      key: "haem_hb",
      name: "Haemoglobin (Hb)",
      category: "Haematology",
      unit: "g/dL",
      min: 12.0,
      max: 16.0,
      aliases: ["hb", "hemoglobin", "anaemia", "anemia"],
    },
    {
      key: "haem_rbc",
      name: "Total RBC Count",
      category: "Haematology",
      unit: "million/mcL",
      min: 4.2,
      max: 5.8,
      aliases: ["rbc", "red blood cells", "erythrocyte count"],
    },
    {
      key: "haem_wbc",
      name: "Total Leucocyte Count (TLC / WBC)",
      category: "Haematology",
      unit: "cells/mcL",
      min: 4000,
      max: 11000,
      aliases: ["wbc", "tlc", "white blood cells", "leucocytes"],
    },
    {
      key: "haem_platelets",
      name: "Platelet Count",
      category: "Haematology",
      unit: "lakhs/mcL",
      min: 1.5,
      max: 4.5,
      aliases: ["platelets", "thrombocytes", "plt", "dengue count"],
    },
    {
      key: "haem_pcv",
      name: "Packed Cell Volume (PCV / Hematocrit)",
      category: "Haematology",
      unit: "%",
      min: 36.0,
      max: 50.0,
      aliases: ["pcv", "hematocrit", "hct"],
    },
    {
      key: "haem_mcv",
      name: "Mean Corpuscular Volume (MCV)",
      category: "Haematology",
      unit: "fL",
      min: 80.0,
      max: 100.0,
      aliases: ["mcv", "rbc indices"],
    },
    {
      key: "haem_mch",
      name: "Mean Corpuscular Hemoglobin (MCH)",
      category: "Haematology",
      unit: "pg",
      min: 27.0,
      max: 33.0,
      aliases: ["mch"],
    },
    {
      key: "haem_mchc",
      name: "MCHC",
      category: "Haematology",
      unit: "g/dL",
      min: 32.0,
      max: 36.0,
      aliases: ["mchc"],
    },
    {
      key: "haem_rdw",
      name: "RDW (Red Cell Distribution Width)",
      category: "Haematology",
      unit: "%",
      min: 11.5,
      max: 14.5,
      aliases: ["rdw", "anisocytosis"],
    },
    {
      key: "haem_neutrophils",
      name: "Neutrophils (%)",
      category: "Haematology",
      unit: "%",
      min: 40,
      max: 75,
      aliases: ["neutrophil", "polymorphs", "dlc"],
    },
    {
      key: "haem_lymphocytes",
      name: "Lymphocytes (%)",
      category: "Haematology",
      unit: "%",
      min: 20,
      max: 45,
      aliases: ["lymphocyte", "dlc"],
    },
    {
      key: "haem_monocytes",
      name: "Monocytes (%)",
      category: "Haematology",
      unit: "%",
      min: 2,
      max: 10,
      aliases: ["monocyte", "dlc"],
    },
    {
      key: "haem_eosinophils",
      name: "Eosinophils (%)",
      category: "Haematology",
      unit: "%",
      min: 1,
      max: 6,
      aliases: ["eosinophil", "allergy cell", "dlc"],
    },
    {
      key: "haem_basophils",
      name: "Basophils (%)",
      category: "Haematology",
      unit: "%",
      min: 0,
      max: 1,
      aliases: ["basophil", "dlc"],
    },
    {
      key: "haem_aec",
      name: "Absolute Eosinophil Count (AEC)",
      category: "Haematology",
      unit: "cells/mcL",
      min: 40,
      max: 450,
      aliases: ["aec", "absolute eosinophils", "allergy count", "asthma"],
    },
    {
      key: "haem_anc",
      name: "Absolute Neutrophil Count (ANC)",
      category: "Haematology",
      unit: "cells/mcL",
      min: 1500,
      max: 8000,
      aliases: ["anc", "absolute neutrophils", "neutropenia"],
    },
    {
      key: "haem_alc",
      name: "Absolute Lymphocyte Count (ALC)",
      category: "Haematology",
      unit: "cells/mcL",
      min: 1000,
      max: 4000,
      aliases: ["alc", "absolute lymphocytes"],
    },
    {
      key: "haem_esr",
      name: "ESR (Erythrocyte Sedimentation Rate)",
      category: "Haematology",
      unit: "mm/hr",
      min: 0,
      max: 20,
      aliases: ["esr", "sed rate", "westergren", "inflammation"],
    },
    {
      key: "haem_retic",
      name: "Reticulocyte Count",
      category: "Haematology",
      unit: "%",
      min: 0.5,
      max: 2.5,
      aliases: ["reticulocyte", "retic", "bone marrow response"],
    },
    {
      key: "haem_pbs",
      name: "Peripheral Blood Smear (PBS)",
      category: "Haematology",
      unit: "Microscopy",
      min: null,
      max: null,
      aliases: ["pbs", "blood smear", "malaria parasite smear", "morphology"],
    },
    {
      key: "haem_bt_ct",
      name: "Bleeding Time & Clotting Time (BT/CT)",
      category: "Haematology",
      unit: "Minutes",
      min: null,
      max: null,
      aliases: ["bt", "ct", "bleeding time", "clotting time"],
    },
    {
      key: "haem_pt_inr",
      name: "Prothrombin Time & INR (PT/INR)",
      category: "Haematology",
      unit: "INR",
      min: 0.8,
      max: 1.2,
      aliases: [
        "pt",
        "inr",
        "prothrombin",
        "warfarin monitoring",
        "coagulation",
      ],
    },
    {
      key: "haem_aptt",
      name: "Activated Partial Thromboplastin Time (APTT)",
      category: "Haematology",
      unit: "Seconds",
      min: 26.0,
      max: 38.0,
      aliases: ["aptt", "ptt", "heparin monitoring", "clotting"],
    },
    {
      key: "haem_d_dimer",
      name: "D-Dimer (Quantitative)",
      category: "Haematology",
      unit: "ng/mL",
      min: 0,
      max: 500,
      aliases: ["d dimer", "ddimer", "thrombosis", "dvt", "pulmonary embolism"],
    },
    {
      key: "haem_fibrinogen",
      name: "Serum Fibrinogen",
      category: "Haematology",
      unit: "mg/dL",
      min: 200,
      max: 400,
      aliases: ["fibrinogen", "factor 1", "clotting factor"],
    },
    {
      key: "haem_blood_group",
      name: "Blood Group & Rh Typing",
      category: "Haematology",
      unit: "Typing",
      min: null,
      max: null,
      aliases: [
        "blood group",
        "abo",
        "rh factor",
        "rh positive",
        "rh negative",
      ],
    },
    {
      key: "haem_coombs_direct",
      name: "Direct Coombs Test (DAT)",
      category: "Haematology",
      unit: "Qualitative",
      min: null,
      max: null,
      aliases: ["coombs direct", "dat", "hemolytic anemia"],
    },
    {
      key: "haem_coombs_indirect",
      name: "Indirect Coombs Test (ICT)",
      category: "Haematology",
      unit: "Qualitative",
      min: null,
      max: null,
      aliases: ["coombs indirect", "ict", "antibody screening", "antenatal"],
    },
    {
      key: "haem_hb_electrophoresis",
      name: "Hemoglobin Electrophoresis / HPLC",
      category: "Haematology",
      unit: "Analysis",
      min: null,
      max: null,
      aliases: ["hplc", "thalassemia", "sickle cell", "hb a2", "hb f"],
    },
    {
      key: "haem_g6pd",
      name: "G6PD Quantitative Assay",
      category: "Haematology",
      unit: "U/g Hb",
      min: 4.6,
      max: 13.5,
      aliases: ["g6pd", "favism", "hemolysis enzyme"],
    },

    // ==========================================
    // 2. DIABETES & GLYCEMIC METABOLISM
    // ==========================================
    {
      key: "diab_fbs",
      name: "Fasting Blood Sugar (FBS)",
      category: "Diabetes & Glycemic",
      unit: "mg/dL",
      min: 70,
      max: 99,
      aliases: ["fbs", "fasting glucose", "sugar fasting", "diabetes"],
    },
    {
      key: "diab_ppbs",
      name: "Post Prandial Blood Sugar (PPBS)",
      category: "Diabetes & Glycemic",
      unit: "mg/dL",
      min: 90,
      max: 140,
      aliases: ["ppbs", "pp blood sugar", "post meals glucose", "2hr sugar"],
    },
    {
      key: "diab_rbs",
      name: "Random Blood Sugar (RBS)",
      category: "Diabetes & Glycemic",
      unit: "mg/dL",
      min: 70,
      max: 140,
      aliases: ["rbs", "random sugar", "glucose random"],
    },
    {
      key: "diab_hba1c",
      name: "Glycosylated Haemoglobin (HbA1c)",
      category: "Diabetes & Glycemic",
      unit: "%",
      min: 4.0,
      max: 5.6,
      aliases: ["hba1c", "a1c", "glycated hemoglobin", "3 month sugar"],
    },
    {
      key: "diab_eag",
      name: "Estimated Average Glucose (eAG)",
      category: "Diabetes & Glycemic",
      unit: "mg/dL",
      min: 70,
      max: 126,
      aliases: ["eag", "mean blood glucose", "mbg"],
    },
    {
      key: "diab_insulin_fasting",
      name: "Serum Insulin (Fasting)",
      category: "Diabetes & Glycemic",
      unit: "mcIU/mL",
      min: 2.6,
      max: 24.9,
      aliases: ["insulin fasting", "fasting insulin", "hyperinsulinemia"],
    },
    {
      key: "diab_insulin_pp",
      name: "Serum Insulin (Post Prandial)",
      category: "Diabetes & Glycemic",
      unit: "mcIU/mL",
      min: 16.0,
      max: 166.0,
      aliases: ["insulin pp", "post prandial insulin"],
    },
    {
      key: "diab_c_peptide",
      name: "C-Peptide (Fasting)",
      category: "Diabetes & Glycemic",
      unit: "ng/mL",
      min: 0.9,
      max: 4.0,
      aliases: [
        "c peptide",
        "c-peptide",
        "beta cell reserve",
        "type 1 diabetes",
      ],
    },
    {
      key: "diab_homa_ir",
      name: "HOMA-IR (Insulin Resistance Index)",
      category: "Diabetes & Glycemic",
      unit: "Score",
      min: 0.5,
      max: 1.9,
      aliases: ["homa ir", "insulin resistance", "metabolic syndrome"],
    },
    {
      key: "diab_fructosamine",
      name: "Serum Fructosamine",
      category: "Diabetes & Glycemic",
      unit: "umol/L",
      min: 200,
      max: 285,
      aliases: ["fructosamine", "glycated protein", "short term sugar"],
    },
    {
      key: "diab_gtt",
      name: "Oral Glucose Tolerance Test (OGTT - 75g)",
      category: "Diabetes & Glycemic",
      unit: "mg/dL",
      min: null,
      max: 140,
      aliases: ["gtt", "ogtt", "glucose tolerance", "gestational diabetes"],
    },
    {
      key: "diab_microalbumin_spot",
      name: "Urine Microalbumin (Spot)",
      category: "Diabetes & Glycemic",
      unit: "mg/L",
      min: 0,
      max: 20,
      aliases: ["urine microalbumin", "early nephropathy", "diabetic kidney"],
    },

    // ==========================================
    // 3. BIOCHEMISTRY & ROUTINE ELECTROLYTES
    // ==========================================
    {
      key: "bio_sodium",
      name: "Serum Sodium (Na+)",
      category: "Bio Chemistry",
      unit: "mEq/L",
      min: 135,
      max: 145,
      aliases: [
        "sodium",
        "na",
        "electrolytes",
        "hyponatremia",
        "hypernatremia",
      ],
    },
    {
      key: "bio_potassium",
      name: "Serum Potassium (K+)",
      category: "Bio Chemistry",
      unit: "mEq/L",
      min: 3.5,
      max: 5.1,
      aliases: ["potassium", "k", "hypokalemia", "hyperkalemia"],
    },
    {
      key: "bio_chloride",
      name: "Serum Chloride (Cl-)",
      category: "Bio Chemistry",
      unit: "mEq/L",
      min: 96,
      max: 106,
      aliases: ["chloride", "cl", "electrolytes"],
    },
    {
      key: "bio_bicarbonate",
      name: "Serum Bicarbonate (HCO3)",
      category: "Bio Chemistry",
      unit: "mEq/L",
      min: 22,
      max: 29,
      aliases: [
        "bicarbonate",
        "hco3",
        "acid base balance",
        "metabolic acidosis",
      ],
    },
    {
      key: "bio_calcium",
      name: "Serum Calcium (Total)",
      category: "Bio Chemistry",
      unit: "mg/dL",
      min: 8.5,
      max: 10.5,
      aliases: ["calcium", "total calcium", "hypocalcemia", "hypercalcemia"],
    },
    {
      key: "bio_ionic_calcium",
      name: "Ionized Calcium",
      category: "Bio Chemistry",
      unit: "mmol/L",
      min: 1.15,
      max: 1.33,
      aliases: ["ionized calcium", "free calcium"],
    },
    {
      key: "bio_phosphorus",
      name: "Serum Phosphorus (Inorganic)",
      category: "Bio Chemistry",
      unit: "mg/dL",
      min: 2.5,
      max: 4.5,
      aliases: ["phosphorus", "phosphate", "bone mineral"],
    },
    {
      key: "bio_magnesium",
      name: "Serum Magnesium",
      category: "Bio Chemistry",
      unit: "mg/dL",
      min: 1.7,
      max: 2.4,
      aliases: ["magnesium", "mg", "hypomagnesemia", "cramps"],
    },
    {
      key: "bio_uric_acid",
      name: "Serum Uric Acid",
      category: "Bio Chemistry",
      unit: "mg/dL",
      min: 3.5,
      max: 7.2,
      aliases: ["uric acid", "gout", "hyperuricemia", "joint pain"],
    },

    // ==========================================
    // 4. LIVER FUNCTION TESTS (LFT)
    // ==========================================
    {
      key: "lft_panel",
      name: "Liver Function Test (LFT Profile)",
      category: "Liver Function (LFT)",
      unit: "Profile",
      min: null,
      max: null,
      aliases: ["lft", "liver panel", "hepatic function", "jaundice profile"],
    },
    {
      key: "lft_bili_tot",
      name: "Serum Bilirubin (Total)",
      category: "Liver Function (LFT)",
      unit: "mg/dL",
      min: 0.2,
      max: 1.2,
      aliases: ["total bilirubin", "bilirubin", "jaundice"],
    },
    {
      key: "lft_bili_dir",
      name: "Serum Bilirubin (Direct / Conjugated)",
      category: "Liver Function (LFT)",
      unit: "mg/dL",
      min: 0.0,
      max: 0.3,
      aliases: ["direct bilirubin", "conjugated bilirubin"],
    },
    {
      key: "lft_bili_ind",
      name: "Serum Bilirubin (Indirect / Unconjugated)",
      category: "Liver Function (LFT)",
      unit: "mg/dL",
      min: 0.1,
      max: 0.9,
      aliases: ["indirect bilirubin", "unconjugated bilirubin"],
    },
    {
      key: "lft_sgpt",
      name: "SGPT / ALT (Alanine Aminotransferase)",
      category: "Liver Function (LFT)",
      unit: "U/L",
      min: 7,
      max: 45,
      aliases: ["sgpt", "alt", "alanine aminotransferase", "liver enzyme"],
    },
    {
      key: "lft_sgot",
      name: "SGOT / AST (Aspartate Aminotransferase)",
      category: "Liver Function (LFT)",
      unit: "U/L",
      min: 8,
      max: 40,
      aliases: ["sgot", "ast", "aspartate aminotransferase"],
    },
    {
      key: "lft_alp",
      name: "Alkaline Phosphatase (ALP)",
      category: "Liver Function (LFT)",
      unit: "U/L",
      min: 44,
      max: 147,
      aliases: ["alp", "alkaline phosphatase", "biliary enzyme", "bone enzyme"],
    },
    {
      key: "lft_ggt",
      name: "Gamma GT (GGT)",
      category: "Liver Function (LFT)",
      unit: "U/L",
      min: 9,
      max: 48,
      aliases: ["ggt", "ggtp", "gamma glutamyl transferase", "alcohol liver"],
    },
    {
      key: "lft_protein_tot",
      name: "Total Protein",
      category: "Liver Function (LFT)",
      unit: "g/dL",
      min: 6.0,
      max: 8.3,
      aliases: ["total protein", "proteins"],
    },
    {
      key: "lft_albumin",
      name: "Serum Albumin",
      category: "Liver Function (LFT)",
      unit: "g/dL",
      min: 3.5,
      max: 5.0,
      aliases: ["albumin", "hypoalbuminemia", "edema"],
    },
    {
      key: "lft_globulin",
      name: "Serum Globulin",
      category: "Liver Function (LFT)",
      unit: "g/dL",
      min: 2.0,
      max: 3.5,
      aliases: ["globulin", "immune proteins"],
    },
    {
      key: "lft_ag_ratio",
      name: "A/G Ratio (Albumin / Globulin)",
      category: "Liver Function (LFT)",
      unit: "Ratio",
      min: 1.1,
      max: 2.2,
      aliases: ["a/g ratio", "ag ratio", "albumin globulin ratio"],
    },
    {
      key: "lft_ldh",
      name: "Serum LDH (Lactate Dehydrogenase)",
      category: "Liver Function (LFT)",
      unit: "U/L",
      min: 140,
      max: 280,
      aliases: ["ldh", "lactate dehydrogenase", "tissue necrosis marker"],
    },

    // ==========================================
    // 5. KIDNEY FUNCTION & RENAL PROFILE (KFT/RFT)
    // ==========================================
    {
      key: "kft_panel",
      name: "Kidney Function Test (KFT / RFT Profile)",
      category: "Kidney Function (KFT)",
      unit: "Profile",
      min: null,
      max: null,
      aliases: ["kft", "rft", "renal panel", "kidney profile"],
    },
    {
      key: "kft_creatinine",
      name: "Serum Creatinine",
      category: "Kidney Function (KFT)",
      unit: "mg/dL",
      min: 0.6,
      max: 1.2,
      aliases: ["creatinine", "creat", "kidney failure", "renal function"],
    },
    {
      key: "kft_urea",
      name: "Blood Urea",
      category: "Kidney Function (KFT)",
      unit: "mg/dL",
      min: 15,
      max: 40,
      aliases: ["blood urea", "urea", "uremia"],
    },
    {
      key: "kft_bun",
      name: "Blood Urea Nitrogen (BUN)",
      category: "Kidney Function (KFT)",
      unit: "mg/dL",
      min: 7,
      max: 20,
      aliases: ["bun", "urea nitrogen"],
    },
    {
      key: "kft_egfr",
      name: "Estimated GFR (eGFR - CKD-EPI)",
      category: "Kidney Function (KFT)",
      unit: "mL/min/1.73m2",
      min: 90,
      max: 140,
      aliases: ["egfr", "gfr", "creatinine clearance", "ckd staging"],
    },
    {
      key: "kft_uacr",
      name: "Urine Albumin to Creatinine Ratio (UACR)",
      category: "Kidney Function (KFT)",
      unit: "mg/g",
      min: 0,
      max: 30,
      aliases: ["uacr", "spot uacr", "albuminuria", "microalbumin creatinine"],
    },
    {
      key: "kft_24hr_protein",
      name: "24-Hour Urine Protein",
      category: "Kidney Function (KFT)",
      unit: "mg/24hr",
      min: 0,
      max: 150,
      aliases: ["24hr urine protein", "proteinuria", "nephrotic"],
    },
    {
      key: "kft_cystatin_c",
      name: "Serum Cystatin C",
      category: "Kidney Function (KFT)",
      unit: "mg/L",
      min: 0.55,
      max: 1.05,
      aliases: ["cystatin c", "sensitive gfr"],
    },

    // ==========================================
    // 6. LIPID PROFILE & CARDIAC BIOMARKERS
    // ==========================================
    {
      key: "lipid_panel",
      name: "Lipid Profile (Complete Panel)",
      category: "Lipid Profile",
      unit: "Profile",
      min: null,
      max: null,
      aliases: ["lipid profile", "cholesterol panel", "lipids", "cardiac risk"],
    },
    {
      key: "lipid_cholesterol_total",
      name: "Total Cholesterol",
      category: "Lipid Profile",
      unit: "mg/dL",
      min: 125,
      max: 200,
      aliases: ["cholesterol", "total cholesterol", "hypercholesterolemia"],
    },
    {
      key: "lipid_triglycerides",
      name: "Serum Triglycerides (TG)",
      category: "Lipid Profile",
      unit: "mg/dL",
      min: 50,
      max: 150,
      aliases: ["triglycerides", "tg", "hypertriglyceridemia"],
    },
    {
      key: "lipid_hdl",
      name: "HDL Cholesterol (Good Cholesterol)",
      category: "Lipid Profile",
      unit: "mg/dL",
      min: 40,
      max: 60,
      aliases: ["hdl", "good cholesterol", "high density lipoprotein"],
    },
    {
      key: "lipid_ldl",
      name: "LDL Cholesterol (Direct / Calculated)",
      category: "Lipid Profile",
      unit: "mg/dL",
      min: 0,
      max: 100,
      aliases: ["ldl", "bad cholesterol", "low density lipoprotein"],
    },
    {
      key: "lipid_vldl",
      name: "VLDL Cholesterol",
      category: "Lipid Profile",
      unit: "mg/dL",
      min: 5,
      max: 30,
      aliases: ["vldl"],
    },
    {
      key: "lipid_non_hdl",
      name: "Non-HDL Cholesterol",
      category: "Lipid Profile",
      unit: "mg/dL",
      min: 0,
      max: 130,
      aliases: ["non hdl", "atherogenic cholesterol"],
    },
    {
      key: "lipid_tc_hdl_ratio",
      name: "Total Cholesterol / HDL Ratio",
      category: "Lipid Profile",
      unit: "Ratio",
      min: 0,
      max: 4.5,
      aliases: ["cholesterol hdl ratio", "tc/hdl"],
    },
    {
      key: "card_trop_i",
      name: "Troponin-I (High Sensitivity - hs-cTnI)",
      category: "Cardiac Markers",
      unit: "pg/mL",
      min: 0,
      max: 14,
      aliases: [
        "troponin",
        "troponin i",
        "hs ctnI",
        "heart attack",
        "myocardial infarction",
      ],
    },
    {
      key: "card_trop_t",
      name: "Troponin-T (High Sensitivity - hs-cTnT)",
      category: "Cardiac Markers",
      unit: "pg/mL",
      min: 0,
      max: 14,
      aliases: ["troponin t", "hs ctnt", "cardiac necrosis"],
    },
    {
      key: "card_cpk_total",
      name: "CPK Total (Creatine Phosphokinase)",
      category: "Cardiac Markers",
      unit: "U/L",
      min: 30,
      max: 200,
      aliases: [
        "cpk",
        "ck",
        "creatine kinase",
        "rhabdomyolysis",
        "muscle enzyme",
      ],
    },
    {
      key: "card_ck_mb",
      name: "CK-MB (Creatine Kinase-MB)",
      category: "Cardiac Markers",
      unit: "ng/mL",
      min: 0,
      max: 5.0,
      aliases: ["ck mb", "ck-mb", "cpk mb"],
    },
    {
      key: "card_nt_probnp",
      name: "NT-proBNP (N-Terminal pro-B-type Natriuretic Peptide)",
      category: "Cardiac Markers",
      unit: "pg/mL",
      min: 0,
      max: 125,
      aliases: ["bnp", "nt probnp", "heart failure marker", "dyspnea"],
    },
    {
      key: "card_homocysteine",
      name: "Serum Homocysteine",
      category: "Cardiac Markers",
      unit: "umol/L",
      min: 5,
      max: 15,
      aliases: ["homocysteine", "vascular risk", "thrombophilia"],
    },
    {
      key: "card_lp_a",
      name: "Lipoprotein (a) [Lp(a)]",
      category: "Cardiac Markers",
      unit: "mg/dL",
      min: 0,
      max: 30,
      aliases: ["lp(a)", "lipoprotein a", "genetic cardiac risk"],
    },
    {
      key: "card_apo_a1",
      name: "Apolipoprotein A1 (Apo-A1)",
      category: "Cardiac Markers",
      unit: "mg/dL",
      min: 119,
      max: 240,
      aliases: ["apo a1", "apolipoprotein a1"],
    },
    {
      key: "card_apo_b",
      name: "Apolipoprotein B (Apo-B)",
      category: "Cardiac Markers",
      unit: "mg/dL",
      min: 55,
      max: 130,
      aliases: ["apo b", "apolipoprotein b"],
    },

    // ==========================================
    // 7. THYROID & ENDOCRINE PROFILE
    // ==========================================
    {
      key: "thy_profile",
      name: "Thyroid Profile (Total T3, T4, TSH)",
      category: "Thyroid Profile",
      unit: "Profile",
      min: null,
      max: null,
      aliases: ["thyroid profile", "tft", "t3 t4 tsh"],
    },
    {
      key: "thy_tsh",
      name: "TSH (Ultrasensitive Thyroid Stimulating Hormone)",
      category: "Thyroid Profile",
      unit: "uIU/mL",
      min: 0.4,
      max: 4.5,
      aliases: ["tsh", "thyrotropin", "hypothyroid", "hyperthyroid"],
    },
    {
      key: "thy_ft3",
      name: "Free T3 (FT3)",
      category: "Thyroid Profile",
      unit: "pg/mL",
      min: 2.0,
      max: 4.4,
      aliases: ["ft3", "free triiodothyronine"],
    },
    {
      key: "thy_ft4",
      name: "Free T4 (FT4)",
      category: "Thyroid Profile",
      unit: "ng/dL",
      min: 0.8,
      max: 1.8,
      aliases: ["ft4", "free thyroxine"],
    },
    {
      key: "thy_total_t3",
      name: "Total Triiodothyronine (T3)",
      category: "Thyroid Profile",
      unit: "ng/dL",
      min: 80,
      max: 200,
      aliases: ["total t3", "t3"],
    },
    {
      key: "thy_total_t4",
      name: "Total Thyroxine (T4)",
      category: "Thyroid Profile",
      unit: "ug/dL",
      min: 5.0,
      max: 12.0,
      aliases: ["total t4", "t4"],
    },
    {
      key: "thy_anti_tpo",
      name: "Anti-TPO Antibodies (Thyroid Peroxidase)",
      category: "Thyroid Profile",
      unit: "IU/mL",
      min: 0,
      max: 34,
      aliases: [
        "anti tpo",
        "hashimotos",
        "thyroid antibodies",
        "autoimmune thyroid",
      ],
    },
    {
      key: "thy_anti_tg",
      name: "Anti-Thyroglobulin Antibodies (Anti-Tg)",
      category: "Thyroid Profile",
      unit: "IU/mL",
      min: 0,
      max: 115,
      aliases: ["anti tg", "thyroglobulin antibodies"],
    },
    {
      key: "thy_pth",
      name: "Intact Parathyroid Hormone (iPTH)",
      category: "Thyroid Profile",
      unit: "pg/mL",
      min: 15,
      max: 65,
      aliases: [
        "pth",
        "parathyroid",
        "hyperparathyroidism",
        "calcium regulation",
      ],
    },
    {
      key: "endo_cortisol_am",
      name: "Serum Cortisol (Morning 8 AM)",
      category: "Hormones & Endocrine",
      unit: "ug/dL",
      min: 6.2,
      max: 19.4,
      aliases: [
        "cortisol",
        "morning cortisol",
        "stress hormone",
        "adrenal",
        "cushing",
      ],
    },
    {
      key: "endo_cortisol_pm",
      name: "Serum Cortisol (Evening 4 PM)",
      category: "Hormones & Endocrine",
      unit: "ug/dL",
      min: 2.3,
      max: 11.9,
      aliases: ["cortisol pm", "evening cortisol"],
    },
    {
      key: "endo_acth",
      name: "Plasma ACTH (Adrenocorticotropic Hormone)",
      category: "Hormones & Endocrine",
      unit: "pg/mL",
      min: 7.2,
      max: 63.3,
      aliases: ["acth", "adrenocorticotropic", "pituitary hormone"],
    },
    {
      key: "endo_prolactin",
      name: "Serum Prolactin",
      category: "Hormones & Endocrine",
      unit: "ng/mL",
      min: 3.0,
      max: 25.0,
      aliases: ["prolactin", "hyperprolactinemia", "galactorrhea", "pituitary"],
    },
    {
      key: "endo_testosterone_total",
      name: "Serum Testosterone (Total)",
      category: "Hormones & Endocrine",
      unit: "ng/dL",
      min: 240,
      max: 850,
      aliases: [
        "testosterone",
        "total testosterone",
        "androgen",
        "hypogonadism",
        "male hormone",
      ],
    },
    {
      key: "endo_testosterone_free",
      name: "Free Testosterone",
      category: "Hormones & Endocrine",
      unit: "pg/mL",
      min: 4.5,
      max: 25.0,
      aliases: ["free testosterone", "bioavailable testosterone"],
    },
    {
      key: "endo_dhea_s",
      name: "DHEA-S (Dehydroepiandrosterone Sulfate)",
      category: "Hormones & Endocrine",
      unit: "ug/dL",
      min: 80,
      max: 420,
      aliases: ["dhea", "dhea-s", "pcos androgen", "adrenal androgen"],
    },
    {
      key: "endo_amh",
      name: "Anti-Mullerian Hormone (AMH)",
      category: "Hormones & Endocrine",
      unit: "ng/mL",
      min: 1.0,
      max: 4.0,
      aliases: ["amh", "ovarian reserve", "fertility", "pcos"],
    },
    {
      key: "endo_fsh",
      name: "FSH (Follicle Stimulating Hormone)",
      category: "Hormones & Endocrine",
      unit: "mIU/mL",
      min: 1.5,
      max: 12.4,
      aliases: ["fsh", "gonadotropin", "ovulation", "menopause", "fertility"],
    },
    {
      key: "endo_lh",
      name: "LH (Luteinizing Hormone)",
      category: "Hormones & Endocrine",
      unit: "mIU/mL",
      min: 1.7,
      max: 8.6,
      aliases: ["lh", "luteinizing hormone", "pcos ratio"],
    },
    {
      key: "endo_estradiol",
      name: "Serum Estradiol (E2)",
      category: "Hormones & Endocrine",
      unit: "pg/mL",
      min: 20,
      max: 350,
      aliases: ["estrogen", "estradiol", "e2", "female hormone"],
    },
    {
      key: "endo_progesterone",
      name: "Serum Progesterone",
      category: "Hormones & Endocrine",
      unit: "ng/mL",
      min: 0.1,
      max: 25.0,
      aliases: ["progesterone", "corpus luteum", "pregnancy hormone"],
    },
    {
      key: "endo_beta_hcg",
      name: "Beta-hCG (Total / Quantitative)",
      category: "Hormones & Endocrine",
      unit: "mIU/mL",
      min: 0,
      max: 5,
      aliases: [
        "hcg",
        "beta hcg",
        "pregnancy test quantitative",
        "ectopic pregnancy",
      ],
    },
    {
      key: "endo_growth_hormone",
      name: "Serum Growth Hormone (GH)",
      category: "Hormones & Endocrine",
      unit: "ng/mL",
      min: 0.05,
      max: 6.0,
      aliases: ["growth hormone", "gh", "acromegaly", "short stature"],
    },
    {
      key: "endo_igf_1",
      name: "IGF-1 (Somatomedin-C)",
      category: "Hormones & Endocrine",
      unit: "ng/mL",
      min: 115,
      max: 300,
      aliases: ["igf 1", "somatomedin", "growth hormone axis"],
    },
    {
      key: "endo_17_ohp",
      name: "17-Hydroxyprogesterone (17-OHP)",
      category: "Hormones & Endocrine",
      unit: "ng/dL",
      min: 20,
      max: 200,
      aliases: ["17 ohp", "congenital adrenal hyperplasia", "cah"],
    },

    // ==========================================
    // 8. VITAMINS, IRON & MINERAL DEFICIENCIES
    // ==========================================
    {
      key: "vit_d3",
      name: "Vitamin D3 (25-Hydroxy Cholecalciferol)",
      category: "Vitamins & Minerals",
      unit: "ng/mL",
      min: 30.0,
      max: 100.0,
      aliases: [
        "vitamin d",
        "vit d3",
        "25 oh vit d",
        "bone health",
        "deficiency",
      ],
    },
    {
      key: "vit_b12",
      name: "Vitamin B12 (Cyanocobalamin)",
      category: "Vitamins & Minerals",
      unit: "pg/mL",
      min: 211,
      max: 911,
      aliases: [
        "vitamin b12",
        "vit b12",
        "cobalamin",
        "neuropathy",
        "megaloblastic",
      ],
    },
    {
      key: "vit_folic_acid",
      name: "Serum Folic Acid (Folate)",
      category: "Vitamins & Minerals",
      unit: "ng/mL",
      min: 4.0,
      max: 20.0,
      aliases: [
        "folic acid",
        "folate",
        "macrocytic anemia",
        "pregnancy vitamin",
      ],
    },
    {
      key: "vit_iron_profile",
      name: "Iron Studies & TIBC Profile",
      category: "Vitamins & Minerals",
      unit: "Profile",
      min: null,
      max: null,
      aliases: ["iron profile", "iron studies", "anemia workup"],
    },
    {
      key: "vit_serum_iron",
      name: "Serum Iron",
      category: "Vitamins & Minerals",
      unit: "ug/dL",
      min: 60,
      max: 170,
      aliases: ["iron", "serum iron", "fe"],
    },
    {
      key: "vit_tibc",
      name: "Total Iron Binding Capacity (TIBC)",
      category: "Vitamins & Minerals",
      unit: "ug/dL",
      min: 250,
      max: 425,
      aliases: ["tibc", "iron binding capacity"],
    },
    {
      key: "vit_uibc",
      name: "Unsaturated Iron Binding Capacity (UIBC)",
      category: "Vitamins & Minerals",
      unit: "ug/dL",
      min: 155,
      max: 355,
      aliases: ["uibc"],
    },
    {
      key: "vit_transferrin_sat",
      name: "Transferrin Saturation (%)",
      category: "Vitamins & Minerals",
      unit: "%",
      min: 20,
      max: 50,
      aliases: ["transferrin saturation", "iron saturation", "tsat"],
    },
    {
      key: "vit_ferritin",
      name: "Serum Ferritin",
      category: "Vitamins & Minerals",
      unit: "ng/mL",
      min: 30,
      max: 300,
      aliases: [
        "ferritin",
        "iron stores",
        "hemochromatosis",
        "acute phase reactant",
      ],
    },
    {
      key: "vit_zinc",
      name: "Serum Zinc",
      category: "Vitamins & Minerals",
      unit: "ug/dL",
      min: 70,
      max: 120,
      aliases: ["zinc", "trace element", "immunity mineral", "hair loss"],
    },
    {
      key: "vit_copper",
      name: "Serum Copper",
      category: "Vitamins & Minerals",
      unit: "ug/dL",
      min: 70,
      max: 140,
      aliases: ["copper", "wilsons disease", "ceruloplasmin"],
    },
    {
      key: "vit_ceruloplasmin",
      name: "Serum Ceruloplasmin",
      category: "Vitamins & Minerals",
      unit: "mg/dL",
      min: 20,
      max: 60,
      aliases: ["ceruloplasmin", "copper protein"],
    },

    // ==========================================
    // 9. FEVER & INFECTIOUS DISEASE SEROLOGY
    // ==========================================
    {
      key: "inf_crp",
      name: "C-Reactive Protein (CRP - Quantitative)",
      category: "Infectious & Serology",
      unit: "mg/L",
      min: 0,
      max: 5.0,
      aliases: [
        "crp",
        "c reactive protein",
        "inflammation marker",
        "infection",
      ],
    },
    {
      key: "inf_hscrp",
      name: "High Sensitivity CRP (hs-CRP)",
      category: "Infectious & Serology",
      unit: "mg/L",
      min: 0,
      max: 1.0,
      aliases: ["hs crp", "hscrp", "cardiac inflammation"],
    },
    {
      key: "inf_procalcitonin",
      name: "Procalcitonin (PCT)",
      category: "Infectious & Serology",
      unit: "ng/mL",
      min: 0,
      max: 0.5,
      aliases: ["pct", "procalcitonin", "bacterial sepsis", "icu infection"],
    },
    {
      key: "inf_widal",
      name: "Widal Slide / Tube Agglutination (Typhoid)",
      category: "Infectious & Serology",
      unit: "Titre",
      min: null,
      max: null,
      aliases: ["widal", "typhoid", "enteric fever", "salmonella"],
    },
    {
      key: "inf_typhidot",
      name: "Typhidot (IgM & IgG Antibodies)",
      category: "Infectious & Serology",
      unit: "Qualitative",
      min: null,
      max: null,
      aliases: ["typhidot", "typhoid antibody", "salmonella typhi"],
    },
    {
      key: "inf_dengue_ns1",
      name: "Dengue NS1 Antigen (Rapid / ELISA)",
      category: "Infectious & Serology",
      unit: "Qualitative",
      min: null,
      max: null,
      aliases: ["dengue ns1", "ns1", "early dengue", "mosquito fever"],
    },
    {
      key: "inf_dengue_serology",
      name: "Dengue Serology (IgM & IgG Antibodies)",
      category: "Infectious & Serology",
      unit: "Qualitative",
      min: null,
      max: null,
      aliases: ["dengue igm", "dengue igg", "dengue antibody"],
    },
    {
      key: "inf_malaria_antigen",
      name: "Malaria Antigen Rapid Card (Pv / Pf)",
      category: "Infectious & Serology",
      unit: "Qualitative",
      min: null,
      max: null,
      aliases: [
        "malaria",
        "mp antigen",
        "plasmodium vivax",
        "plasmodium falciparum",
      ],
    },
    {
      key: "inf_chikungunya_igm",
      name: "Chikungunya IgM Antibody",
      category: "Infectious & Serology",
      unit: "Qualitative",
      min: null,
      max: null,
      aliases: ["chikungunya", "chikingunya", "joint fever"],
    },
    {
      key: "inf_leptospira_igm",
      name: "Leptospira IgM Antibodies",
      category: "Infectious & Serology",
      unit: "Qualitative",
      min: null,
      max: null,
      aliases: ["leptospira", "weils disease", "monsoon fever"],
    },
    {
      key: "inf_scrub_typhus",
      name: "Scrub Typhus IgM Antibodies",
      category: "Infectious & Serology",
      unit: "Qualitative",
      min: null,
      max: null,
      aliases: [
        "scrub typhus",
        "orientia",
        "mite borne typhus",
        "eschar fever",
      ],
    },
    {
      key: "inf_blood_cs",
      name: "Blood Culture & Sensitivity (Aerobic/Anaerobic)",
      category: "Infectious & Serology",
      unit: "Culture",
      min: null,
      max: null,
      aliases: ["blood culture", "blood c/s", "sepsis culture", "bacteremia"],
    },
    {
      key: "inf_urine_cs",
      name: "Urine Culture & Sensitivity (Urine C/S)",
      category: "Infectious & Serology",
      unit: "Culture",
      min: null,
      max: null,
      aliases: [
        "urine culture",
        "urine c/s",
        "uti culture",
        "antibiotic sensitivity",
      ],
    },
    {
      key: "inf_mantoux",
      name: "Mantoux Test (Tuberculin Skin Test - PPD)",
      category: "Infectious & Serology",
      unit: "mm induration",
      min: 0,
      max: 10,
      aliases: ["mantoux", "ppd", "tuberculin", "tb skin test"],
    },
    {
      key: "inf_tb_gold",
      name: "TB Gold / QuantiFERON (IGRA - Interferon Gamma)",
      category: "Infectious & Serology",
      unit: "IU/mL",
      min: 0,
      max: 0.35,
      aliases: ["tb gold", "quantiferon", "igra", "latent tb"],
    },
    {
      key: "inf_sputum_afb",
      name: "Sputum for Acid Fast Bacilli (AFB Smear)",
      category: "Infectious & Serology",
      unit: "Microscopy",
      min: null,
      max: null,
      aliases: ["sputum afb", "afb smear", "tuberculosis smear", "zn stain"],
    },
    {
      key: "inf_gene_xpert",
      name: "GeneXpert MTB/RIF (CBNAAT)",
      category: "Infectious & Serology",
      unit: "PCR Assay",
      min: null,
      max: null,
      aliases: ["cbnaat", "genexpert", "mtb pcr", "rifampicin resistance"],
    },

    // ==========================================
    // 10. VIRAL MARKERS & STD SCREENING
    // ==========================================
    {
      key: "viral_hiv",
      name: "HIV I & II (Antibody & p24 Antigen 4th Gen)",
      category: "Viral & STD Markers",
      unit: "Qualitative",
      min: null,
      max: null,
      aliases: ["hiv", "aids screening", "elisa hiv", "retro"],
    },
    {
      key: "viral_hbsag",
      name: "HBsAg (Hepatitis B Surface Antigen)",
      category: "Viral & STD Markers",
      unit: "Qualitative",
      min: null,
      max: null,
      aliases: ["hbsag", "hepatitis b", "australia antigen", "hbv"],
    },
    {
      key: "viral_anti_hbs",
      name: "Anti-HBs Antibody Titre (Hep B Immunity)",
      category: "Viral & STD Markers",
      unit: "mIU/mL",
      min: 10,
      max: 1000,
      aliases: ["anti hbs", "hepatitis b vaccine titre", "hbv immunity"],
    },
    {
      key: "viral_hcv",
      name: "HCV (Hepatitis C Total Antibodies)",
      category: "Viral & STD Markers",
      unit: "Qualitative",
      min: null,
      max: null,
      aliases: ["hcv", "anti hcv", "hepatitis c"],
    },
    {
      key: "viral_vdrl",
      name: "VDRL / RPR (Syphilis Screening)",
      category: "Viral & STD Markers",
      unit: "Qualitative",
      min: null,
      max: null,
      aliases: ["vdrl", "rpr", "syphilis", "treponema"],
    },
    {
      key: "viral_tpha",
      name: "TPHA (Treponema Pallidum Hemagglutination)",
      category: "Viral & STD Markers",
      unit: "Titre",
      min: null,
      max: null,
      aliases: ["tpha", "syphilis confirmatory"],
    },
    {
      key: "viral_hav_igm",
      name: "Hepatitis A Virus (HAV IgM)",
      category: "Viral & STD Markers",
      unit: "Qualitative",
      min: null,
      max: null,
      aliases: ["hav igm", "acute hepatitis a", "viral jaundice"],
    },
    {
      key: "viral_hev_igm",
      name: "Hepatitis E Virus (HEV IgM)",
      category: "Viral & STD Markers",
      unit: "Qualitative",
      min: null,
      max: null,
      aliases: ["hev igm", "acute hepatitis e", "waterborne hepatitis"],
    },
    {
      key: "viral_hsv_1_2",
      name: "Herpes Simplex Virus (HSV 1 & 2 IgG/IgM)",
      category: "Viral & STD Markers",
      unit: "Index",
      min: 0,
      max: 0.9,
      aliases: ["hsv", "herpes", "cold sores", "genital herpes"],
    },

    // ==========================================
    // 11. IMMUNOLOGY, ALLERGY & AUTOIMMUNE
    // ==========================================
    {
      key: "imm_ra_factor",
      name: "Rheumatoid Factor (RA / RF - Quantitative)",
      category: "Immunology & Autoimmune",
      unit: "IU/mL",
      min: 0,
      max: 14,
      aliases: ["ra factor", "rf", "rheumatoid arthritis", "joint swelling"],
    },
    {
      key: "imm_anti_ccp",
      name: "Anti-CCP Antibodies (Cyclic Citrullinated Peptide)",
      category: "Immunology & Autoimmune",
      unit: "U/mL",
      min: 0,
      max: 20,
      aliases: ["anti ccp", "citrullinated peptide", "ra confirmatory"],
    },
    {
      key: "imm_ana_ifa",
      name: "ANA by IFA (Antinuclear Antibodies)",
      category: "Immunology & Autoimmune",
      unit: "Titre/Pattern",
      min: null,
      max: null,
      aliases: ["ana", "antinuclear", "lupus", "sle", "ifa pattern"],
    },
    {
      key: "imm_ana_profile",
      name: "ANA Profile / Blot (16-Parameter Immunoblot)",
      category: "Immunology & Autoimmune",
      unit: "Immunoblot",
      min: null,
      max: null,
      aliases: [
        "ana profile",
        "dsdna",
        "smith antibody",
        "ro",
        "la",
        "scl 70",
        "jo 1",
      ],
    },
    {
      key: "imm_dsdna",
      name: "Anti-dsDNA Antibodies",
      category: "Immunology & Autoimmune",
      unit: "IU/mL",
      min: 0,
      max: 25,
      aliases: ["dsdna", "double stranded dna", "lupus flare"],
    },
    {
      key: "imm_hla_b27",
      name: "HLA-B27 by Flow Cytometry / PCR",
      category: "Immunology & Autoimmune",
      unit: "Qualitative",
      min: null,
      max: null,
      aliases: [
        "hla b27",
        "ankylosing spondylitis",
        "back pain genetic",
        "sacroiliitis",
      ],
    },
    {
      key: "imm_aso_titre",
      name: "ASO Titre (Anti-Streptolysin O)",
      category: "Immunology & Autoimmune",
      unit: "IU/mL",
      min: 0,
      max: 200,
      aliases: ["aso", "aso titre", "strep infection", "rheumatic fever"],
    },
    {
      key: "imm_ige_total",
      name: "Total Serum IgE (Immunoglobulin E)",
      category: "Immunology & Autoimmune",
      unit: "IU/mL",
      min: 0,
      max: 100,
      aliases: [
        "ige",
        "total ige",
        "allergy marker",
        "atopy",
        "allergic rhinitis",
      ],
    },
    {
      key: "imm_anti_ttg_iga",
      name: "Anti-Tissue Transglutaminase IgA (Anti-tTG)",
      category: "Immunology & Autoimmune",
      unit: "U/mL",
      min: 0,
      max: 10,
      aliases: ["ttg", "anti ttg", "celiac disease", "gluten allergy"],
    },
    {
      key: "imm_anca",
      name: "ANCA (p-ANCA & c-ANCA)",
      category: "Immunology & Autoimmune",
      unit: "Titre",
      min: null,
      max: null,
      aliases: ["anca", "p-anca", "c-anca", "vasculitis", "wegeners"],
    },

    // ==========================================
    // 12. TUMOR & ONCOLOGY MARKERS
    // ==========================================
    {
      key: "tumor_psa_total",
      name: "PSA Total (Prostate Specific Antigen)",
      category: "Tumor Markers",
      unit: "ng/mL",
      min: 0,
      max: 4.0,
      aliases: ["psa", "total psa", "prostate cancer", "bph", "prostatitis"],
    },
    {
      key: "tumor_psa_free",
      name: "Free PSA & Free/Total PSA Ratio",
      category: "Tumor Markers",
      unit: "%",
      min: 25,
      max: 100,
      aliases: ["free psa", "psa ratio"],
    },
    {
      key: "tumor_cea",
      name: "Carcinoembryonic Antigen (CEA)",
      category: "Tumor Markers",
      unit: "ng/mL",
      min: 0,
      max: 5.0,
      aliases: ["cea", "colon cancer", "rectal cancer", "gi malignancy"],
    },
    {
      key: "tumor_ca125",
      name: "CA 125 (Ovarian Cancer Marker)",
      category: "Tumor Markers",
      unit: "U/mL",
      min: 0,
      max: 35,
      aliases: [
        "ca 125",
        "ca125",
        "ovarian cancer",
        "endometriosis",
        "pelvic mass",
      ],
    },
    {
      key: "tumor_ca19_9",
      name: "CA 19-9 (Pancreatic & Biliary Marker)",
      category: "Tumor Markers",
      unit: "U/mL",
      min: 0,
      max: 37,
      aliases: [
        "ca 19-9",
        "ca199",
        "pancreatic cancer",
        "cholangiocarcinoma",
        "gallbladder",
      ],
    },
    {
      key: "tumor_ca15_3",
      name: "CA 15-3 (Breast Cancer Marker)",
      category: "Tumor Markers",
      unit: "U/mL",
      min: 0,
      max: 30,
      aliases: ["ca 15-3", "ca153", "breast cancer recurrence"],
    },
    {
      key: "tumor_afp",
      name: "Alpha-Fetoprotein (AFP)",
      category: "Tumor Markers",
      unit: "ng/mL",
      min: 0,
      max: 8.5,
      aliases: ["afp", "alpha fetoprotein", "liver cancer", "hcc", "teratoma"],
    },
    {
      key: "tumor_spep",
      name: "Serum Protein Electrophoresis (SPEP / M-Spike)",
      category: "Tumor Markers",
      unit: "Analysis",
      min: null,
      max: null,
      aliases: ["spep", "m band", "multiple myeloma", "paraprotein"],
    },
    {
      key: "tumor_free_light_chains",
      name: "Serum Free Light Chains (Kappa / Lambda)",
      category: "Tumor Markers",
      unit: "mg/L",
      min: null,
      max: null,
      aliases: ["sflc", "kappa lambda ratio", "myeloma light chains"],
    },

    // ==========================================
    // 13. URINE & STOOL ROUTINE
    // ==========================================
    {
      key: "urine_rm",
      name: "Urine Routine & Microscopy (Urine R/M)",
      category: "Urine & Stool",
      unit: "Complete",
      min: null,
      max: null,
      aliases: ["urine routine", "urinalysis", "urine microscopy", "urine r/m"],
    },
    {
      key: "urine_ph",
      name: "Urine pH",
      category: "Urine & Stool",
      unit: "pH",
      min: 5.0,
      max: 8.0,
      aliases: ["urine ph", "acidic urine"],
    },
    {
      key: "urine_specific_gravity",
      name: "Urine Specific Gravity",
      category: "Urine & Stool",
      unit: "Gravity",
      min: 1.005,
      max: 1.03,
      aliases: ["specific gravity", "sp gravity"],
    },
    {
      key: "urine_pus_cells",
      name: "Urine Pus Cells (Leucocytes)",
      category: "Urine & Stool",
      unit: "/hpf",
      min: 0,
      max: 5,
      aliases: ["pus cells", "urine wbc", "pyuria", "uti pus"],
    },
    {
      key: "urine_rbc",
      name: "Urine RBCs (Red Blood Cells)",
      category: "Urine & Stool",
      unit: "/hpf",
      min: 0,
      max: 2,
      aliases: ["urine rbc", "hematuria", "blood in urine"],
    },
    {
      key: "urine_protein",
      name: "Urine Protein / Albumin",
      category: "Urine & Stool",
      unit: "Dipstick",
      min: null,
      max: null,
      aliases: ["urine protein", "urine albumin", "albuminuria"],
    },
    {
      key: "urine_sugar",
      name: "Urine Sugar / Glucose",
      category: "Urine & Stool",
      unit: "Dipstick",
      min: null,
      max: null,
      aliases: ["urine sugar", "glycosuria"],
    },
    {
      key: "urine_ketones",
      name: "Urine Ketones (Acetoacetate)",
      category: "Urine & Stool",
      unit: "Dipstick",
      min: null,
      max: null,
      aliases: ["urine ketones", "ketonuria", "dka", "diabetic ketoacidosis"],
    },
    {
      key: "urine_bile_salts",
      name: "Urine Bile Salts & Pigments",
      category: "Urine & Stool",
      unit: "Qualitative",
      min: null,
      max: null,
      aliases: ["bile salts", "bile pigments", "obstructive jaundice"],
    },
    {
      key: "urine_upt",
      name: "Urine Pregnancy Test (UPT)",
      category: "Urine & Stool",
      unit: "Qualitative",
      min: null,
      max: null,
      aliases: ["upt", "pregnancy test card", "urine hcg"],
    },
    {
      key: "stool_rm",
      name: "Stool Routine & Microscopy",
      category: "Urine & Stool",
      unit: "Microscopy",
      min: null,
      max: null,
      aliases: ["stool routine", "stool r/m", "ova cyst", "ameba", "giardia"],
    },
    {
      key: "stool_occult_blood",
      name: "Stool Occult Blood (FOBT)",
      category: "Urine & Stool",
      unit: "Qualitative",
      min: null,
      max: null,
      aliases: [
        "fobt",
        "stool occult blood",
        "gi bleeding",
        "colon cancer screening",
      ],
    },
    {
      key: "stool_calprotectin",
      name: "Fecal Calprotectin",
      category: "Urine & Stool",
      unit: "ug/g",
      min: 0,
      max: 50,
      aliases: ["calprotectin", "ibd", "crohns", "ulcerative colitis"],
    },

    // ==========================================
    // 14. PANCREATIC & GASTROINTESTINAL
    // ==========================================
    {
      key: "gi_amylase",
      name: "Serum Amylase",
      category: "Bio Chemistry",
      unit: "U/L",
      min: 28,
      max: 100,
      aliases: ["amylase", "acute pancreatitis", "abdominal pain enzyme"],
    },
    {
      key: "gi_lipase",
      name: "Serum Lipase",
      category: "Bio Chemistry",
      unit: "U/L",
      min: 13,
      max: 60,
      aliases: ["lipase", "pancreatitis specific enzyme"],
    },
    {
      key: "gi_h_pylori_antigen",
      name: "H. Pylori Stool Antigen / Serology",
      category: "Infectious & Serology",
      unit: "Qualitative",
      min: null,
      max: null,
      aliases: ["h pylori", "helicobacter", "peptic ulcer", "gastritis"],
    },

    // ==========================================
    // 15. RADIOLOGY & DIAGNOSTIC INVESTIGATIONS
    // ==========================================
    {
      key: "diag_ecg",
      name: "12-Lead Electrocardiogram (ECG)",
      category: "Radiology & Imaging",
      unit: "Report",
      min: null,
      max: null,
      aliases: ["ecg", "ekg", "electrocardiogram", "heart rhythm", "ischemia"],
    },
    {
      key: "diag_echo",
      name: "2D Echocardiography & Color Doppler",
      category: "Radiology & Imaging",
      unit: "Report",
      min: null,
      max: null,
      aliases: [
        "echo",
        "2d echo",
        "echocardiogram",
        "ejection fraction",
        "valves",
      ],
    },
    {
      key: "diag_tmt",
      name: "Treadmill Exercise Stress Test (TMT)",
      category: "Radiology & Imaging",
      unit: "Report",
      min: null,
      max: null,
      aliases: ["tmt", "stress test", "treadmill test", "cardiac stress"],
    },
    {
      key: "diag_cxr",
      name: "Chest X-Ray (PA View)",
      category: "Radiology & Imaging",
      unit: "Report",
      min: null,
      max: null,
      aliases: [
        "cxr",
        "chest x ray",
        "chest radiograph",
        "lungs",
        "cardiomegaly",
      ],
    },
    {
      key: "diag_usg_abdomen",
      name: "USG Whole Abdomen & Pelvis",
      category: "Radiology & Imaging",
      unit: "Report",
      min: null,
      max: null,
      aliases: [
        "usg abdomen",
        "ultrasound abdomen",
        "sonography abdomen",
        "fatty liver usg",
      ],
    },
    {
      key: "diag_usg_kub",
      name: "USG KUB (Kidney, Ureter, Bladder)",
      category: "Radiology & Imaging",
      unit: "Report",
      min: null,
      max: null,
      aliases: ["usg kub", "kidney ultrasound", "renal calculi", "stone"],
    },
    {
      key: "diag_usg_neck",
      name: "USG Neck & Thyroid",
      category: "Radiology & Imaging",
      unit: "Report",
      min: null,
      max: null,
      aliases: ["usg thyroid", "neck ultrasound", "thyroid nodule"],
    },
    {
      key: "diag_ct_brain",
      name: "CT Brain (Plain / Contrast)",
      category: "Radiology & Imaging",
      unit: "Report",
      min: null,
      max: null,
      aliases: ["ct brain", "ct head", "stroke ct", "head injury"],
    },
    {
      key: "diag_hrct_chest",
      name: "HRCT Chest (High-Resolution CT)",
      category: "Radiology & Imaging",
      unit: "Report",
      min: null,
      max: null,
      aliases: [
        "hrct",
        "hrct chest",
        "interstitial lung disease",
        "corads",
        "covid lung",
      ],
    },
    {
      key: "diag_mri_brain",
      name: "MRI Brain with Diffusion (DWI)",
      category: "Radiology & Imaging",
      unit: "Report",
      min: null,
      max: null,
      aliases: ["mri brain", "brain mri", "infarct mri", "seizure mri"],
    },
    {
      key: "diag_mri_spine",
      name: "MRI Spine (Lumbar / Cervical)",
      category: "Radiology & Imaging",
      unit: "Report",
      min: null,
      max: null,
      aliases: ["mri spine", "lumbar spine mri", "disc prolapse", "sciatica"],
    },
    {
      key: "diag_fibroscan",
      name: "FibroScan (Liver Transient Elastography)",
      category: "Radiology & Imaging",
      unit: "kPa / dB/m",
      min: null,
      max: 7.0,
      aliases: [
        "fibroscan",
        "liver stiffness",
        "steatosis",
        "cap score",
        "cirrhosis",
      ],
    },
    {
      key: "diag_pft",
      name: "Pulmonary Function Test (PFT / Spirometry)",
      category: "Radiology & Imaging",
      unit: "Report",
      min: null,
      max: null,
      aliases: ["pft", "spirometry", "fev1", "asthma test", "copd test"],
    },
    {
      key: "diag_dexa",
      name: "DEXA Bone Mineral Density (BMD)",
      category: "Radiology & Imaging",
      unit: "T-Score",
      min: -1.0,
      max: null,
      aliases: ["dexa", "bmd", "bone density", "osteopenia", "osteoporosis"],
    },
  ];

  const CATEGORY_ORDER = [
    "Haematology",
    "Diabetes & Glycemic",
    "Bio Chemistry",
    "Liver Function (LFT)",
    "Kidney Function (KFT)",
    "Lipid Profile",
    "Thyroid Profile",
    "Cardiac Markers",
    "Hormones & Endocrine",
    "Vitamins & Minerals",
    "Infectious & Serology",
    "Viral & STD Markers",
    "Immunology & Autoimmune",
    "Tumor Markers",
    "Urine & Stool",
    "Radiology & Imaging",
    "Other Investigations",
  ];

  // Utility to generate a clean, safe input ID
  function slugifyTestName(name) {
    if (!name) return "custom_" + Date.now();
    return (
      "cust_" +
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .substring(0, 32)
    );
  }

  // Fast fuzzy search across Test Name, Category, and Aliases
  function searchMedicalTestCatalog(query) {
    const q = (query || "").trim().toLowerCase();
    if (!q) return TEST_DATABASE;

    return TEST_DATABASE.filter((test) => {
      if (test.name.toLowerCase().includes(q)) return true;
      if (test.category.toLowerCase().includes(q)) return true;
      if (test.key.toLowerCase().includes(q)) return true;
      if (
        test.aliases &&
        test.aliases.some((alias) => alias.includes(q) || q.includes(alias))
      ) {
        return true;
      }
      return false;
    });
  }

  // Find a test in the catalog by key
  function getTestByKey(key) {
    return TEST_DATABASE.find((t) => t.key === key) || null;
  }

  // Find a test by exact name (case insensitive)
  function getTestByName(name) {
    if (!name) return null;
    const lower = name.trim().toLowerCase();
    return TEST_DATABASE.find((t) => t.name.toLowerCase() === lower) || null;
  }

  // Reconstruct patient custom definitions from historical records
  function reconstructPatientCustomDefs(labRecords) {
    if (!window.currentPatientCustomDefs) window.currentPatientCustomDefs = {};
    (labRecords || []).forEach((rec) => {
      if (rec.results && rec.results._custom_defs) {
        Object.assign(
          window.currentPatientCustomDefs,
          rec.results._custom_defs,
        );
      }
      if (rec.results) {
        Object.keys(rec.results).forEach((k) => {
          if (k === "_custom_defs") return;
          if (!window.currentPatientCustomDefs[k]) {
            const catTest = getTestByKey(k);
            if (catTest) {
              window.currentPatientCustomDefs[k] = {
                key: catTest.key,
                name: catTest.name,
                category: catTest.category,
                unit: catTest.unit,
                min: catTest.min,
                max: catTest.max,
                isCustom: false,
              };
            }
          }
        });
      }
    });
    return window.currentPatientCustomDefs;
  }

  // Export to window
  window.COMPREHENSIVE_TEST_DATABASE = TEST_DATABASE;
  window.LAB_TEST_CATEGORIES = CATEGORY_ORDER;
  window.searchMedicalTestCatalog = searchMedicalTestCatalog;
  window.getTestByKey = getTestByKey;
  window.getTestByName = getTestByName;
  window.slugifyTestName = slugifyTestName;
  window.reconstructPatientCustomDefs = reconstructPatientCustomDefs;
})();

window.currentPatientCustomDefs = {};
window.selectedCatalogCategory = "";

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

window.renderDynamicPatientTests = function () {
  const section = document.getElementById("dynamic-lab-section");
  const grid = document.getElementById("dynamic-lab-grid");
  const badge = document.getElementById("dynamic-tests-count-badge");
  if (!section || !grid) return;

  const keys = Object.keys(window.currentPatientCustomDefs || {});
  if (keys.length === 0) {
    section.style.display = "none";
    grid.innerHTML = "";
    if (badge) badge.textContent = "0 Added";
    return;
  }

  section.style.display = "block";
  if (badge) badge.textContent = `${keys.length} Added`;

  grid.innerHTML = keys
    .map((key) => {
      const def = window.currentPatientCustomDefs[key];
      const unitStr = def.unit ? ` (${def.unit})` : "";
      const minAttr =
        def.min !== null && def.min !== undefined && def.min !== ""
          ? ` data-min="${def.min}"`
          : "";
      const maxAttr =
        def.max !== null && def.max !== undefined && def.max !== ""
          ? ` data-max="${def.max}"`
          : "";
      const rangeStr =
        (def.min !== null && def.min !== undefined && def.min !== "") ||
        (def.max !== null && def.max !== undefined && def.max !== "")
          ? `<span style="font-size: 10px; color: #0284c7; font-weight: 700; margin-left: 4px;">[${def.min ?? "-"} - ${def.max ?? "-"}]</span>`
          : "";

      return `
        <div class="lab-input-group" style="position: relative; background: #ffffff; border: 1.5px solid #bae6fd; border-radius: 6px; padding: 7px 9px;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 4px;">
            <label style="font-size: 11.5px; font-weight: 700; color: #0369a1; line-height: 1.25; margin: 0;">
              ${escapeHtml(def.name)}${escapeHtml(unitStr)} ${rangeStr}
            </label>
            <button
              type="button"
              onclick="window.removeCustomTest('${escapeHtml(key)}')"
              title="Remove test from patient profile"
              style="background: none; border: none; color: #94a3b8; cursor: pointer; font-size: 13px; font-weight: 700; padding: 0 0 0 4px; line-height: 1;"
              onmouseover="this.style.color='#ef4444'"
              onmouseout="this.style.color='#94a3b8'"
            >
              ✕
            </button>
          </div>
          <input
            type="${(def.min !== null && def.min !== undefined) || (def.max !== null && def.max !== undefined) ? "number" : "text"}"
            step="any"
            id="lab-${escapeHtml(key)}"
            class="input"
            ${minAttr}
            ${maxAttr}
            placeholder="${escapeHtml(def.unit || "Enter value")}"
            onkeyup="checkRange(this)"
            style="font-size: 13px; height: 32px;"
          />
        </div>
      `;
    })
    .join("");
};

window.openAddTestModal = function () {
  const modal = document.getElementById("add-test-modal");
  if (!modal) return;

  window.toggleCustomTestDrawer(false);
  const searchInput = document.getElementById("add-test-search-input");
  if (searchInput) searchInput.value = "";
  window.selectedCatalogCategory = "";

  window.renderCategoryFilterPills();
  window.renderAddTestModalResults(window.COMPREHENSIVE_TEST_DATABASE || []);

  modal.style.display = "flex";
  if (searchInput) searchInput.focus();
};

window.closeAddTestModal = function () {
  const modal = document.getElementById("add-test-modal");
  if (modal) modal.style.display = "none";
  const curDate = document.getElementById("lab-date")?.value;
  if (curDate) populateLabInputsForDate(curDate);
};

window.toggleCustomTestDrawer = function (forceState) {
  const drawer = document.getElementById("custom-test-drawer");
  const btn = document.getElementById("btn-toggle-custom-test");
  if (!drawer) return;

  const show =
    forceState !== undefined ? forceState : drawer.style.display === "none";
  drawer.style.display = show ? "block" : "none";
  if (btn) btn.style.display = show ? "none" : "block";

  if (show) {
    const searchVal =
      document.getElementById("add-test-search-input")?.value.trim() || "";
    const nameInput = document.getElementById("cust-test-name");
    if (nameInput) {
      if (searchVal) nameInput.value = searchVal;
      nameInput.focus();
    }
  }
};

window.renderCategoryFilterPills = function () {
  const container = document.getElementById("add-test-category-pills");
  if (!container) return;

  const categories = [
    "",
    ...(window.LAB_TEST_CATEGORIES || [
      "Haematology",
      "Diabetes & Glycemic",
      "Bio Chemistry",
      "Liver Function (LFT)",
      "Kidney Function (KFT)",
      "Lipid Profile",
      "Thyroid Profile",
      "Cardiac Markers",
      "Hormones & Endocrine",
      "Vitamins & Minerals",
      "Infectious & Serology",
      "Viral & STD Markers",
      "Immunology & Autoimmune",
      "Tumor Markers",
      "Urine & Stool",
      "Radiology & Imaging",
      "Other Investigations",
    ]),
  ];

  container.innerHTML = categories
    .map((cat) => {
      const isSelected = window.selectedCatalogCategory === cat;
      const label = cat === "" ? "All Categories" : cat;
      const encoded = encodeURIComponent(cat);
      return `
        <button
          type="button"
          onclick="window.filterCatalogByCategory(decodeURIComponent('${encoded}'))"
          style="padding: 4px 11px; border-radius: 12px; font-size: 11px; font-weight: 700; cursor: pointer; border: 1px solid ${isSelected ? "#0284c7" : "#e2e8f0"}; background: ${isSelected ? "#0284c7" : "#ffffff"}; color: ${isSelected ? "#ffffff" : "#475569"}; white-space: nowrap;"
        >
          ${escapeHtml(label)}
        </button>
      `;
    })
    .join("");
};

window.filterCatalogByCategory = function (cat) {
  window.selectedCatalogCategory = cat;
  window.renderCategoryFilterPills();
  const searchInput = document.getElementById("add-test-search-input");
  window.searchAddTestModal(searchInput?.value || "");
};

window.searchAddTestModal = function (query) {
  const q = (query || "").trim().toLowerCase();
  let results = window.searchMedicalTestCatalog
    ? window.searchMedicalTestCatalog(q)
    : [];

  if (window.selectedCatalogCategory) {
    results = results.filter(
      (t) =>
        t.category.toLowerCase() ===
        window.selectedCatalogCategory.toLowerCase(),
    );
  }

  window.renderAddTestModalResults(results, query);
};

window.renderAddTestModalResults = function (tests, query) {
  const container = document.getElementById("add-test-results-container");
  const summaryEl = document.getElementById("add-test-status-summary");
  if (!container) return;

  if (summaryEl) {
    summaryEl.textContent = `Showing ${tests.length} tests ${window.selectedCatalogCategory ? `in ${window.selectedCatalogCategory}` : ""}`;
  }

  const customDefs = window.currentPatientCustomDefs || {};

  if (tests.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 24px 10px; color: #64748b;">
        <p style="margin-bottom: 10px; font-size: 13px;">No tests found matching "${escapeHtml(query || "")}".</p>
        <button
          type="button"
          onclick="window.toggleCustomTestDrawer(true)"
          class="btn"
          style="background: #16a34a; color: white; border: none; font-size: 12px; font-weight: 700; padding: 6px 14px; border-radius: 6px; cursor: pointer;"
        >
          + Create "${escapeHtml(query || "")}" as Custom Test
        </button>
      </div>
    `;
    return;
  }

  container.innerHTML = tests
    .map((test) => {
      const isAdded = Boolean(customDefs[test.key]);
      const rangeStr =
        test.min !== null || test.max !== null
          ? `[Ref: ${test.min ?? "-"} - ${test.max ?? "-"}]`
          : "";
      const unitStr = test.unit ? `(${test.unit})` : "";
      const encodedKey = encodeURIComponent(test.key);

      return `
        <div
          style="display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; border: 1px solid ${isAdded ? "#bae6fd" : "#f1f5f9"}; background: ${isAdded ? "#f0f9ff" : "#ffffff"}; border-radius: 8px; transition: background 0.15s;"
          onmouseover="if(!${isAdded}) this.style.background='#f8fafc'"
          onmouseout="if(!${isAdded}) this.style.background='#ffffff'"
        >
          <div style="display: flex; flex-direction: column; gap: 2px;">
            <div style="display: flex; align-items: center; gap: 6px;">
              <strong style="font-size: 12.5px; color: ${isAdded ? "#0369a1" : "#1e293b"};">${escapeHtml(test.name)}</strong>
              ${unitStr ? `<span style="font-size: 11px; color: #64748b; font-weight: 600;">${escapeHtml(unitStr)}</span>` : ""}
              ${rangeStr ? `<span style="font-size: 10.5px; color: #0284c7; background: #e0f2fe; padding: 1px 6px; border-radius: 4px; font-weight: 700;">${escapeHtml(rangeStr)}</span>` : ""}
            </div>
            <div style="display: flex; align-items: center; gap: 6px;">
              <span style="font-size: 10.5px; color: #64748b; background: #f1f5f9; padding: 1px 6px; border-radius: 4px; font-weight: 600;">${escapeHtml(test.category)}</span>
            </div>
          </div>
          <div>
            ${
              isAdded
                ? `
              <button
                type="button"
                disabled
                class="btn"
                style="background: #e0f2fe; color: #0284c7; border: 1px solid #bae6fd; font-size: 11px; font-weight: 800; padding: 4px 10px; border-radius: 6px; cursor: default;"
              >
                ✓ Added
              </button>
            `
                : `
              <button
                type="button"
                onclick="window.addTestToPatient(decodeURIComponent('${encodedKey}'))"
                class="btn btn-primary"
                style="font-size: 11px; font-weight: 700; padding: 4px 12px; border-radius: 6px;"
              >
                + Add
              </button>
            `
            }
          </div>
        </div>
      `;
    })
    .join("");
};

window.addTestToPatient = function (testKey) {
  const catTest = window.getTestByKey ? window.getTestByKey(testKey) : null;
  if (!catTest) return;

  if (!window.currentPatientCustomDefs) window.currentPatientCustomDefs = {};

  window.currentPatientCustomDefs[testKey] = {
    key: catTest.key,
    name: catTest.name,
    category: catTest.category,
    unit: catTest.unit,
    min: catTest.min,
    max: catTest.max,
    isCustom: false,
  };

  window.renderDynamicPatientTests();
  window.updateChartParameterOptions();

  // Refresh modal list
  const searchInput = document.getElementById("add-test-search-input");
  window.searchAddTestModal(searchInput?.value || "");

  // Smooth scroll to dynamic section
  document
    .getElementById("dynamic-lab-section")
    ?.scrollIntoView({ behavior: "smooth", block: "start" });
};

window.submitCustomTest = function () {
  const name = document.getElementById("cust-test-name")?.value.trim();
  if (!name) return alert("Please enter a test name.");

  const category =
    document.getElementById("cust-test-category")?.value ||
    "Other Investigations";
  const unit = document.getElementById("cust-test-unit")?.value.trim() || "";
  const minVal = document.getElementById("cust-test-min")?.value.trim();
  const maxVal = document.getElementById("cust-test-max")?.value.trim();
  const initVal = document.getElementById("cust-test-val")?.value.trim();

  const min =
    minVal !== "" && !isNaN(parseFloat(minVal)) ? parseFloat(minVal) : null;
  const max =
    maxVal !== "" && !isNaN(parseFloat(maxVal)) ? parseFloat(maxVal) : null;

  const key = window.slugifyTestName
    ? window.slugifyTestName(name)
    : "cust_" + Date.now();

  if (!window.currentPatientCustomDefs) window.currentPatientCustomDefs = {};

  window.currentPatientCustomDefs[key] = {
    key: key,
    name: name,
    category: category,
    unit: unit,
    min: min,
    max: max,
    isCustom: true,
  };

  window.renderDynamicPatientTests();
  window.updateChartParameterOptions();

  // If initial value entered, populate it
  if (initVal !== undefined && initVal !== "") {
    const inputEl = document.getElementById(`lab-${key}`);
    if (inputEl) {
      inputEl.value = initVal;
      checkRange(inputEl);
    }
  }

  // Clear custom drawer inputs
  document.getElementById("cust-test-name").value = "";
  document.getElementById("cust-test-unit").value = "";
  document.getElementById("cust-test-min").value = "";
  document.getElementById("cust-test-max").value = "";
  document.getElementById("cust-test-val").value = "";

  window.toggleCustomTestDrawer(false);
  window.closeAddTestModal();

  const newEl = document.getElementById(`lab-${key}`);
  if (newEl) {
    newEl.focus();
    newEl.scrollIntoView({ behavior: "smooth", block: "center" });
  }
};

window.removeCustomTest = function (testKey) {
  if (
    !window.currentPatientCustomDefs ||
    !window.currentPatientCustomDefs[testKey]
  )
    return;

  const def = window.currentPatientCustomDefs[testKey];
  const confirmRemove = confirm(
    `Remove "${def.name}" from this patient's profile? Historical values will remain saved in past date records.`,
  );
  if (!confirmRemove) return;

  delete window.currentPatientCustomDefs[testKey];
  window.renderDynamicPatientTests();
  window.updateChartParameterOptions();
};

window.updateChartParameterOptions = function () {
  const select = document.getElementById("chart-parameter");
  if (!select) return;

  const existingGroup = document.getElementById("chart-optgroup-dynamic");
  if (existingGroup) existingGroup.remove();

  const customKeys = Object.keys(window.currentPatientCustomDefs || {});
  if (customKeys.length === 0) return;

  const optgroup = document.createElement("optgroup");
  optgroup.id = "chart-optgroup-dynamic";
  optgroup.label = "⭐ Added & Custom Tests";

  let hasNumericCustom = false;
  customKeys.forEach((key) => {
    const def = window.currentPatientCustomDefs[key];
    const hasData = (patientLabData || []).some(
      (l) =>
        l.results &&
        l.results[key] !== undefined &&
        !isNaN(parseFloat(l.results[key])),
    );
    const isNumeric =
      (def.min !== null && def.min !== undefined) ||
      (def.max !== null && def.max !== undefined) ||
      hasData;
    if (isNumeric) {
      const opt = document.createElement("option");
      opt.value = key;
      opt.textContent = `${def.name} ${def.unit ? `(${def.unit})` : ""}`;
      optgroup.appendChild(opt);
      hasNumericCustom = true;
    }
  });

  if (hasNumericCustom) {
    select.appendChild(optgroup);
  }
};

async function fetchLabData(token) {
  try {
    const res = await fetch(`/api/events/labs/${token}?clinic_id=${clinicId}`);
    const data = await res.json();
    patientLabData = data.labs || [];

    // Reconstruct patient's custom/added test definitions from historical records
    window.currentPatientCustomDefs = {};
    (patientLabData || []).forEach((rec) => {
      if (rec.results && rec.results._custom_defs) {
        Object.assign(
          window.currentPatientCustomDefs,
          rec.results._custom_defs,
        );
      }
      if (rec.results) {
        Object.keys(rec.results).forEach((k) => {
          if (k === "_custom_defs" || ALL_LAB_KEYS.includes(k)) return;
          if (!window.currentPatientCustomDefs[k]) {
            const catTest = window.getTestByKey ? window.getTestByKey(k) : null;
            if (catTest) {
              window.currentPatientCustomDefs[k] = {
                key: catTest.key,
                name: catTest.name,
                category: catTest.category,
                unit: catTest.unit,
                min: catTest.min,
                max: catTest.max,
                isCustom: false,
              };
            } else {
              window.currentPatientCustomDefs[k] = {
                key: k,
                name: k.replace(/^(cust_|cat_)/, "").replace(/_/g, " "),
                category: "Other Investigations",
                unit: "",
                min: null,
                max: null,
                isCustom: true,
              };
            }
          }
        });
      }
    });

    window.renderDynamicPatientTests();
    window.updateChartParameterOptions();
    populateLabInputsForDate(document.getElementById("lab-date").value);
    updateChart();
  } catch (e) {
    console.error("Failed to load labs", e);
  }
}

window.onLabCategoryChange = function (category) {
  const searchInput = document.getElementById("lab-search-input");
  if (searchInput) {
    searchInput.value = category === "added" ? "" : category;
  }
  filterLabFields();
};

window.filterLabFields = function () {
  const searchTerm =
    document.getElementById("lab-search-input")?.value.trim().toLowerCase() ||
    "";
  const catFilter =
    document
      .getElementById("lab-category-filter")
      ?.value.trim()
      .toLowerCase() || "";
  const effectiveTerm = searchTerm || catFilter;

  const isAddedFilter = catFilter === "added";
  const dynamicSection = document.getElementById("dynamic-lab-section");
  if (
    dynamicSection &&
    Object.keys(window.currentPatientCustomDefs || {}).length > 0
  ) {
    if (isAddedFilter) {
      dynamicSection.style.display = "block";
      dynamicSection.scrollIntoView({ behavior: "smooth", block: "start" });
    } else if (effectiveTerm) {
      const matchDynamic =
        effectiveTerm.includes("custom") || effectiveTerm.includes("added");
      dynamicSection.style.display = matchDynamic ? "block" : "none";
    } else {
      dynamicSection.style.display = "block";
    }
  }

  let firstMatchedHeading = null;

  document.querySelectorAll(".lab-section-header").forEach((heading) => {
    if (heading.closest("#dynamic-lab-section")) return;
    const grid = heading.nextElementSibling;
    if (!grid || !grid.classList.contains("lab-grid")) return;

    if (isAddedFilter) {
      heading.style.display = "none";
      grid.style.display = "none";
      return;
    }

    const headingText = heading.textContent.toLowerCase();
    const headingMatches = Boolean(
      effectiveTerm && headingText.includes(effectiveTerm),
    );

    let hasVisible = false;
    grid.querySelectorAll(".lab-input-group").forEach((group) => {
      const input = group.querySelector("input");
      const label = group.querySelector("label")?.textContent || "";
      const key = input ? input.id.replace(/^lab-/, "") : "";
      const match =
        !effectiveTerm ||
        headingMatches ||
        `${key} ${label}`.toLowerCase().includes(effectiveTerm);
      group.style.display = match ? "" : "none";
      if (match) hasVisible = true;
    });

    const showHeading = !effectiveTerm || headingMatches || hasVisible;
    heading.style.display = showHeading ? "" : "none";
    grid.style.display = showHeading ? "" : "none";

    if (headingMatches && !firstMatchedHeading) {
      firstMatchedHeading = heading;
    }
  });

  if (firstMatchedHeading && effectiveTerm && !isAddedFilter) {
    firstMatchedHeading.scrollIntoView({ behavior: "smooth", block: "start" });
  }
};

window.populateLabInputsForDate = function (dateStr) {
  const allActiveKeys = [
    ...ALL_LAB_KEYS,
    ...Object.keys(window.currentPatientCustomDefs || {}),
  ];

  allActiveKeys.forEach((id) => {
    const el = document.getElementById(`lab-${id}`);
    if (el) {
      el.value = "";
      checkRange(el);
    }
  });

  const record = patientLabData.find((l) => l.test_date === dateStr);
  if (record && record.results) {
    allActiveKeys.forEach((id) => {
      if (record.results[id] !== undefined) {
        const el = document.getElementById(`lab-${id}`);
        if (el) {
          el.value = record.results[id];
          checkRange(el);
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
  document.querySelectorAll('[id^="lab-"]').forEach((el) => {
    if (["lab-date", "lab-local-token", "lab-search-input"].includes(el.id))
      return;
    const key = el.id.replace(/^lab-/, "");
    if (el.value.trim() !== "") {
      results[key] = el.value.trim();
    }
  });

  // Preserve custom test definitions inside results._custom_defs
  if (
    window.currentPatientCustomDefs &&
    Object.keys(window.currentPatientCustomDefs).length > 0
  ) {
    results._custom_defs = window.currentPatientCustomDefs;
  }

  const payload = {
    clinic_id: clinicId,
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
  if (!input) return;
  const val = parseFloat(input.value);
  if (isNaN(val)) {
    input.classList.remove("lab-input-abnormal");
    return;
  }

  const min = parseFloat(
    minStr !== undefined ? minStr : input.getAttribute("data-min"),
  );
  const max = parseFloat(
    maxStr !== undefined ? maxStr : input.getAttribute("data-max"),
  );

  let isAbnormal = false;
  if (!isNaN(min) && val < min) isAbnormal = true;
  if (!isNaN(max) && val > max) isAbnormal = true;

  if (isAbnormal) {
    input.classList.add("lab-input-abnormal");
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

// =======================================================
// CLINICAL TESTS CATALOG & INTERACTIVE DROPDOWN SYSTEM
// =======================================================

const LAB_TEST_CATALOG = [
  {
    category: "Haematology",
    icon: "🩸",
    aliases: [
      "hematology",
      "haem",
      "hem",
      "blood",
      "cbc",
      "cell",
      "rbc",
      "wbc",
      "platelet",
      "esr",
    ],
    tests: [
      "Complete Blood Count (CBC)",
      "Haemoglobin (Hb)",
      "Total WBC Count (TLC)",
      "Differential Leucocyte Count (DLC)",
      "Platelet Count",
      "ESR (Erythrocyte Sedimentation Rate)",
      "Packed Cell Volume (PCV / Hematocrit)",
      "Peripheral Blood Smear (PBS)",
      "Blood Group & Rh Type",
      "Reticulocyte Count",
      "Absolute Eosinophil Count (AEC)",
      "Bleeding Time & Clotting Time (BT/CT)",
      "PT / INR (Prothrombin Time)",
      "APTT (Activated Partial Thromboplastin Time)",
      "Red Blood Cell (RBC) Count",
      "MCV / MCH / MCHC",
    ],
  },
  {
    category: "Diabetes & Glucose",
    icon: "🍬",
    aliases: [
      "diabetes",
      "sugar",
      "glucose",
      "diab",
      "fbs",
      "ppbs",
      "rbs",
      "hba1c",
    ],
    tests: [
      "Fasting Blood Sugar (FBS)",
      "Post Prandial Blood Sugar (PPBS)",
      "Random Blood Sugar (RBS)",
      "HbA1c (Glycated Hemoglobin)",
      "Glucose Tolerance Test (GTT)",
      "Average Blood Glucose (MBG)",
      "Serum Insulin (Fasting)",
      "C-Peptide",
    ],
  },
  {
    category: "Lipid Profile",
    icon: "🫀",
    aliases: [
      "lipid",
      "cholesterol",
      "triglyceride",
      "heart",
      "cardiac",
      "hdl",
      "ldl",
    ],
    tests: [
      "Lipid Profile (Complete)",
      "Total Cholesterol",
      "Serum Triglycerides",
      "HDL Cholesterol",
      "LDL Cholesterol",
      "VLDL Cholesterol",
      "Total Cholesterol / HDL Ratio",
    ],
  },
  {
    category: "Liver Function Test (LFT)",
    icon: "🫁",
    aliases: [
      "lft",
      "liver",
      "bilirubin",
      "sgpt",
      "sgot",
      "jaundice",
      "alt",
      "ast",
    ],
    tests: [
      "Liver Function Test (LFT Profile)",
      "Serum Bilirubin (Total, Direct, Indirect)",
      "SGPT / ALT",
      "SGOT / AST",
      "Serum Alkaline Phosphatase (ALP)",
      "Total Protein, Albumin & Globulin (A/G Ratio)",
      "Gamma GT (GGT)",
      "Serum Amylase",
      "Serum Lipase",
    ],
  },
  {
    category: "Kidney Function Test (KFT / RFT)",
    icon: "🧪",
    aliases: [
      "kft",
      "rft",
      "kidney",
      "renal",
      "creatinine",
      "urea",
      "bun",
      "electrolytes",
    ],
    tests: [
      "Kidney Function Test (KFT / RFT Profile)",
      "Serum Creatinine",
      "Blood Urea",
      "Blood Urea Nitrogen (BUN)",
      "Serum Uric Acid",
      "Serum Electrolytes (Sodium, Potassium, Chloride)",
      "Serum Calcium",
      "Serum Phosphorus",
      "Estimated GFR (eGFR)",
      "Urine Albumin to Creatinine Ratio (UACR)",
    ],
  },
  {
    category: "Thyroid Profile",
    icon: "🦋",
    aliases: ["thyroid", "tsh", "t3", "t4", "hypothyroid", "hyperthyroid"],
    tests: [
      "Thyroid Profile (Total T3, T4, TSH)",
      "TSH (Ultrasensitive)",
      "Free T3 (FT3)",
      "Free T4 (FT4)",
      "Anti-TPO Antibodies",
    ],
  },
  {
    category: "Urine & Stool Examination",
    icon: "🧴",
    aliases: ["urine", "stool", "urinalysis", "pus", "uti"],
    tests: [
      "Urine Routine & Microscopy (Urine R/M)",
      "Urine Culture & Sensitivity (Urine C/S)",
      "Urine Microalbumin",
      "Urine Pregnancy Test (UPT)",
      "Urine Bile Salts & Bile Pigments",
      "Stool Routine & Microscopy",
      "Stool Occult Blood",
    ],
  },
  {
    category: "Fever & Infectious Serology",
    icon: "🌡️",
    aliases: [
      "fever",
      "infection",
      "dengue",
      "malaria",
      "typhoid",
      "widal",
      "crp",
    ],
    tests: [
      "Widal Test (Typhoid)",
      "Typhidot (IgM & IgG)",
      "Dengue NS1 Antigen",
      "Dengue Serology (IgM & IgG)",
      "Malaria Antigen (Pv / Pf)",
      "Chikungunya IgM",
      "CRP (C-Reactive Protein - Quantitative)",
      "High Sensitivity CRP (hs-CRP)",
      "Procalcitonin",
      "Blood Culture & Sensitivity",
    ],
  },
  {
    category: "Viral Markers & Immunology",
    icon: "🔬",
    aliases: [
      "viral",
      "hiv",
      "hepatitis",
      "hbsag",
      "hcv",
      "immunology",
      "autoimmune",
      "ra",
      "ana",
    ],
    tests: [
      "HIV I & II (Card / ELISA)",
      "HBsAg (Hepatitis B Surface Antigen)",
      "HCV (Hepatitis C Antibody)",
      "VDRL / RPR (Syphilis)",
      "RA Factor (Rheumatoid Arthritis)",
      "ANA (Antinuclear Antibodies)",
      "ASO Titre",
    ],
  },
  {
    category: "Vitamins & Minerals",
    icon: "💊",
    aliases: [
      "vitamins",
      "minerals",
      "iron",
      "deficiency",
      "b12",
      "d3",
      "ferritin",
    ],
    tests: [
      "Vitamin D3 (25-Hydroxy)",
      "Vitamin B12",
      "Serum Ferritin",
      "Serum Iron & TIBC Profile",
      "Serum Magnesium",
      "Serum Zinc",
    ],
  },
  {
    category: "Cardiac & Hormones",
    icon: "❤️",
    aliases: [
      "cardiac",
      "heart",
      "hormones",
      "pcos",
      "troponin",
      "testosterone",
    ],
    tests: [
      "Troponin-I (High Sensitivity)",
      "CPK / CK-MB",
      "NT-proBNP",
      "Serum Prolactin",
      "Serum Testosterone (Total)",
      "FSH & LH",
      "Serum Cortisol",
    ],
  },
  {
    category: "Imaging & Diagnostics",
    icon: "📷",
    aliases: [
      "imaging",
      "radiology",
      "xray",
      "x-ray",
      "scan",
      "usg",
      "ecg",
      "echo",
    ],
    tests: [
      "ECG (12-Lead)",
      "Chest X-Ray (PA View)",
      "USG Whole Abdomen & Pelvis",
      "USG KUB (Kidney, Ureter, Bladder)",
      "2D Echocardiography",
      "TMT (Treadmill Test)",
    ],
  },
];

let expandedCategoryNames = new Set();

function getSelectedTestsList() {
  const el = document.getElementById("patient-tests");
  if (!el || !el.value) return [];
  return el.value
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

window.syncTestChips = function () {
  const chipsContainer = document.getElementById("rx-selected-tests-chips");
  if (!chipsContainer) return;

  const currentTests = getSelectedTestsList();
  if (currentTests.length === 0) {
    chipsContainer.innerHTML = "";
    return;
  }

  chipsContainer.innerHTML = currentTests
    .map((test) => {
      const escaped = escapeHtml(test);
      const encoded = encodeURIComponent(test);
      return `
        <span style="display: inline-flex; align-items: center; gap: 5px; background: #e0f2fe; color: #0369a1; border: 1px solid #bae6fd; padding: 3px 8px; border-radius: 12px; font-size: 11.5px; font-weight: 600;">
          <span>${escaped}</span>
          <span onclick="window.removeTestFromPrescription(decodeURIComponent('${encoded}'))" style="cursor: pointer; color: #0284c7; font-weight: 800; font-size: 11px; margin-left: 2px;" title="Remove">✕</span>
        </span>
      `;
    })
    .join("");
};

window.addTestToPrescription = function (testName) {
  if (!testName) return;
  const textarea = document.getElementById("patient-tests");
  if (!textarea) return;

  const list = getSelectedTestsList();
  const lowerTest = testName.trim().toLowerCase();
  const alreadyExists = list.some((t) => t.toLowerCase() === lowerTest);

  if (!alreadyExists) {
    list.push(testName.trim());
    textarea.value = list.join(", ");
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  }

  window.syncTestChips();
  const searchInput = document.getElementById("rx-tests-search");
  window.renderTestsDropdown(searchInput?.value || "");
};

window.removeTestFromPrescription = function (testName) {
  if (!testName) return;
  const textarea = document.getElementById("patient-tests");
  if (!textarea) return;

  const lowerTest = testName.trim().toLowerCase();
  const list = getSelectedTestsList().filter(
    (t) => t.toLowerCase() !== lowerTest,
  );

  textarea.value = list.join(", ");
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
  window.syncTestChips();

  const searchInput = document.getElementById("rx-tests-search");
  window.renderTestsDropdown(searchInput?.value || "");
};

window.addAllCategoryTests = function (categoryName) {
  const cat = LAB_TEST_CATALOG.find((c) => c.category === categoryName);
  if (!cat) return;

  const textarea = document.getElementById("patient-tests");
  if (!textarea) return;

  const currentList = getSelectedTestsList();
  const currentLower = new Set(currentList.map((t) => t.toLowerCase()));

  cat.tests.forEach((test) => {
    if (!currentLower.has(test.toLowerCase())) {
      currentList.push(test);
      currentLower.add(test.toLowerCase());
    }
  });

  textarea.value = currentList.join(", ");
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
  window.syncTestChips();

  const searchInput = document.getElementById("rx-tests-search");
  window.renderTestsDropdown(searchInput?.value || "");
};

window.toggleCategoryExpand = function (categoryName, event) {
  if (event) event.stopPropagation();
  if (expandedCategoryNames.has(categoryName)) {
    expandedCategoryNames.delete(categoryName);
  } else {
    expandedCategoryNames.add(categoryName);
  }
  const searchInput = document.getElementById("rx-tests-search");
  window.renderTestsDropdown(searchInput?.value || "");
};

window.clearTestSearch = function () {
  const input = document.getElementById("rx-tests-search");
  if (input) {
    input.value = "";
    input.focus();
  }
  window.renderTestsDropdown("");
};

window.toggleTestCategoriesDropdown = function () {
  const dropdown = document.getElementById("rx-tests-dropdown");
  const input = document.getElementById("rx-tests-search");
  if (!dropdown) return;

  if (dropdown.style.display === "block" && (!input || !input.value.trim())) {
    dropdown.style.display = "none";
  } else {
    if (input) {
      input.value = "";
      input.focus();
    }
    window.renderTestsDropdown("", true);
  }
};

window.renderTestsDropdown = function (query, forceCategoryMode) {
  const dropdown = document.getElementById("rx-tests-dropdown");
  const clearBtn = document.getElementById("rx-tests-search-clear");
  if (!dropdown) return;

  const q = (query || "").trim().toLowerCase();
  if (clearBtn) clearBtn.style.display = q ? "block" : "none";

  const selectedTests = new Set(
    getSelectedTestsList().map((t) => t.toLowerCase()),
  );
  let html = "";

  if (q) {
    // 1. Check for matching categories
    const matchingCategories = LAB_TEST_CATALOG.filter((cat) => {
      if (cat.category.toLowerCase().includes(q)) return true;
      return cat.aliases.some(
        (alias) => alias.includes(q) || q.includes(alias),
      );
    });

    // Auto-expand strongly matched categories so user sees tests immediately
    matchingCategories.forEach((cat) => {
      expandedCategoryNames.add(cat.category);
    });

    if (matchingCategories.length > 0) {
      html += `
        <div style="padding: 4px 10px 2px; font-size: 10.5px; font-weight: 800; color: #0284c7; text-transform: uppercase; letter-spacing: 0.05em;">
          Matching Headings / Categories (Click to open list):
        </div>
      `;

      matchingCategories.forEach((cat) => {
        const isExpanded = expandedCategoryNames.has(cat.category);
        html += `
          <div class="rx-cat-block" style="background: #f8fafc; border: 1.5px solid #bae6fd; border-radius: 8px; margin: 6px 8px; overflow: hidden;">
            <div
              onclick="window.toggleCategoryExpand('${escapeHtml(cat.category)}', event)"
              style="padding: 9px 12px; display: flex; justify-content: space-between; align-items: center; cursor: pointer; background: #f0f9ff; user-select: none;"
            >
              <div style="display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 15px;">${cat.icon}</span>
                <strong style="font-size: 13px; color: #0369a1;">${escapeHtml(cat.category)}</strong>
                <span style="font-size: 11px; font-weight: 700; background: #ffffff; color: #0284c7; padding: 2px 7px; border-radius: 10px; border: 1px solid #bae6fd;">
                  ${cat.tests.length} Tests
                </span>
              </div>
              <span style="font-size: 11.5px; font-weight: 700; color: #0284c7;">
                ${isExpanded ? "▲ Hide Tests" : "▼ Open List of Tests"}
              </span>
            </div>
            ${
              isExpanded
                ? `
              <div style="padding: 6px 10px 10px; background: #ffffff;">
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 4px 0 8px; border-bottom: 1px dashed #e2e8f0; margin-bottom: 6px;">
                  <span style="font-size: 11px; color: #64748b; font-weight: 600;">Click test name to add/remove:</span>
                  <button type="button" onclick="window.addAllCategoryTests('${escapeHtml(cat.category)}')" class="btn btn-ghost" style="padding: 2px 8px; font-size: 11px; font-weight: 700; color: #0284c7; height: auto;">
                    + Select All (${cat.tests.length})
                  </button>
                </div>
                <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 5px;">
                  ${cat.tests
                    .map((test) => {
                      const isSelected = selectedTests.has(test.toLowerCase());
                      const encoded = encodeURIComponent(test);
                      return `
                      <div
                        onclick="window.${isSelected ? "removeTestFromPrescription" : "addTestToPrescription"}(decodeURIComponent('${encoded}'))"
                        style="padding: 6px 10px; border-radius: 6px; font-size: 12px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; border: 1px solid ${isSelected ? "#38bdf8" : "#f1f5f9"}; background: ${isSelected ? "#f0f9ff" : "#ffffff"};"
                        onmouseover="if(!${isSelected}) this.style.background='#f8fafc'"
                        onmouseout="if(!${isSelected}) this.style.background='#ffffff'"
                      >
                        <span style="font-weight: ${isSelected ? "700" : "500"}; color: ${isSelected ? "#0369a1" : "#334155"};">${escapeHtml(test)}</span>
                        <span style="font-size: 11px; font-weight: 800; color: ${isSelected ? "#059669" : "#0284c7"};">${isSelected ? "✓ Added" : "+ Add"}</span>
                      </div>
                    `;
                    })
                    .join("")}
                </div>
              </div>
            `
                : ""
            }
          </div>
        `;
      });
    }

    // 2. Check for matching individual tests
    const matchingTests = [];
    const seenTestNames = new Set();

    LAB_TEST_CATALOG.forEach((cat) => {
      cat.tests.forEach((test) => {
        if (
          test.toLowerCase().includes(q) &&
          !seenTestNames.has(test.toLowerCase())
        ) {
          seenTestNames.add(test.toLowerCase());
          matchingTests.push({ test, category: cat.category, icon: cat.icon });
        }
      });
    });

    // Also search comprehensive medical test database
    if (window.searchMedicalTestCatalog) {
      const dbMatches = window.searchMedicalTestCatalog(q);
      dbMatches.forEach((item) => {
        if (!seenTestNames.has(item.name.toLowerCase())) {
          seenTestNames.add(item.name.toLowerCase());
          matchingTests.push({
            test: item.name,
            category: item.category,
            icon: "🔬",
          });
        }
      });
    }

    if (matchingTests.length > 0) {
      html += `
        <div style="padding: 6px 10px 2px; font-size: 10.5px; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 4px;">
          Individual Tests matching "${escapeHtml(query)}":
        </div>
        <div style="padding: 2px 6px;">
      `;

      matchingTests.forEach((item) => {
        const isSelected = selectedTests.has(item.test.toLowerCase());
        const encoded = encodeURIComponent(item.test);
        html += `
          <div
            onclick="window.${isSelected ? "removeTestFromPrescription" : "addTestToPrescription"}(decodeURIComponent('${encoded}'))"
            style="padding: 8px 10px; border-radius: 6px; font-size: 12.5px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #f8fafc; background: ${isSelected ? "#f0f9ff" : "white"};"
            onmouseover="if(!${isSelected}) this.style.background='#f8fafc'"
            onmouseout="if(!${isSelected}) this.style.background='white'"
          >
            <div style="display: flex; align-items: center; gap: 8px;">
              <span>${item.icon}</span>
              <strong style="color: ${isSelected ? "#0369a1" : "#1e293b"}; font-weight: ${isSelected ? "700" : "600"};">${escapeHtml(item.test)}</strong>
              <span style="font-size: 10.5px; color: #64748b; background: #f1f5f9; padding: 1px 6px; border-radius: 4px;">${escapeHtml(item.category)}</span>
            </div>
            <span style="font-size: 11px; font-weight: 800; color: ${isSelected ? "#059669" : "#0284c7"};">${isSelected ? "✓ Added" : "+ Add"}</span>
          </div>
        `;
      });
      html += `</div>`;
    }

    // 3. Option to add custom test if query doesn't exactly match
    const exactMatch = matchingTests.some((t) => t.test.toLowerCase() === q);
    if (!exactMatch && q.length > 1) {
      const encodedQ = encodeURIComponent(query.trim());
      html += `
        <div
          onclick="window.addTestToPrescription(decodeURIComponent('${encodedQ}'))"
          style="padding: 10px 14px; margin: 6px 8px; border-radius: 6px; background: #faf5ff; border: 1px dashed #c084fc; cursor: pointer; display: flex; justify-content: space-between; align-items: center;"
          onmouseover="this.style.background='#f3e8ff'"
          onmouseout="this.style.background='#faf5ff'"
        >
          <span style="font-size: 12.5px; font-weight: 600; color: #7e22ce;">
            + Add custom test: <strong>"${escapeHtml(query)}"</strong>
          </span>
          <span style="font-size: 11.5px; font-weight: 800; color: #7e22ce;">Add</span>
        </div>
      `;
    }

    if (
      matchingCategories.length === 0 &&
      matchingTests.length === 0 &&
      q.length > 0
    ) {
      html += `
        <div style="padding: 14px; text-align: center; color: #64748b; font-size: 12px;">
          No standard test matching "${escapeHtml(query)}". Click the button above to add it as a custom test.
        </div>
      `;
    }
  } else {
    // Empty query or force category mode: show all categories organized
    html += `
      <div style="padding: 6px 12px 4px; font-size: 11px; font-weight: 800; color: #0284c7; text-transform: uppercase; letter-spacing: 0.05em; display: flex; justify-content: space-between; align-items: center;">
        <span>Select Category to View All Tests:</span>
        <span style="color: #64748b; font-weight: 500; font-size: 10.5px;">${LAB_TEST_CATALOG.length} Categories</span>
      </div>
      <div style="padding: 2px 6px;">
    `;

    LAB_TEST_CATALOG.forEach((cat) => {
      const isExpanded = expandedCategoryNames.has(cat.category);
      html += `
        <div style="border-bottom: 1px solid #f1f5f9; margin-bottom: 2px;">
          <div
            onclick="window.toggleCategoryExpand('${escapeHtml(cat.category)}', event)"
            style="padding: 9px 12px; display: flex; justify-content: space-between; align-items: center; cursor: pointer; border-radius: 6px; background: ${isExpanded ? "#f0f9ff" : "white"};"
            onmouseover="if(!${isExpanded}) this.style.background='#f8fafc'"
            onmouseout="if(!${isExpanded}) this.style.background='${isExpanded ? "#f0f9ff" : "white"}'"
          >
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 15px;">${cat.icon}</span>
              <strong style="font-size: 12.5px; color: ${isExpanded ? "#0369a1" : "#1e293b"};">${escapeHtml(cat.category)}</strong>
              <span style="font-size: 10.5px; font-weight: 700; color: #0284c7; background: #e0f2fe; padding: 1px 6px; border-radius: 10px;">
                ${cat.tests.length} Tests
              </span>
            </div>
            <span style="font-size: 11px; font-weight: 700; color: #0284c7;">
              ${isExpanded ? "▲ Close" : "▼ View Tests"}
            </span>
          </div>
          ${
            isExpanded
              ? `
            <div style="padding: 6px 8px 10px; background: #ffffff; border-left: 2px solid #38bdf8; margin: 2px 6px 6px;">
              <div style="display: flex; justify-content: space-between; align-items: center; padding: 4px 2px 6px; border-bottom: 1px dashed #e2e8f0; margin-bottom: 4px;">
                <span style="font-size: 11px; color: #64748b; font-weight: 600;">Select tests to add to prescription:</span>
                <button type="button" onclick="window.addAllCategoryTests('${escapeHtml(cat.category)}')" class="btn btn-ghost" style="padding: 2px 8px; font-size: 11px; font-weight: 700; color: #0284c7; height: auto;">
                  + Select All (${cat.tests.length})
                </button>
              </div>
              <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 4px;">
                ${cat.tests
                  .map((test) => {
                    const isSelected = selectedTests.has(test.toLowerCase());
                    const encoded = encodeURIComponent(test);
                    return `
                    <div
                      onclick="window.${isSelected ? "removeTestFromPrescription" : "addTestToPrescription"}(decodeURIComponent('${encoded}'))"
                      style="padding: 5px 8px; border-radius: 5px; font-size: 12px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; border: 1px solid ${isSelected ? "#38bdf8" : "#f1f5f9"}; background: ${isSelected ? "#f0f9ff" : "#ffffff"};"
                      onmouseover="if(!${isSelected}) this.style.background='#f8fafc'"
                      onmouseout="if(!${isSelected}) this.style.background='#ffffff'"
                    >
                      <span style="font-weight: ${isSelected ? "700" : "500"}; color: ${isSelected ? "#0369a1" : "#334155"};">${escapeHtml(test)}</span>
                      <span style="font-size: 11px; font-weight: 800; color: ${isSelected ? "#059669" : "#0284c7"};">${isSelected ? "✓ Added" : "+ Add"}</span>
                    </div>
                  `;
                  })
                  .join("")}
              </div>
            </div>
          `
              : ""
          }
        </div>
      `;
    });
    html += `</div>`;
  }

  dropdown.innerHTML = html;
  dropdown.style.display = "block";
};

// Initialize interactive listeners for tests input and dropdown
function initTestsDropdownEvents() {
  const searchInput = document.getElementById("rx-tests-search");
  const dropdown = document.getElementById("rx-tests-dropdown");
  const textarea = document.getElementById("patient-tests");

  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      window.renderTestsDropdown(e.target.value);
    });

    searchInput.addEventListener("focus", (e) => {
      window.renderTestsDropdown(e.target.value);
    });

    searchInput.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && dropdown) {
        dropdown.style.display = "none";
      }
    });
  }

  if (textarea) {
    textarea.addEventListener("input", () => {
      window.syncTestChips();
    });
  }

  // Close dropdown when clicking outside
  document.addEventListener("click", (e) => {
    if (!dropdown || dropdown.style.display === "none") return;
    const isInsideSearch = e.target.closest(".rx-tests-search-wrap");
    if (!isInsideSearch) {
      dropdown.style.display = "none";
    }
  });

  window.syncTestChips();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initTestsDropdownEvents);
} else {
  initTestsDropdownEvents();
}

loadQueue();
setInterval(loadQueue, 5000);
