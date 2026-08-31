const clinicId = localStorage.getItem("tap2med_clinic_id");
if (!clinicId) window.location.href = "/staff-login";

let currentClinicName = "Clinic";
let currentDoctorName = "Doctor";
window.currentWaitingTokens = [];

let patientLabData = [];
let labChartInstance = null;

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
    const a = ['','One ','Two ','Three ','Four ', 'Five ','Six ','Seven ','Eight ','Nine ','Ten ','Eleven ','Twelve ','Thirteen ','Fourteen ','Fifteen ','Sixteen ','Seventeen ','Eighteen ','Nineteen '];
    const b = ['', '', 'Twenty','Thirty','Forty','Fifty', 'Sixty','Seventy','Eighty','Ninety'];
    if ((num = num.toString()).length > 9) return 'OVERFLOW';
    let n = ('000000000' + num).substr(-9).match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/);
    if (!n) return ''; let str = '';
    str += (n[1] != 0) ? (a[Number(n[1])] || b[n[1][0]] + ' ' + a[n[1][1]]) + 'Crore ' : '';
    str += (n[2] != 0) ? (a[Number(n[2])] || b[n[2][0]] + ' ' + a[n[2][1]]) + 'Lakh ' : '';
    str += (n[3] != 0) ? (a[Number(n[3])] || b[n[3][0]] + ' ' + a[n[3][1]]) + 'Thousand ' : '';
    str += (n[4] != 0) ? (a[Number(n[4])] || b[n[4][0]] + ' ' + a[n[4][1]]) + 'Hundred ' : '';
    str += (n[5] != 0) ? ((str != '') ? 'and ' : '') + (a[Number(n[5])] || b[n[5][0]] + ' ' + a[n[5][1]]) : '';
    return str ? str.trim().toUpperCase() + ' RUPEES ONLY' : 'ZERO RUPEES ONLY';
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
    if (nameInput) nameInput.value = "";
    setLookupStatus("", "neutral");
}

window.attemptManualLookup = async function() {
    const phoneInput = document.getElementById("walkin-phone");
    const phone = phoneInput ? phoneInput.value.trim() : "";
    const memberDropdown = document.getElementById("manual-member-id");
    const selectedMember = memberDropdown ? parseInt(memberDropdown.value) : 0;
    const nameInput = document.getElementById("walkin-name");

    if (!/^\d{10}$/.test(phone)) {
        clearLookupStatus();
        return;
    }

    try {
        const res = await fetch("/api/events/lookup", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ phone: phone, member_id: selectedMember, clinic_id: clinicId })
        });

        if (!res.ok) {
            setLookupStatus("Specific patient not found", "error");
            if (nameInput) nameInput.value = "";
            return;
        }

        const data = await res.json();
        if (data.found && data.patient_name) {
            if (nameInput) nameInput.value = data.patient_name;
            nameInput.style.borderColor = "#22c55e";
            nameInput.style.backgroundColor = "#f0fdf4";
            setLookupStatus(`Specific patient found: ${data.patient_name}`, "success");
            setTimeout(() => {
                if (nameInput) {
                    nameInput.style.borderColor = "#cbd5e1";
                    nameInput.style.backgroundColor = "#f8fafc";
                }
            }, 1500);
        } else {
            if (nameInput) nameInput.value = "";
            setLookupStatus("Specific patient not found", "error");
        }
    } catch (e) {
        console.error("Lookup failed", e);
        if (nameInput) nameInput.value = "";
        setLookupStatus("Specific patient not found", "error");
    }
};

document.getElementById("walkin-phone")?.addEventListener("input", () => {
    if (document.getElementById("walkin-phone").value.trim().length < 10) {
        clearLookupStatus();
    }
});
document.getElementById("walkin-phone")?.addEventListener("blur", attemptManualLookup);
document.getElementById("manual-member-id")?.addEventListener("change", () => {
    const phone = document.getElementById("walkin-phone")?.value.trim() || "";
    if (/^\d{10}$/.test(phone)) {
        attemptManualLookup();
    } else {
        clearLookupStatus();
    }
});

window.manualCheckIn = async function() {
    const phoneInput = document.getElementById("walkin-phone");
    const phone = phoneInput.value.trim();
    const statusEl = document.getElementById("manual-status");
    const btn = document.getElementById("btn-manual-checkin");
    const memberDropdown = document.getElementById("manual-member-id");
    const selectedMember = memberDropdown ? parseInt(memberDropdown.value) : 0;
    
    const nameInput = document.getElementById("walkin-name");
    const patientName = nameInput ? nameInput.value.trim() : "Walk-in Patient";
    
    const cityInput = document.getElementById("walkin-city");
    const patientCity = cityInput ? cityInput.value.trim() : null;
    
    const isAppt = document.getElementById("walkin-is-appt")?.checked || false;

    if (!/^\d{10}$/.test(phone)) {
        statusEl.textContent = "Please enter a valid 10-digit phone number.";
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
                is_appointment: isAppt 
            })
        });

        if (!response.ok) throw new Error("Check-in failed");
        const data = await response.json();
        const tokenStr = getShortCode(data.queue_number);

        statusEl.innerHTML = `Success! Token is <strong style="font-size: 18px; color: var(--primary-color);">#${tokenStr}</strong>`;
        statusEl.style.color = "var(--success-color)";
        phoneInput.value = "";
        if (nameInput) nameInput.value = "";
        if (cityInput) cityInput.value = "";
        if (document.getElementById("walkin-is-appt")) document.getElementById("walkin-is-appt").checked = false;

        loadStaffQueue();
    } catch (error) {
        statusEl.textContent = "Failed to add patient to queue.";
        statusEl.style.color = "var(--error-color)";
    } finally {
        btn.disabled = false;
        btn.textContent = "Generate Token";
    }
};

window.openVitalsModal = function(localToken, vitalsJSON) {
    document.getElementById('vitals-token').value = localToken;
    let vitals = {};
    try { vitals = JSON.parse(vitalsJSON || '{}'); } catch(e) {}
    
    document.getElementById('vital-is-paid').value = vitals.is_paid === true ? 'true' : 'false';
    document.getElementById('vitals-modal').style.display = 'flex';

    document.getElementById('vital-bp-sys').value = vitals.bp_sys || '';
    document.getElementById('vital-bp-dia').value = vitals.bp_dia || '';
    document.getElementById('vital-pr').value = vitals.pr || '';
    document.getElementById('vital-wt').value = vitals.wt || '';
    document.getElementById('vital-ht').value = vitals.ht || '';
    document.getElementById('vital-temp').value = vitals.temp || '';
    document.getElementById('vital-spo2').value = vitals.spo2 || '';
    document.getElementById('vital-waist').value = vitals.waist || '';
    document.getElementById('vital-hip').value = vitals.hip || '';
};

window.closeVitalsModal = function() {
    document.getElementById('vitals-modal').style.display = 'none';
};

window.submitVitals = async function() {
    const localToken = document.getElementById('vitals-token').value;
    const payload = {
        is_paid: document.getElementById('vital-is-paid').value === 'true',
        bp_sys: document.getElementById('vital-bp-sys').value.trim() || null,
        bp_dia: document.getElementById('vital-bp-dia').value.trim() || null,
        pr: document.getElementById('vital-pr').value.trim() || null,
        wt: document.getElementById('vital-wt').value.trim() || null,
        ht: document.getElementById('vital-ht').value.trim() || null,
        temp: document.getElementById('vital-temp').value.trim() || null,
        spo2: document.getElementById('vital-spo2').value.trim() || null,
        waist: document.getElementById('vital-waist').value.trim() || null,
        hip: document.getElementById('vital-hip').value.trim() || null
    };

    try {
        await fetch("/api/events/vitals", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ local_token: localToken, vitals: payload })
        });
        closeVitalsModal();
        loadStaffQueue(); 
    } catch (e) {
        alert("Failed to save vitals.");
    }
};

window.markAsPaid = async function(localToken, currentVitalsJSON) {
    let vitals = {};
    try { vitals = JSON.parse(currentVitalsJSON || '{}'); } catch(e) {}
    vitals.is_paid = true;
    
    try {
        await fetch("/api/events/vitals", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ local_token: localToken, vitals: vitals })
        });
        loadStaffQueue();
    } catch (e) {
        alert("Failed to mark as paid.");
    }
};

window.openBillModal = function(patientName, displayId, tokenNum, fee, visitType) {
    document.getElementById("modal-bill-patient-name").value = patientName;
    document.getElementById("modal-bill-display-id").value = displayId;
    document.getElementById("modal-bill-token-num").value = tokenNum;
    
    document.getElementById("bill-modal-patient-info").textContent = `Patient: ${patientName} | ID: ${displayId} | Token: #${tokenNum}`;
    document.getElementById("modal-bill-service").value = `Dr. ${currentDoctorName}- ${visitType || 'Consultation'}`;
    document.getElementById("modal-bill-amount").value = fee || '300';
    document.getElementById("modal-bill-mode").value = 'CASH';
    
    document.getElementById("bill-modal").style.display = "flex";
};

window.executePrintBill = function() {
    const patientName = document.getElementById("modal-bill-patient-name").value;
    const displayId = document.getElementById("modal-bill-display-id").value;
    const tokenNum = document.getElementById("modal-bill-token-num").value;
    const serviceName = document.getElementById("modal-bill-service").value.trim() || "Consultation";
    const amount = document.getElementById("modal-bill-amount").value.trim() || "0";
    const payMode = document.getElementById("modal-bill-mode").value;

    const now = new Date();
    const dateStr = now.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
    const timeStr = now.toLocaleTimeString("en-IN", { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });

    document.getElementById('bill-clinic-name').textContent = currentClinicName;
    document.getElementById('bill-patient-name').textContent = patientName;
    document.getElementById('bill-patient-id').textContent = displayId;
    document.getElementById('bill-date').textContent = `${dateStr} ${timeStr}`;
    document.getElementById('bill-number').textContent = `#${tokenNum}`;
    
    document.getElementById('bill-service-name').textContent = serviceName;
    document.getElementById('bill-price').textContent = amount;
    document.getElementById('bill-net-price').textContent = amount;
    
    document.getElementById('bill-payment-mode').textContent = payMode;
    document.getElementById('bill-amount-words').textContent = numberToWords(amount);
    
    document.getElementById('bill-total-1').textContent = amount;
    document.getElementById('bill-total-2').textContent = amount;
    document.getElementById('bill-total-3').textContent = amount;

    document.getElementById("bill-modal").style.display = "none";
    
    document.body.className = "mode-bill"; 
    window.print();
    setTimeout(() => document.body.className = "", 1000);
};

window.showQRCode = function() {
    try {
        const qrContainer = document.getElementById("dashboardQRCode");
        const printContainer = document.getElementById("print-qr-target");
        if (!qrContainer) return;
        qrContainer.innerHTML = "";
        if (printContainer) printContainer.innerHTML = "";

        if (!clinicId) return;
        const targetUrl = window.location.origin + "/scan?clinic=" + clinicId;

        new QRCode(qrContainer, { text: targetUrl, width: 220, height: 220, correctLevel: QRCode.CorrectLevel.H });
        if (printContainer) {
            new QRCode(printContainer, { text: targetUrl, width: 380, height: 380, correctLevel: QRCode.CorrectLevel.H });
        }
        document.getElementById("print-qr-clinic-name").textContent = currentClinicName;
        document.getElementById("qrModal").style.display = "flex";
    } catch (error) {}
};

window.printQRCode = function() {
    document.body.className = "mode-qr";
    window.print();
    setTimeout(() => document.body.className = "", 1000);
};

// --- EXPANDED STAFF LAB FLOWSHEET INTEGRATION ---
const ALL_LAB_KEYS = [
    // Diabetes
    'diab_sap', 'diab_fbs', 'diab_hba1c', 'diab_creat', 'diab_egfr', 'diab_sacr', 'diab_chol', 'diab_tg', 'diab_ldl', 'diab_hdl',
    // Haematology
    'haem_aec', 'haem_hb', 'haem_wbc', 'haem_pcv', 'haem_neut', 'haem_lymph', 'haem_eos', 'haem_mono', 'haem_baso', 'haem_rbc', 'haem_esr', 'haem_rbcs', 'haem_wbcs', 'haem_plt', 'haem_para', 'haem_imp', 'haem_mcv', 'haem_mch', 'haem_mchc',
    // Bio Chemistry
    'bio_fus', 'bio_ppbs', 'bio_ppus', 'bio_mbg', 'bio_rbs', 'bio_rus', 'bio_ket', 'bio_prot', 'bio_urea', 'bio_na', 'bio_k', 'bio_cl', 'bio_uric', 'bio_bun', 'bio_hco3', 'bio_cal',
    // LFT
    'lft_bili_tot', 'lft_bili_dir', 'lft_bili_ind', 'lft_prot_tot', 'lft_prot_alb', 'lft_prot_glob', 'lft_sgot', 'lft_sgpt', 'lft_ggt', 'lft_mg',
    // UACR
    'uacr_alb', 'uacr_malb', 'uacr_creat',
    // Urine Routine
    'ur_app', 'ur_reac', 'ur_alb', 'ur_pus', 'ur_rbc', 'ur_casts', 'ur_cryst', 'ur_bact',
    // Thyroid
    'thy_tsh', 'thy_tsh_ultra', 'thy_t3', 'thy_t4', 'thy_ft3', 'thy_ft4', 'thy_tpo', 'thy_tg_ab', 'thy_anti_tg',
    // PCOS
    'pcos_lh', 'pcos_fsh', 'pcos_prol', 'pcos_testo', 'pcos_dheas', 'pcos_shbg', 'pcos_oest', 'pcos_fgw',
    // Others
    'oth_ecg', 'oth_usg', 'oth_fnac', 'oth_trop', 'oth_pft', 'oth_vpt', 'oth_vitb12', 'oth_echo', 'oth_iron_prof', 'oth_serum_iron', 'oth_tibc', 'oth_vitd3', 'oth_crp', 'oth_hscrp', 'oth_ferritin', 'oth_mri', 'oth_ct', 'oth_fibro', 'oth_ttg', 'oth_cect', 'oth_mri_brain', 'oth_ige', 'oth_ptinr', 'oth_pth', 'oth_anti_tpo'
];

window.openLabsModal = async function(localToken, patientName) {
    document.getElementById("lab-modal-patient-name").textContent = patientName || "Patient";
    document.getElementById("lab-local-token").value = localToken;
    document.getElementById("labs-modal").style.display = "flex";
    
    const today = new Date().toLocaleDateString('en-CA');
    document.getElementById("lab-date").value = today;
    await fetchLabData(localToken);
};

window.closeLabsModal = function() {
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

window.populateLabInputsForDate = function(dateStr) {
    ALL_LAB_KEYS.forEach(id => {
        const el = document.getElementById(`lab-${id}`);
        if(el) {
            el.value = "";
            checkRange(el, el.getAttribute('data-min'), el.getAttribute('data-max'));
        }
    });
    
    const record = patientLabData.find(l => l.test_date === dateStr);
    if (record && record.results) {
        ALL_LAB_KEYS.forEach(id => {
            if (record.results[id] !== undefined) {
                const el = document.getElementById(`lab-${id}`);
                if(el) {
                    el.value = record.results[id];
                    checkRange(el, el.getAttribute('data-min'), el.getAttribute('data-max'));
                }
            }
        });
    }
};

window.saveLabs = async function() {
    const localToken = document.getElementById("lab-local-token").value;
    const dateStr = document.getElementById("lab-date").value;
    if (!dateStr) return alert("Please select a date.");
    
    const results = {};
    ALL_LAB_KEYS.forEach(id => {
        const el = document.getElementById(`lab-${id}`);
        if(el && el.value.trim() !== '') results[id] = el.value.trim();
    });
    
    const payload = { local_token: localToken, lab_record: { test_date: dateStr, results: results } };
    
    try {
        const btn = document.querySelector("#labs-modal .btn-primary");
        const originalText = btn.textContent;
        btn.textContent = "Saving...";
        await fetch("/api/events/labs", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        await fetchLabData(localToken);
        btn.textContent = "Saved ✓";
        setTimeout(() => btn.textContent = originalText, 2000);
    } catch(e) {
        alert("Failed to save labs.");
    }
};

window.checkRange = function(input, minStr, maxStr) {
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

window.updateChart = function() {
    const select = document.getElementById("chart-parameter");
    if (!select) return;

    const param = select.value;
    const paramLabel = select.options[select.selectedIndex]?.text || "Lab Value";
    
    const filteredData = patientLabData
        .filter(l => l.results && l.results[param] !== undefined && l.results[param] !== "" && !Number.isNaN(parseFloat(l.results[param])))
        .sort((a, b) => new Date(a.test_date) - new Date(b.test_date));
    const labels = filteredData.map(l => new Date(l.test_date).toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "2-digit" }));
    const dataPoints = filteredData.map(l => parseFloat(l.results[param]));
    
    if (labChartInstance) labChartInstance.destroy();
    const ctx = document.getElementById('labChart');
    if(!ctx || typeof Chart === 'undefined') return;

    labChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: paramLabel,
                data: dataPoints,
                borderColor: '#0284c7', 
                backgroundColor: 'rgba(2, 132, 199, 0.1)',
                borderWidth: 3,
                pointBackgroundColor: '#fff',
                pointBorderColor: '#0284c7',
                pointRadius: 5,
                pointHoverRadius: 7,
                fill: true,
                tension: 0.3
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { callbacks: { label: function(context) { return `${context.parsed.y} ${paramLabel}`; } } } },
            scales: { y: { beginAtZero: false, grid: { borderDash: [4, 4] } }, x: { grid: { display: false } } }
        }
    });
};

window.checkRange = function(input) {
    const val = parseFloat(input.value);
    if (isNaN(val)) {
        input.classList.remove("lab-input-abnormal");
        return;
    }
    
    const min = parseFloat(input.getAttribute('data-min'));
    const max = parseFloat(input.getAttribute('data-max'));

    let isAbnormal = false;
    if (!isNaN(min) && val < min) isAbnormal = true;
    if (!isNaN(max) && val > max) isAbnormal = true;

    if (isAbnormal) {
        input.classList.add("lab-input-abnormal");
    } else {
        input.classList.remove("lab-input-abnormal");
    }
};

window.moveQueue = async function(localToken, direction, event) {
    if (event) event.stopPropagation();
    try {
        await fetch('/api/events/queue/move', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ local_token: localToken, direction: direction })
        });
        loadStaffQueue(); 
    } catch (e) {
        console.error("Failed to move queue", e);
    }
};

window.changeVisitType = async function(localToken, newType) {
    try {
        await fetch('/api/events/visit_type', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ local_token: localToken, visit_type: newType })
        });
        loadStaffQueue(); 
    } catch (e) {
        console.error("Failed to update visit type", e);
    }
};

window.removePatientFromQueue = async function(localToken, event) {
    if (event) event.stopPropagation();
    if (!confirm("Remove this patient from the queue?")) return;

    try {
        await fetch('/api/events/queue/remove', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ local_token: localToken })
        });
        loadStaffQueue();
    } catch (e) {
        console.error('Failed to remove patient from queue', e);
        alert('Failed to remove patient from queue.');
    }
};

async function loadStaffQueue() {
    try {
        const response = await fetch(`/api/clinics/queue/${encodeURIComponent(clinicId)}`);
        if (!response.ok) return;

        const data = await response.json();
        currentClinicName = data.clinic_name || "Clinic";
        currentDoctorName = data.doctor_name || "Doctor";

        const list = document.getElementById("staff-queue-list");
        const completedList = document.getElementById("staff-completed-list");
        const waiting = data.queue.filter(p => p.status === 'waiting');
        const completed = data.queue.filter(p => p.status === 'completed');
        
        window.currentWaitingTokens = waiting.map(p => p.local_token);
        document.getElementById("queue-count").textContent = `${waiting.length} Waiting`;
        document.getElementById("completed-count").textContent = `${completed.length} Completed`;

        list.innerHTML = "";
        completedList.innerHTML = "";

        if (waiting.length === 0) {
            list.innerHTML = '<div style="text-align: center; padding: 60px 20px; background: white; border-radius: 16px; border: 1px dashed #cbd5e1; color: #94a3b8; font-weight: 500;">Waiting room is empty.</div>';
        } else {
            waiting.forEach((patient, index) => {
                const shortCode = getShortCode(patient.daily_token_number);
                const isCurrent = index === 0; 
                const displayName = patient.patient_name || 'Patient';
                const displayId = patient.display_id || '--';
                const checkInTime = new Date(patient.timestamp).toLocaleTimeString("en-IN", { hour: '2-digit', minute: '2-digit' });
                
                const cityText = patient.city ? ` <span style="font-size: 13px; color: var(--primary-color); opacity: 0.8; margin-left: 4px;">(${patient.city})</span>` : "";

                let typeColors = "";
                let visitLabel = "New Consultation";
                
                if (patient.visit_type === "followup") {
                    typeColors = "background: #fef08a; color: #b45309;";
                    visitLabel = "Follow-up Consultation";
                }
                else if (patient.visit_type === "appointment") {
                    typeColors = "background: #e0e7ff; color: #0369a1;";
                    visitLabel = "Appointment Consultation";
                }
                else {
                    typeColors = "background: #f1f5f9; color: #64748b;";
                    visitLabel = "New Consultation";
                }

                const typeBadge = `
                    <select onchange="changeVisitType('${patient.local_token}', this.value)" 
                            style="font-size: 11px; padding: 4px 6px; border-radius: 4px; margin-left: 8px; font-weight: 800; text-transform: uppercase; border: 1px solid #cbd5e1; cursor: pointer; ${typeColors} outline: none;">
                        <option value="walkin" ${patient.visit_type === 'walkin' || !patient.visit_type ? 'selected' : ''}>WALK-IN</option>
                        <option value="appointment" ${patient.visit_type === 'appointment' ? 'selected' : ''}>APPOINTMENT</option>
                        <option value="followup" ${patient.visit_type === 'followup' ? 'selected' : ''}>FOLLOW-UP</option>
                    </select>
                `;

                const patientVitals = patient.vitals || {};
                const isPaid = patientVitals.is_paid === true;
                const safeVitals = JSON.stringify(patientVitals).replace(/'/g, "\\'").replace(/"/g, '&quot;');
                const feeText = patient.fee ? `Collect ₹${patient.fee}` : 'Mark Paid';

                let markPaidBtn = '';
                if (!isPaid) {
                    markPaidBtn = `<button onclick="markAsPaid('${patient.local_token}', '${safeVitals}')" class="btn btn-primary" style="padding: 6px 12px; font-size: 13px; background: #ea580c; border-color: #ea580c; box-shadow: 0 4px 10px rgba(234, 88, 12, 0.3);">💰 ${feeText}</button>`;
                } else {
                    markPaidBtn = `<span style="font-size: 13px; color: var(--success-color); font-weight: 800; text-align: center; background: #dcfce7; padding: 4px 8px; border-radius: 6px;">✅ Bill Paid</span>`;
                }

                const vitalsBtn = `<button onclick="openVitalsModal('${patient.local_token}', '${safeVitals}')" class="btn btn-secondary" style="padding: 6px 12px; font-size: 13px; background: white; border: 1px dashed #cbd5e1; box-shadow: none;">❤️ Vitals</button>`;
                const labsBtn = `<button onclick="openLabsModal('${patient.local_token}', '${displayName.replace(/'/g, "\\'")}')" class="btn btn-secondary" style="padding: 6px 12px; font-size: 13px; background: white; border: 1px dashed #cbd5e1; box-shadow: none;">🧪 Labs</button>`;
                const billBtn = `<button onclick="openBillModal('${displayName.replace(/'/g, "\\'")}', '${displayId}', '${shortCode}', '${patient.fee || 300}', '${visitLabel}')" class="btn btn-secondary" style="padding: 6px 12px; font-size: 13px; background: white; border: 1px dashed #cbd5e1; box-shadow: none;">🧾 Bill</button>`;

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
                card.className = `queue-card ${isCurrent ? 'active-patient' : ''}`;
                card.style.position = 'relative';
                
                card.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 15px; flex-wrap: wrap; width: 100%;">
                        <div style="display: flex; flex-direction: column; gap: 6px;">
                            <button onclick="moveQueue('${patient.local_token}', -1, event)" style="background:#f1f5f9; border:1px solid #cbd5e1; border-radius:4px; padding:4px 8px; cursor:pointer; color: #475569; font-size: 12px; line-height: 1; transition: all 0.2s;" onmouseover="this.style.background='#e2e8f0'" onmouseout="this.style.background='#f1f5f9'">▲</button>
                            <button onclick="moveQueue('${patient.local_token}', 1, event)" style="background:#f1f5f9; border:1px solid #cbd5e1; border-radius:4px; padding:4px 8px; cursor:pointer; color: #475569; font-size: 12px; line-height: 1; transition: all 0.2s;" onmouseover="this.style.background='#e2e8f0'" onmouseout="this.style.background='#f1f5f9'">▼</button>
                        </div>
                        <div class="token-badge">#${shortCode}</div>
                        <div>
                            <strong style="display: flex; align-items: center; font-size: 18px; color: var(--text-main); margin-bottom: 4px;">
                                ${isCurrent ? 'Currently with Doctor' : 'Waiting in Queue'} ${typeBadge}
                            </strong>
                            <span style="color: var(--text-muted); font-size: 13px; font-weight: 500;">In at ${checkInTime} • ID: ${displayId}</span>
                        </div>
                        <div style="display:flex; align-items:center; margin-left: 10px; background: #e0f2fe; padding: 6px 12px; border-radius: 8px;">
                            <span style="font-size: 16px; font-weight: 700; color: var(--primary-color);">👤 ${displayName}${cityText}</span>
                        </div>
                        ${actionButtons}
                    </div>
                    <button onclick="removePatientFromQueue('${patient.local_token}', event)" title="Remove patient from queue" style="position:absolute; right:16px; bottom:16px; display:inline-flex; align-items:center; justify-content:center; gap:8px; min-width:170px; height:38px; border:none; border-radius:12px; padding:0 14px; background:#fff1f2; color:#be123c; font-size:12px; font-weight:800; cursor:pointer; box-shadow:0 8px 18px rgba(190,18,60,0.12); border:1px solid #fecdd3;">🗑 Remove patient from queue</button>
                `;
                list.appendChild(card);
            });
        }

        if (completed.length === 0) {
             completedList.innerHTML = '<div style="text-align: center; padding: 40px 20px; color: #cbd5e1; font-weight: 500;">No completed visits yet.</div>';
        } else {
            completed.forEach(patient => {
                const shortCode = getShortCode(patient.daily_token_number);
                const displayName = patient.patient_name || 'Patient';
                const displayId = patient.display_id || '--';
                const cityText = patient.city ? ` <span style="font-size: 13px; color: #64748b; font-weight: 500; margin-left: 4px;">(${patient.city})</span>` : "";

                let typeBadge = "";
                let visitLabel = "New Consultation";
                
                if (patient.visit_type === "followup") {
                    typeBadge = `<span style="font-size: 11px; background: #fef08a; color: #b45309; padding: 2px 6px; border-radius: 4px; margin-left: 8px; font-weight: 800; text-transform: uppercase;">Follow-up</span>`;
                    visitLabel = "Follow-up Consultation";
                }
                else if (patient.visit_type === "appointment") {
                    typeBadge = `<span style="font-size: 11px; background: #e0e7ff; color: #0369a1; padding: 2px 6px; border-radius: 4px; margin-left: 8px; font-weight: 800; text-transform: uppercase;">Appointment</span>`;
                    visitLabel = "Appointment Consultation";
                }
                else {
                    typeBadge = `<span style="font-size: 11px; background: #f1f5f9; color: #64748b; padding: 2px 6px; border-radius: 4px; margin-left: 8px; font-weight: 800; text-transform: uppercase;">Walk-in</span>`;
                    visitLabel = "New Consultation";
                }

                const labsBtn = `<button onclick="openLabsModal('${patient.local_token}', '${displayName.replace(/'/g, "\\'")}')" class="btn btn-secondary" style="padding: 8px 20px; background: white; border-color: #cbd5e1; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">🧪 Labs</button>`;
                const billBtn = `<button onclick="openBillModal('${displayName.replace(/'/g, "\\'")}', '${displayId}', '${shortCode}', '${patient.fee || 300}', '${visitLabel}')" class="btn btn-secondary" style="padding: 8px 20px; background: white; border-color: #cbd5e1; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">🧾 Print Bill</button>`;

                const card = document.createElement("div");
                card.className = "queue-card";
                card.style.background = "#f1f5f9";
                card.style.borderColor = "#e2e8f0";
                card.style.boxShadow = "none";
                card.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 24px;">
                        <div class="token-badge" style="background: #e2e8f0; color: #94a3b8;">#${shortCode}</div>
                        <div>
                            <strong style="display: flex; align-items: center; font-size: 16px; color: #475569; margin-bottom: 2px;">👤 ${displayName}${cityText} (ID: ${displayId}) ${typeBadge}</strong>
                            <span style="color: #94a3b8; font-size: 13px; font-weight: 500;">Consultation Completed</span>
                        </div>
                    </div>
                    <div style="display: flex; gap: 10px;">
                        <button onclick="printPrescription('${patient.local_token}', '${displayName.replace(/'/g, "\\'")}', '${displayId}')" class="btn btn-secondary" style="padding: 8px 20px; background: white; border-color: #cbd5e1; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">🖨️ Print Rx</button>
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

window.printPrescription = async function(localToken, patientName, displayId) {
    try {
        const response = await fetch(`/api/events/history/${encodeURIComponent(localToken)}`);
        const data = await response.json();
        if (!data.history || data.history.length === 0) {
            alert("No prescription found.");
            return;
        }
        
        const visit = data.history[0]; 
        const today = new Date(visit.timestamp).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
        
        document.getElementById("print-clinic-name").textContent = currentClinicName;
        document.getElementById("print-doctor-name").textContent = currentDoctorName;
        document.getElementById("print-date").textContent = `Date: ${today}`;
        document.getElementById("print-patient-name").innerHTML = `<strong>Name:</strong> ${patientName || 'Patient'}`;
        document.getElementById("print-patient-id").innerHTML = `<strong>Patient ID:</strong> ${displayId || '--'}`;
        
        const printNotesContainer = document.getElementById("print-clinical-notes");
        const printComplaints = document.getElementById("print-complaints");
        const printDiagnosis = document.getElementById("print-diagnosis");
        const printTests = document.getElementById("print-tests");

        if (visit.complaints || visit.diagnosis) {
            printNotesContainer.style.display = "block";
            printComplaints.innerHTML = visit.complaints ? `<strong>C/E:</strong> ${visit.complaints}` : "";
            printDiagnosis.innerHTML = visit.diagnosis ? `<strong>Diagnosis:</strong> ${visit.diagnosis}` : "";
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
            visit.prescriptions.forEach(med => {
                printMedContainer.innerHTML += `
                    <div style="margin-bottom: 20px;">
                        <strong style="font-size: 16px; color: #000; display: block;">${med.name}</strong>
                        <span style="font-size: 14px; color: #444;">${med.instructions || ''}</span>
                    </div>
                `;
            });
        }

        document.body.className = "mode-rx";
        window.print();
        setTimeout(() => document.body.className = "", 1000);
    } catch (e) {
        alert("Failed to load prescription for printing.");
    }
};

loadStaffQueue();
setInterval(loadStaffQueue, 5000);