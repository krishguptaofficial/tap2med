const clinicId = localStorage.getItem("tap2med_clinic_id");
if (!clinicId) window.location.href = "/staff-login";

let currentClinicName = "Clinic";
let currentDoctorName = "Doctor";
window.currentWaitingTokens = [];

// Lab Flowsheet Variables
let patientLabData = [];
let labChartInstance = null;

function logout() {
    localStorage.removeItem("tap2med_clinic_id");
    localStorage.removeItem("tap2med_staff_role");
    window.location.href = "/staff-login";
}

function getShortCode(tokenNumber) {
    const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ"; 
    const letter = letters[(tokenNumber - 1) % 24]; 
    return `${letter}-${tokenNumber}`; 
}

function numberToWords(num) {
    const a = ['','One ','Two ','Three ','Four ', 'Five ','Six ','Seven ','Eight ','Nine ','Ten ','Eleven ','Twelve ','Thirteen ','Fourteen ','Fifteen ','Sixteen ','Seventeen ','Eighteen ','Nineteen '];
    const b = ['', '', 'Twenty','Thirty','Forty','Fifty', 'Sixty','Seventy','Eighty','Ninety'];
    if ((num = num.toString()).length > 9) return 'overflow';
    let n = ('000000000' + num).substr(-9).match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/);
    if (!n) return; let str = '';
    str += (n[1] != 0) ? (a[Number(n[1])] || b[n[1][0]] + ' ' + a[n[1][1]]) + 'Crore ' : '';
    str += (n[2] != 0) ? (a[Number(n[2])] || b[n[2][0]] + ' ' + a[n[2][1]]) + 'Lakh ' : '';
    str += (n[3] != 0) ? (a[Number(n[3])] || b[n[3][0]] + ' ' + a[n[3][1]]) + 'Thousand ' : '';
    str += (n[4] != 0) ? (a[Number(n[4])] || b[n[4][0]] + ' ' + a[n[4][1]]) + 'Hundred ' : '';
    str += (n[5] != 0) ? ((str != '') ? 'and ' : '') + (a[Number(n[5])] || b[n[5][0]] + ' ' + a[n[5][1]]) : '';
    return str ? str.trim().toUpperCase() + ' RUPEES ONLY' : '';
}

window.moveQueue = async function(localToken, direction, e) {
    if (e) e.stopPropagation();
    let tokens = [...window.currentWaitingTokens];
    const index = tokens.indexOf(localToken);
    if (index < 0) return;
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= tokens.length) return;
    
    [tokens[index], tokens[newIndex]] = [tokens[newIndex], tokens[index]];
    window.currentWaitingTokens = tokens; 
    
    try {
        await fetch(`/api/clinics/${clinicId}/queue/reorder`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ local_tokens: tokens })
        });
        window.location.reload();
    } catch (err) {
        console.error("Reorder failed");
    }
}

async function updatePatientCity(localToken) {
    const cityInput = document.getElementById(`city-input-${localToken}`);
    const cityVal = cityInput ? cityInput.value.trim() : '';
    if (!cityVal) return;
    
    const saveBtn = cityInput.nextElementSibling;
    saveBtn.textContent = "Saving...";
    
    try {
        await fetch("/api/events/city", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ local_token: localToken, city: cityVal })
        });
        loadStaffQueue();
    } catch (e) {
        alert("Failed to update city.");
        saveBtn.textContent = "Save";
    }
}

window.attemptManualLookup = async function() {
    const phone = document.getElementById("walkin-phone").value.trim();
    const memberDropdown = document.getElementById("manual-member-id");
    const selectedMember = memberDropdown ? parseInt(memberDropdown.value) : 0;
    const nameInput = document.getElementById("walkin-name");

    if (/^\d{10}$/.test(phone)) {
        try {
            const res = await fetch("/api/events/lookup", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    phone: phone,
                    member_id: selectedMember,
                    clinic_id: clinicId
                })
            });
            
            if (res.ok) {
                const data = await res.json();
                if (data.found && data.patient_name) {
                    nameInput.value = data.patient_name;
                    nameInput.style.borderColor = "var(--success-color)";
                    nameInput.style.backgroundColor = "#f0fdf4";
                    
                    setTimeout(() => {
                        nameInput.style.borderColor = "#cbd5e1";
                        nameInput.style.backgroundColor = "#f8fafc";
                    }, 1500);
                } else {
                    nameInput.value = "";
                }
            }
        } catch (e) {
            console.error("Manual lookup failed");
        }
    }
};

document.getElementById("walkin-phone").addEventListener("blur", attemptManualLookup);
document.getElementById("manual-member-id").addEventListener("change", attemptManualLookup);

window.manualCheckIn = async function() {
    const phoneInput = document.getElementById("walkin-phone");
    const phone = phoneInput.value.trim();
    const statusEl = document.getElementById("manual-status");
    const btn = document.getElementById("btn-manual-checkin");
    const memberDropdown = document.getElementById("manual-member-id");
    const selectedMember = memberDropdown ? parseInt(memberDropdown.value) : 0;
    const nameInput = document.getElementById("walkin-name");
    const patientName = nameInput ? nameInput.value.trim() : "Walk-in Patient";
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

// --- LAB FLOWSHEET INTEGRATION FOR STAFF ---
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
    const inputs = ['hba1c', 'fbs', 'ppbs', 'tsh', 'ft3', 'creat', 'hb'];
    inputs.forEach(id => {
        const el = document.getElementById(`lab-${id}`);
        if(el) {
            el.value = "";
            checkRange(el, el.getAttribute('data-min'), el.getAttribute('data-max'));
        }
    });
    
    const record = patientLabData.find(l => l.test_date === dateStr);
    if (record && record.results) {
        inputs.forEach(id => {
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
    
    const results = {
        hba1c: document.getElementById("lab-hba1c").value,
        fbs: document.getElementById("lab-fbs").value,
        ppbs: document.getElementById("lab-ppbs").value,
        tsh: document.getElementById("lab-tsh").value,
        ft3: document.getElementById("lab-ft3").value,
        creat: document.getElementById("lab-creat").value,
        hb: document.getElementById("lab-hb").value,
    };
    
    const payload = {
        local_token: localToken,
        lab_record: { test_date: dateStr, results: results }
    };
    
    try {
        const btn = document.querySelector("#labs-modal .btn-primary");
        btn.textContent = "Saving...";
        await fetch("/api/events/labs", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        await fetchLabData(localToken);
        btn.textContent = "Saved ✓";
        setTimeout(() => btn.textContent = "Save Values", 2000);
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
    const param = document.getElementById("chart-parameter").value;
    const paramLabel = document.getElementById("chart-parameter").options[document.getElementById("chart-parameter").selectedIndex].text;
    
    const filteredData = patientLabData.filter(l => l.results && l.results[param] !== undefined && l.results[param] !== "");
    const labels = filteredData.map(l => {
        const d = new Date(l.test_date);
        return d.toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "2-digit" });
    });
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
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: function(context) { return context.parsed.y + " " + paramLabel; } } }
            },
            scales: {
                y: { beginAtZero: false, grid: { borderDash: [4, 4] } },
                x: { grid: { display: false } }
            }
        }
    });
};

async function loadStaffQueue() {
    if (document.activeElement && document.activeElement.id && document.activeElement.id.startsWith('city-input-')) {
        return;
    }

    try {
        const response = await fetch(`/api/clinics/queue/${encodeURIComponent(clinicId)}`);
        if (!response.ok) return;

        const data = await response.json();
        currentClinicName = data.clinic_name;
        currentDoctorName = data.doctor_name;

        const list = document.getElementById("staff-queue-list");
        const completedList = document.getElementById("staff-completed-list");
        const enableVitals = localStorage.getItem("tap2med_enable_vitals") !== "false";

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
                else typeBadge = `<span style="font-size: 11px; background: #f1f5f9; color: #64748b; padding: 2px 6px; border-radius: 4px; margin-left: 8px; font-weight: 800; text-transform: uppercase;">Walk-in</span>`;

                const patientVitals = patient.vitals || {};
                const isPaid = patientVitals.is_paid === true;
                
                const hasVitals = Object.keys(patientVitals).some(k => k !== 'is_paid' && patientVitals[k] !== null);
                const safeVitals = JSON.stringify(patientVitals).replace(/'/g, "\\'");
                const feeText = patient.fee ? `Collect ₹${patient.fee}` : 'Mark Paid';

                let actionButtons = '';
                let markPaidBtn = '';
                if (!isPaid) {
                    markPaidBtn = `<button onclick="markAsPaid('${patient.local_token}', '${safeVitals}')" class="btn btn-primary" style="padding: 6px 12px; font-size: 13px; background: #ea580c; border-color: #ea580c; box-shadow: 0 4px 10px rgba(234, 88, 12, 0.3);">💰 ${feeText}</button>`;
                } else {
                    markPaidBtn = `<span style="font-size: 13px; color: var(--success-color); font-weight: 800; text-align: center; background: #dcfce7; padding: 4px 8px; border-radius: 6px;">✅ Bill Paid</span>`;
                }

                let vitalsBtn = '';
                if (enableVitals) {
                    vitalsBtn = `<button onclick="openVitalsModal('${patient.local_token}', '${safeVitals}')" class="btn btn-secondary" style="padding: 6px 12px; font-size: 13px; background: white; border: 1px dashed #cbd5e1; box-shadow: none;">❤️ Vitals</button>`;
                    if (hasVitals) {
                        vitalsBtn += `<span style="font-size: 11px; color: var(--success-color); font-weight: 600; text-align: center;">✓ Vitals Saved</span>`;
                    }
                }

                const labsBtn = `<button onclick="openLabsModal('${patient.local_token}', '${displayName.replace(/'/g, "\\'")}')" class="btn btn-secondary" style="padding: 6px 12px; font-size: 13px; background: white; border: 1px dashed #cbd5e1; box-shadow: none;">🧪 Labs</button>`;
                const billBtn = patient.fee ? `<button onclick="printBill('${displayName.replace(/'/g, "\\'")}', '${displayId}', '${shortCode}', '${currentDoctorName.replace(/'/g, "\\'")}', '${visitLabel}', '${patient.fee}')" class="btn btn-secondary" style="padding: 6px 12px; font-size: 13px; background: white; border: 1px dashed #cbd5e1; box-shadow: none;">🧾 Bill</button>` : '';

                actionButtons = `
                  <div style="display:flex; flex-direction: column; gap: 8px; margin-left: auto; border-left: 2px solid #f1f5f9; padding-left: 24px; min-width: 140px;">
                      ${markPaidBtn}
                      <div style="display: flex; gap: 8px;">
                          ${vitalsBtn}
                          ${labsBtn}
                          ${billBtn}
                      </div>
                  </div>
                `;

                let cityHtml = patient.city 
                    ? `<span style="font-size: 13px; color: var(--text-muted); font-weight: 600; margin-left: 6px;">(${patient.city})</span>`
                    : `<div style="display:flex; gap: 4px; align-items:center; margin-left: 8px;">
                         <input type="text" id="city-input-${patient.local_token}" placeholder="Add City" style="padding: 4px 8px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 12px; width: 110px;">
                         <button onclick="updatePatientCity('${patient.local_token}')" class="btn btn-secondary" style="padding: 4px 8px; font-size: 12px; min-height: 26px; height: 26px;">Save</button>
                       </div>`;

                const card = document.createElement("div");
                card.className = `queue-card ${isCurrent ? 'active-patient' : ''}`;
                card.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 24px; flex-wrap: wrap;">
                        <div style="display: flex; flex-direction: column; margin-right: -10px; gap: 4px;">
                            <button onclick="moveQueue('${patient.local_token}', -1, event)" style="background:transparent; border:none; padding:0; cursor:pointer; color: var(--primary-color); font-size: 18px; line-height: 1;">▲</button>
                            <button onclick="moveQueue('${patient.local_token}', 1, event)" style="background:transparent; border:none; padding:0; cursor:pointer; color: var(--primary-color); font-size: 18px; line-height: 1;">▼</button>
                        </div>
                        <div class="token-badge">#${shortCode}</div>
                        <div>
                            <strong style="display: block; font-size: 18px; color: var(--text-main); margin-bottom: 4px;">
                                ${isCurrent ? 'Currently with Doctor' : 'Waiting in Queue'} ${typeBadge}
                            </strong>
                            <span style="color: var(--text-muted); font-size: 13px; font-weight: 500;">In at ${checkInTime} • ID: ${displayId}</span>
                        </div>
                        <div style="display:flex; align-items:center; margin-left: 20px; background: #e0f2fe; padding: 6px 12px; border-radius: 8px;">
                            <span style="font-size: 16px; font-weight: 700; color: var(--primary-color);">👤 ${displayName}</span>
                            ${cityHtml}
                        </div>
                        ${actionButtons}
                    </div>
                    <button onclick="cancelToken('${patient.local_token}')" class="btn btn-ghost" style="color: var(--error-color); padding: 8px 16px; margin-left: 16px;">Remove</button>
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
                else typeBadge = `<span style="font-size: 11px; background: #f1f5f9; color: #64748b; padding: 2px 6px; border-radius: 4px; margin-left: 8px; font-weight: 800; text-transform: uppercase;">Walk-in</span>`;

                const labsBtn = `<button onclick="openLabsModal('${patient.local_token}', '${displayName.replace(/'/g, "\\'")}')" class="btn btn-secondary" style="padding: 8px 20px; background: white; border-color: #cbd5e1; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">🧪 Labs</button>`;
                const billBtn = patient.fee ? `<button onclick="printBill('${displayName.replace(/'/g, "\\'")}', '${displayId}', '${shortCode}', '${currentDoctorName.replace(/'/g, "\\'")}', '${visitLabel}', '${patient.fee}')" class="btn btn-secondary" style="padding: 8px 20px; background: white; border-color: #cbd5e1; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">🧾 Print Bill</button>` : '';

                const card = document.createElement("div");
                card.className = "queue-card";
                card.style.background = "#f1f5f9";
                card.style.borderColor = "#e2e8f0";
                card.style.boxShadow = "none";
                card.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 24px;">
                        <div class="token-badge" style="background: #e2e8f0; color: #94a3b8;">#${shortCode}</div>
                        <div>
                            <strong style="display: block; font-size: 16px; color: #475569; margin-bottom: 2px;">👤 ${displayName} (ID: ${displayId}) ${typeBadge}</strong>
                            <span style="color: #94a3b8; font-size: 13px; font-weight: 500;">Consultation Completed</span>
                        </div>
                    </div>
                    <div style="display: flex; gap: 10px;">
                        <button onclick="printPrescription('${patient.local_token}')" class="btn btn-secondary" style="padding: 8px 20px; background: white; border-color: #cbd5e1; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">🖨️ Print Rx</button>
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

window.cancelToken = async function(localToken) {
    if(!confirm("Are you sure you want to remove this patient from the queue?")) return;
    try {
        await fetch("/api/events/complete", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ local_token: localToken, medicines: [] })
        });
        loadStaffQueue();
    } catch (e) {
        alert("Failed to remove patient.");
    }
}

window.printPrescription = async function(localToken) {
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
        
        let weightStr = "";
        if (visit.vitals && visit.vitals.wt) weightStr = visit.vitals.wt + "kg";
        else if (visit.weight && visit.weight.includes('Wt:')) weightStr = visit.weight.split('Wt:')[1].split('|')[0].trim();
        
        document.getElementById("print-vitals-field").textContent = weightStr ? weightStr : "N/A";
        
        let ce = [], dx = [], tests = [], advice = [], rx = [];
        visit.prescriptions.forEach(med => {
            if (med.name.startsWith("C/E:")) ce.push(med.name.replace("C/E:", "").trim());
            else if (med.name.startsWith("Dx:")) dx.push(med.name.replace("Dx:", "").trim());
            else if (med.name.startsWith("Test:")) tests.push(med.name.replace("Test:", "").trim());
            else if (med.name.startsWith("Advice:")) advice.push({ name: med.name.replace("Advice:", "").trim(), inst: med.instructions });
            else rx.push(med);
        });

        let printHTML = "";
        
        if (ce.length > 0) printHTML += `<div style="margin-bottom: 12px; font-size: 15px;"><strong>C/E:</strong> ${ce.join(", ")}</div>`;
        if (dx.length > 0) printHTML += `<div style="margin-bottom: 12px; font-size: 15px;"><strong>Diagnosis:</strong> ${dx.join(", ")}</div>`;

        if (rx.length > 0 || advice.length > 0) {
            rx.forEach((med, index) => {
                printHTML += `
                    <div style="display: flex; gap: 15px; margin-bottom: 20px; align-items: baseline;">
                        <div style="font-weight: 700; font-size: 15px; color: #0f172a; min-width: 20px;">${index + 1}.</div>
                        <div>
                            <strong style="font-size: 16px; color: #0f172a; display: block;">${med.name}</strong>
                            <span style="font-size: 14px; color: #475569; display: block; font-style: italic;">${med.instructions}</span>
                        </div>
                    </div>`;
            });
            advice.forEach((adv) => {
                printHTML += `
                    <div style="display: flex; gap: 15px; margin-bottom: 20px; align-items: baseline;">
                        <div style="font-weight: 700; font-size: 15px; color: #166534; min-width: 20px;">*</div>
                        <div>
                            <strong style="font-size: 15px; color: #166534; display: block;">Advice: ${adv.name}</strong>
                            <span style="font-size: 14px; color: #475569; display: block; font-style: italic;">${adv.inst}</span>
                        </div>
                    </div>`;
            });
        }

        if (tests.length > 0) {
            printHTML += `<div style="margin-top: 24px; padding-top: 16px; border-top: 1px dashed #cbd5e1; font-size: 15px;"><strong>Advised Tests:</strong> ${tests.join(", ")}</div>`;
        }

        document.getElementById("print-medicines").innerHTML = printHTML;
        window.print();
    } catch (e) {
        alert("Failed to load prescription for printing.");
    }
}

window.printBill = function(patientName, displayId, tokenNum, doctorName, visitType, fee) {
    const now = new Date();
    const dateStr = now.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
    const timeStr = now.toLocaleTimeString("en-IN", { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    document.getElementById('bill-clinic-name').textContent = currentClinicName;
    document.getElementById('bill-patient-name').textContent = patientName;
    document.getElementById('bill-patient-id').textContent = displayId;
    document.getElementById('bill-date').textContent = `${dateStr} ${timeStr}`;
    document.getElementById('bill-number').textContent = `#${tokenNum}`;
    document.getElementById('bill-service-name').textContent = `Dr. ${doctorName} - ${visitType}`;
    document.getElementById('bill-price').textContent = fee;
    document.getElementById('bill-net-price').textContent = fee;
    document.getElementById('bill-total-1').textContent = fee;
    document.getElementById('bill-total-2').textContent = fee;
    document.getElementById('bill-total-3').textContent = fee;
    document.getElementById('bill-amount-words').textContent = numberToWords(fee);
    document.body.classList.add('mode-bill');
    window.print();
    setTimeout(() => { document.body.classList.remove('mode-bill'); }, 500);
}

loadStaffQueue();
setInterval(loadStaffQueue, 5000);