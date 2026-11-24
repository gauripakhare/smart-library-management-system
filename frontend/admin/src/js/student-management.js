document.addEventListener('DOMContentLoaded', async () => {
  await loadAdminSidebar();
  initStudentManagement();
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

      // Inject sidebar navigation logic
      const script = document.createElement('script');
      script.src = 'src/js/admin-sidebar.js';
      document.body.appendChild(script);
    }
  } catch (err) {
    console.error('Sidebar load failed:', err);
  }
}

// Student Management Controller
function initStudentManagement() {
  let allStudents = [];
  let currentPage = 1;
  const rowsPerPage = 5;

  const tableBody = document.getElementById('student-table-body');
  const searchInput = document.getElementById('search-input');
  const classFilter = document.getElementById('class-filter');
  const genderFilter = document.getElementById('gender-filter');
  const recordCountText = document.getElementById('record-count-text');
  const paginationControls = document.getElementById('pagination-controls');

  const apiBase = window.location.port === '8000' ? '' : 'http://127.0.0.1:8000';

  // Fetch initial student list from Backend
  async function fetchStudents() {
    try {
      const response = await fetch(`${apiBase}/api/admin/students`);
      if (!response.ok) throw new Error('API offline');
      const data = await response.json();
      allStudents = Array.isArray(data.students) ? data.students : [];
      populateClassDropdown(data.classes || []);
    } catch (err) {
      console.warn('Backend API offline. Table ready to receive data.', err);
      allStudents = [];
    }
    renderTable();
  }

  function populateClassDropdown(classes) {
    classFilter.innerHTML = '<option value="">All Classes</option>';
    classes.forEach(cls => {
      const option = document.createElement('option');
      option.value = cls;
      option.textContent = cls;
      classFilter.appendChild(option);
    });
  }

  // Filter & Search Logic
  function getFilteredStudents() {
    const query = searchInput.value.trim().toLowerCase();
    const selectedClass = classFilter.value;
    const selectedGender = genderFilter.value;

    return allStudents.filter(student => {
      const matchesSearch = !query ||
        (student.name && student.name.toLowerCase().includes(query)) ||
        (student.rollNumber && student.rollNumber.toLowerCase().includes(query)) ||
        (student.libraryCardNumber && student.libraryCardNumber.toLowerCase().includes(query)) ||
        (student.libraryNumber && student.libraryNumber.toLowerCase().includes(query)) ||
        (student.email && student.email.toLowerCase().includes(query)) ||
        (student.class && student.class.toLowerCase().includes(query));

      const matchesClass = !selectedClass || student.class === selectedClass;
      const matchesGender = !selectedGender || student.gender === selectedGender;

      return matchesSearch && matchesClass && matchesGender;
    });
  }

  // Render Table Rows
  function renderTable() {
    const filtered = getFilteredStudents();
    const totalRecords = filtered.length;
    const totalPages = Math.ceil(totalRecords / rowsPerPage) || 1;

    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    const startIdx = (currentPage - 1) * rowsPerPage;
    const endIdx = startIdx + rowsPerPage;
    const pageRecords = filtered.slice(startIdx, endIdx);

    tableBody.innerHTML = '';

    if (pageRecords.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="10" class="no-data-cell">No student records found.</td>
        </tr>
      `;
      recordCountText.textContent = 'Showing 0 to 0 of 0 students';
      paginationControls.innerHTML = '';
      return;
    }

    pageRecords.forEach((student, index) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${startIdx + index + 1}</td>
        <td>${student.rollNumber || '-'}</td>
        <td>${student.libraryCardNumber || student.libraryNumber || '-'}</td>
        <td>${student.name || '-'}</td>
        <td>${student.class || '-'}</td>
        <td>${student.gender || '-'}</td>
        <td>${student.email || '-'}</td>
        <td>${student.contact || '-'}</td>
        <td>${student.dob || '-'}</td>
        <td class="actions-col">
          <div class="action-buttons">
            <button type="button" class="btn-action btn-view" onclick="viewStudent('${student.id || student.rollNumber}')">
              <i class="fa-regular fa-eye"></i> View
            </button>
            <button type="button" class="btn-action btn-edit" onclick="editStudent('${student.id || student.rollNumber}')">
              <i class="fa-solid fa-pen"></i> Edit
            </button>
            <button type="button" class="btn-action btn-delete" onclick="deleteStudent('${student.id || student.rollNumber}')">
              <i class="fa-regular fa-trash-can"></i> Delete
            </button>
          </div>
        </td>
      `;
      tableBody.appendChild(tr);
    });

    const displayStart = totalRecords === 0 ? 0 : startIdx + 1;
    const displayEnd = Math.min(endIdx, totalRecords);
    recordCountText.textContent = `Showing ${displayStart} to ${displayEnd} of ${totalRecords} students`;

    renderPagination(totalPages);
  }

  // Render Pagination Buttons
  function renderPagination(totalPages) {
    paginationControls.innerHTML = '';

    const prevBtn = document.createElement('button');
    prevBtn.className = 'page-btn';
    prevBtn.innerHTML = '<i class="fa-solid fa-chevron-left"></i>';
    prevBtn.disabled = currentPage === 1;
    prevBtn.onclick = () => {
      if (currentPage > 1) {
        currentPage--;
        renderTable();
      }
    };
    paginationControls.appendChild(prevBtn);

    for (let i = 1; i <= totalPages; i++) {
      const pageBtn = document.createElement('button');
      pageBtn.className = `page-btn ${i === currentPage ? 'active' : ''}`;
      pageBtn.textContent = i;
      pageBtn.onclick = () => {
        currentPage = i;
        renderTable();
      };
      paginationControls.appendChild(pageBtn);
    }

    const nextBtn = document.createElement('button');
    nextBtn.className = 'page-btn';
    nextBtn.innerHTML = '<i class="fa-solid fa-chevron-right"></i>';
    nextBtn.disabled = currentPage === totalPages;
    nextBtn.onclick = () => {
      if (currentPage < totalPages) {
        currentPage++;
        renderTable();
      }
    };
    paginationControls.appendChild(nextBtn);
  }

  // Event Listeners
  searchInput.addEventListener('input', () => {
    currentPage = 1;
    renderTable();
  });

  classFilter.addEventListener('change', () => {
    currentPage = 1;
    renderTable();
  });

  genderFilter.addEventListener('change', () => {
    currentPage = 1;
    renderTable();
  });

  document.getElementById('add-student-btn').addEventListener('click', () => {
    window.location.href = 'add-student.html';
  });

  // Action Triggers
  window.viewStudent = function(studentId) {
    window.location.href = `student-details.html?id=${studentId}`;
  };

  window.editStudent = function(studentId) {
    window.location.href = `update-student.html?id=${encodeURIComponent(studentId)}`;
  };

  window.deleteStudent = async function(studentId) {
    if (!confirm('Are you sure you want to delete this student record?')) return;
    try {
      const res = await fetch(`${apiBase}/api/admin/students/${studentId}`, { method: 'DELETE' });
      if (res.ok) {
        allStudents = allStudents.filter(s => (s.id || s.rollNumber) !== studentId);
        renderTable();
      }
    } catch (err) {
      console.error('Delete action failed:', err);
    }
  };

  fetchStudents();
}