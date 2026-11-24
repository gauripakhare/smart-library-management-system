/**
 * Smart Library Forgot Password Controller
 */

function togglePasswordVisibility(inputId, toggleIcon) {
  const input = document.getElementById(inputId);
  if (!input) return;
  if (input.type === 'password') {
    input.type = 'text';
    toggleIcon.classList.remove('fa-eye-slash');
    toggleIcon.classList.add('fa-eye');
  } else {
    input.type = 'password';
    toggleIcon.classList.remove('fa-eye');
    toggleIcon.classList.add('fa-eye-slash');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const recoveryEmailInput = document.getElementById('recoveryEmail');
  const btnSendOtp = document.getElementById('btnSendOtp');
  const otpInput = document.getElementById('otpInput');
  const btnVerifyOtp = document.getElementById('btnVerifyOtp');
  
  const credentialsSection = document.getElementById('credentialsStepSection');
  const newPasswordInput = document.getElementById('newPassword');
  const confirmPasswordInput = document.getElementById('confirmPassword');
  const btnChangePassword = document.getElementById('btnChangePassword');

  const feedbackMsg = document.getElementById('formFeedbackMessage');

  let activeEmail = '';
  let verifiedResetToken = '';

  const apiBase = typeof getApiBase === 'function' ? getApiBase() : 'http://127.0.0.1:8000';

  function showMessage(msg, isError = true) {
    if (!feedbackMsg) return;
    feedbackMsg.textContent = msg;
    feedbackMsg.className = `feedback-board ${isError ? 'error' : 'success'}`;
    feedbackMsg.style.display = 'block';
  }

  function hideMessage() {
    if (feedbackMsg) feedbackMsg.style.display = 'none';
  }

  // Step 1: Send OTP
  btnSendOtp.addEventListener('click', async () => {
    hideMessage();
    const emailVal = recoveryEmailInput.value.trim();

    if (!emailVal) {
      showMessage('Please enter your registered Email or Roll Number.');
      return;
    }

    btnSendOtp.disabled = true;
    btnSendOtp.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

    try {
      const res = await fetch(`${apiBase}/api/auth/forgot/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailVal })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to send OTP.');

      activeEmail = data.email || emailVal;
      showMessage(data.message || 'OTP sent successfully! Check your email inbox.', false);

      // Enable OTP inputs
      otpInput.disabled = false;
      btnVerifyOtp.disabled = false;
      otpInput.focus();
      btnSendOtp.textContent = 'Resend OTP';
      btnSendOtp.disabled = false;

    } catch (err) {
      console.error('Send OTP error:', err);
      showMessage(err.message || 'Error sending OTP. Please try again.');
      btnSendOtp.disabled = false;
      btnSendOtp.textContent = 'Send OTP';
    }
  });

  // Step 2: Verify OTP
  btnVerifyOtp.addEventListener('click', async () => {
    hideMessage();
    const otpVal = otpInput.value.trim();

    if (!activeEmail) {
      showMessage('Please click "Send OTP" first.');
      return;
    }

    if (!otpVal || otpVal.length < 6) {
      showMessage('Please enter the full 6-digit OTP code.');
      return;
    }

    btnVerifyOtp.disabled = true;
    btnVerifyOtp.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

    try {
      const res = await fetch(`${apiBase}/api/auth/forgot/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: activeEmail,
          otp_code: otpVal
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'OTP verification failed.');

      verifiedResetToken = data.reset_token;
      showMessage('OTP verified! Please enter your new password below.', false);

      // Unlock password section
      credentialsSection.style.display = 'block';
      newPasswordInput.focus();

      btnVerifyOtp.disabled = true;
      btnVerifyOtp.textContent = 'Verified ✓';
      btnSendOtp.disabled = true;
      recoveryEmailInput.disabled = true;
      otpInput.disabled = true;

    } catch (err) {
      console.error('Verify OTP error:', err);
      showMessage(err.message || 'Invalid or expired OTP code.');
      btnVerifyOtp.disabled = false;
      btnVerifyOtp.textContent = 'Verify OTP';
    }
  });

  // Step 3: Change Password
  btnChangePassword.addEventListener('click', async () => {
    hideMessage();
    const newPwd = newPasswordInput.value.trim();
    const confirmPwd = confirmPasswordInput.value.trim();

    if (!verifiedResetToken) {
      showMessage('Session token missing. Please verify OTP first.');
      return;
    }

    if (!newPwd) {
      showMessage('Please enter a new password.');
      return;
    }

    if (newPwd.length < 6) {
      showMessage('Password must be at least 6 characters long.');
      return;
    }

    if (newPwd !== confirmPwd) {
      showMessage('Passwords do not match. Please re-enter.');
      return;
    }

    btnChangePassword.disabled = true;
    btnChangePassword.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Updating...';

    try {
      const res = await fetch(`${apiBase}/api/auth/forgot/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: activeEmail,
          reset_token: verifiedResetToken,
          new_password: newPwd
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Password reset failed.');

      showMessage('Password updated successfully! Redirecting to login...', false);

      setTimeout(() => {
        window.location.href = '../login.html';
      }, 1500);

    } catch (err) {
      console.error('Reset password error:', err);
      showMessage(err.message || 'Error updating password. Please try again.');
      btnChangePassword.disabled = false;
      btnChangePassword.innerHTML = '<span>Update Password</span> <i class="fa-solid fa-check-circle"></i>';
    }
  });
});
