document.addEventListener('DOMContentLoaded', async () => {
  await loadAdminSidebar();
  initDeleteStudentPage();
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

      // Active state highlight on Student Management
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

// Delete Student Controller
function initDeleteStudentPage() {
  const cancelBtn = document.getElementById('btn-cancel-delete');
  const triggerBtn = document.getElementById('btn-trigger-delete');

  const modal = document.getElementById('confirm-modal');
  const modalBtnNo = document.getElementById('modal-btn-no');
  const modalBtnYes = document.getElementById('modal-btn-yes');

  const valName = document.getElementById('val-name');
  const valRoll = document.getElementById('val-roll');
  const valClass = document.getElementById('val-class');

  // Retrieve query params: e.g., ?id=STU001 or ?rollNumber=STU001
  const urlParams = new URLSearchParams(window.location.search);
  const studentId = urlParams.get('id') || urlParams.get('rollNumber');

  // Cancel action returns to student management list
  cancelBtn.addEventListener('click', () => {
    window.location.href = 'student-management.html';
  });

  // Fetch record info to populate verification summary
  async function fetchStudentDetails() {
    if (!studentId) {
      valName.textContent = 'Unknown Student';
      valRoll.textContent = '-';
      valClass.textContent = '-';
      triggerBtn.disabled = true;
      return;
    }

    try {
      const res = await fetch(`/api/admin/students/${studentId}`);
      if (!res.ok) throw new Error('Could not load student');
      const data = await res.json();
      const student = data.student || data;

      valName.textContent = student.name || '-';
      valRoll.textContent = student.rollNumber || studentId;
      valClass.textContent = student.class || '-';
    } catch (err) {
      console.warn('API currently offline, using URL parameters.');
      valName.textContent = urlParams.get('name') || 'Selected Student';
      valRoll.textContent = studentId;
      valClass.textContent = urlParams.get('class') || '-';
    }
  }

  // Open confirmation pop-up modal
  triggerBtn.addEventListener('click', () => {
    modal.style.display = 'flex';
  });

  // Close pop-up modal on "No, Keep" or overlay click
  function closeModal() {
    modal.style.display = 'none';
  }

  modalBtnNo.addEventListener('click', closeModal);

  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

  // Execute deletion on "Yes, Delete"
  modalBtnYes.addEventListener('click', async () => {
    modalBtnYes.disabled = true;
    modalBtnYes.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span>Deleting...</span>';

    try {
      const res = await fetch(`/api/admin/students/${studentId}`, {
        method: 'DELETE'
      });

      if (!res.ok) throw new Error('Deletion request failed on server');

      window.location.href = 'student-management.html';
    } catch (err) {
      console.error('Failed to delete student:', err);
      alert('Unable to delete student. Please verify the backend connection and try again.');
      modalBtnYes.disabled = false;
      modalBtnYes.innerHTML = '<i class="fa-regular fa-trash-can"></i> <span>Yes, Delete</span>';
      closeModal();
    }
  });

  fetchStudentDetails();
}