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
              <button onclick="editRx('${patient.local_token}', ${patient.daily_token_number}, '${(patient.patient_name || "Patient").replace(/'/g, "\\'")}', '${patient.display_id || "--"}')" class="btn btn-ghost" style="padding: 4px 8px; font-size: 11px; color: #ef4444; border: 1px dashed #fca5a5;">Edit</button>
              <button onclick="openLabsModal('${patient.local_token}', '${(patient.patient_name || "Patient").replace(/'/g, "\\'")}')" class="btn btn-secondary" style="padding: 4px 8px; font-size: 11px; background: white; border: 1px dashed #cbd5e1;">Labs</button>
              <button onclick="rePrintRx('${patient.local_token}', '${(patient.patient_name || "Patient").replace(/'/g, "\\'")}', '${patient.display_id || "--"}')" class="btn btn-secondary" style="padding: 4px 8px; font-size: 11px; background: white;">Print</button>
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

// --- LAB FLOWSHEET & TRENDS (DECOUPLED COMPONENT) ---
window.openLabsModal = async function (localToken, patientName) {
  const token = localToken || currentLocalToken;
  if (!token) return alert("Please select a patient first.");
  const name = patientName || window.currentPatientName || "Patient";
  if (window.Tap2MedLabs) {
    window.Tap2MedLabs.open(token, name, clinicId);
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

// Fallback billing stubs to prevent unhandled clicks
window.openBillModal = window.openBillModal || function () {};
window.executePrintBill = window.executePrintBill || function () {};

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
