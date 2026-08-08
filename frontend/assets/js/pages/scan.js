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
const memberListContainer =
    document.getElementById("member-list-container");
const tokenDisplay =
    document.getElementById("token-display");

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

    const phone = phoneInput.value.trim();

    if (!/^\d{10}$/.test(phone)) {
        alert("Please enter a valid 10-digit number.");
        return;
    }

    currentSessionPhone = phone;

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

    const addMember = document.createElement("button");

    addMember.type = "button";
    addMember.className = "member-row add-member";
    addMember.textContent = "+ Add New Member";

    addMember.addEventListener(
        "click",
        showAddMemberScreen
    );

    memberListContainer.appendChild(addMember);
}

function selectMember(memberId, rowElement) {
    selectedMemberId = memberId;

    memberListContainer
        .querySelectorAll(".member-row")
        .forEach((row) => {
            row.classList.remove("selected");
        });

    rowElement.classList.add("selected");
}

function showAddMemberScreen() {
    newMemberInput.value = "";
    showScreen("screen-add-member");
    newMemberInput.focus();
}

function saveNewMember() {
    const name = newMemberInput.value.trim();

    if (!name) {
        alert("Please enter a name.");
        return;
    }

    familyMembers.push({
        id: Date.now(),
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

    const button = document.getElementById("check-in-btn");

    button.disabled = true;
    button.textContent = "Checking in...";

    try {
        const response = await fetch(
            "/api/events/checkin",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(payload)
            }
        );

        if (!response.ok) {
            throw new Error("Check-in failed");
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

        tokenDisplay.textContent =
            `#${data.queue_number}`;

        currentSessionPhone = null;
        selectedMemberId = null;

        showScreen("screen-success");
    } catch (error) {
        console.error(error);

        alert(
            "Network error. Please try again."
        );

        currentSessionPhone = null;
        selectedMemberId = null;
        phoneInput.value = "";

        showScreen("screen-phone");
    } finally {
        button.disabled = false;
        button.textContent = "Check-in";
    }
}

document
    .getElementById("submit-phone-btn")
    .addEventListener(
        "click",
        goToMemberScreen
    );

document
    .getElementById("check-in-btn")
    .addEventListener(
        "click",
        submitCheckIn
    );

document
    .getElementById("save-member-btn")
    .addEventListener(
        "click",
        saveNewMember
    );

document
    .getElementById("cancel-member-btn")
    .addEventListener(
        "click",
        () => showScreen("screen-members")
    );

window.addEventListener("load", () => {
    const savedToken =
        localStorage.getItem(
            "tap2med_daily_token_number"
        );

    if (savedToken) {
        tokenDisplay.textContent =
            `#${savedToken}`;

        showScreen("screen-success");
    }
});