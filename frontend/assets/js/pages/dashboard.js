

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




document.addEventListener("input", (event) => {
  if (
    event.target.closest(
      "#patient-complaints, #patient-diagnosis, #patient-tests, #rx-container",
    )
  ) {
    
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




window.rePrintRx = async function (localToken, patientName, displayId) {
  try {
    const data = await ApiClient.request(
      `/api/events/history/${encodeURIComponent(localToken)}?clinic_id=${clinicId}`,
    );
    if (!data.history || data.history.length === 0)
      return ToastUI.showError();

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
    ToastUI.showError();
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
    const data = await ApiClient.request(`/api/events/history/${encodeURIComponent(localToken)}?clinic_id=${clinicId}`);
    if (!data.history || data.history.length === 0)
      return ToastUI.showError();

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
    if (window.updateFollowupUI) window.updateFollowupUI(visit.follow_up_days !== null && visit.follow_up_days !== undefined ? visit.follow_up_days : 3);

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
    await ApiClient.request("/api/events/complete", {
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

    await window.QueueManager.loadQueue();
  } catch (error) {
    console.error("Complete visit error:", error);
    setPrescriptionStatus("Failed to Send", "danger");
    ToastUI.showError();
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











// --- LAB FLOWSHEET & TRENDS (DECOUPLED COMPONENT) ---
window.openLabsModal = async function (localToken, patientName) {
  const token = localToken || currentLocalToken;
  if (!token) return ToastUI.showError();
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



if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initTestsDropdownEvents);
} else {
  initTestsDropdownEvents();
}




// Follow-up conversion logic
document.addEventListener("DOMContentLoaded", () => {
  const monthsInput = document.getElementById("followup-months-input");
  const daysInput = document.getElementById("followup-days-input");
  const hiddenFollowup = document.getElementById("patient-followup");

  function updateHiddenFollowup() {
    if (!monthsInput || !daysInput || !hiddenFollowup) return;
    const months = parseInt(monthsInput.value) || 0;
    const days = parseInt(daysInput.value) || 0;
    hiddenFollowup.value = (months * 30) + days;
    
  }

  if (monthsInput) monthsInput.addEventListener("input", updateHiddenFollowup);
  if (daysInput) daysInput.addEventListener("input", updateHiddenFollowup);
});

