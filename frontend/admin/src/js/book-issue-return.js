

// ---------------------------------------------------------------------------
// Design constants & Seed data
// ---------------------------------------------------------------------------
const TODAY = new Date(); // Current date
const FINE_PER_DAY = 25;
const DURATIONS = [14, 21, 28];

const apiBase = window.location.port === '8000' ? '' : 'http://127.0.0.1:8000';

const addDays = (d, n) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

const daysBetween = (a, b) => Math.round((b - a) / 86400000);

const fmtDMY = (d) => {
  if (!d || d === '—') return '—';
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt.getTime())) return '—';
  return `${String(dt.getDate()).padStart(2, '0')}-${String(dt.getMonth() + 1).padStart(2, '0')}-${dt.getFullYear()}`;
};

const parseDMY = (str) => {
  if (!str || str === '—') return TODAY;
  if (str instanceof Date) return str;
  if (typeof str !== 'string') return new Date(str);
  const parts = str.split('-');
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    }
    return new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
  }
  return new Date(str);
};

const toISODate = (d) => {
  if (!d) return '';
  const dt = d instanceof Date ? d : parseDMY(d);
  if (isNaN(dt.getTime())) return '';
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

let studentsSeed = [];
let booksSeed = [];

const getStudentClasses = () => {
  const list = studentsSeed.map((s) => s.class || s.batch).filter(Boolean);
  return [...new Set(list)].sort();
};

const bookByTitle = (t) => {
  if (!t) return { title: 'Unknown', author: 'Unknown', isbn: '—', department: 'General' };
  return booksSeed.find((b) => b.title === t || b.id === t || b.title.toLowerCase() === String(t).toLowerCase()) || { title: t, author: 'Unknown', isbn: '—', department: 'General' };
};

const studentById = (id) => {
  if (!id) return { id: '—', name: 'Student', contact: '—', email: '—', class: '—', rollNo: '—', libraryCardNo: '—', batch: '1R' };
  return studentsSeed.find((s) => s.id === id || s.rollNo === id || s.libraryCardNo === id || String(s.id).toLowerCase() === String(id).toLowerCase()) || { id, name: id, contact: '—', email: '—', class: '—', rollNo: '—', libraryCardNo: '—', batch: '1R' };
};

const studentDisplayId = (student) => {
  if (!student) return '—';
  return student.rollNo && student.rollNo !== '-' ? student.rollNo
    : student.libraryCardNo && student.libraryCardNo !== '-' ? student.libraryCardNo
    : student.id || '—';
};

const issueDisplayId = (issue) => issue.issueCode || issue.id || '—';
const fineDisplayId = (fine) => fine.fineCode || fine.id || '—';
const getDepartments = () => [...new Set([
  ...studentsSeed.map((student) => student.department),
  ...booksSeed.map((book) => book.department),
].filter(Boolean))].sort();

// ---------------------------------------------------------------------------
// Application State
// ---------------------------------------------------------------------------
let state = {
  currentTab: 'issued', // issued | fine | history
  issues: [],
  fines: [],
  history: [],
  editingIssueId: null,
  viewingFineId: null,
  viewingHistoryId: null,
  editingFineId: null,
  isNewIssueModalOpen: false,
  filters: {
    issuedText: '',
    issuedStudent: 'all',
    issuedBook: 'all',
    issuedDate: 'all',
    issuedStartDate: '',
    issuedEndDate: '',
    fineSearch: '',
    fineStartDate: '',
    fineEndDate: '',
    fineStudentId: '',
    historySearch: '',
    historyStartDate: '',
    historyEndDate: '',
  },
  newIssueForm: {
    student: null,
    book: null,
    studentQuery: '',
    bookQuery: '',
    duration: 14,
    notes: '',
  },
};

// ---------------------------------------------------------------------------
// Lucide-style Inline SVG Icons
// ---------------------------------------------------------------------------
function getIcon(name, size = 16, color = 'currentColor') {
  const icons = {
    BookOpen: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>`,
    Home: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,
    Search: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>`,
    CalendarDays: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/><path d="M8 14h.01"/><path d="M12 14h.01"/><path d="M16 14h.01"/><path d="M8 18h.01"/><path d="M12 18h.01"/><path d="M16 18h.01"/></svg>`,
    Armchair: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 9V6a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v3"/><path d="M3 16a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5a2 2 0 0 0-4 0v2H7v-2a2 2 0 0 0-4 0Z"/><path d="M5 18v2"/><path d="M19 18v2"/></svg>`,
    Star: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
    Users: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
    RefreshCw: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>`,
    LogOut: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/></svg>`,
    ArrowLeft: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>`,
    Bell: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>`,
    ChevronDown: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>`,
    Plus: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>`,
    X: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,
    IndianRupee: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h12"/><path d="M6 8h12"/><path d="m6 13 8.5 8"/><path d="M6 13h3a4 4 0 0 0 0-8"/></svg>`,
    CheckCircle2: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="m9 12 2 2 4-4"/></svg>`,
    AlertTriangle: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg>`,
    Pencil: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/></svg>`,
    Eye: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`,
  };
  return icons[name] || '';
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const liveStatus = (issue) => {
  if (issue.status === 'returned' || issue.status === 'Returned' || issue.status === 'Returned - Late' || issue.status === 'Fine Paid' || issue.status === 'lost') return issue.status;
  const due = parseDMY(issue.dueDate);
  return TODAY > due ? 'overdue' : 'active';
};

function applyIssueData(data) {
  if (!data) return;
  if (data.students) studentsSeed = data.students;
  if (data.books) booksSeed = data.books;
  if (data.issues) {
    state.issues = data.issues.map(i => ({
      ...i,
      book: typeof i.book === 'object' && i.book ? i.book.title : (i.bookTitle || i.book || 'Unknown Book'),
      author: i.author || (typeof i.book === 'object' && i.book ? i.book.author : ''),
      isbn: i.isbn || (typeof i.book === 'object' && i.book ? i.book.isbn : ''),
      studentId: i.studentId || (i.student ? i.student.id : '—')
    }));
  }
  if (data.fines) {
    state.fines = data.fines.map(f => ({
      ...f,
      book: typeof f.book === 'object' && f.book ? f.book.title : (f.bookTitle || f.book || 'Unknown Book'),
      author: f.author || (typeof f.book === 'object' && f.book ? f.book.author : ''),
      isbn: f.isbn || (typeof f.book === 'object' && f.book ? f.book.isbn : ''),
      studentId: f.studentId || (f.student ? f.student.id : '—')
    }));
  }
  if (data.history) {
    state.history = data.history.map(h => ({
      ...h,
      book: typeof h.book === 'object' && h.book ? h.book.title : (h.bookTitle || h.book || 'Unknown Book'),
      author: h.author || (typeof h.book === 'object' && h.book ? h.book.author : ''),
      isbn: h.isbn || (typeof h.book === 'object' && h.book ? h.book.isbn : ''),
      studentId: h.studentId || (h.student ? h.student.id : '—')
    }));
  }
  if (data.reviews) {
    state.reviews = data.reviews;
  }
  renderApp();
}

async function fetchIssueData() {
  try {
    const res = await fetch(`${apiBase}/api/admin/issues/issue-data`);
    if (res.ok) {
      const data = await res.json();
      try {
        sessionStorage.setItem('book_issue_return_cache_v1', JSON.stringify(data));
      } catch (_) {}
      applyIssueData(data);
    }
  } catch (err) {
    console.error('Failed to fetch issue data:', err);
  }
}

function showToast(msg, tone = 'good') {
  const textStr = typeof msg === 'object' && msg !== null 
    ? (msg.detail || msg.message || JSON.stringify(msg)) 
    : String(msg);

  const existing = document.querySelector('.toast-notice');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = `toast-notice ${tone}`;
  toast.innerHTML = `
    ${tone === 'good' ? getIcon('CheckCircle2', 16, '#ffffff') : getIcon('AlertTriangle', 16, '#ffffff')}
    <span>${textStr}</span>
    <button class="toast-close">${getIcon('X', 14, '#ffffff')}</button>
  `;

  toast.querySelector('.toast-close').addEventListener('click', () => toast.remove());
  document.body.appendChild(toast);

  setTimeout(() => {
    if (toast.parentNode) toast.remove();
  }, 3000);
}

// ---------------------------------------------------------------------------
// Main Render
// ---------------------------------------------------------------------------
function renderApp() {
  const root = document.getElementById('app');
  if (!root) return;

  const activeIssues = state.issues.filter(
    (i) => (!i.returnDate || i.returnDate === '—' || i.returnDate === '-') && !(i.status || '').toLowerCase().startsWith('returned')
  );
  const totalFineOverdue = state.fines
    .filter((f) => f.status === 'Unpaid')
    .reduce((a, f) => a + f.fine, 0);
  const dueTodayCount = activeIssues.filter(
    (i) => daysBetween(TODAY, new Date(i.dueDate)) === 0
  ).length;

  const editingIssue = state.issues.find((i) => i.id === state.editingIssueId || i.issueCode === state.editingIssueId);

  root.innerHTML = `
    <!-- Sidebar Navigation -->
    <aside class="sidebar">
      <div class="sidebar-top">
        <div class="panel-header" style="display: flex; align-items: center; gap: 12px; padding: 6px 10px 20px 10px;">
          <div class="user-avatar-icon" style="width: 38px; height: 38px; background-color: rgba(255, 255, 255, 0.22); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 1.05rem; color: #ffffff;">
            <i class="fa-solid fa-user"></i>
          </div>
          <span class="panel-title" style="font-size: 1.05rem; font-weight: 600; letter-spacing: 0.2px; color: #ffffff;">Admin Panel</span>
        </div>

        <!-- Admin Navigation Options -->
        <nav class="nav-menu">
          <a href="dashboard.html" class="nav-item">
            <i class="fa-solid fa-border-all"></i>
            <span>Dashboard</span>
          </a>
          <a href="search-books.html" class="nav-item">
            <i class="fa-solid fa-magnifying-glass"></i>
            <span>Book Search</span>
          </a>
          <a href="student-management.html" class="nav-item">
            <i class="fa-solid fa-users"></i>
            <span>Student Management</span>
          </a>
          <a href="book-management.html" class="nav-item">
            <i class="fa-solid fa-book-open"></i>
            <span>Book Management</span>
          </a>
          <a href="book-issue-return.html" class="nav-item active">
            <i class="fa-solid fa-arrow-right-arrow-left"></i>
            <span>Book Issue Return</span>
          </a>
          <a href="attendence_overview.html" class="nav-item">
            <i class="fa-solid fa-calendar-days"></i>
            <span>Attendance</span>
          </a>
          <a href="seat-reservation.html" class="nav-item">
            <i class="fa-solid fa-chair"></i>
            <span>Seat Reservation</span>
          </a>
          <a href="reports.html" class="nav-item">
            <i class="fa-solid fa-chart-column"></i>
            <span>Report</span>
          </a>
        </nav>
      </div>

      <!-- Logout Footer Option -->
      <div class="sidebar-footer">
        <a href="../login.html" class="nav-item logout-item" id="sidebar-logout-btn">
          <i class="fa-solid fa-arrow-right-from-bracket"></i>
          <span>Logout</span>
        </a>
      </div>
    </aside>

    <!-- Main Wrapper -->
    <div class="main-wrapper">
      <!-- Topbar -->
      <header class="topbar">
        ${
          editingIssue
            ? `<button id="topbar-back-btn" class="back-btn">
                ${getIcon('ArrowLeft', 16)} Back
              </button>`
            : `<div></div>`
        }
        <div class="topbar-right">
          <div class="bell-icon" title="Notifications">${getIcon('Bell', 19, '#767ba0')}<span class="notification-badge">3</span></div>
          <div class="user-profile">
            <div class="user-avatar">${getIcon('Users', 15, '#3D539F')}</div>
            <div>
              <p class="user-name">System Admin</p>
              <p class="user-role">Administrator</p>
            </div>
            ${getIcon('ChevronDown', 14, '#767ba0')}
          </div>
        </div>
      </header>

      <!-- Main Content Area -->
      <main class="content-area">
        ${
          editingIssue
            ? renderEditIssuePage(editingIssue)
            : `
              <!-- Header Section -->
              <div class="page-header">
                <div class="header-icon-box">${getIcon('BookOpen', 20, '#3D539F')}</div>
                <div>
                  <h1 class="page-title">Book Issue &amp; Return</h1>
                  <p class="page-desc"></p>
                </div>
              </div>

              <!-- Stats Cards -->
              <div class="stats-grid">
                <div class="stat-card">
                  <div class="stat-icon" style="background-color: #eaeefb;">${getIcon('BookOpen', 20, '#3D539F')}</div>
                  <div>
                    <p class="stat-label">Total Current Issued</p>
                    <p class="stat-value">${activeIssues.length}</p>
                    <p class="stat-sub">Count: ${activeIssues.length}</p>
                  </div>
                </div>

                <div class="stat-card">
                  <div class="stat-icon" style="background-color: #fbeaea;">${getIcon('IndianRupee', 20, '#d1453b')}</div>
                  <div>
                    <p class="stat-label">Total Fine Overdue</p>
                    <p class="stat-value">₹${totalFineOverdue}</p>
                    <p class="stat-sub">Amount: ${totalFineOverdue}</p>
                  </div>
                </div>

                <div class="stat-card">
                  <div class="stat-icon" style="background-color: #e7f8ee;">${getIcon('RefreshCw', 20, '#1f9d55')}</div>
                  <div>
                    <p class="stat-label">Total Books Due Today</p>
                    <p class="stat-value">${dueTodayCount}</p>
                    <p class="stat-sub">Count: ${dueTodayCount}</p>
                  </div>
                </div>
              </div>

              <!-- Navigation Tabs & Actions -->
              <div class="tabs-action-bar">
                <div class="tabs-list">
                  <button class="tab-btn ${state.currentTab === 'issued' ? 'active' : ''}" data-tab="issued">Issued Books</button>
                  <button class="tab-btn ${state.currentTab === 'fine' ? 'active' : ''}" data-tab="fine">Fine</button>
                  <button class="tab-btn ${state.currentTab === 'history' ? 'active' : ''}" data-tab="history">History</button>
                </div>

                ${
                  state.currentTab === 'issued'
                    ? `<button id="btn-open-new-issue" class="btn-primary">
                        ${getIcon('Plus', 16, '#ffffff')}
                        New Issued Book
                      </button>`
                    : ''
                }
              </div>

              <!-- Tab Content -->
              <div id="tab-container">
                ${renderCurrentTabContent(activeIssues)}
              </div>
            `
        }
      </main>
    </div>

    <!-- Modals Container -->
    <div id="modal-container">
      ${state.isNewIssueModalOpen ? renderNewIssueModal() : ''}
      ${state.editingFineId ? renderEditFineModal() : ''}
      ${state.viewingFineId ? renderFineDetailsModal() : ''}
      ${state.viewingHistoryId ? renderHistoryDetailsModal() : ''}
    </div>
  `;

  attachEventListeners();
}

// ---------------------------------------------------------------------------
// Tab Renderers
// ---------------------------------------------------------------------------
function renderCurrentTabContent(activeIssues) {
  switch (state.currentTab) {
    case 'issued':
      return renderIssuedBooksTab(activeIssues);
    case 'fine':
      return renderFineTab();
    case 'history':
      return renderHistoryTab();
    default:
      return '';
  }
}

function renderIssuedBooksTab(activeIssues) {
  const { issuedText, issuedStartDate, issuedEndDate } = state.filters;

  const filtered = activeIssues.filter((i) => {
    const s = studentById(i.studentId);
    const b = bookByTitle(i.book);

    if (issuedText) {
      const q = issuedText.toLowerCase().trim();
      const codeMatch = issueDisplayId(i).toLowerCase().includes(q);
      const studentNameMatch = (s.name || '').toLowerCase().includes(q);
      const libCardMatch = (s.libraryCardNo || '').toLowerCase().includes(q);
      const rollMatch = (s.rollNo || '').toLowerCase().includes(q);
      const bookMatch = (i.book || '').toLowerCase().includes(q);
      const authorMatch = (b.author || '').toLowerCase().includes(q);
      if (!codeMatch && !studentNameMatch && !libCardMatch && !rollMatch && !bookMatch && !authorMatch) {
        return false;
      }
    }

    if (issuedStartDate) {
      const issueDt = parseDMY(i.issueDate);
      const startDt = new Date(issuedStartDate);
      startDt.setHours(0, 0, 0, 0);
      if (issueDt < startDt) return false;
    }

    if (issuedEndDate) {
      const issueDt = parseDMY(i.issueDate);
      const endDt = new Date(issuedEndDate);
      endDt.setHours(23, 59, 59, 999);
      if (issueDt > endDt) return false;
    }

    return true;
  });

  return `
    <section class="content-card">
      <h2 class="section-title">Issued Books</h2>

      <!-- Filters -->
      <div class="filters-row">
        <input
          id="filter-issued-text"
          class="input-control"
          placeholder="Search book, student name or library card no..."
          value="${state.filters.issuedText}"
          style="min-width: 250px;"
        />

        <div style="display: flex; align-items: center; gap: 6px; font-size: 13px; color: #767ba0;">
          <span>From:</span>
          <input type="date" id="filter-issued-start-date" class="input-control" value="${issuedStartDate || ''}" style="width: 135px;" />
          <span>To:</span>
          <input type="date" id="filter-issued-end-date" class="input-control" value="${issuedEndDate || ''}" style="width: 135px;" />
        </div>
      </div>

      <!-- Table -->
      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>Issue ID</th>
              <th>Library Card No</th>
              <th>Student Name</th>
              <th>Book / Author</th>
              <th>Issue Date</th>
              <th>Due Date</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${
              filtered.length === 0
                ? `<tr><td colspan="8" class="empty-state-row">No issues match these filters.</td></tr>`
                : filtered
                    .map((i) => {
                      const s = studentById(i.studentId);
                      const b = bookByTitle(i.book);
                      const author = i.author || b.author || 'Unknown';
                      const rawStatus = (i.status || '').toLowerCase();
                      const isFinePaid = rawStatus === 'fine paid';
                      const status = liveStatus(i);
                      const badgeClass = isFinePaid ? 'fine-paid' : (status === 'overdue' ? 'overdue' : 'active');
                      const badgeText = isFinePaid ? 'Fine Paid' : (status === 'overdue' ? 'Overdue' : 'Active');
                      const libNo = s.libraryCardNo && s.libraryCardNo !== '-' ? s.libraryCardNo : studentDisplayId(s);
                      return `
                        <tr>
                          <td style="font-weight: 500; color: #1c2148; white-space: nowrap;">${issueDisplayId(i)}</td>
                          <td style="color: #767ba0; white-space: nowrap; font-weight: 500;">${libNo}</td>
                          <td style="color: #1c2148; font-weight: 500; white-space: nowrap;">${s.name}</td>
                          <td>
                            <span style="font-weight: 500; color: #1c2148;">${i.book}</span><br />
                            <span style="color: #767ba0; font-size: 12px;">${author}</span>
                          </td>
                          <td style="color: #767ba0; white-space: nowrap;">${fmtDMY(i.issueDate)}</td>
                          <td style="color: #767ba0; white-space: nowrap;">${fmtDMY(i.dueDate)}</td>
                          <td>
                            <span class="status-badge ${badgeClass}">
                              ${badgeText}
                            </span>
                          </td>
                          <td>
                            <div style="display: flex; gap: 8px;">
                              <button class="btn-secondary btn-edit-issue" data-id="${i.id}">
                                ${getIcon('Pencil', 12)} Edit
                              </button>
                              <button class="btn-navy btn-return-book" data-id="${i.id}">
                                Mark as Returned
                              </button>
                            </div>
                          </td>
                        </tr>
                      `;
                    })
                    .join('')
            }
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderFineTab() {
  const { fineSearch, fineStartDate, fineEndDate } = state.filters;

  const filtered = state.fines.filter((f) => {
    const s = studentById(f.studentId);
    const b = bookByTitle(f.book);
    const q = fineSearch.trim().toLowerCase();

    if (q) {
      const haystack = `${f.id} ${f.studentId} ${s.name} ${s.rollNo} ${f.book} ${b.author} ${b.isbn}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }

    const fineDate = parseDMY(f.returnDate || f.originalDueDate);
    if (fineStartDate && fineDate < new Date(`${fineStartDate}T00:00:00`)) return false;
    if (fineEndDate && fineDate > new Date(`${fineEndDate}T23:59:59`)) return false;

    return true;
  });

  return `
    <section class="content-card">
      <h2 class="section-title">Manage Library Fines</h2>
      <p class="section-subtitle"></p>

      <!-- Filters -->
      <div class="filters-row">
        <input
          id="filter-fine-search"
          class="input-control"
          placeholder="Search fine, student, book, or ISBN"
          value="${fineSearch}"
        />

        <span class="date-range-label">From</span>
        <input id="filter-fine-start-date" type="date" class="input-control date-input" value="${fineStartDate}" />
        <span class="date-range-label">To</span>
        <input id="filter-fine-end-date" type="date" class="input-control date-input" value="${fineEndDate}" />

      </div>

      <!-- Table -->
      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>Fine ID</th>
              <th>Library Card No</th>
              <th>Student Name</th>
              <th>Book Title</th>
              <th>Author</th>
              <th>ISBN</th>
              <th>Original Due</th>
              <th>Return Date</th>
              <th>Days Overdue</th>
              <th>Fine</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${
              filtered.length === 0
                ? `<tr><td colspan="12" class="empty-state-row">No fines match these filters.</td></tr>`
                : filtered
                    .map((f) => {
                      const s = studentById(f.studentId);
                      const b = bookByTitle(f.book);
                      const libNo = s.libraryCardNo && s.libraryCardNo !== '-' ? s.libraryCardNo : studentDisplayId(s);
                      return `
                        <tr>
                          <td style="font-weight: 500; color: #1c2148; white-space: nowrap;">${fineDisplayId(f)}</td>
                          <td style="color: #767ba0; white-space: nowrap; font-weight: 500;">${libNo}</td>
                          <td style="color: #1c2148; font-weight: 500; white-space: nowrap;">${s.name}</td>
                          <td style="color: #1c2148; font-weight: 500; white-space: nowrap;">${f.book}</td>
                          <td style="color: #767ba0; white-space: nowrap;">${f.author || b.author || 'Unknown'}</td>
                          <td style="color: #767ba0; white-space: nowrap;">${(f.isbn || b.isbn || '—').slice(0, 8)}...</td>
                          <td style="color: #767ba0; white-space: nowrap;">${fmtDMY(f.originalDueDate)}</td>
                          <td style="color: #767ba0; white-space: nowrap;">${f.returnDate && f.returnDate !== '-' ? fmtDMY(f.returnDate) : 'Not returned yet'}</td>
                          <td style="color: #767ba0; white-space: nowrap;">${f.daysOverdue}</td>
                          <td style="font-weight: 600; color: #1c2148; white-space: nowrap;">₹${f.fine}</td>
                          <td>
                            <span class="status-badge ${f.status === 'Paid' ? 'paid' : 'unpaid'}">${f.status}</span>
                          </td>
                          <td>
                            <div style="display: flex; gap: 8px;">
                              <button class="btn-secondary btn-view-fine" data-id="${f.id}">
                                ${getIcon('Eye', 12)} View Details
                              </button>
                              <button class="btn-navy btn-edit-fine" data-id="${f.id}">
                                ${getIcon('Pencil', 12)} Edit
                              </button>
                            </div>
                          </td>
                        </tr>
                      `;
                    })
                    .join('')
            }
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderHistoryTab() {
  const { historySearch, historyStartDate, historyEndDate } = state.filters;
  const filtered = state.history.filter((r) => {
    const s = studentById(r.studentId);
    const q = historySearch.trim().toLowerCase();

    if (q) {
      const haystack = `${r.id} ${r.studentId} ${s.name} ${r.book} ${s.rollNo}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }

    const returnedDate = parseDMY(r.returnDate);
    if (historyStartDate && returnedDate < new Date(`${historyStartDate}T00:00:00`)) return false;
    if (historyEndDate && returnedDate > new Date(`${historyEndDate}T23:59:59`)) return false;
    return true;
  });

  return `
    <section class="content-card">
      <h2 class="section-title">History Log: Past Transactions</h2>
      <p class="section-subtitle"></p>

      <div class="filters-row">
        <input
          id="filter-history-search"
          class="input-control"
          placeholder="Search student, book, or transaction"
          value="${historySearch}"
        />

        <span class="date-range-label">From</span>
        <input id="filter-history-start-date" type="date" class="input-control date-input" value="${historyStartDate}" />
        <span class="date-range-label">To</span>
        <input id="filter-history-end-date" type="date" class="input-control date-input" value="${historyEndDate}" />
      </div>

      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>Library Card No</th>
              <th>Student Name</th>
              <th>Book Title</th>
              <th>Author</th>
              <th>ISBN</th>
              <th>Issue Date</th>
              <th>Original Due</th>
              <th>Return Date</th>
              <th>Fine Paid</th>
              <th>Rating / Review</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${
              filtered.length === 0
                ? `<tr><td colspan="11" class="empty-state-row">No completed transactions yet.</td></tr>`
                : filtered
                    .map((r) => {
                      const s = studentById(r.studentId);
                      const b = bookByTitle(r.book);
                      const libNo = s.libraryCardNo && s.libraryCardNo !== '-' ? s.libraryCardNo : studentDisplayId(s);
                      const ratingBadge = r.reviewed
                        ? `<span style="background-color: #fef3c7; color: #d97706; padding: 3px 8px; border-radius: 10px; font-size: 11.5px; font-weight: 600; white-space: nowrap;" title="${r.review || 'No written review'}">&#9733; ${r.rating}/5</span>`
                        : `<span style="color: #a0a5c0; font-size: 12px;">No Review</span>`;
                      return `
                        <tr>
                          <td style="color: #767ba0; white-space: nowrap; font-weight: 500;">${libNo}</td>
                          <td style="color: #1c2148; font-weight: 500; white-space: nowrap;">${s.name}</td>
                          <td style="color: #1c2148; font-weight: 500; white-space: nowrap;">${r.book}</td>
                          <td style="color: #767ba0; white-space: nowrap;">${r.author || b.author || 'Unknown'}</td>
                          <td style="color: #767ba0; white-space: nowrap;">${r.isbn || b.isbn || '—'}</td>
                          <td style="color: #767ba0; white-space: nowrap;">${fmtDMY(r.issueDate)}</td>
                          <td style="color: #767ba0; white-space: nowrap;">${fmtDMY(r.originalDueDate)}</td>
                          <td style="color: #767ba0; white-space: nowrap;">${r.returnDate && r.returnDate !== '-' ? fmtDMY(r.returnDate) : 'Not recorded'}</td>
                          <td style="color: ${r.finePaid ? '#d1453b' : '#767ba0'}; font-weight: 500; white-space: nowrap;">
                            ${r.finePaid ? `₹${r.finePaid}` : '₹0'}
                          </td>
                          <td>${ratingBadge}</td>
                          <td>
                            <button class="btn-navy btn-history-details" data-id="${r.id}">
                              ${getIcon('Eye', 12)} View Details
                            </button>
                          </td>
                        </tr>
                      `;
                    })
                    .join('')
            }
          </tbody>
        </table>
      </div>
    </section>
  `;
}

// ---------------------------------------------------------------------------
// Edit Issue View
// ---------------------------------------------------------------------------
function renderEditIssuePage(issue) {
  const b = bookByTitle(issue.book);
  const author = issue.author || b.author || 'Unknown';
  const s = studentById(issue.studentId);
  const currentStatus = issue.status === 'active' && TODAY > new Date(issue.dueDate) ? 'overdue' : issue.status;

  return `
    <div>
      <button id="btn-back-to-issues" class="back-btn" style="margin-bottom: 16px; border:none; padding-left: 0;">
        ${getIcon('ArrowLeft', 15)} Back to Issued Books
      </button>

      <h1 class="page-title" style="margin-bottom: 24px;">Edit Book Issue ID: ${issueDisplayId(issue)}</h1>

      <!-- Issue Details -->
      <section class="content-card">
        <h2 class="section-title" style="margin-bottom: 16px;">Issue Details</h2>
        <div class="form-grid">
          <div class="form-field">
            <label class="form-label">Book Title</label>
            <input class="input-control readonly" readonly value="${issue.book}" />
          </div>

          <div class="form-field">
            <label class="form-label">Issue Date</label>
            <input type="date" id="edit-issue-date" class="input-control" value="${toISODate(issue.issueDate)}" />
          </div>

          <div class="form-field">
            <label class="form-label">Author</label>
            <input class="input-control readonly" readonly value="${author}" />
          </div>

          <div class="form-field">
            <label class="form-label">Due Date</label>
            <input type="date" id="edit-due-date" class="input-control" value="${toISODate(issue.dueDate)}" />
          </div>

          <div class="form-field">
            <label class="form-label">Book ISBN</label>
            <input class="input-control readonly" readonly value="${b.isbn}" />
          </div>

          <div class="form-field">
            <label class="form-label">Return Date (Optional)</label>
            <input type="date" id="edit-return-date" class="input-control" value="${toISODate(issue.returnDate)}" />
          </div>

          <div class="form-field">
            <label class="form-label">Status</label>
            <select id="edit-issue-status" class="input-control">
              <option value="active" ${currentStatus === 'active' ? 'selected' : ''}>Active</option>
              <option value="overdue" ${currentStatus === 'overdue' ? 'selected' : ''}>Overdue</option>
              <option value="returned" ${currentStatus === 'returned' ? 'selected' : ''}>Returned</option>
              <option value="lost" ${currentStatus === 'lost' ? 'selected' : ''}>Lost</option>
            </select>
          </div>

          <div class="form-field full">
            <label class="form-label">Comments</label>
            <textarea id="edit-issue-comments" class="input-control" rows="3" style="resize:none;">${issue.comments || ''}</textarea>
          </div>
        </div>
      </section>

      <!-- Student Details -->
      <section class="content-card">
        <h2 class="section-title" style="margin-bottom: 16px;">Student Details</h2>
        <div class="form-grid">
          <div class="form-field">
            <label class="form-label">Student ID</label>
            <input class="input-control readonly" readonly value="${studentDisplayId(s)}" />
          </div>

          <div class="form-field">
            <label class="form-label">Student Name</label>
            <input class="input-control readonly" readonly value="${s.name}" />
          </div>

          <div class="form-field">
            <label class="form-label">Student Contact</label>
            <input class="input-control readonly" readonly value="${s.contact}" />
          </div>
        </div>
      </section>

      <!-- Actions -->
      <div style="display: flex; justify-content: flex-end; gap: 12px; margin-bottom: 30px;">
        <button id="btn-cancel-edit-issue" class="btn-secondary">Cancel</button>
        <button id="btn-reset-edit-issue" class="btn-secondary">Reset</button>
        <button id="btn-save-edit-issue" class="btn-primary" style="background-color: #3D539F;">Update Issue</button>
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Modals
// ---------------------------------------------------------------------------
function renderNewIssueModal() {
  const { student, book, studentQuery, bookQuery, duration, notes } = state.newIssueForm;

  const studentMatches =
    studentQuery.length > 0 && !student
      ? studentsSeed.filter(
          (s) =>
            s.name.toLowerCase().includes(studentQuery.toLowerCase()) ||
            s.id.toLowerCase().includes(studentQuery.toLowerCase())
        )
      : [];

  const bookMatches =
    bookQuery.length > 0 && !book
      ? booksSeed.filter(
          (b) =>
            b.title.toLowerCase().includes(bookQuery.toLowerCase()) ||
            b.isbn.includes(bookQuery)
        )
      : [];

  const issueDate = TODAY;
  const dueDate = addDays(issueDate, duration);
  const canConfirm = student && book;

  return `
    <div class="modal-overlay" id="modal-overlay-new-issue">
      <div class="modal-card">
        <div class="modal-header">
          <h3 class="modal-title">Issue New Book to Student</h3>
          <button class="modal-close" id="btn-close-new-issue-x">${getIcon('X', 20)}</button>
        </div>

        <!-- Student Section -->
        <p class="form-section-label">Student Information</p>
        <div class="search-field-wrapper">
          ${
            student
              ? `
                <div class="selected-item-card">
                  <div>
                    <p style="font-weight: 500; font-size: 14px; color: #1c2148;">${student.name}</p>
                    <p style="color: #767ba0; font-size: 12px;">ID: ${student.id} · ${student.class}</p>
                  </div>
                  <button id="btn-clear-selected-student" style="background:transparent; border:none; cursor:pointer; color:#767ba0;">
                    ${getIcon('X', 16)}
                  </button>
                </div>
              `
              : `
                <span class="search-icon">${getIcon('Search', 15)}</span>
                <input
                  id="input-search-student"
                  class="input-control"
                  placeholder="Search by Student Name or ID"
                  value="${studentQuery}"
                  autocomplete="off"
                />
                ${
                  studentMatches.length > 0
                    ? `
                      <div class="autocomplete-dropdown">
                        ${studentMatches
                          .map(
                            (s) => `
                            <button class="autocomplete-item select-student-item" data-id="${s.id}">
                              <div style="background-color: #eaeefb; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; color: #3D539F;">
                                ${getIcon('Users', 14)}
                              </div>
                              <div>
                                <p style="color: #1c2148; font-size: 13.5px; font-weight: 500;">${s.name}</p>
                                <p style="color: #767ba0; font-size: 11.5px;">ID: ${s.id} · ${s.class}</p>
                              </div>
                            </button>
                          `
                          )
                          .join('')}
                      </div>
                    `
                    : ''
                }
              `
          }
        </div>

        <!-- Book Section -->
        <p class="form-section-label">Book Information</p>
        <div class="search-field-wrapper">
          ${
            book
              ? `
                <div class="selected-item-card">
                  <div>
                    <p style="font-weight: 500; font-size: 14px; color: #1c2148;">${book.title}</p>
                    <p style="color: #767ba0; font-size: 12px;">Author: ${book.author} · ISBN: ${book.isbn}</p>
                  </div>
                  <button id="btn-clear-selected-book" style="background:transparent; border:none; cursor:pointer; color:#767ba0;">
                    ${getIcon('X', 16)}
                  </button>
                </div>
              `
              : `
                <span class="search-icon">${getIcon('Search', 15)}</span>
                <input
                  id="input-search-book"
                  class="input-control"
                  placeholder="Search by Book Title or ISBN"
                  value="${bookQuery}"
                  autocomplete="off"
                />
                ${
                  bookMatches.length > 0
                    ? `
                      <div class="autocomplete-dropdown">
                        ${bookMatches
                          .map(
                            (b) => `
                            <button class="autocomplete-item select-book-item" data-title="${b.title}">
                              <div style="background-color: #fbeedc; width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; color: #c9832f;">
                                ${getIcon('BookOpen', 14)}
                              </div>
                              <div>
                                <p style="color: #1c2148; font-size: 13.5px; font-weight: 500;">${b.title}</p>
                                <p style="color: #767ba0; font-size: 11.5px;">Author: ${b.author}</p>
                              </div>
                            </button>
                          `
                          )
                          .join('')}
                      </div>
                    `
                    : ''
                }
              `
          }
        </div>

        <!-- Issuance Details -->
        <p class="form-section-label">Issuance Details</p>
        <div class="form-grid">
          <div class="form-field">
            <label class="form-label">Issue Date</label>
            <input class="input-control readonly" readonly value="${fmtDMY(issueDate)}" />
          </div>

          <div class="form-field">
            <label class="form-label">Due Date (Quick Days or Pick Custom Date)</label>
            <div style="display: flex; gap: 8px;">
              <select id="select-issue-duration" class="input-control" style="width: 110px; flex-shrink: 0;">
                <option value="7" ${duration === 7 ? 'selected' : ''}>7 Days</option>
                <option value="14" ${duration === 14 ? 'selected' : ''}>14 Days</option>
                <option value="21" ${duration === 21 ? 'selected' : ''}>21 Days</option>
                <option value="28" ${duration === 28 ? 'selected' : ''}>28 Days</option>
                <option value="30" ${duration === 30 ? 'selected' : ''}>30 Days</option>
                <option value="60" ${duration === 60 ? 'selected' : ''}>60 Days</option>
              </select>
              <input type="date" id="input-due-date" class="input-control" value="${state.newIssueForm.customDueDate || toISODate(dueDate)}" style="flex:1;" />
            </div>
          </div>
        </div>

        <div class="form-field" style="margin-bottom: 16px;">
          <label class="form-label">Condition Notes (optional)</label>
          <textarea id="input-issue-notes" class="input-control" rows="2" style="resize:none;" placeholder="e.g. Minor cover wear noted at issue.">${notes}</textarea>
        </div>

        <p style="color: #767ba0; font-size: 12px; margin-bottom: 20px; line-height: 1.4;">
          Confirming this will issue 
          <strong style="color: #1c2148;">"${book ? book.title : '—'}"</strong> to 
          <strong style="color: #1c2148;">"${student ? student.name : '—'}"</strong>. 
          Fines will apply for overdue returns at ₹25/day.
        </p>

        <div class="modal-actions">
          <button id="btn-cancel-new-issue" class="btn-secondary">Cancel</button>
          <button
            id="btn-confirm-new-issue"
            class="btn-primary"
            style="${canConfirm ? 'background-color: #3D539F;' : 'background-color: #e6e8f3; color: #767ba0; cursor: not-allowed;'}"
            ${canConfirm ? '' : 'disabled'}
          >
            Confirm Issue
          </button>
        </div>
      </div>
    </div>
  `;
}

function renderEditFineModal() {
  const fine = state.fines.find((f) => f.id === state.editingFineId);
  if (!fine) return '';
  const s = studentById(fine.studentId);
  const b = bookByTitle(fine.book);

  return `
    <div class="modal-overlay" id="modal-overlay-edit-fine">
      <div class="modal-card">
        <div class="modal-header">
          <h3 class="modal-title">Edit Fine Details - ${fine.id}</h3>
          <button class="modal-close" id="btn-close-edit-fine-x">${getIcon('X', 20)}</button>
        </div>

        <div style="background-color: #f2f4fa; border: 1px solid #e6e8f3; border-radius: 12px; padding: 14px 16px; margin-bottom: 20px; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 13px;">
          <p style="color: #767ba0;">Fine ID: <strong style="color: #1c2148;">${fine.id}</strong></p>
          <p style="color: #767ba0;">Return Days: <strong style="color: #1c2148;">${fine.daysOverdue}</strong></p>
          <p style="color: #767ba0;">Student: <strong style="color: #1c2148;">${s.name} (${s.id})</strong></p>
          <p style="color: #767ba0;">ISBN: <strong style="color: #1c2148;">${b.isbn.slice(0, 8)}...</strong></p>
          <p style="color: #767ba0;">Book Title: <strong style="color: #1c2148;">${fine.book}</strong></p>
          <p style="color: #767ba0;">Calculated Fine: <strong style="color: #1c2148;">₹${fine.fine}</strong></p>
          <p style="color: #767ba0;">Overdue Days: <strong style="color: #1c2148;">${fine.daysOverdue}</strong></p>
        </div>

        <p class="form-section-label">Update Fine Status &amp; Notes</p>
        <div class="form-grid">
          <div class="form-field">
            <label class="form-label">Status</label>
            <select id="edit-fine-status" class="input-control">
              <option value="Paid" ${fine.status === 'Paid' ? 'selected' : ''}>Paid</option>
              <option value="Unpaid" ${fine.status === 'Unpaid' ? 'selected' : ''}>Unpaid</option>
            </select>
          </div>

          <div class="form-field">
            <label class="form-label">Payment Method</label>
            <select id="edit-fine-method" class="input-control">
              <option value="Cash" ${fine.paymentMethod === 'Cash' ? 'selected' : ''}>Cash</option>
              <option value="Online" ${fine.paymentMethod === 'Online' ? 'selected' : ''}>Online</option>
              <option value="Card" ${fine.paymentMethod === 'Card' ? 'selected' : ''}>Card</option>
            </select>
          </div>
        </div>

        <div class="form-field" style="margin-bottom: 16px;">
          <label class="form-label">Transaction ID</label>
          <input id="edit-fine-txnid" class="input-control" value="${fine.transactionId || `TXN_${Math.random().toString(36).slice(2, 10).toUpperCase()}`}" />
        </div>

        <div class="form-field" style="margin-bottom: 20px;">
          <label class="form-label">Notes/Comments</label>
          <textarea id="edit-fine-notes" class="input-control" rows="3" style="resize:none;">${fine.notes || ''}</textarea>
        </div>

        <div class="modal-actions">
          <button id="btn-cancel-edit-fine" class="btn-secondary">Cancel</button>
          <button id="btn-save-edit-fine" class="btn-primary" style="background-color: #3D539F;">
            ${getIcon('CheckCircle2', 15, '#ffffff')} Save Changes
          </button>
        </div>
      </div>
    </div>
  `;
}

function renderFineDetailsModal() {
  const fine = state.fines.find((f) => f.id === state.viewingFineId);
  if (!fine) return '';
  const s = studentById(fine.studentId);
  const b = bookByTitle(fine.book);
  const author = fine.author || b.author || 'Unknown';
  const issueDate = addDays(new Date(fine.originalDueDate), -14);

  return `
    <div class="modal-overlay" id="modal-overlay-fine-details">
      <div class="modal-card" style="max-width: 600px; padding: 0; display: flex; flex-direction: column;">
        <!-- Header -->
        <div style="padding: 16px 24px; border-bottom: 1px solid #e6e8f3; display: flex; align-items: center; justify-content: space-between;">
          <div style="display: flex; align-items: center; gap: 12px;">
            <button id="btn-fine-details-back" class="back-btn">
              ${getIcon('ArrowLeft', 15)} Back
            </button>
            <div>
              <h3 style="color: #1c2148; font-size: 16px; font-weight: 600;">Fine Details — ${fine.id}</h3>
              <p style="color: #767ba0; font-size: 12px;">Full record for ${s.name}'s overdue return</p>
            </div>
          </div>
          <button class="modal-close" id="btn-close-fine-details-x">${getIcon('X', 20)}</button>
        </div>

        <!-- Body -->
        <div style="padding: 20px 24px; overflow-y: auto; flex: 1;">
          <!-- Student Card -->
          <div style="background-color: #f2f4fa; border-radius: 12px; padding: 12px 16px; margin-bottom: 16px; display: flex; align-items: center; gap: 12px;">
            <div style="background-color: #eaeefb; width: 44px; height: 44px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #3D539F;">
              ${getIcon('Users', 18)}
            </div>
            <div>
              <p style="color: #1c2148; font-weight: 600; font-size: 14px;">${s.name}</p>
              <p style="color: #767ba0; font-size: 12.5px;">${s.class}</p>
            </div>
          </div>

          <!-- Student ID details -->
          <p class="form-section-label" style="margin-top: 16px;">Student Identification</p>
          <div style="margin-bottom: 16px;">
            <div class="detail-row"><span class="detail-label">Student ID</span><span class="detail-val">${s.id}</span></div>
            <div class="detail-row"><span class="detail-label">Roll No.</span><span class="detail-val">${s.rollNo}</span></div>
            <div class="detail-row"><span class="detail-label">Library Card No.</span><span class="detail-val">${s.libraryCardNo}</span></div>
            <div class="detail-row"><span class="detail-label">Class</span><span class="detail-val">${s.class}</span></div>
            <div class="detail-row"><span class="detail-label">Contact</span><span class="detail-val">${s.contact}</span></div>
            <div class="detail-row"><span class="detail-label">Email</span><span class="detail-val">${s.email}</span></div>
          </div>

          <!-- Book details -->
          <p class="form-section-label" style="margin-top: 16px;">Book &amp; Loan Information</p>
          <div style="margin-bottom: 16px;">
            <div class="detail-row"><span class="detail-label">Book Title</span><span class="detail-val">${b.title}</span></div>
            <div class="detail-row"><span class="detail-label">Author</span><span class="detail-val">${author}</span></div>
            <div class="detail-row"><span class="detail-label">ISBN</span><span class="detail-val">${fine.isbn || b.isbn || '—'}</span></div>
            <div class="detail-row"><span class="detail-label">Issue Date</span><span class="detail-val">${fmtDMY(issueDate)}</span></div>
            <div class="detail-row"><span class="detail-label">Due Date</span><span class="detail-val">${fmtDMY(fine.originalDueDate)}</span></div>
            <div class="detail-row"><span class="detail-label">Return Date</span><span class="detail-val">${fmtDMY(fine.returnDate)}</span></div>
            <div class="detail-row"><span class="detail-label">Days Overdue</span><span class="detail-val">${fine.daysOverdue} day(s)</span></div>
          </div>

          <!-- Fine details -->
          <p class="form-section-label" style="margin-top: 16px;">Fine &amp; Payment</p>
          <div style="margin-bottom: 16px;">
            <div class="detail-row"><span class="detail-label">Fine Amount</span><span class="detail-val">₹${fine.fine}</span></div>
            <div class="detail-row"><span class="detail-label">Status</span><span class="detail-val"><span class="status-badge ${fine.status === 'Paid' ? 'paid' : 'unpaid'}">${fine.status}</span></span></div>
            <div class="detail-row"><span class="detail-label">Payment Method</span><span class="detail-val">${fine.paymentMethod || '—'}</span></div>
            <div class="detail-row"><span class="detail-label">Transaction ID</span><span class="detail-val">${fine.transactionId || '—'}</span></div>
            <div class="detail-row"><span class="detail-label">Notes</span><span class="detail-val">${fine.notes || '—'}</span></div>
          </div>
        </div>

        <!-- Sticky Footer -->
        <div style="padding: 16px 24px; border-top: 1px solid #e6e8f3; display: flex; justify-content: flex-end; gap: 12px;">
          <button id="btn-fine-details-close-btn" class="btn-secondary">${getIcon('ArrowLeft', 15)} Back to Fines</button>
          ${fine.status === 'Paid' ? `
            <button id="btn-fine-print-receipt" class="btn-primary" style="background:#1f9d55; border:none; padding: 8px 16px; font-size: 13.5px; color:#fff; border-radius:8px; cursor:pointer; display:inline-flex; align-items:center; gap:6px;">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
              Print Receipt
            </button>
          ` : ''}
          <button id="btn-fine-details-close-navy" class="btn-navy" style="padding: 8px 16px; font-size: 13.5px;">Close</button>
        </div>
      </div>
    </div>
  `;
}

function renderHistoryDetailsModal() {
  const record = state.history.find((h) => h.id === state.viewingHistoryId);
  if (!record) return '';
  const s = studentById(record.studentId);
  const historyBook = bookByTitle(record.book);

  return `
    <div class="modal-overlay" id="modal-overlay-history-details">
      <div class="modal-card" style="max-width: 620px; padding: 0; display: flex; flex-direction: column;">
        <div style="padding: 16px 24px; border-bottom: 1px solid #e6e8f3; display: flex; align-items: center; justify-content: space-between;">
          <div style="display: flex; align-items: center; gap: 12px;">
            <button id="btn-history-details-back" class="back-btn">${getIcon('ArrowLeft', 15)} Back</button>
            <div>
              <h3 style="color: #1c2148; font-size: 16px; font-weight: 600;">History Details — ${issueDisplayId(record)}</h3>
              <p style="color: #767ba0; font-size: 12px;">Completed transaction record for ${s.name}</p>
            </div>
          </div>
          <button class="modal-close" id="btn-history-details-close-x">${getIcon('X', 20)}</button>
        </div>

        <div style="padding: 20px 24px; overflow-y: auto; flex: 1;">
          <div style="background-color: #f2f4fa; border-radius: 12px; padding: 12px 16px; margin-bottom: 16px; display: flex; align-items: center; gap: 12px;">
            <div style="background-color: #eaeefb; width: 44px; height: 44px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #3D539F;">
              ${getIcon('BookOpen', 18)}
            </div>
            <div>
              <p style="color: #1c2148; font-weight: 600; font-size: 14px;">${record.book}</p>
              <p style="color: #767ba0; font-size: 12.5px;">Student: ${s.name} (${studentDisplayId(s)})</p>
            </div>
          </div>

          <p class="form-section-label" style="margin-top: 16px;">Transaction Summary</p>
          <div style="margin-bottom: 16px;">
            <div class="detail-row"><span class="detail-label">History ID</span><span class="detail-val">${issueDisplayId(record)}</span></div>
            <div class="detail-row"><span class="detail-label">Student ID</span><span class="detail-val">${studentDisplayId(s)}</span></div>
            <div class="detail-row"><span class="detail-label">Student Name</span><span class="detail-val">${s.name}</span></div>
            <div class="detail-row"><span class="detail-label">Book Title</span><span class="detail-val">${record.book}</span></div>
            <div class="detail-row"><span class="detail-label">Author</span><span class="detail-val">${record.author || historyBook.author || 'Unknown'}</span></div>
            <div class="detail-row"><span class="detail-label">ISBN</span><span class="detail-val">${record.isbn || historyBook.isbn || '—'}</span></div>
            <div class="detail-row"><span class="detail-label">Issue Date</span><span class="detail-val">${fmtDMY(record.issueDate)}</span></div>
            <div class="detail-row"><span class="detail-label">Original Due Date</span><span class="detail-val">${fmtDMY(record.originalDueDate)}</span></div>
            <div class="detail-row"><span class="detail-label">Return Date</span><span class="detail-val">${fmtDMY(record.returnDate)}</span></div>
            <div class="detail-row"><span class="detail-label">Fine Paid</span><span class="detail-val">₹${record.finePaid || 0}</span></div>
            <div class="detail-row"><span class="detail-label">Status</span><span class="detail-val"><span class="status-badge ${record.status.includes('Late') || record.status === 'Fine Paid' ? 'returned-late' : 'returned'}">${record.status}</span></span></div>
            <div class="detail-row"><span class="detail-label">Payment Method</span><span class="detail-val">${record.paymentMethod || '—'}</span></div>
            <div class="detail-row"><span class="detail-label">Transaction ID</span><span class="detail-val">${record.transactionId || '—'}</span></div>
            <div class="detail-row"><span class="detail-label">Notes</span><span class="detail-val">${record.notes || '—'}</span></div>
          </div>

          <!-- Student Review Section -->
          <p class="form-section-label" style="margin-top: 16px;">Student Review &amp; Rating</p>
          <div style="margin-bottom: 16px; background-color: #f9fafb; padding: 12px 16px; border-radius: 8px; border: 1px solid #e5e7eb;">
            <div class="detail-row">
              <span class="detail-label">Rating</span>
              <span class="detail-val" style="color: #d97706; font-weight: 600;">
                ${record.reviewed ? `&#9733; ${record.rating} / 5` : 'Not reviewed yet'}
              </span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Review Comment</span>
              <span class="detail-val" style="font-style: italic; color: #1c2148;">
                ${record.review || (record.reviewed ? 'No comment text provided' : '—')}
              </span>
            </div>
          </div>
        </div>

        <div style="padding: 16px 24px; border-top: 1px solid #e6e8f3; display: flex; justify-content: flex-end; gap: 12px;">
          <button id="btn-history-details-close-btn" class="btn-secondary">${getIcon('ArrowLeft', 15)} Back to History</button>
          <button id="btn-history-details-close-navy" class="btn-navy" style="padding: 8px 16px; font-size: 13.5px;">Close</button>
        </div>
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Event Listeners Binding
// ---------------------------------------------------------------------------
function attachEventListeners() {
  // Tab switching
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      state.currentTab = e.currentTarget.dataset.tab;
      renderApp();
    });
  });

  // Topbar back button
  const topbarBack = document.getElementById('topbar-back-btn');
  if (topbarBack) {
    topbarBack.addEventListener('click', () => {
      state.editingIssueId = null;
      renderApp();
    });
  }

  // Open New Issue Modal
  const btnOpenNew = document.getElementById('btn-open-new-issue');
  if (btnOpenNew) {
    btnOpenNew.addEventListener('click', () => {
      state.isNewIssueModalOpen = true;
      state.newIssueForm = {
        student: null,
        book: null,
        studentQuery: '',
        bookQuery: '',
        duration: 14,
        notes: '',
      };
      renderApp();
    });
  }

  // Issued Books Tab Filters
  const issuedText = document.getElementById('filter-issued-text');
  if (issuedText) {
    issuedText.addEventListener('input', (e) => {
      state.filters.issuedText = e.target.value;
      renderApp();
      const el = document.getElementById('filter-issued-text');
      if (el) {
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      }
    });
  }

  const issuedStartDate = document.getElementById('filter-issued-start-date');
  if (issuedStartDate) {
    issuedStartDate.addEventListener('change', (e) => {
      state.filters.issuedStartDate = e.target.value;
      renderApp();
    });
  }

  const issuedEndDate = document.getElementById('filter-issued-end-date');
  if (issuedEndDate) {
    issuedEndDate.addEventListener('change', (e) => {
      state.filters.issuedEndDate = e.target.value;
      renderApp();
    });
  }

  // Issued Books: Edit Button
  document.querySelectorAll('.btn-edit-issue').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      state.editingIssueId = e.currentTarget.dataset.id;
      renderApp();
    });
  });

  // Issued Books: Mark as Returned Button
  document.querySelectorAll('.btn-return-book').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const issueId = e.currentTarget.dataset.id;
      handleMarkReturned(issueId);
    });
  });

  // Edit Issue Page actions
  const backToIssues = document.getElementById('btn-back-to-issues');
  if (backToIssues) {
    backToIssues.addEventListener('click', () => {
      state.editingIssueId = null;
      renderApp();
    });
  }

  const cancelEditIssue = document.getElementById('btn-cancel-edit-issue');
  if (cancelEditIssue) {
    cancelEditIssue.addEventListener('click', () => {
      state.editingIssueId = null;
      renderApp();
    });
  }

  const resetEditIssue = document.getElementById('btn-reset-edit-issue');
  if (resetEditIssue) {
    resetEditIssue.addEventListener('click', () => {
      renderApp();
    });
  }

  const saveEditIssue = document.getElementById('btn-save-edit-issue');
  if (saveEditIssue) {
    saveEditIssue.addEventListener('click', async () => {
      const issue = state.issues.find((i) => i.id === state.editingIssueId || i.issueCode === state.editingIssueId);
      if (issue) {
        const issueDateStr = document.getElementById('edit-issue-date').value;
        const dueDateStr = document.getElementById('edit-due-date').value;
        const returnDateEl = document.getElementById('edit-return-date');
        const returnDateStr = returnDateEl ? returnDateEl.value : null;
        const statusVal = document.getElementById('edit-issue-status').value;
        const commentsVal = document.getElementById('edit-issue-comments').value;

        saveEditIssue.disabled = true;
        saveEditIssue.textContent = 'Updating...';

        try {
          const targetId = issue.id || issue.issueCode;
          const res = await fetch(`${apiBase}/api/admin/issues/${targetId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              issueDate: issueDateStr,
              dueDate: dueDateStr,
              returnDate: returnDateStr,
              status: statusVal,
              comments: commentsVal
            })
          });

          const data = await res.json();
          if (res.ok) {
            showToast(data.message || `Issue updated successfully.`, 'good');
            state.editingIssueId = null;
            await fetchIssueData();
          } else {
            showToast(data.detail || 'Failed to update issue.', 'warn');
          }
        } catch (err) {
          console.error(err);
          showToast(err.message || 'Unable to update issue.', 'warn');
        } finally {
          saveEditIssue.disabled = false;
        }
      }
    });
  }

  // Fine Tab Filters
  const fineSearch = document.getElementById('filter-fine-search');
  if (fineSearch) {
    fineSearch.addEventListener('input', (e) => {
      state.filters.fineSearch = e.target.value;
      renderApp();
      const el = document.getElementById('filter-fine-search');
      if (el) {
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      }
    });
  }

  ['fine-start-date', 'fine-end-date'].forEach((suffix) => {
    const input = document.getElementById(`filter-${suffix}`);
    if (input) input.addEventListener('change', (e) => {
      state.filters[suffix === 'fine-start-date' ? 'fineStartDate' : 'fineEndDate'] = e.target.value;
      renderApp();
    });
  });

  // Fine Tab: View Details
  document.querySelectorAll('.btn-view-fine').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      state.viewingFineId = e.currentTarget.dataset.id;
      renderApp();
    });
  });

  // Fine Tab: Edit Fine
  document.querySelectorAll('.btn-edit-fine').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      state.editingFineId = e.currentTarget.dataset.id;
      renderApp();
    });
  });

  // History Tab: Filter & Details
  const historySearch = document.getElementById('filter-history-search');
  if (historySearch) {
    historySearch.addEventListener('input', (e) => {
      state.filters.historySearch = e.target.value;
      renderApp();
      const el = document.getElementById('filter-history-search');
      if (el) {
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      }
    });
  }

  ['history-start-date', 'history-end-date'].forEach((suffix) => {
    const input = document.getElementById(`filter-${suffix}`);
    if (input) input.addEventListener('change', (e) => {
      state.filters[suffix === 'history-start-date' ? 'historyStartDate' : 'historyEndDate'] = e.target.value;
      renderApp();
    });
  });

  document.querySelectorAll('.btn-history-details').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      state.viewingHistoryId = e.currentTarget.dataset.id;
      renderApp();
    });
  });

  // New Issue Modal Events
  bindNewIssueModalEvents();

  // History Details Modal Events
  bindHistoryDetailsModalEvents();

  // Edit Fine Modal Events
  bindEditFineModalEvents();

  // Fine Details Modal Events
  bindFineDetailsModalEvents();
}

function bindNewIssueModalEvents() {
  const overlay = document.getElementById('modal-overlay-new-issue');
  if (!overlay) return;

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      state.isNewIssueModalOpen = false;
      renderApp();
    }
  });

  const btnCloseX = document.getElementById('btn-close-new-issue-x');
  if (btnCloseX) {
    btnCloseX.addEventListener('click', () => {
      state.isNewIssueModalOpen = false;
      renderApp();
    });
  }

  const btnCancel = document.getElementById('btn-cancel-new-issue');
  if (btnCancel) {
    btnCancel.addEventListener('click', () => {
      state.isNewIssueModalOpen = false;
      renderApp();
    });
  }

  const searchStudent = document.getElementById('input-search-student');
  if (searchStudent) {
    searchStudent.addEventListener('input', (e) => {
      state.newIssueForm.studentQuery = e.target.value;
      renderApp();
      const el = document.getElementById('input-search-student');
      if (el) {
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      }
    });
  }

  document.querySelectorAll('.select-student-item').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const id = e.currentTarget.dataset.id;
      state.newIssueForm.student = studentById(id);
      state.newIssueForm.studentQuery = '';
      renderApp();
    });
  });

  const clearStudent = document.getElementById('btn-clear-selected-student');
  if (clearStudent) {
    clearStudent.addEventListener('click', () => {
      state.newIssueForm.student = null;
      state.newIssueForm.studentQuery = '';
      renderApp();
    });
  }

  const searchBook = document.getElementById('input-search-book');
  if (searchBook) {
    searchBook.addEventListener('input', (e) => {
      state.newIssueForm.bookQuery = e.target.value;
      renderApp();
      const el = document.getElementById('input-search-book');
      if (el) {
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      }
    });
  }

  document.querySelectorAll('.select-book-item').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const title = e.currentTarget.dataset.title;
      state.newIssueForm.book = bookByTitle(title);
      state.newIssueForm.bookQuery = '';
      renderApp();
    });
  });

  const clearBook = document.getElementById('btn-clear-selected-book');
  if (clearBook) {
    clearBook.addEventListener('click', () => {
      state.newIssueForm.book = null;
      state.newIssueForm.bookQuery = '';
      renderApp();
    });
  }

  const durationSelect = document.getElementById('select-issue-duration');
  if (durationSelect) {
    durationSelect.addEventListener('change', (e) => {
      const d = Number(e.target.value);
      state.newIssueForm.duration = d;
      state.newIssueForm.customDueDate = toISODate(addDays(TODAY, d));
      renderApp();
    });
  }

  const inputDueDate = document.getElementById('input-due-date');
  if (inputDueDate) {
    inputDueDate.addEventListener('change', (e) => {
      state.newIssueForm.customDueDate = e.target.value;
    });
  }

  const notesInput = document.getElementById('input-issue-notes');
  if (notesInput) {
    notesInput.addEventListener('input', (e) => {
      state.newIssueForm.notes = e.target.value;
    });
  }

  const confirmBtn = document.getElementById('btn-confirm-new-issue');
  if (confirmBtn) {
    confirmBtn.addEventListener('click', async () => {
      const { student, book, duration, customDueDate, notes } = state.newIssueForm;
      if (!student || !book) return;

      const targetDueDate = customDueDate ? parseDMY(customDueDate) : addDays(TODAY, duration || 14);
      const calculatedDays = Math.max(1, daysBetween(TODAY, targetDueDate));

      confirmBtn.disabled = true;
      confirmBtn.innerText = 'Issuing...';

      try {
        const res = await fetch(`${apiBase}/api/admin/issues`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            studentId: student.id,
            bookId: book.id || book.title,
            durationDays: calculatedDays,
            comments: notes || ''
          })
        });

        const data = await res.json();
        if (!res.ok) {
          showToast(data.detail || 'Failed to issue book.', 'warn');
        } else {
          showToast(data.message || `Issued "${book.title}" to ${student.name}.`, 'good');
          state.isNewIssueModalOpen = false;
          state.newIssueForm = { student: null, book: null, studentQuery: '', bookQuery: '', duration: 14, customDueDate: '', notes: '' };
          await fetchIssueData();
        }
      } catch (err) {
        console.error(err);
        showToast('Network error while issuing book.', 'warn');
      } finally {
        confirmBtn.disabled = false;
      }
    });
  }
}

function bindEditFineModalEvents() {
  const overlay = document.getElementById('modal-overlay-edit-fine');
  if (!overlay) return;

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      state.editingFineId = null;
      renderApp();
    }
  });

  const closeX = document.getElementById('btn-close-edit-fine-x');
  if (closeX) {
    closeX.addEventListener('click', () => {
      state.editingFineId = null;
      renderApp();
    });
  }

  const cancelBtn = document.getElementById('btn-cancel-edit-fine');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      state.editingFineId = null;
      renderApp();
    });
  }

  const saveBtn = document.getElementById('btn-save-edit-fine');
  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      const fine = state.fines.find((f) => f.id === state.editingFineId);
      if (fine) {
        const nextStatus = document.getElementById('edit-fine-status').value;
        const method = document.getElementById('edit-fine-method').value;
        const txnid = document.getElementById('edit-fine-txnid').value;
        const notes = document.getElementById('edit-fine-notes').value;

        saveBtn.disabled = true;
        try {
          if (nextStatus === 'Paid') {
            const res = await fetch(`${apiBase}/api/admin/issues/fines/${fine.id}/pay`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                amountPaid: fine.fine - (fine.finePaid || 0),
                paymentMethod: method || 'Cash',
                transactionId: txnid || '',
                notes: notes || ''
              })
            });
            const data = await res.json();
            if (res.ok) {
              showToast(data.message || `Fine marked paid.`, 'good');
              state.editingFineId = null;
              await fetchIssueData();
            } else {
              showToast(data.detail || 'Failed to pay fine', 'warn');
            }
          } else {
            showToast(`Fine status unchanged.`, 'good');
            state.editingFineId = null;
            renderApp();
          }
        } catch (err) {
          console.error(err);
          showToast(err.message || 'Unable to process fine payment.', 'warn');
        } finally {
          saveBtn.disabled = false;
        }
      }
    });
  }
}

function bindFineDetailsModalEvents() {
  const overlay = document.getElementById('modal-overlay-fine-details');
  if (!overlay) return;

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      state.viewingFineId = null;
      renderApp();
    }
  });

  const closeHandlers = [
    'btn-fine-details-back',
    'btn-close-fine-details-x',
    'btn-fine-details-close-btn',
    'btn-fine-details-close-navy',
  ];

  closeHandlers.forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('click', () => {
        state.viewingFineId = null;
        renderApp();
      });
    }
  });

  const printBtn = document.getElementById('btn-fine-print-receipt');
  if (printBtn) {
    printBtn.addEventListener('click', () => {
      window.print();
    });
  }
}

function bindHistoryDetailsModalEvents() {
  const overlay = document.getElementById('modal-overlay-history-details');
  if (!overlay) return;

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      state.viewingHistoryId = null;
      renderApp();
    }
  });

  const closeHandlers = [
    'btn-history-details-back',
    'btn-history-details-close-x',
    'btn-history-details-close-btn',
    'btn-history-details-close-navy',
  ];

  closeHandlers.forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('click', () => {
        state.viewingHistoryId = null;
        renderApp();
      });
    }
  });
}

// ---------------------------------------------------------------------------
// Business Operations
// ---------------------------------------------------------------------------
async function handleMarkReturned(issueId) {
  const issue = state.issues.find((i) => i.id === issueId);
  if (!issue) return;

  const dueDt = parseDMY(issue.dueDate);
  const overdueDays = Math.max(0, daysBetween(dueDt, TODAY));
  const fineAmt = overdueDays * FINE_PER_DAY;

  try {
    const res = await fetch(`${apiBase}/api/admin/issues/${issueId}/return`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        returnDate: new Date().toISOString().split('T')[0],
        fineAmount: fineAmt,
        paymentMethod: '',
        transactionId: '',
        notes: overdueDays > 0 ? `Late return with fine ₹${fineAmt}.` : ''
      })
    });
    const data = await res.json();
    if (res.ok) {
      showToast(data.message || `Returned "${issue.bookTitle || issue.book}"`, 'good');
      await fetchIssueData();
    } else {
      showToast(data.detail || 'Failed to mark book returned.', 'warn');
    }
  } catch (err) {
    console.error(err);
    showToast(err.message || 'Unable to return book.', 'warn');
  }
}

// Keyboard ESC to close modals
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (state.isNewIssueModalOpen || state.editingFineId || state.viewingFineId) {
      state.isNewIssueModalOpen = false;
      state.editingFineId = null;
      state.viewingFineId = null;
      renderApp();
    }
  }
});

// Initial boot with instant local cache hydration (0ms)
try {
  const cachedRaw = sessionStorage.getItem('book_issue_return_cache_v1');
  if (cachedRaw) {
    const cachedData = JSON.parse(cachedRaw);
    if (cachedData && (cachedData.issues || cachedData.books)) {
      applyIssueData(cachedData);
    }
  }
} catch (_) {}

renderApp();
fetchIssueData();