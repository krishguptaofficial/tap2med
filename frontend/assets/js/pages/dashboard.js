const clinicId = localStorage.getItem("tap2med_clinic_id");

// If they haven't logged in this morning, force them to the login page
if (!clinicId) {
    window.location = "/login";
}

const clinicId = params.get("clinic");

let currentLocalToken = null;
let isSaving = false;

const currentToken =
    document.getElementById("current-token");

const historyContent =
    document.getElementById("history-content");

const doctorName =
    document.getElementById("doc-name");

const clinicName =
    document.getElementById("clinic-name");

const prescriptionList =
    document.getElementById("rx-container");

const prescriptionStatus =
    document.getElementById("prescription-status");

const sidebar =
    document.getElementById("app-sidebar");

const sidebarBackdrop =
    document.getElementById("sidebar-backdrop");

const mobileMenuButton =
    document.getElementById("mobile-menu-btn");

function openSidebar() {
    sidebar.classList.add("open");
    sidebarBackdrop.classList.add("open");

    mobileMenuButton.setAttribute(
        "aria-expanded",
        "true"
    );
}

function closeSidebar() {
    sidebar.classList.remove("open");
    sidebarBackdrop.classList.remove("open");

    mobileMenuButton.setAttribute(
        "aria-expanded",
        "false"
    );
}

function addPrescriptionRow() {
    const number =
        prescriptionList
            .querySelectorAll(".prescription-row")
            .length + 1;

    const row =
        document.createElement("div");

    row.className = "prescription-row";

    const medicineField =
        document.createElement("div");

    medicineField.className = "field";

    const medicineLabel =
        document.createElement("label");

    medicineLabel.htmlFor =
        `medicine-${number}`;

    medicineLabel.textContent =
        "Medicine";

    const medicineInput =
        document.createElement("input");

    medicineInput.id =
        `medicine-${number}`;

    medicineInput.className =
        "input rx-med";

    medicineInput.type = "text";
    medicineInput.placeholder =
        "Medicine & dose";
    medicineInput.autocomplete =
        "off";

    medicineField.append(
        medicineLabel,
        medicineInput
    );

    const instructionField =
        document.createElement("div");

    instructionField.className =
        "field";

    const instructionLabel =
        document.createElement("label");

    instructionLabel.htmlFor =
        `instruction-${number}`;

    instructionLabel.textContent =
        "Instructions";

    const instructionInput =
        document.createElement("input");

    instructionInput.id =
        `instruction-${number}`;

    instructionInput.className =
        "input rx-freq";

    instructionInput.type = "text";
    instructionInput.placeholder =
        "Frequency & instructions";

    instructionInput.autocomplete =
        "off";

    instructionField.append(
        instructionLabel,
        instructionInput
    );

    row.append(
        medicineField,
        instructionField
    );

    prescriptionList.appendChild(row);
}

function clearPrescription() {
    prescriptionList.innerHTML = "";
    addPrescriptionRow();
}

async function loadQueue() {
    if (!clinicId) {
        currentToken.textContent = "#--";

        historyContent.innerHTML =
            '<p class="text-danger">Clinic ID is missing.</p>';

        return;
    }

    try {
        const response = await fetch(
            `/api/clinics/queue/${encodeURIComponent(
                clinicId
            )}`
        );

        if (!response.ok) {
            throw new Error(
                "Queue request failed"
            );
        }

        const data =
            await response.json();

        doctorName.textContent =
            data.doctor_name || "Doctor";

        clinicName.textContent =
            data.clinic_name || "Clinic";

        if (
            !data.queue ||
            data.queue.length === 0
        ) {
            currentToken.textContent = "—";
            currentLocalToken = null;

            historyContent.innerHTML =
                '<p class="text-muted">No patients waiting.</p>';

            return;
        }

        const patient =
            data.queue[0];

        const nextLocalToken =
            patient.local_token;

        currentToken.textContent =
            `#${patient.daily_token_number}`;

        if (
            currentLocalToken !==
            nextLocalToken
        ) {
            currentLocalToken =
                nextLocalToken;

            prescriptionStatus.textContent =
                "Draft";

            clearPrescription();

            await loadHistory(
                currentLocalToken
            );
        }
    } catch (error) {
        console.error(
            "Queue error:",
            error
        );

        historyContent.innerHTML =
            '<p class="text-danger">Unable to load queue.</p>';
    }
}

async function loadHistory(localToken) {
    historyContent.innerHTML =
        '<p class="text-muted">Loading history...</p>';

    try {
        const response = await fetch(
            `/api/events/history/${encodeURIComponent(
                localToken
            )}`
        );

        if (!response.ok) {
            throw new Error(
                "History request failed"
            );
        }

        const data =
            await response.json();

        if (
            !data.history ||
            data.history.length === 0
        ) {
            historyContent.innerHTML =
                '<p class="text-muted">No previous visits.</p>';

            return;
        }

        historyContent.innerHTML = "";

        data.history.forEach(
            (visit, index) => {
                const details =
                    document.createElement(
                        "details"
                    );

                if (index === 0) {
                    details.open = true;
                }

                const summary =
                    document.createElement(
                        "summary"
                    );

                const date =
                    new Date(
                        visit.timestamp
                    );

                summary.textContent =
                    date.toLocaleDateString(
                        "en-IN",
                        {
                            day: "numeric",
                            month: "short",
                            year: "numeric"
                        }
                    );

                const content =
                    document.createElement(
                        "div"
                    );

                if (
                    !visit.prescriptions ||
                    visit.prescriptions.length === 0
                ) {
                    const message =
                        document.createElement(
                            "p"
                        );

                    message.className =
                        "text-muted";

                    message.textContent =
                        "No medicines recorded.";

                    content.appendChild(
                        message
                    );
                } else {
                    const list =
                        document.createElement(
                            "ul"
                        );

                    visit.prescriptions.forEach(
                        (prescription) => {
                            const item =
                                document.createElement(
                                    "li"
                                );

                            const name =
                                document.createElement(
                                    "strong"
                                );

                            name.textContent =
                                prescription.name;

                            const instructions =
                                document.createTextNode(
                                    ` — ${prescription.instructions || ""}`
                                );

                            item.append(
                                name,
                                instructions
                            );

                            list.appendChild(
                                item
                            );
                        }
                    );

                    content.appendChild(
                        list
                    );
                }

                details.append(
                    summary,
                    content
                );

                historyContent.appendChild(
                    details
                );
            }
        );
    } catch (error) {
        console.error(
            "History error:",
            error
        );

        historyContent.innerHTML =
            '<p class="text-danger">Unable to load visit history.</p>';
    }
}

async function completeVisit() {
    if (
        !currentLocalToken ||
        isSaving
    ) {
        return;
    }

    const medicines = [];

    prescriptionList
        .querySelectorAll(
            ".prescription-row"
        )
        .forEach((row) => {
            const name =
                row
                    .querySelector(
                        ".rx-med"
                    )
                    .value
                    .trim();

            const instructions =
                row
                    .querySelector(
                        ".rx-freq"
                    )
                    .value
                    .trim();

            if (name) {
                medicines.push({
                    name,
                    instructions
                });
            }
        });

    if (!medicines.length) {
        const proceed =
            confirm(
                "No medicines have been entered. Complete this visit?"
            );

        if (!proceed) {
            return;
        }
    }

    isSaving = true;

    prescriptionStatus.textContent =
        "Saving...";

    try {
        const response =
            await fetch(
                "/api/events/complete",
                {
                    method: "PUT",
                    headers: {
                        "Content-Type":
                            "application/json"
                    },
                    body:
                        JSON.stringify({
                            local_token:
                                currentLocalToken,
                            medicines
                        })
                }
            );

        if (!response.ok) {
            throw new Error(
                "Prescription save failed"
            );
        }

        prescriptionStatus.textContent =
            "Saved";

        window.print();

        currentLocalToken = null;

        clearPrescription();

        await loadQueue();
    } catch (error) {
        console.error(
            "Complete visit error:",
            error
        );

        prescriptionStatus.textContent =
            "Save failed";

        alert(
            "The prescription could not be saved. Please check the connection and try again."
        );
    } finally {
        isSaving = false;
    }
}

document
    .getElementById("add-row-btn")
    .addEventListener(
        "click",
        addPrescriptionRow
    );

document
    .getElementById("print-btn")
    .addEventListener(
        "click",
        completeVisit
    );

document
    .getElementById("copy-prescription-btn")
    .addEventListener(
        "click",
        () => {
            alert(
                "Copy Last Prescription is not connected yet."
            );
        }
    );

mobileMenuButton
    .addEventListener(
        "click",
        () => {
            if (
                sidebar.classList.contains(
                    "open"
                )
            ) {
                closeSidebar();
            } else {
                openSidebar();
            }
        }
    );

sidebarBackdrop
    .addEventListener(
        "click",
        closeSidebar
    );

loadQueue();

setInterval(
    loadQueue,
    5000
);