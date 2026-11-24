document.addEventListener('DOMContentLoaded', async () => {
  await loadAdminSidebar();
  initAddStudentForm();
});

// Dynamic Admin Sidebar Loader
async function loadAdminSidebar() {
  try {
    const res = await fetch('admin-sidebar.html');
    if (!res.ok) throw new Error('Failed to load admin-sidebar.html');
    const htmlText = await res.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlText, 'text/html');
    const sidebar = doc.querySelector('.sidebar');

    if (sidebar) {
      document.getElementById('sidebar-placeholder').appendChild(sidebar);

      // Set Student Management active in sidebar
      const navItems = sidebar.querySelectorAll('.nav-item');
      navItems.forEach(item => {
        const href = item.getAttribute('href') || '';
        const page = item.getAttribute('data-page') || '';
        if (href.includes('student-management') || page === 'student-management') {
          item.classList.add('active');
        } else {
          item.classList.remove('active');
        }
      });

      const script = document.createElement('script');
      script.src = 'src/js/admin-sidebar.js';
      document.body.appendChild(script);
    }
  } catch (err) {
    console.error('Sidebar load failed:', err);
  }
}

// Add Student Form Controller
function initAddStudentForm() {
  const form = document.getElementById('add-student-form');
  const cancelBtn = document.getElementById('cancel-btn');
  const saveBtn = document.getElementById('save-btn');

  const apiBase = window.location.port === '8000' ? '' : 'http://127.0.0.1:8000';

  // Cancel action returns to management table
  cancelBtn.addEventListener('click', () => {
    window.location.href = 'student-management.html';
  });

  // Class and academic year are typed values instead of fixed dropdown options.
  async function fetchDropdownOptions() {
    try {
      await fetch(`${apiBase}/api/admin/student-form-options`);
    } catch (err) {
      console.warn('Student form options API offline; continuing with free-text fields.');
    }
  }

  // Real-time error clearance on input
  form.querySelectorAll('input, select').forEach(field => {
    field.addEventListener('input', () => {
      const container = field.closest('.input-container');
      if (container) container.classList.remove('invalid');
      const errSpan = field.closest('.form-group')?.querySelector('.error-msg');
      if (errSpan) errSpan.textContent = '';
    });
  });

  // Validation & Submission
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    let isValid = true;

    const fields = [
      { el: document.getElementById('student-name'), errId: 'name-error', msg: 'Name is required' },
      { el: document.getElementById('roll-number'), errId: 'roll-error', msg: 'Roll Number is required' },
      { el: document.getElementById('library-number'), errId: 'library-error', msg: 'Library Card Number is required' },
      { el: document.getElementById('student-class'), errId: 'class-error', msg: 'Class is required' },
      { el: document.getElementById('academic-year'), errId: 'year-error', msg: 'Academic year is required' },
      { el: document.getElementById('student-email'), errId: 'email-error', msg: 'Valid email is required', isEmail: true },
      { el: document.getElementById('contact-number'), errId: 'contact-error', msg: 'Valid contact number is required' }
    ];

    fields.forEach(({ el, errId, msg, isEmail }) => {
      const container = el ? el.closest('.input-container') : null;
      const errEl = errId ? document.getElementById(errId) : null;
      const val = el ? el.value.trim() : '';

      if (!val) {
        if (container) container.classList.add('invalid');
        if (errEl) errEl.textContent = msg;
        isValid = false;
      } else if (isEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
        if (container) container.classList.add('invalid');
        if (errEl) errEl.textContent = 'Please enter a valid email address';
        isValid = false;
      }
    });

    if (!isValid) return;

    const payload = {
      name: document.getElementById('student-name').value.trim(),
      rollNumber: document.getElementById('roll-number').value.trim(),
      libraryNumber: document.getElementById('library-number').value.trim(),
      className: document.getElementById('student-class').value,
      academicYear: document.getElementById('academic-year').value,
      email: document.getElementById('student-email').value.trim(),
      contactNumber: document.getElementById('contact-number').value.trim(),
      department: document.getElementById('student-department')?.value.trim() || '',
      college: document.getElementById('student-college')?.value.trim() || '',
      dob: document.getElementById('student-dob')?.value || '',
      gender: document.getElementById('student-gender')?.value || '',
      address: document.getElementById('student-address')?.value.trim() || ''
    };

    saveBtn.disabled = true;
    saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';

    try {
      const res = await fetch(`${apiBase}/api/admin/students`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const resData = await res.json();
      if (!res.ok) throw new Error(resData.detail || 'Submission failed');

      alert(resData.message || 'Student saved successfully! Password stored securely.');
      window.location.href = 'student-management.html';
    } catch (err) {
      console.error('Failed to save student:', err);
      alert(err.message || 'Unable to save student. Please verify the backend connection and try again.');
      saveBtn.disabled = false;
      saveBtn.innerHTML = '<i class="fa-solid fa-user-plus"></i> Save Student';
    }
  });

  fetchDropdownOptions();
}