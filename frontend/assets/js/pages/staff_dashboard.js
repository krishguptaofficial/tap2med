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

// --- EXPANDED STAFF LAB FLOWSHEET INTEGRATION ---
const ALL_LAB_KEYS = [
  // Diabetes
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
  // Haematology
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
  // Bio Chemistry
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
  // LFT
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
  // UACR
  "uacr_alb",
  "uacr_malb",
  "uacr_creat",
  // Urine Routine
  "ur_app",
  "ur_reac",
  "ur_alb",
  "ur_pus",
  "ur_rbc",
  "ur_casts",
  "ur_cryst",
  "ur_bact",
  // Thyroid
  "thy_tsh",
  "thy_tsh_ultra",
  "thy_t3",
  "thy_t4",
  "thy_ft3",
  "thy_ft4",
  "thy_tpo",
  "thy_tg_ab",
  "thy_anti_tg",
  // PCOS
  "pcos_lh",
  "pcos_fsh",
  "pcos_prol",
  "pcos_testo",
  "pcos_dheas",
  "pcos_shbg",
  "pcos_oest",
  "pcos_fgw",
  // Others
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

window.openLabsModal = async function (localToken, patientName) {
  document.getElementById("lab-modal-patient-name").textContent =
    patientName || "Patient";
  document.getElementById("lab-local-token").value = localToken;
  document.getElementById("labs-modal").style.display = "flex";

  const today = new Date().toLocaleDateString("en-CA");
  document.getElementById("lab-date").value = today;
  await fetchLabData(localToken);
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
