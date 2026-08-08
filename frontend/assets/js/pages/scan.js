const urlParams = new URLSearchParams(window.location.search);
const scannedClinicId = urlParams.get("clinic");

let currentSessionPhone = null;
let selectedMemberId = null;

const defaultMembers = [
    { id: 0, name: "Self" },
    { id: 1, name: "Mother" },
    { id: 2, name: "Father" },
    { id: 3, name: "Wife" },
    { id: 4, name: "Son" },
    { id: 5, name: "Daughter" }
];

const savedMembers = localStorage.getItem("tap2med_family");
let familyMembers = savedMembers
    ? JSON.parse(savedMembers)
    : defaultMembers;

const screens = [
    "screen-phone",
    "screen-members",
    "screen-add-member",
    "screen-success"
];

const phoneInput = document.getElementById("phone-input");
const newMemberInput = document.getElementById("new-member-name");
const memberListContainer = document.getElementById("member-list-container");
const tokenDisplay = document.getElementById("token-display");

function showScreen(screenId) {
    screens.forEach((id) => {
        document.getElementById(id).classList.add("hidden");
    });

    document.getElementById(screenId).classList.remove("hidden");
}

function goToMemberScreen() {
    if (!scannedClinicId) {
        alert("Invalid QR Code. Missing Clinic ID.");
        return;
    }

    const phoneValue = phoneInput.value.trim();

    if (phoneValue.length !== 10) {
        alert("Please enter a valid 10-digit number.");
        return;
    }

    currentSessionPhone = phoneValue;
    renderMemberList();
    showScreen("screen-members");
}

function renderMemberList() {
    memberListContainer.innerHTML = "";

    familyMembers.forEach((member) => {
        const row = document.createElement("button");

        row.type = "button";
        row.className = "member-row";
        row.textContent = member.name;

        row.addEventListener("click", () => {
            selectMember(member.id, row);
        });

        memberListContainer.appendChild(row);
    });

    const addMemberRow = document.createElement("button");

    addMemberRow.type = "button";
    addMemberRow.className = "member-row add-member";
    addMemberRow.textContent = "+ Add New Member";

    addMemberRow.addEventListener("click", showAddMemberScreen);

    memberListContainer.appendChild(addMemberRow);
}

function selectMember(memberId, rowElement) {
    selectedMemberId = memberId;

    const rows = memberListContainer.querySelectorAll(".member-row");

    rows.forEach((row) => {
        row.classList.remove("selected");
    });

    rowElement.classList.add("selected");
}

function showAddMemberScreen() {
    newMemberInput.value = "";
    showScreen("screen-add-member");
}

function saveNewMember() {
    const name = newMemberInput.value.trim();

    if (!name) {
        alert("Please enter a name.");
        return;
    }

    const uniqueId = Date.now();

    familyMembers.push({
        id: uniqueId,
        name
    });

    localStorage.setItem(
        "tap2med_family",
        JSON.stringify(familyMembers)
    );

    renderMemberList();
    showScreen("screen-members");
}

async function submitCheckIn() {
    if (
        currentSessionPhone === null ||
        selectedMemberId === null
    ) {
        alert("Please select a member first.");
        return;
    }

    const payload = {
        phone: currentSessionPhone,
        member_id: selectedMemberId,
        clinic_id: scannedClinicId
    };

    try {
        const response = await fetch("/api/events/checkin", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error("Backend failed");
        }

        const data = await response.json();

        localStorage.setItem(
            "tap2med_daily_token_number",
            data.daily_token_number
        );

        localStorage.setItem(
            "tap2med_local_token",
            data.local_token
        );

        currentSessionPhone = null;
        selectedMemberId = null;

        tokenDisplay.textContent = `#${data.queue_number}`;

        showScreen("screen-success");
    } catch (error) {
        alert("Network error. Please try again.");

        currentSessionPhone = null;
        selectedMemberId = null;
        phoneInput.value = "";

        showScreen("screen-phone");
    }
}

document
    .getElementById("submit-phone-btn")
    .addEventListener("click", goToMemberScreen);

document
    .getElementById("check-in-btn")
    .addEventListener("click", submitCheckIn);

document
    .getElementById("save-member-btn")
    .addEventListener("click", saveNewMember);

document
    .getElementById("cancel-member-btn")
    .addEventListener("click", () => {
        showScreen("screen-members");
    });

window.addEventListener("load", () => {
    const savedToken = localStorage.getItem(
        "tap2med_queue_number"
    );

    if (savedToken) {
        tokenDisplay.textContent = `#${savedToken}`;
        showScreen("screen-success");
    }
});