function extractCleanUUID(val) {
  if (!val || val === "null" || val === "undefined") return null;
  const match = String(val).match(
    /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/,
  );
  return match ? match[0] : null;
}

const urlParams = new URLSearchParams(window.location.search);
const rawScannedClinicId = urlParams.get("clinic");
const scannedClinicId = extractCleanUUID(rawScannedClinicId);
if (scannedClinicId) {
  localStorage.setItem("tap2med_patient_clinic_id", scannedClinicId);
}
const rawStoredClinicId =
  localStorage.getItem("tap2med_patient_clinic_id") ||
  localStorage.getItem("tap2med_clinic_id");
const clinicId = scannedClinicId || extractCleanUUID(rawStoredClinicId);
if (clinicId) {
  localStorage.setItem("tap2med_patient_clinic_id", clinicId);
}

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
  const currentClinicId =
    clinicId ||
    extractCleanUUID(localStorage.getItem("tap2med_patient_clinic_id")) ||
    extractCleanUUID(localStorage.getItem("tap2med_clinic_id"));

  if (!currentClinicId) {
    alert(
      "Invalid or Missing Clinic QR Code. Please scan the official clinic QR code to check in.",
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
  const consentInput = document.getElementById("share-history-consent");
  if (consentInput) consentInput.checked = false;

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
        clinic_id: clinicId,
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
  const activeClinic =
    clinicId ||
    extractCleanUUID(localStorage.getItem("tap2med_patient_clinic_id")) ||
    extractCleanUUID(localStorage.getItem("tap2med_clinic_id"));

  if (savedLocalToken && activeClinic) {
    try {
      const response = await fetch(
        `/api/events/status/${encodeURIComponent(savedLocalToken)}?clinic_id=${activeClinic}`,
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
        } else if (data.status === "Completed") {
          showScreen("screen-success");
          handleCompletedStatus(data);
        } else {
          localStorage.removeItem("tap2med_local_token");
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

  const consentInput = document.getElementById("share-history-consent");
  const shareHistory = consentInput ? consentInput.checked : false;

  const activeClinic =
    clinicId ||
    extractCleanUUID(localStorage.getItem("tap2med_patient_clinic_id")) ||
    extractCleanUUID(localStorage.getItem("tap2med_clinic_id"));

  if (!activeClinic) {
    alert("Missing Clinic ID. Please scan the official clinic QR code to check in.");
    return;
  }

  const payload = {
    phone: currentSessionPhone,
    member_id: selectedMemberId,
    clinic_id: activeClinic,
    name: patientName,
    city: cityInput ? cityInput.value.trim() : null,
    age: patientAge ? parseInt(patientAge, 10) : null,
    share_network_history: shareHistory,
  };

  const headers = { "Content-Type": "application/json" };
  const savedPatientId = localStorage.getItem("tap2med_patient_id");
  const cleanedPatientId = extractCleanUUID(savedPatientId) || (savedPatientId && savedPatientId.length === 32 ? savedPatientId : null);
  if (cleanedPatientId) {
    headers["X-Patient-ID"] = cleanedPatientId;
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

function handleCompletedStatus(data) {
  const waitStatusEl = document.getElementById("wait-status");
  if (!waitStatusEl) return;

  const savedPhone =
    currentSessionPhone || localStorage.getItem("tap2med_last_phone");
  let waUrl = "whatsapp://";
  if (savedPhone && data.prescription_text) {
    waUrl = `whatsapp://send?phone=91${savedPhone}&text=${encodeURIComponent(data.prescription_text)}`;
  }

  waitStatusEl.className = "status-live text-green";
  waitStatusEl.innerHTML = `
    <div style="font-weight: 800; margin-bottom: 10px; font-size: 22px; color: #15803d;">Consultation Complete! 🎉</div>
    <p style="font-size: 14px; color: #64748b; margin-bottom: 20px; font-weight: 500;">Your digital prescription is ready. Tap below to get it on WhatsApp or discover nearby pharmacies with all your medicines in stock.</p>
    <div style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 16px;">
      <a href="${waUrl}" style="background: #25D366; color: white; padding: 14px 20px; border-radius: 12px; text-decoration: none; font-size: 15px; font-weight: 700; width: 100%; box-sizing: border-box; box-shadow: 0 4px 12px rgba(37, 211, 102, 0.25); display: flex; align-items: center; justify-content: center; gap: 10px;">
        <span>💬 Open on WhatsApp</span>
      </a>
      <button type="button" id="btn-get-meds-nearby" style="background: linear-gradient(180deg, #0284c7 0%, #0369a1 100%); color: white; padding: 14px 20px; border-radius: 12px; border: none; font-size: 15px; font-weight: 700; width: 100%; box-sizing: border-box; box-shadow: 0 4px 14px rgba(2, 132, 199, 0.25); display: flex; align-items: center; justify-content: center; gap: 8px; cursor: pointer; transition: all 0.2s;">
        <span>📍 Get Meds Nearby (Within 1000m)</span>
      </button>
    </div>
    <div id="nearby-meds-container" style="display: none; margin-top: 18px; border-top: 1.5px dashed #cbd5e1; padding-top: 20px; text-align: left;"></div>
  `;

  const medsBtn = document.getElementById("btn-get-meds-nearby");
  if (medsBtn) {
    medsBtn.addEventListener("click", () => {
      const medsSection = document.getElementById("nearby-meds-container");
      if (medsSection) {
        const isHidden = medsSection.style.display === "none";
        medsSection.style.display = isHidden ? "block" : "none";
        if (isHidden) {
          medsBtn.style.background = "#0369a1";
          initNearbyPharmacies(data.medicines || []);
          medsSection.scrollIntoView({ behavior: "smooth" });
        } else {
          medsBtn.style.background = "linear-gradient(180deg, #0284c7 0%, #0369a1 100%)";
        }
      }
    });
  }
}

function startQueuePolling(localToken) {
  if (pollingInterval) clearInterval(pollingInterval);

  const activeClinic =
    clinicId ||
    extractCleanUUID(localStorage.getItem("tap2med_patient_clinic_id")) ||
    extractCleanUUID(localStorage.getItem("tap2med_clinic_id"));

  pollingInterval = setInterval(async () => {
    try {
      const response = await fetch(
        `/api/events/status/${encodeURIComponent(localToken)}?clinic_id=${activeClinic}`,
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
        handleCompletedStatus(data);
        currentSessionPhone = null;
        selectedMemberId = null;
      }
    } catch (error) {
      console.error("Polling error:", error);
    }
  }, 3000);
}

// ----------------- NEARBY PHARMACIES & GPS MAP -----------------

let nearbyMapInstance = null;
let currentPharmacies = [];
let userCoords = null;

function calculateDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // metres
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c);
}

async function initNearbyPharmacies(medicines = []) {
  const container = document.getElementById("nearby-meds-container");
  if (!container) return;

  container.innerHTML = `
    <div style="text-align: center; padding: 24px 16px; color: #64748b;">
      <div style="font-size: 28px; margin-bottom: 8px;">📡</div>
      <p style="font-size: 14px; font-weight: 600; margin: 0;">Detecting GPS & scanning verified partner pharmacies within 1000m...</p>
    </div>
  `;

  // Read clinicId from localStorage ("tap2med_patient_clinic_id") or URL param ("clinic")
  const urlParamClinic = new URLSearchParams(window.location.search).get("clinic");
  const storedClinic =
    localStorage.getItem("tap2med_patient_clinic_id") ||
    localStorage.getItem("tap2med_clinic_id");
  const activeClinicId = extractCleanUUID(urlParamClinic) || extractCleanUUID(storedClinic);

  const defaultLat = 28.5672;
  const defaultLng = 77.2100;

  const fetchAndRender = async (lat, lng) => {
    userCoords = { lat, lng };

    if (!activeClinicId) {
      renderNearbyPharmaciesUI(lat, lng, medicines, []);
      return;
    }

    try {
      const res = await fetch(
        `/api/clinics/${activeClinicId}/pharmacies/nearby?lat=${lat}&lng=${lng}&radius_meters=1000`
      );
      if (!res.ok) {
        throw new Error(`Server returned ${res.status}`);
      }
      const data = await res.json();
      const pharmacies = (data && data.pharmacies) || [];
      renderNearbyPharmaciesUI(lat, lng, medicines, pharmacies);
    } catch (err) {
      console.warn("Error fetching connected pharmacies:", err);
      renderNearbyPharmaciesUI(lat, lng, medicines, []);
    }
  };

  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        fetchAndRender(pos.coords.latitude, pos.coords.longitude);
      },
      () => {
        fetchAndRender(defaultLat, defaultLng);
      },
      { timeout: 5000 },
    );
  } else {
    fetchAndRender(defaultLat, defaultLng);
  }
}

function renderNearbyPharmaciesUI(lat, lng, medicines, pharmacies = []) {
  userCoords = { lat, lng };

  currentPharmacies = (pharmacies || []).map((p, idx) => {
    const pLat = Number(p.latitude || p.lat || lat);
    const pLng = Number(p.longitude || p.lng || lng);
    const dist =
      p.distance !== undefined
        ? Number(p.distance)
        : p.distance_meters !== undefined
          ? Number(p.distance_meters)
          : calculateDistanceMeters(lat, lng, pLat, pLng);

    return {
      id: String(p.pharmacy_id || p.id || `pharm-${idx}`),
      pharmacy_id: String(p.pharmacy_id || p.id || `pharm-${idx}`),
      name: p.name || "Clinic-Connected Pharmacy",
      address: p.address || "Near Clinic Premises",
      phone: p.phone || "",
      hours: p.hours || "Open Now",
      latitude: pLat,
      longitude: pLng,
      lat: pLat,
      lng: pLng,
      distance: dist,
      walkTime: Math.max(1, Math.round(dist / 75)),
    };
  });

  currentPharmacies.sort((a, b) => a.distance - b.distance);

  const container = document.getElementById("nearby-meds-container");
  if (!container) return;

  if (!currentPharmacies.length) {
    container.innerHTML = `
      <div style="margin-bottom: 14px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; flex-wrap: wrap; gap: 6px;">
          <strong style="font-size: 16px; color: #0f172a;">Connected Pharmacies</strong>
          <span style="background: #f1f5f9; color: #64748b; font-size: 11.5px; font-weight: 700; padding: 3px 8px; border-radius: 999px;">1000m Walking Radius</span>
        </div>
        <p style="font-size: 12.5px; color: #64748b; margin: 0;">Pharmacies connected to this clinic with verified stock for all your prescribed medicines.</p>
      </div>
      <div style="text-align: center; padding: 32px 16px; background: #f8fafc; border: 1.5px dashed #cbd5e1; border-radius: 12px; margin-top: 12px;">
        <div style="font-size: 32px; margin-bottom: 8px;">🏥</div>
        <strong style="font-size: 14px; color: #334155; display: block; margin-bottom: 4px;">No verified partner pharmacies within 1km of this clinic.</strong>
        <p style="font-size: 12px; color: #64748b; margin: 0;">No active pharmacies connected to this clinic were found within 1000m walking distance.</p>
      </div>
    `;
    return;
  }

  const medCount = medicines && medicines.length ? medicines.length : "All";
  const medTags = medicines && medicines.length
    ? medicines.map((m) => `<span style="background: #f0fdf4; color: #166534; font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 6px; border: 1px solid #bbf7d0;">✓ ${escapeHtml(m)}</span>`).join(" ")
    : '<span style="background: #f0fdf4; color: #166534; font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 6px; border: 1px solid #bbf7d0;">✓ Prescribed Medicines in Stock</span>';

  let html = `
    <div style="margin-bottom: 14px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; flex-wrap: wrap; gap: 6px;">
        <strong style="font-size: 16px; color: #0f172a;">Connected Pharmacies</strong>
        <span style="background: #dcfce7; color: #15803d; font-size: 11.5px; font-weight: 700; padding: 3px 8px; border-radius: 999px;">🟢 1000m Walking Radius</span>
      </div>
      <p style="font-size: 12.5px; color: #64748b; margin: 0;">Pharmacies connected to this clinic with verified stock for all your prescribed medicines.</p>
    </div>

    <div style="margin-bottom: 14px; display: flex; flex-wrap: wrap; gap: 6px;">
      ${medTags}
    </div>

    <div id="pharmacy-cards-list">
  `;

  currentPharmacies.forEach((p) => {
    html += `
      <div class="pharmacy-card" id="card-${p.id}" onclick="window.selectNearbyPharmacy('${p.id}')">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6px;">
          <div>
            <strong style="font-size: 15px; color: #0f172a; display: block;">${escapeHtml(p.name)}</strong>
            <span style="font-size: 12px; color: #64748b;">${escapeHtml(p.address)}${p.phone ? ` • ${escapeHtml(p.phone)}` : ""}</span>
          </div>
          <span style="background: #e0f2fe; color: #0369a1; font-size: 12px; font-weight: 800; padding: 4px 8px; border-radius: 8px; white-space: nowrap; margin-left: 8px;">
            ${p.distance}m • ~${p.walkTime} min
          </span>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; font-size: 12px; margin-top: 8px; border-top: 1px dashed #f1f5f9; padding-top: 8px;">
          <span style="color: #16a34a; font-weight: 700;">● ${medCount} Meds In Stock</span>
          <span style="color: #0284c7; font-weight: 700; display: inline-flex; align-items: center; gap: 4px;">🗺️ Select & View Map →</span>
        </div>
      </div>
    `;
  });

  html += `
    </div>

    <!-- Embedded Map Preview -->
    <div id="pharmacy-map-container" style="display: none; margin-top: 18px; border-radius: 14px; overflow: hidden; border: 1.5px solid #cbd5e1; box-shadow: 0 4px 14px rgba(0,0,0,0.06);">
      <div id="pharmacy-leaflet-map" style="height: 220px; width: 100%; background: #f8fafc;"></div>
      <div id="pharmacy-directions-panel" style="background: white; padding: 14px 16px; border-top: 1px solid #e2e8f0; text-align: left;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
          <div>
            <strong id="dir-pharm-name" style="font-size: 15px; color: #0f172a; display: block;">Select a pharmacy</strong>
            <span id="dir-pharm-dist" style="font-size: 12px; color: #64748b;">Walking distance</span>
          </div>
          <span style="background: #dcfce7; color: #166534; font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 6px;">Ready for Pickup</span>
        </div>
        <button type="button" id="btn-launch-directions" style="background: #0284c7; color: white; width: 100%; padding: 12px; border-radius: 10px; border: none; font-size: 14px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; box-shadow: 0 2px 8px rgba(2, 132, 199, 0.3);">
          <span>🧭 Open Walking Directions</span>
        </button>
      </div>
    </div>
  `;

  container.innerHTML = html;
}

function selectNearbyPharmacy(pharmId) {
  const pharm = currentPharmacies.find((p) => p.id === pharmId);
  if (!pharm || !userCoords) return;

  document.querySelectorAll(".pharmacy-card").forEach((c) => c.classList.remove("selected"));
  const card = document.getElementById(`card-${pharmId}`);
  if (card) card.classList.add("selected");

  const mapContainer = document.getElementById("pharmacy-map-container");
  if (mapContainer) mapContainer.style.display = "block";

  const nameEl = document.getElementById("dir-pharm-name");
  const distEl = document.getElementById("dir-pharm-dist");
  if (nameEl) nameEl.textContent = pharm.name;
  if (distEl) distEl.textContent = `${pharm.distance} meters away (~${pharm.walkTime} min walk) • ${pharm.address}`;

  const dirBtn = document.getElementById("btn-launch-directions");
  if (dirBtn) {
    dirBtn.onclick = () => {
      const gmapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${userCoords.lat},${userCoords.lng}&destination=${pharm.latitude},${pharm.longitude}&travelmode=walking`;
      window.open(gmapsUrl, "_blank");
    };
  }

  renderLeafletRoute(userCoords.lat, userCoords.lng, pharm.latitude, pharm.longitude, pharm.name);

  mapContainer.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function renderLeafletRoute(userLat, userLng, destLat, destLng, destName) {
  if (typeof L === "undefined") {
    const mapEl = document.getElementById("pharmacy-leaflet-map");
    if (mapEl) {
      mapEl.innerHTML = `
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: #64748b; font-size: 13px;">
          <span style="font-size: 32px; margin-bottom: 6px;">🗺️</span>
          <span>Click "Open Walking Directions" below to start navigation.</span>
        </div>`;
    }
    return;
  }

  const mapEl = document.getElementById("pharmacy-leaflet-map");
  if (!mapEl) return;

  if (nearbyMapInstance) {
    nearbyMapInstance.remove();
    nearbyMapInstance = null;
  }

  nearbyMapInstance = L.map("pharmacy-leaflet-map", {
    zoomControl: false,
    attributionControl: false,
  });

  L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
    maxZoom: 19,
    subdomains: "abcd",
  }).addTo(nearbyMapInstance);

  L.circle([userLat, userLng], {
    radius: 1000,
    color: "#0284c7",
    fillColor: "#0284c7",
    fillOpacity: 0.05,
    weight: 1.5,
    dashArray: "4, 4",
  }).addTo(nearbyMapInstance);

  const userIcon = L.divIcon({
    className: "user-map-pin",
    html: `<div style="background: #0284c7; width: 14px; height: 14px; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 0 4px rgba(2, 132, 199, 0.4);"></div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
  L.marker([userLat, userLng], { icon: userIcon }).addTo(nearbyMapInstance).bindPopup("You are here");

  const pharmIcon = L.divIcon({
    className: "pharm-map-pin",
    html: `<div style="background: #16a34a; color: white; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: bold; border: 2px solid white; box-shadow: 0 4px 10px rgba(0,0,0,0.3);">🏥</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
  L.marker([destLat, destLng], { icon: pharmIcon }).addTo(nearbyMapInstance).bindPopup(`<strong>${escapeHtml(destName)}</strong><br>All meds in stock ✓`).openPopup();

  L.polyline(
    [
      [userLat, userLng],
      [destLat, destLng],
    ],
    {
      color: "#0284c7",
      weight: 3.5,
      dashArray: "6, 6",
      opacity: 0.85,
    },
  ).addTo(nearbyMapInstance);

  nearbyMapInstance.fitBounds(
    [
      [userLat, userLng],
      [destLat, destLng],
    ],
    { padding: [40, 40], maxZoom: 17 },
  );

  setTimeout(() => {
    if (nearbyMapInstance) nearbyMapInstance.invalidateSize();
  }, 120);
}

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

window.selectNearbyPharmacy = selectNearbyPharmacy;
