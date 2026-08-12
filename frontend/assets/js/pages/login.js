const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const btnPasswordLogin = document.getElementById("btn-password-login");
const btnSendLoginOtp = document.getElementById("btn-send-login-otp");
const otpSection = document.getElementById("otp-section");
const otpInput = document.getElementById("otp");
const btnVerifyOtp = document.getElementById("btn-verify-otp");
const forgotLink = document.getElementById("forgot-link");
const forgotSection = document.getElementById("forgot-section");
const btnForgotSend = document.getElementById("btn-forgot-send");
const forgotEmail = document.getElementById("forgot-email");
const resetSection = document.getElementById("reset-section");
const btnResetSubmit = document.getElementById("btn-reset-submit");
const resetOtp = document.getElementById("reset-otp");
const resetPassword = document.getElementById("reset-password");
const messageBox = document.getElementById("message");

function showMessage(msg, isError = false) {
  messageBox.textContent = msg;
  messageBox.style.color = isError ? "crimson" : "green";
}

btnPasswordLogin.addEventListener("click", async () => {
  const payload = { email: emailInput.value, password: passwordInput.value };
  try {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      showMessage(data.detail || "Login failed", true);
      return;
    }
    showMessage("Login successful");
    // redirect to dashboard with clinic id
    localStorage.setItem("tap2med_clinic_id", data.clinic_id);
    window.location = "/dashboard";
  } catch (e) {
    showMessage("Network error", true);
  }
});

btnSendLoginOtp.addEventListener("click", async () => {
  const payload = { email: emailInput.value };
  try {
    const res = await fetch("/api/auth/login/send-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      showMessage(data.detail || "Failed to send OTP", true);
      return;
    }
    showMessage("OTP sent to email");
    otpSection.style.display = "block";
  } catch (e) {
    showMessage("Network error", true);
  }
});

btnVerifyOtp.addEventListener("click", async () => {
  const payload = { email: emailInput.value, otp: otpInput.value };
  try {
    const res = await fetch("/api/auth/login/verify-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      showMessage(data.detail || "Invalid OTP", true);
      return;
    }
    showMessage("Login successful");
    window.location = `/dashboard?clinic=${encodeURIComponent(data.clinic_id)}`;
  } catch (e) {
    showMessage("Network error", true);
  }
});

forgotLink.addEventListener("click", (e) => {
  e.preventDefault();
  forgotSection.style.display = "block";
});

btnForgotSend.addEventListener("click", async () => {
  const payload = { email: forgotEmail.value };
  try {
    const res = await fetch("/api/auth/forgot/send-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      showMessage(data.detail || "Failed to send OTP", true);
      return;
    }
    showMessage("Reset OTP sent");
    resetSection.style.display = "block";
  } catch (e) {
    showMessage("Network error", true);
  }
});

btnResetSubmit.addEventListener("click", async () => {
  const payload = {
    email: forgotEmail.value,
    otp: resetOtp.value,
    new_password: resetPassword.value,
  };
  try {
    const res = await fetch("/api/auth/forgot/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      showMessage(data.detail || "Reset failed", true);
      return;
    }
    showMessage("Password reset successful");
  } catch (e) {
    showMessage("Network error", true);
  }
});
