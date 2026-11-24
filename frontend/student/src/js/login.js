/**
 * Smart Library Login Controller
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
  const form = document.getElementById('loginForm');
  const btnLogin = document.getElementById('btnLogin');
  const feedbackMsg = document.getElementById('feedbackMessage');

  if (!form) return;

  function showMessage(msg, isError = true) {
    if (!feedbackMsg) return;
    feedbackMsg.textContent = msg;
    feedbackMsg.className = `feedback-board ${isError ? 'error' : 'success'}`;
    feedbackMsg.style.display = 'block';
  }

  function hideMessage() {
    if (feedbackMsg) feedbackMsg.style.display = 'none';
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideMessage();

    const identifier = document.getElementById('identifier').value.trim();
    const password = document.getElementById('password').value.trim();

    if (!identifier) {
      showMessage('Please enter your Email, Roll Number, or Username.');
      return;
    }

    if (!password) {
      showMessage('Please enter your password.');
      return;
    }

    btnLogin.disabled = true;
    btnLogin.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Logging in...';

    const apiBase = typeof getApiBase === 'function' ? getApiBase() : 'http://127.0.0.1:8000';

    try {
      const res = await fetch(`${apiBase}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          identifier: identifier,
          password: password
        })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.detail || 'Login failed. Please verify your credentials.');
      }

      // Store Auth Token and User Details
      localStorage.setItem('access_token', data.access_token);
      localStorage.setItem('user_info', JSON.stringify(data.user || {}));
      localStorage.setItem('student_info', JSON.stringify(data.user || {}));
      
      // Store token in cookie for backend API authorization compatibility
      document.cookie = `access_token=${data.access_token}; path=/; max-age=86400`;

      showMessage('Login successful! Redirecting...', false);

      setTimeout(() => {
        const userRole = (data.user && data.user.role) ? String(data.user.role).toLowerCase() : 'student';
        const inStudentFolder = window.location.pathname.includes('/student/');

        if (userRole === 'admin') {
          window.location.href = inStudentFolder ? '../admin/dashboard.html' : 'admin/dashboard.html';
        } else {
          window.location.href = inStudentFolder ? 'student_dashboard.html' : 'student/student_dashboard.html';
        }
      }, 800);

    } catch (err) {
      console.error('Login error:', err);
      showMessage(err.message || 'Unable to connect to login server. Please try again.');
      btnLogin.disabled = false;
      btnLogin.innerHTML = '<span>Log In</span> <i class="fa-solid fa-right-to-bracket"></i>';
    }
  });
});
