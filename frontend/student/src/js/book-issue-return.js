const TODAY = new Date(); // Current date

const apiBase = window.location.port === '8000' ? '' : 'http://127.0.0.1:8000';

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatDate(date) {
  if (!date) return '—';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '—';
  return `${String(d.getDate()).padStart(2, "0")}-${MONTHS[d.getMonth()]}-${d.getFullYear()}`;
}

function daysBetween(a, b) {
  return Math.round((new Date(b) - new Date(a)) / 86400000);
}

function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

// Data Stores
const BOOKS = [
  { title: "Clean Code", author: "Robert C. Martin", isbn: "978-0132350884" },
  { title: "Atomic Habits", author: "James Clear", isbn: "978-0735211292" },
  { title: "The Alchemist", author: "Paulo Coelho", isbn: "978-0061122415" },
  { title: "Database System Concepts", author: "Abraham Silberschatz", isbn: "978-0073523323" },
  { title: "Sapiens: A Brief History of Humankind", author: "Yuval Noah Harari", isbn: "978-0062316097" },
  { title: "Thinking, Fast and Slow", author: "Daniel Kahneman", isbn: "978-0374275631" },
  { title: "Zero to One", author: "Peter Thiel", isbn: "978-0804139298" },
  { title: "Deep Work", author: "Cal Newport", isbn: "978-1455586691" },
];

let issuedList = [];
let finesList = [];
let historyList = [];

async function fetchStudentData() {
  try {
    let studentId = 'me';
    let userRaw = localStorage.getItem('user_info') || localStorage.getItem('user');
    if (userRaw) {
      try {
        const u = JSON.parse(userRaw);
        if (u.id || u.roll_number || u.email) {
          studentId = u.roll_number || u.id || u.email;
        }
        const userNameEl = document.querySelector('.user-name');
        const userRoleEl = document.querySelector('.user-role');
        if (userNameEl && u.name) userNameEl.textContent = u.name;
        if (userRoleEl) userRoleEl.textContent = `Student • ${u.roll_number || u.class_name || 'CS'}`;
      } catch (e) {}
    }

    const res = await fetch(`${apiBase}/api/admin/issues/student-data/${studentId}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || `Student data request failed (${res.status})`);
    {
      if (data.issues) {
        issuedList = data.issues.map(i => ({
          ...i,
          issueDate: new Date(i.issueDate),
          dueDate: new Date(i.dueDate)
        }));
      }
      if (data.fines) {
        finesList = data.fines.map(f => ({
          ...f,
          date: new Date(f.date)
        }));
      }
      if (data.history) {
        historyList = data.history.map(h => ({
          ...h,
          issued: new Date(h.issued),
          returned: h.returned && h.returned !== '-' ? new Date(h.returned) : (h.returnDate && h.returnDate !== '-' ? new Date(h.returnDate) : null)
        }));
      }

      if (data.user) {
        const userNameEl = document.querySelector('.user-name');
        const userRoleEl = document.querySelector('.user-role');
        if (userNameEl && data.user.name) userNameEl.textContent = data.user.name;
        if (userRoleEl) userRoleEl.textContent = `Student • ${data.user.rollNo || data.user.class || 'CS'}`;
      }

      renderStats();
      renderTabContent();
    }
  } catch (err) {
    console.error('Failed to fetch student issue data:', err);
    throw err;
  }
}

const borrowByMonth = [1, 0, 2, 1, 3, 2, 1, 2, 3, 0, 0, 0];

// App State
let currentTab = "issued";
let filterSearch = "";
let filterBook = "all";
let filterStatus = "all";
let filterDate = "all";
let selectedFine = null;
let selectedReviewBook = null;
let currentRating = 0;

// Sparkline SVG Builder
function buildSparklineSvg(data, showMonths = false) {
  const w = 260;
  const h = 44;
  const max = Math.max(...data, 1);
  const step = w / (data.length - 1);
  const pts = data.map((v, i) => [i * step, h - (v / max) * (h - 6) - 3]);
  const path = pts.map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`)).join(" ");
  const area = `${path} L${w},${h} L0,${h} Z`;

  let html = `
    <div class="sparkline-box">
      <svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" preserveAspectRatio="none">
        <path d="${area}" fill="#eaeefb" />
        <path d="${path}" fill="none" stroke="#3D539F" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
      </svg>
  `;

  if (showMonths) {
    html += `<div class="sparkline-months">`;
    MONTHS.forEach(m => {
      html += `<span>${m}</span>`;
    });
    html += `</div>`;
  }
  html += `</div>`;
  return html;
}

// Toast Notification
function showToast(msg) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.innerText = msg;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2800);
}

// Render Stats Header Cards
function renderStats() {
  const container = document.getElementById("statsContainer");
  if (!container) return;
  const totalFines = finesList.reduce((acc, f) => acc + f.amount, 0);
  const paidFines = finesList.filter(f => f.status === "Paid").reduce((acc, f) => acc + f.amount, 0);
  const unpaidFines = totalFines - paidFines;

  if (currentTab === "issued") {
    const dueSoonCount = issuedList.filter(i => {
      const d = daysBetween(TODAY, i.dueDate);
      return d >= 0 && d <= 3;
    }).length;
    const overdueCount = issuedList.filter(i => daysBetween(TODAY, i.dueDate) < 0).length;

    container.innerHTML = `
      <div class="stat-card">
        <div class="stat-icon" style="background:#eaeefb; color:#3D539F;">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
        </div>
        <div class="stat-info">
          <div class="stat-label">Currently Issued</div>
          <div class="stat-value">${issuedList.length}</div>
          <div class="stat-sub">Books with you</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon" style="background:#fbeedc; color:#c9832f;">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="3" y1="10" y2="10"/></svg>
        </div>
        <div class="stat-info">
          <div class="stat-label">Due Soon</div>
          <div class="stat-value">${dueSoonCount}</div>
          <div class="stat-sub">Within 3 days</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon" style="background:#fbeaea; color:#d1453b;">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg>
        </div>
        <div class="stat-info">
          <div class="stat-label">Overdue</div>
          <div class="stat-value">${overdueCount}</div>
          <div class="stat-sub">Return immediately</div>
        </div>
      </div>
    `;
  } else if (currentTab === "fine") {
    container.innerHTML = `
      <div class="stat-card">
        <div class="stat-icon" style="background:#eaeefb; color:#3D539F;">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 3h12"/><path d="M6 8h12"/><path d="m6 13 8.5 8"/><path d="M6 13h3a4 4 0 0 0 0-8"/></svg>
        </div>
        <div class="stat-info">
          <div class="stat-label">Total Fines</div>
          <div class="stat-value">₹ ${totalFines}</div>
          <div class="stat-sub">Total Fines</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon" style="background:#e7f8ee; color:#1f9d55;">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 3h12"/><path d="M6 8h12"/><path d="m6 13 8.5 8"/><path d="M6 13h3a4 4 0 0 0 0-8"/></svg>
        </div>
        <div class="stat-info">
          <div class="stat-label">Paid Fines</div>
          <div class="stat-value">₹ ${paidFines}</div>
          <div class="stat-sub">Books returned</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon" style="background:#fbeaea; color:#d1453b;">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 3h12"/><path d="M6 8h12"/><path d="m6 13 8.5 8"/><path d="M6 13h3a4 4 0 0 0 0-8"/></svg>
        </div>
        <div class="stat-info">
          <div class="stat-label">Unpaid Fines</div>
          <div class="stat-value">₹ ${unpaidFines}</div>
          <div class="stat-sub">Unpaid Fines</div>
        </div>
      </div>
      <div class="stat-card" style="flex: 1.2;">
        <div class="stat-info">
          <div class="stat-label" style="margin-bottom:6px;">History of Fines (Total: ${finesList.length})</div>
          ${buildSparklineSvg(finesList.map(f => f.amount))}
        </div>
      </div>
    `;
  } else if (currentTab === "history") {
    container.innerHTML = `
      <div class="stat-card">
        <div class="stat-icon" style="background:#eaeefb; color:#3D539F;">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m16 6 4 14"/><path d="M12 6v14"/><path d="M8 8v12"/><path d="M4 4v16"/></svg>
        </div>
        <div class="stat-info">
          <div class="stat-label">Total Books Borrowed</div>
          <div class="stat-value">${historyList.length}</div>
          <div class="stat-sub">Total Books</div>
        </div>
      </div>
      <div class="stat-card" style="flex: 2;">
        <div class="stat-info">
          <div style="font-size:13.5px; font-weight:600; color:var(--ink); margin-bottom:4px;">History Of Borrowing</div>
          ${buildSparklineSvg(borrowByMonth, true)}
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon" style="background:#fbeaea; color:#d1453b;">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 3h12"/><path d="M6 8h12"/><path d="m6 13 8.5 8"/><path d="M6 13h3a4 4 0 0 0 0-8"/></svg>
        </div>
        <div class="stat-info">
          <div class="stat-label">Total Fines Paid</div>
          <div class="stat-value">₹ ${paidFines}</div>
          <div class="stat-sub">Settled charges</div>
        </div>
      </div>
    `;
  }
}

// Render Filter Bar HTML
function renderFilterBar(placeholder, statusOptions) {
  const statusOpts = statusOptions.map(o => `<option value="${o.value}" ${filterStatus === o.value ? 'selected' : ''}>${o.label}</option>`).join("");

  return `
    <div class="filter-bar">
      <div class="search-input-wrap">
        <span class="search-icon">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
        </span>
        <input type="text" id="filterSearchInput" class="form-control" placeholder="${placeholder}" value="${filterSearch}">
      </div>
      <select id="filterStatusSelect" class="form-control select-control">
        ${statusOpts}
      </select>
      <select id="filterDateSelect" class="form-control select-control">
        <option value="all" ${filterDate === 'all' ? 'selected' : ''}>All Dates</option>
        <option value="30" ${filterDate === '30' ? 'selected' : ''}>Last 30 days</option>
        <option value="90" ${filterDate === '90' ? 'selected' : ''}>Last 3 months</option>
      </select>
    </div>
  `;
}

// Bind Filter Events
function bindFilterEvents() {
  const input = document.getElementById("filterSearchInput");
  const statusSel = document.getElementById("filterStatusSelect");
  const dateSel = document.getElementById("filterDateSelect");

  input?.addEventListener("input", (e) => {
    filterSearch = e.target.value;
    renderTabContent();
  });
  statusSel?.addEventListener("change", (e) => {
    filterStatus = e.target.value;
    renderTabContent();
  });
  dateSel?.addEventListener("change", (e) => {
    filterDate = e.target.value;
    renderTabContent();
  });
}

// Render Main Tab View
function renderTabContent() {
  const container = document.getElementById("tabContentArea");
  if (!container) return;

  if (currentTab === "issued") {
    const rows = issuedList.filter(i => {
      const left = daysBetween(TODAY, i.dueDate);
      const status = left < 0 ? "overdue" : left <= 3 ? "due" : "active";
      if (filterSearch && !(i.book.toLowerCase().includes(filterSearch.toLowerCase()) || i.id.toLowerCase().includes(filterSearch.toLowerCase()))) return false;
      if (filterStatus !== "all" && status !== filterStatus) return false;
      if (filterDate !== "all" && daysBetween(i.issueDate, TODAY) > Number(filterDate)) return false;
      return true;
    });

    let tableRows = rows.map(i => {
      const authorName = i.author && i.author !== "Unknown" && i.author !== "-" ? i.author : (BOOKS.find(item => item.title === i.book)?.author || "-");
      const left = daysBetween(TODAY, i.dueDate);
      const isFinePaid = (i.status || "").toLowerCase() === "fine paid";
      const pillClass = isFinePaid ? "pill-green" : (left < 0 ? "pill-red" : left <= 3 ? "pill-amber" : "pill-green");
      const pillText = isFinePaid ? "Fine Paid" : (left < 0 ? "Overdue" : left <= 3 ? "Due Soon" : "Active");
      const daysText = isFinePaid
        ? `<span class="text-success" style="font-weight:600;">Fine Paid</span>`
        : (left < 0 ? `<span class="text-danger">${Math.abs(left)} late</span>` : `${left} days`);
      const canRenew = i.renewals < 1;

      return `
        <tr>
          <td style="font-weight:600;">${i.id}</td>
          <td>${i.book}</td>
          <td style="color:var(--ink-soft);">${authorName}</td>
          <td style="color:var(--ink-soft);">${formatDate(i.issueDate)}</td>
          <td style="color:var(--ink-soft);">${formatDate(i.dueDate)}</td>
          <td>${daysText}</td>
          <td><span class="pill ${pillClass}">${pillText}</span></td>
        </tr>
      `;
    }).join("");

    if (rows.length === 0) {
      tableRows = `<tr><td colspan="7" style="text-align:center; padding:30px; color:var(--ink-soft);">No issued books found.</td></tr>`;
    }

    container.innerHTML = `
      <div class="card-section">
        <div class="section-title-wrap">
          <div class="header-icon-box" style="width:36px; height:36px;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
          </div>
          <h2 class="section-title">My Issued Books</h2>
        </div>
        ${renderFilterBar("Search by Book Title, Issue ID...", [
          { value: "all", label: "All Status" },
          { value: "active", label: "Active" },
          { value: "due", label: "Due Soon" },
          { value: "overdue", label: "Overdue" },
        ])}
        <div class="table-responsive">
          <table class="custom-table">
            <thead>
              <tr>
                <th>Issue ID</th>
                <th>Book Title</th>
                <th>Author</th>
                <th>Issued Date</th>
                <th>Due Date</th>
                <th>Days Left</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
          </table>
        </div>
      </div>
    `;

  } else if (currentTab === "fine") {
    const rows = finesList.filter(f => {
      if (filterSearch && !(f.book.toLowerCase().includes(filterSearch.toLowerCase()) || f.id.toLowerCase().includes(filterSearch.toLowerCase()))) return false;
      if (filterStatus !== "all" && f.status !== filterStatus) return false;
      if (filterDate !== "all" && daysBetween(f.date, TODAY) > Number(filterDate)) return false;
      return true;
    });

    let tableRows = rows.map(f => {
      const isPaid = f.status === "Paid";
      const pillClass = isPaid ? "pill-green" : "pill-red";
      const actionBtn = isPaid
        ? `<button class="btn-receipt view-receipt-btn" data-id="${f.id}" title="View and Print Payment Receipt">
             <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
             Receipt
           </button>`
        : `<button class="btn btn-primary btn-sm pay-btn" data-id="${f.id}">Pay Fine</button>`;

      return `
        <tr>
          <td style="font-weight:600;">${f.id}</td>
          <td style="color:var(--ink-soft);">${formatDate(f.date)}</td>
          <td>${f.book}</td>
          <td class="text-bold">₹${f.amount}</td>
          <td><span class="pill ${pillClass}">${f.status}</span></td>
          <td style="color:var(--ink-soft);">${f.overdueDays}</td>
          <td>${actionBtn}</td>
        </tr>
      `;
    }).join("");

    if (rows.length === 0) {
      tableRows = `<tr><td colspan="7" style="text-align:center; padding:30px; color:var(--ink-soft);">No fines found matching filters.</td></tr>`;
    }

    container.innerHTML = `
      <div class="card-section">
        <div class="section-title-wrap">
          <div class="header-icon-box" style="width:36px; height:36px;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 3h12"/><path d="M6 8h12"/><path d="m6 13 8.5 8"/><path d="M6 13h3a4 4 0 0 0 0-8"/></svg>
          </div>
          <h2 class="section-title">My Fine Management</h2>
        </div>
        ${renderFilterBar("Search by Fine ID, Book...", [
          { value: "all", label: "All Status" },
          { value: "Paid", label: "Paid" },
          { value: "Unpaid", label: "Unpaid" },
        ])}
        <div class="table-responsive">
          <table class="custom-table">
            <thead>
              <tr>
                <th>Fine ID</th>
                <th>Fine Date</th>
                <th>Book Title</th>
                <th>Amount (₹)</th>
                <th>Status</th>
                <th>Overdue Days</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
          </table>
        </div>
      </div>
    `;

    // Bind Pay buttons
    container.querySelectorAll(".pay-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.id;
        selectedFine = finesList.find(x => x.id === id);
        if (selectedFine) openPayModal(selectedFine);
      });
    });

    // Bind View Receipt buttons
    container.querySelectorAll(".view-receipt-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.id;
        const fineObj = finesList.find(x => x.id === id);
        if (fineObj) openReceiptModal(fineObj);
      });
    });

  } else if (currentTab === "history") {
    const rows = historyList.filter(r => {
      if (filterSearch && !(r.book.toLowerCase().includes(filterSearch.toLowerCase()))) return false;
      if (filterStatus !== "all" && r.finePaid !== filterStatus) return false;
      if (filterDate !== "all" && daysBetween(r.returned, TODAY) > Number(filterDate)) return false;
      return true;
    });

    let tableRows = rows.map(r => {
      const authorName = r.author && r.author !== "Unknown" && r.author !== "-" ? r.author : (BOOKS.find(item => item.title === r.book)?.author || "-");
      const isbnNum = r.isbn && r.isbn !== "-" ? r.isbn : (BOOKS.find(item => item.title === r.book)?.isbn || "-");
      const retVal = r.returned || r.returnDate;
      const returnedDateFmt = retVal && retVal !== '—' && retVal !== '-' ? formatDate(retVal) : '—';
      const pillClass = r.finePaid === "Paid" ? "pill-green" : r.finePaid === "None Due" ? "pill-blue" : "pill-red";

      return `
        <tr>
          <td style="font-weight:600;">${r.book}</td>
          <td style="color:var(--ink-soft);">${formatDate(r.issued)}</td>
          <td style="color:var(--ink-soft);">${returnedDateFmt}</td>
          <td style="color:var(--ink-soft);">${authorName}</td>
          <td style="color:var(--ink-soft); font-family:monospace;">${isbnNum}</td>
          <td><span class="pill ${pillClass}">${r.finePaid}</span></td>
          <td>
            ${
              r.reviewed
                ? `
                <button class="btn btn-sm btn-review-edit review-btn" data-book="${r.book}" title="Edit your existing review and rating">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                  <span>Edit Review</span>
                  <span style="color:#d97706; font-size:11px; margin-left:2px;">(${r.rating}&#9733;)</span>
                </button>
                `
                : `
                <button class="btn btn-sm btn-review-add review-btn" data-book="${r.book}" title="Write a review for this book">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                  <span>Add Review</span>
                </button>
                `
            }
          </td>
        </tr>
      `;
    }).join("");

    if (rows.length === 0) {
      tableRows = `<tr><td colspan="7" style="text-align:center; padding:30px; color:var(--ink-soft);">No borrowing history found.</td></tr>`;
    }

    container.innerHTML = `
      <div class="card-section">
        <div class="section-title-wrap">
          <div class="header-icon-box" style="width:36px; height:36px;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>
          </div>
          <h2 class="section-title">My Detailed Borrowing History</h2>
        </div>
        ${renderFilterBar("Search by Book Title, Author...", [
          { value: "all", label: "All Fine Status" },
          { value: "Paid", label: "Paid" },
          { value: "None Due", label: "None Due" },
          { value: "Overdue", label: "Overdue" },
        ])}
        <div class="table-responsive">
          <table class="custom-table">
            <thead>
              <tr>
                <th>Book Title</th>
                <th>Issued Date</th>
                <th>Returned Date</th>
                <th>Author</th>
                <th>ISBN</th>
                <th>Fine Paid?</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
          </table>
        </div>
      </div>
    `;

    // Bind Review buttons
    container.querySelectorAll(".review-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const title = btn.dataset.book;
        openReviewModal(title);
      });
    });
  }

  bindFilterEvents();
}

// Modal Handlers: Pay Fine
function openPayModal(fine) {
  const b = BOOKS.find(item => item.title === fine.book) || { author: "-" };
  document.getElementById("payModalTitle").innerText = `Pay Fine — ${fine.id}`;
  document.getElementById("payModalSub").innerText = fine.book;
  document.getElementById("payBookTitle").innerText = fine.book;
  document.getElementById("payBookAuthor").innerText = b.author;
  document.getElementById("payOverdueDays").innerText = `${fine.overdueDays} days`;
  document.getElementById("payTotalAmount").innerText = `₹${fine.amount}`;
  document.getElementById("confirmPayBtn").innerText = `Pay ₹${fine.amount}`;

  document.getElementById("payModal").classList.add("open");
}

function closePayModal() {
  document.getElementById("payModal").classList.remove("open");
  selectedFine = null;
}

// Modal Handlers: Fine Payment Receipt
function openReceiptModal(fineData) {
  if (!fineData) return;
  const rcptModal = document.getElementById("receiptModal");
  if (!rcptModal) return;

  const userRaw = localStorage.getItem('user_info') || localStorage.getItem('user');
  let currentUser = {};
  if (userRaw) {
    try { currentUser = JSON.parse(userRaw); } catch (e) {}
  }

  const isUuid = (val) => typeof val === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);

  let sName = fineData.studentName || (fineData.student && fineData.student.name);
  if (!sName || sName === 'Student') {
    sName = currentUser.name || document.querySelector('.user-name')?.textContent || 'Student';
  }

  let sId = fineData.rollNo || fineData.studentRollNo || (fineData.student && (fineData.student.rollNo || fineData.student.roll_number));
  if (!sId || isUuid(sId)) {
    if (fineData.studentId && !isUuid(fineData.studentId)) {
      sId = fineData.studentId;
    } else if (currentUser.roll_number && !isUuid(currentUser.roll_number)) {
      sId = currentUser.roll_number;
    } else if (currentUser.rollNo && !isUuid(currentUser.rollNo)) {
      sId = currentUser.rollNo;
    } else if (currentUser.library_card_number) {
      sId = currentUser.library_card_number;
    } else if (fineData.student && fineData.student.libraryCardNo) {
      sId = fineData.student.libraryCardNo;
    } else {
      sId = '-';
    }
  }

  let sClass = fineData.studentClass || (fineData.student && fineData.student.class);
  if (!sClass || sClass === '-') {
    sClass = currentUser.class_name || currentUser.department || '-';
  }

  const rcptId = `REC-${(fineData.fineCode || fineData.id || 'FIN').replace(/[^a-zA-Z0-9]/g, '')}`;
  const dateStr = fineData.paidAt || new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

  document.getElementById("rcptNo").innerText = rcptId;
  document.getElementById("rcptDateTime").innerText = dateStr;
  document.getElementById("rcptStudentName").innerText = sName;
  document.getElementById("rcptStudentId").innerText = sId;
  document.getElementById("rcptStudentClass").innerText = sClass;
  document.getElementById("rcptBookTitle").innerText = fineData.book || fineData.bookTitle || '-';
  document.getElementById("rcptBookTitle").title = fineData.book || fineData.bookTitle || '';

  const b = BOOKS.find(item => item.title === (fineData.book || fineData.bookTitle));
  const author = fineData.author && fineData.author !== "Unknown" ? fineData.author : (b ? b.author : "-");
  const isbn = fineData.isbn && fineData.isbn !== "-" ? fineData.isbn : (b ? b.isbn : "-");
  document.getElementById("rcptBookAuthor").innerText = `${author} ${isbn !== '-' ? '(' + isbn + ')' : ''}`;

  document.getElementById("rcptOverdueDays").innerText = `${fineData.overdueDays || fineData.daysOverdue || 0} Days`;
  document.getElementById("rcptPaymentMethod").innerText = fineData.paymentMethod || 'Online (Razorpay)';
  document.getElementById("rcptTxnId").innerText = fineData.transactionId || `TXN_${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
  document.getElementById("rcptAmount").innerText = `₹${fineData.finePaid || fineData.amount || fineData.fine || 0}`;

  rcptModal.classList.add("open");
}

function closeReceiptModal() {
  const rcptModal = document.getElementById("receiptModal");
  if (rcptModal) rcptModal.classList.remove("open");
}

// Modal Handlers: Review
function openReviewModal(bookTitle) {
  selectedReviewBook = bookTitle;
  const item = historyList.find(x => x.book === bookTitle);
  currentRating = (item && item.rating) || 0;
  document.getElementById("reviewModalSub").innerText = bookTitle;
  document.getElementById("reviewText").value = (item && item.review) || "";

  updateStarDisplay();
  document.getElementById("reviewModal").classList.add("open");
}

function closeReviewModal() {
  document.getElementById("reviewModal").classList.remove("open");
  selectedReviewBook = null;
}

async function payFineWithRazorpay(fine) {
  if (!window.Razorpay) {
    await new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-razorpay-checkout]');
      if (existing) {
        existing.addEventListener('load', resolve, { once: true });
        existing.addEventListener('error', () => reject(new Error('Razorpay Checkout could not be loaded. Check your internet connection.')), { once: true });
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.dataset.razorpayCheckout = 'true';
      script.onload = resolve;
      script.onerror = () => reject(new Error('Razorpay Checkout could not be loaded. Check your internet connection.'));
      document.head.appendChild(script);
    });
  }
  if (!window.Razorpay) throw new Error('Razorpay Checkout is unavailable in this browser.');

  const fineId = fine.db_id || fine.id;
  const orderResponse = await fetch(`${apiBase}/api/admin/issues/fines/${fineId}/payment-order`, { method: 'POST' });
  const orderData = await orderResponse.json();
  if (!orderResponse.ok) throw new Error(orderData.detail || 'Unable to create Razorpay order');

  return new Promise((resolve, reject) => {
    const checkout = new window.Razorpay({
      key: orderData.keyId,
      amount: orderData.order.amount,
      currency: orderData.order.currency,
      name: 'Library Management System',
      description: `Fine payment for ${fine.book}`,
      order_id: orderData.order.id,
      prefill: { name: document.querySelector('.user-name')?.textContent || '' },
      theme: { color: '#3D539F' },
      handler: async (response) => {
        try {
          const verify = await fetch(`${apiBase}/api/admin/issues/fines/${fineId}/payment-verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(response)
          });
          const data = await verify.json();
          if (!verify.ok) throw new Error(data.detail || 'Payment verification failed');
          resolve(data);
        } catch (error) {
          reject(error);
        }
      },
      modal: { ondismiss: () => reject(new Error('Payment cancelled')) }
    });
    checkout.on('payment.failed', (response) => reject(new Error(response.error?.description || 'Payment failed')));
    checkout.open();
  });
}

function updateStarDisplay() {
  const stars = document.querySelectorAll("#starRating .star-btn");
  stars.forEach(s => {
    const val = Number(s.dataset.star);
    if (val <= currentRating) {
      s.classList.add("active");
    } else {
      s.classList.remove("active");
    }
  });
  const submitBtn = document.getElementById("submitReviewBtn");
  if (submitBtn) submitBtn.disabled = currentRating === 0;
}

// Header text switcher based on tab
function updatePageHeader() {
  const titles = {
    issued: { title: "Book Issue & Return", sub: "Track your issued books, due dates, and renewals." },
    fine: { title: "Fine Management", sub: "Manage fine payments, track due dates, and transactions." },
    history: { title: "Borrowing History", sub: "Your complete borrowing record and past transactions." },
  };
  const titleElem = document.getElementById("pageTitle");
  const subElem = document.getElementById("pageSubtitle");
  if (titleElem && titles[currentTab]) titleElem.innerText = titles[currentTab].title;
  if (subElem && titles[currentTab]) subElem.innerText = titles[currentTab].sub;
}

// Initialize Application
function init() {
  // Tabs Navigation
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      currentTab = btn.dataset.tab;
      filterSearch = "";
      filterBook = "all";
      filterStatus = "all";
      filterDate = "all";
      updatePageHeader();
      renderStats();
      renderTabContent();
    });
  });

  // Mobile menu toggle
  const toggle = document.getElementById("menuToggle");
  const sidebar = document.getElementById("sidebar");
  toggle?.addEventListener("click", () => {
    sidebar?.classList.toggle("open");
  });

  // Payment method selection in modal
  document.querySelectorAll(".method-option").forEach(opt => {
    opt.addEventListener("click", () => {
      document.querySelectorAll(".method-option").forEach(o => o.classList.remove("active"));
      opt.classList.add("active");
      const radio = opt.querySelector("input");
      if (radio) radio.checked = true;
    });
  });

  // Close Pay Modal buttons
  document.getElementById("closePayModal")?.addEventListener("click", closePayModal);
  document.getElementById("closePayModalBack")?.addEventListener("click", closePayModal);
  document.getElementById("cancelPayBtn")?.addEventListener("click", closePayModal);

  // Confirm Pay button
  document.getElementById("confirmPayBtn")?.addEventListener("click", async () => {
    if (selectedFine) {
      const currentPayingFine = { ...selectedFine };
      const fineId = currentPayingFine.db_id || currentPayingFine.id;
      const methodEl = document.querySelector('input[name="paymentMethod"]:checked');
      const payMethod = methodEl ? methodEl.value : 'Online';

      const confirmBtn = document.getElementById("confirmPayBtn");
      if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.innerText = "Processing...";
      }

      try {
        if (payMethod !== 'Cash') {
          const data = await payFineWithRazorpay(currentPayingFine);
          const paidAmount = currentPayingFine.amount;
          showToast(data.message || `Fine of ₹${paidAmount} paid successfully!`);
          closePayModal();

          const receiptFineData = {
            ...currentPayingFine,
            ...(data.fine || {}),
            status: 'Paid',
            finePaid: paidAmount,
            amount: paidAmount,
            paymentMethod: data.fine?.paymentMethod || 'Online (Razorpay)',
            transactionId: data.fine?.transactionId || `PAY_${Date.now()}`,
            paidAt: new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
          };

          openReceiptModal(receiptFineData);

          try {
            await fetchStudentData();
          } catch (refreshError) {
            console.error('Payment saved but student data refresh failed:', refreshError);
            showToast('Payment saved successfully. Refresh the page to see Paid status.');
          }
          return;
        }

        const genTxnId = `TXN_${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
        const res = await fetch(`${apiBase}/api/admin/issues/fines/${fineId}/pay`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amountPaid: currentPayingFine.amount,
            paymentMethod: payMethod,
            transactionId: genTxnId,
            notes: 'Paid via student portal'
          })
        });
        const data = await res.json();
        if (res.ok) {
          showToast(data.message || `Fine of ₹${currentPayingFine.amount} paid successfully!`);
          closePayModal();

          const receiptFineData = {
            ...currentPayingFine,
            ...(data.fine || {}),
            status: 'Paid',
            finePaid: currentPayingFine.amount,
            amount: currentPayingFine.amount,
            paymentMethod: payMethod,
            transactionId: data.fine?.transactionId || genTxnId,
            paidAt: new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
          };

          openReceiptModal(receiptFineData);

          try {
            await fetchStudentData();
          } catch (refreshError) {
            console.error('Payment saved but student data refresh failed:', refreshError);
            showToast('Payment saved successfully. Refresh the page to see Paid status.');
          }
        } else {
          showToast(data.detail || 'Failed to process fine payment.');
        }
      } catch (err) {
        console.error(err);
        showToast(err.message || 'Unable to process fine payment.');
      } finally {
        if (confirmBtn) {
          confirmBtn.disabled = false;
          confirmBtn.innerText = `Pay ₹${currentPayingFine ? currentPayingFine.amount : ''}`;
        }
      }
    }
  });

  // Receipt Modal actions
  document.getElementById("closeReceiptModal")?.addEventListener("click", closeReceiptModal);
  document.getElementById("closeReceiptBtn")?.addEventListener("click", closeReceiptModal);
  document.getElementById("printReceiptBtn")?.addEventListener("click", () => {
    window.print();
  });

  // Stars click
  document.querySelectorAll("#starRating .star-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      currentRating = Number(btn.dataset.star);
      updateStarDisplay();
    });
  });

  // Close Review Modal buttons
  document.getElementById("closeReviewModal")?.addEventListener("click", closeReviewModal);
  document.getElementById("closeReviewModalBack")?.addEventListener("click", closeReviewModal);
  document.getElementById("cancelReviewBtn")?.addEventListener("click", closeReviewModal);

  // Submit Review button
  document.getElementById("submitReviewBtn")?.addEventListener("click", async () => {
    if (selectedReviewBook && currentRating > 0) {
      const submitBtn = document.getElementById("submitReviewBtn");
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerText = "Submitting...";
      }

      try {
        const res = await fetch(`${apiBase}/api/student/reviews`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            bookTitle: selectedReviewBook,
            rating: currentRating,
            review: document.getElementById("reviewText").value
          })
        });
        const data = await res.json();
        if (res.ok) {
          showToast(data.message || `Review submitted for "${selectedReviewBook}"!`);
          closeReviewModal();
          await fetchStudentData();
        } else {
          showToast(data.detail || 'Failed to submit review.');
        }
      } catch (err) {
        console.error(err);
        showToast('Network error while submitting review.');
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerText = "Submit Review";
        }
      }
    }
  });

  // Initial render
  updatePageHeader();
  renderStats();
  renderTabContent();
  fetchStudentData().catch((error) => {
    console.error('Initial student issue data load failed:', error);
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
