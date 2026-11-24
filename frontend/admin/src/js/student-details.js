document.addEventListener('DOMContentLoaded', async () => {
  await loadAdminSidebar();
  initStudentSearchAndDetails();
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

// Student Search and Details Controller
function initStudentSearchAndDetails() {
  const searchInput = document.getElementById('student-search-input');
  const searchBtn = document.getElementById('btn-search-trigger');
  const editBtn = document.getElementById('btn-edit-student');
  const backBtn = document.getElementById('btn-back-nav');

  const studentContent = document.getElementById('student-content');
  const detailsFooter = document.getElementById('details-footer');
  const statusStateBox = document.getElementById('status-state-box');
  const statusMessage = document.getElementById('status-message');

  const apiBase = window.location.port === '8000' ? '' : 'http://127.0.0.1:8000';

  let currentLoadedStudentId = null;

  // Retrieve 'id' query parameter if redirected from table view
  const urlParams = new URLSearchParams(window.location.search);
  const initialId = urlParams.get('id');

  // Trigger search on Button click or Enter key
  searchBtn.addEventListener('click', () => executeSearch(searchInput.value.trim()));
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      executeSearch(searchInput.value.trim());
    }
  });

  // Navigation handlers
  backBtn.addEventListener('click', () => {
    window.location.href = 'student-management.html';
  });

  editBtn.addEventListener('click', () => {
    if (currentLoadedStudentId) {
      window.location.href = `update-student.html?id=${currentLoadedStudentId}`;
    }
  });

  async function executeSearch(query) {
    if (!query) {
      showStatus('Please enter a roll number, name, or class to search.');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch(`${apiBase}/api/admin/students/${encodeURIComponent(query)}`);
      if (!res.ok) throw new Error('Search failed');
      const student = await res.json();

      if (student && (student.id || student.rollNumber)) {
        renderStudentData(student);
      } else {
        showStatus(`No student found matching "${query}".`);
      }
    } catch (err) {
      console.warn('API error during search:', err);
      showStatus(`No student found matching "${query}".`);
    } finally {
      setLoading(false);
    }
  }

  async function loadStudentById(id) {
    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/api/admin/students/${id}`);
      if (!res.ok) throw new Error('Record not found');
      const student = await res.json();
      renderStudentData(student);
    } catch (err) {
      console.warn('Could not fetch student by id:', err);
      showStatus(`Could not load details for student ID: ${id}`);
    } finally {
      setLoading(false);
    }
  }

  function renderStudentData(student) {
    if (!student) return;

    currentLoadedStudentId = student.id || student.rollNumber;

    document.getElementById('val-roll').textContent = student.rollNumber || '-';
    if (document.getElementById('val-library')) {
      document.getElementById('val-library').textContent = student.libraryCardNumber || '-';
    }
    document.getElementById('val-name').textContent = student.name || '-';
    document.getElementById('val-class').textContent = student.class || '-';
    document.getElementById('val-email').textContent = student.email || '-';
    document.getElementById('val-contact').textContent = student.contactNumber || student.contact || '-';
    document.getElementById('val-gender').textContent = student.gender || '-';
    document.getElementById('val-dob').textContent = student.dob || '-';
    document.getElementById('val-address').textContent = student.address || '-';

    // Show view, hide empty/loading state
    statusStateBox.style.display = 'none';
    studentContent.style.display = 'flex';
    detailsFooter.style.display = 'flex';
  }

  function showStatus(msg) {
    statusMessage.textContent = msg;
    statusStateBox.style.display = 'flex';
    studentContent.style.display = 'none';
    detailsFooter.style.display = 'none';
  }

  function setLoading(isLoading) {
    if (isLoading) {
      searchBtn.disabled = true;
      searchBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span>Searching...</span>';
    } else {
      searchBtn.disabled = false;
      searchBtn.innerHTML = '<i class="fa-solid fa-magnifying-glass"></i> <span>Search</span>';
    }
  }

  // Auto-load if ID param exists, else show prompt
  if (initialId) {
    searchInput.value = initialId;
    loadStudentById(initialId);
  } else {
    showStatus('Enter a roll number, name, or class above to view student details.');
  }
}