document.addEventListener('DOMContentLoaded', async () => {
  await loadAdminSidebar();
  initUpdateStudent();
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

      // Active state highlight for Student Management
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

// Update Student Controller
function initUpdateStudent() {
  const form = document.getElementById('update-student-form');
  const resetBtn = document.getElementById('reset-btn');
  const updateBtn = document.getElementById('update-btn');

  // Retrieve Student ID from URL params (e.g., ?id=STU001)
  const urlParams = new URLSearchParams(window.location.search);
  const studentId = urlParams.get('id');

  let initialStudentData = null;

  const apiBase = window.location.port === '8000' ? '' : 'http://127.0.0.1:8000';

  // Fetch student details; class and academic year are typed values rather than dropdown selections.
  async function loadInitialData() {
    try {
      if (studentId) {
        const stuRes = await fetch(`${apiBase}/api/admin/students/${studentId}`);
        if (stuRes.ok) {
          const student = await stuRes.json();
          initialStudentData = student;
          populateForm(student);
        }
      }
    } catch (err) {
      console.warn('API currently unavailable, form ready for server integration.');
    }
  }

  function populateForm(data) {
    if (!data) return;
    document.getElementById('student-name').value = data.name || '';
    document.getElementById('roll-number').value = data.rollNumber || data.roll_number || '';
    document.getElementById('student-class').value = data.class || data.className || data.class_name || '';
    document.getElementById('academic-year').value = data.academicYear || data.academic_year || '';
    document.getElementById('student-email').value = data.email || '';
    document.getElementById('contact-number').value = data.contactNumber || data.contact || data.contact_number || '';
    document.getElementById('library-number').value = data.libraryNumber || data.libraryCardNumber || data.library_card_number || '';
  }

  // Reset to original values
  resetBtn.addEventListener('click', () => {
    if (initialStudentData) {
      populateForm(initialStudentData);
    } else {
      form.reset();
    }
    // Clear validation highlights
    form.querySelectorAll('.input-container').forEach(c => c.classList.remove('invalid'));
    form.querySelectorAll('.error-msg').forEach(s => s.textContent = '');
  });

  // Clear validation styling on typing
  form.querySelectorAll('input, select').forEach(field => {
    field.addEventListener('input', () => {
      field.closest('.input-container').classList.remove('invalid');
      const errSpan = field.closest('.form-group').querySelector('.error-msg');
      if (errSpan) errSpan.textContent = '';
    });
  });

  // Validation & Form Submission
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    let isValid = true;

    const fields = [
      { el: document.getElementById('student-name'), errId: 'name-error', msg: 'Name is required' },
      { el: document.getElementById('roll-number'), errId: 'roll-error', msg: 'Roll number is required' },
      { el: document.getElementById('student-class'), errId: 'class-error', msg: 'Class is required' },
      { el: document.getElementById('academic-year'), errId: 'year-error', msg: 'Academic year is required' },
      { el: document.getElementById('student-email'), errId: 'email-error', msg: 'Valid email is required', isEmail: true },
      { el: document.getElementById('contact-number'), errId: 'contact-error', msg: 'Valid contact number is required' },
      { el: document.getElementById('library-number'), errId: 'library-error', msg: 'Library number is required' }
    ];

    fields.forEach(({ el, errId, msg, isEmail }) => {
      const container = el.closest('.input-container');
      const errEl = document.getElementById(errId);
      const val = el.value.trim();

      if (!val) {
        container.classList.add('invalid');
        errEl.textContent = msg;
        isValid = false;
      } else if (isEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
        container.classList.add('invalid');
        errEl.textContent = 'Please enter a valid email address';
        isValid = false;
      }
    });

    if (!isValid) return;

    const payload = {
      name: document.getElementById('student-name').value.trim(),
      rollNumber: document.getElementById('roll-number').value.trim(),
      class: document.getElementById('student-class').value,
      className: document.getElementById('student-class').value,
      academicYear: document.getElementById('academic-year').value,
      email: document.getElementById('student-email').value.trim(),
      contactNumber: document.getElementById('contact-number').value.trim(),
      libraryNumber: document.getElementById('library-number').value.trim()
    };

    updateBtn.disabled = true;
    updateBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Updating...';

    try {
      const endpoint = studentId ? `${apiBase}/api/admin/students/${studentId}` : `${apiBase}/api/admin/students`;
      const res = await fetch(endpoint, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) throw new Error('Update failed');

      window.location.href = 'student-management.html';
    } catch (err) {
      console.error('Failed to update student:', err);
      alert('Unable to update student. Please verify the backend connection.');
      updateBtn.disabled = false;
      updateBtn.innerHTML = '<i class="fa-regular fa-floppy-disk"></i> Update';
    }
  });

  loadInitialData();
}