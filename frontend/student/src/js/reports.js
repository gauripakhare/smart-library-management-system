/* ==========================================================================
   SMART LIBRARY MANAGEMENT SYSTEM - STUDENT REPORTS MODULE
   ========================================================================== */

const API_STUDENT_REPORTS_URL = "http://127.0.0.1:8000/api/student/reports";

let currentStudentTab = "overview";
let studentChart = null;

document.addEventListener("DOMContentLoaded", () => {
  initStudentTabs();
  initStudentFilters();
  initStudentExports();
  loadStudentReportData();
});

/**
 * Tab Navigation Setup
 */
function initStudentTabs() {
  const tabs = document.querySelectorAll(".tab-btn");
  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      tabs.forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      currentStudentTab = tab.getAttribute("data-tab");
      loadStudentReportData();
    });
  });
}

/**
 * Filter Controls Setup
 */
function initStudentFilters() {
  document.getElementById("date-preset-filter").addEventListener("change", loadStudentReportData);
  document.getElementById("btn-refresh-student-report").addEventListener("click", loadStudentReportData);
}

/**
 * PDF / CSV Export Setup
 */
function initStudentExports() {
  const mainDownloadBtn = document.getElementById("download-my-report-btn");
  const pdfBtn = document.getElementById("export-my-pdf-btn");
  const csvBtn = document.getElementById("export-my-csv-btn");

  if (mainDownloadBtn) mainDownloadBtn.addEventListener("click", () => triggerStudentDownload("pdf"));
  if (pdfBtn) pdfBtn.addEventListener("click", () => triggerStudentDownload("pdf"));
  if (csvBtn) csvBtn.addEventListener("click", () => triggerStudentDownload("csv"));
}

function triggerStudentDownload(format) {
  const preset = document.getElementById("date-preset-filter").value;
  let url = `${API_STUDENT_REPORTS_URL}/download?report_type=${currentStudentTab}&format=${format}`;
  if (preset && preset !== "all") url += `&preset=${preset}`;
  window.open(url, "_blank");
}

/**
 * Main Fetch Dispatcher
 */
async function loadStudentReportData() {
  const preset = document.getElementById("date-preset-filter").value;
  let queryParams = new URLSearchParams();
  if (preset && preset !== "all") queryParams.append("preset", preset);

  const queryString = queryParams.toString() ? `?${queryParams.toString()}` : "";
  const token = localStorage.getItem("token") || localStorage.getItem("student_token");

  try {
    let endpoint = `${API_STUDENT_REPORTS_URL}/${currentStudentTab}${queryString}`;
    let res = await fetch(endpoint, {
      headers: {
        "Content-Type": "application/json",
        ...(token ? { "Authorization": `Bearer ${token}` } : {})
      }
    });

    let data = await res.json();
    if (!data.success) {
      console.error("Student report fetch error:", data);
      return;
    }

    if (data.user) {
      const nameElem = document.getElementById("student-name-display");
      const rollElem = document.getElementById("student-roll-display");
      if (nameElem) nameElem.textContent = data.user.name;
      if (rollElem) rollElem.textContent = `Roll: ${data.user.rollNo}`;
    }

    switch (currentStudentTab) {
      case "overview":
        renderStudentOverview(data);
        break;
      case "books":
        renderStudentBooks(data);
        break;
      case "fines":
        renderStudentFines(data);
        break;
      case "attendance":
        renderStudentAttendance(data);
        break;
      case "seats":
        renderStudentSeats(data);
        break;
      case "notifications":
        renderStudentNotifications(data);
        break;
      default:
        renderStudentOverview(data);
    }
  } catch (err) {
    console.error("Error loading student report:", err);
  }
}

// ---------------------------------------------------------------------------
// 1. STUDENT OVERVIEW
// ---------------------------------------------------------------------------
function renderStudentOverview(data) {
  const kpis = data.kpis || {};
  document.getElementById("student-kpi-grid").innerHTML = `
    <div class="kpi-card blue">
      <div class="kpi-header"><div class="kpi-icon-box"><i class="fa-solid fa-book-open"></i></div><span class="kpi-label">Currently Issued</span></div>
      <div class="kpi-value">${kpis.currentlyIssued || 0}</div>
    </div>
    <div class="kpi-card green">
      <div class="kpi-header"><div class="kpi-icon-box"><i class="fa-solid fa-circle-check"></i></div><span class="kpi-label">Returned Books</span></div>
      <div class="kpi-value">${kpis.returnedBooks || 0}</div>
    </div>
    <div class="kpi-card pink">
      <div class="kpi-header"><div class="kpi-icon-box"><i class="fa-solid fa-clock-rotate-left"></i></div><span class="kpi-label">Overdue Books</span></div>
      <div class="kpi-value">${kpis.overdueBooks || 0}</div>
    </div>
    <div class="kpi-card purple">
      <div class="kpi-header"><div class="kpi-icon-box"><i class="fa-solid fa-indian-rupee-sign"></i></div><span class="kpi-label">Pending Fines</span></div>
      <div class="kpi-value">₹ ${(kpis.pendingFines || 0).toLocaleString()}</div>
    </div>
    <div class="kpi-card orange">
      <div class="kpi-header"><div class="kpi-icon-box"><i class="fa-solid fa-chair"></i></div><span class="kpi-label">Seat Bookings</span></div>
      <div class="kpi-value">${kpis.seatBookings || 0}</div>
    </div>
  `;

  // Render Reading Trends Chart
  const charts = data.charts || {};
  renderStudentChart(charts.months || [], charts.issuedMonthly || [], charts.returnedMonthly || []);

  // Render Recent Transactions Table
  const transactions = data.recentTransactions || [];
  document.getElementById("student-table-title").textContent = "Recent Reading Transactions";
  document.getElementById("student-table-count").textContent = `Showing last ${transactions.length} transactions`;

  document.getElementById("student-table-head").innerHTML = `
    <tr>
      <th>Book Title</th>
      <th>Issue Date</th>
      <th>Due Date</th>
      <th>Return Date</th>
      <th>Fine (₹)</th>
      <th>Status</th>
    </tr>
  `;

  document.getElementById("student-table-body").innerHTML = transactions.map(t => `
    <tr>
      <td><b>${t.bookTitle}</b></td>
      <td>${t.issueDate}</td>
      <td>${t.dueDate}</td>
      <td>${t.returnDate}</td>
      <td>₹ ${t.fine}</td>
      <td><span class="badge-status ${t.status === 'Returned' ? 'status-returned' : (t.status === 'Overdue' ? 'status-overdue' : 'status-issued')}">${t.status}</span></td>
    </tr>
  `).join("");
}

// ---------------------------------------------------------------------------
// 2. STUDENT BOOKS
// ---------------------------------------------------------------------------
function renderStudentBooks(data) {
  const books = data.books || [];
  const activeCount = books.filter(b => b.returnDate === '-' || (b.status && !b.status.toLowerCase().includes('returned'))).length;
  const returnedCount = books.filter(b => b.returnDate !== '-' || (b.status && b.status.toLowerCase().includes('returned'))).length;

  document.getElementById("student-kpi-grid").innerHTML = `
    <div class="kpi-card blue"><div class="kpi-header"><div class="kpi-icon-box"><i class="fa-solid fa-book"></i></div><span class="kpi-label">Total Books Borrowed</span></div><div class="kpi-value">${books.length}</div></div>
    <div class="kpi-card purple"><div class="kpi-header"><div class="kpi-icon-box"><i class="fa-solid fa-book-open"></i></div><span class="kpi-label">Active Issues</span></div><div class="kpi-value">${activeCount}</div></div>
    <div class="kpi-card green"><div class="kpi-header"><div class="kpi-icon-box"><i class="fa-solid fa-circle-check"></i></div><span class="kpi-label">Returned Books</span></div><div class="kpi-value">${returnedCount}</div></div>
  `;

  document.getElementById("student-table-title").textContent = "My Borrowed Books History";
  document.getElementById("student-table-count").textContent = `Showing ${books.length} entries`;

  document.getElementById("student-table-head").innerHTML = `
    <tr>
      <th>Issue Code</th>
      <th>Book Title</th>
      <th>Author</th>
      <th>ISBN</th>
      <th>Issue Date</th>
      <th>Due Date</th>
      <th>Return Date</th>
      <th>Status</th>
    </tr>
  `;

  document.getElementById("student-table-body").innerHTML = books.map(b => `
    <tr>
      <td><code>${b.issueCode}</code></td>
      <td><b>${b.title}</b></td>
      <td>${b.author}</td>
      <td>${b.isbn}</td>
      <td>${b.issueDate}</td>
      <td>${b.dueDate}</td>
      <td>${b.returnDate}</td>
      <td><span class="badge-status ${b.status === 'Returned' ? 'status-returned' : (b.status === 'Overdue' ? 'status-overdue' : 'status-issued')}">${b.status}</span></td>
    </tr>
  `).join("");
}

// ---------------------------------------------------------------------------
// 3. STUDENT FINES
// ---------------------------------------------------------------------------
function renderStudentFines(data) {
  const fines = data.fines || [];
  const pendingAmt = fines.filter(f => f.status !== 'Paid').reduce((acc, f) => acc + (f.fineAmount - f.finePaid), 0);
  const totalPaid = fines.reduce((acc, f) => acc + f.finePaid, 0);

  document.getElementById("student-kpi-grid").innerHTML = `
    <div class="kpi-card purple"><div class="kpi-header"><div class="kpi-icon-box"><i class="fa-solid fa-receipt"></i></div><span class="kpi-label">Fine Records</span></div><div class="kpi-value">${fines.length}</div></div>
    <div class="kpi-card green"><div class="kpi-header"><div class="kpi-icon-box"><i class="fa-solid fa-circle-dollar-to-slot"></i></div><span class="kpi-label">Total Fine Paid</span></div><div class="kpi-value">₹ ${totalPaid}</div></div>
    <div class="kpi-card pink"><div class="kpi-header"><div class="kpi-icon-box"><i class="fa-solid fa-hand-holding-dollar"></i></div><span class="kpi-label">Pending Fine Balance</span></div><div class="kpi-value">₹ ${pendingAmt}</div></div>
  `;

  document.getElementById("student-table-title").textContent = "My Fine Statement & Transactions";
  document.getElementById("student-table-count").textContent = `Showing ${fines.length} fine records`;

  document.getElementById("student-table-head").innerHTML = `
    <tr>
      <th>Fine Code</th>
      <th>Book Title</th>
      <th>Original Due Date</th>
      <th>Return Date</th>
      <th>Days Overdue</th>
      <th>Fine Amount</th>
      <th>Paid</th>
      <th>Status</th>
    </tr>
  `;

  document.getElementById("student-table-body").innerHTML = fines.map(f => `
    <tr>
      <td><code>${f.fineCode}</code></td>
      <td><b>${f.bookTitle}</b></td>
      <td>${f.originalDueDate}</td>
      <td>${f.returnDate}</td>
      <td>${f.daysOverdue} days</td>
      <td>₹ ${f.fineAmount}</td>
      <td>₹ ${f.finePaid}</td>
      <td><span class="badge-status ${f.status === 'Paid' ? 'status-paid' : 'status-unpaid'}">${f.status}</span></td>
    </tr>
  `).join("");
}

// ---------------------------------------------------------------------------
// 4. STUDENT ATTENDANCE
// ---------------------------------------------------------------------------
function renderStudentAttendance(data) {
  const stats = data.stats || {};
  const logs = data.attendance || [];

  document.getElementById("student-kpi-grid").innerHTML = `
    <div class="kpi-card green"><div class="kpi-header"><div class="kpi-icon-box"><i class="fa-solid fa-calendar-check"></i></div><span class="kpi-label">Days Present</span></div><div class="kpi-value">${stats.presentDays || logs.length}</div></div>
    <div class="kpi-card blue"><div class="kpi-header"><div class="kpi-icon-box"><i class="fa-solid fa-chart-pie"></i></div><span class="kpi-label">Attendance Rate</span></div><div class="kpi-value">${stats.attendanceRate || 0}%</div></div>
  `;

  document.getElementById("student-table-title").textContent = "My Daily Attendance Logs";
  document.getElementById("student-table-count").textContent = `Showing ${logs.length} check-in entries`;

  document.getElementById("student-table-head").innerHTML = `
    <tr>
      <th>Date</th>
      <th>Check-in Time</th>
      <th>Check-out Time</th>
      <th>Verification Method</th>
      <th>Status</th>
    </tr>
  `;

  document.getElementById("student-table-body").innerHTML = logs.map(l => `
    <tr>
      <td><b>${l.date}</b></td>
      <td>${l.checkInTime}</td>
      <td>${l.checkOutTime}</td>
      <td><span class="badge-status status-issued">${l.method}</span></td>
      <td><span class="badge-status status-present">${l.status}</span></td>
    </tr>
  `).join("");
}

// ---------------------------------------------------------------------------
// 5. STUDENT SEATS
// ---------------------------------------------------------------------------
function renderStudentSeats(data) {
  const bookings = data.bookings || [];

  document.getElementById("student-kpi-grid").innerHTML = `
    <div class="kpi-card orange"><div class="kpi-header"><div class="kpi-icon-box"><i class="fa-solid fa-chair"></i></div><span class="kpi-label">Total Reservations</span></div><div class="kpi-value">${bookings.length}</div></div>
  `;

  document.getElementById("student-table-title").textContent = "My Seat Reservation Log";
  document.getElementById("student-table-count").textContent = `Showing ${bookings.length} bookings`;

  document.getElementById("student-table-head").innerHTML = `
    <tr>
      <th>Seat Code</th>
      <th>Floor Location</th>
      <th>Booking Date</th>
      <th>Reserved Time Slot</th>
      <th>Status</th>
    </tr>
  `;

  document.getElementById("student-table-body").innerHTML = bookings.map(b => `
    <tr>
      <td><code>${b.seatCode}</code></td>
      <td>${b.floor}</td>
      <td>${b.bookingDate}</td>
      <td>${b.startTime} - ${b.endTime}</td>
      <td><span class="badge-status ${b.status === 'CHECKED_IN' ? 'status-present' : 'status-reserved'}">${b.status}</span></td>
    </tr>
  `).join("");
}

// ---------------------------------------------------------------------------
// 6. STUDENT NOTIFICATIONS
// ---------------------------------------------------------------------------
function renderStudentNotifications(data) {
  const notifs = data.notifications || [];

  document.getElementById("student-kpi-grid").innerHTML = `
    <div class="kpi-card blue"><div class="kpi-header"><div class="kpi-icon-box"><i class="fa-regular fa-bell"></i></div><span class="kpi-label">Total Notifications</span></div><div class="kpi-value">${notifs.length}</div></div>
  `;

  document.getElementById("student-table-title").textContent = "My System Notifications";
  document.getElementById("student-table-count").textContent = `Showing ${notifs.length} notifications`;

  document.getElementById("student-table-head").innerHTML = `
    <tr>
      <th>Title</th>
      <th>Message</th>
      <th>Category</th>
      <th>Date</th>
    </tr>
  `;

  document.getElementById("student-table-body").innerHTML = notifs.map(n => `
    <tr>
      <td><b>${n.title}</b></td>
      <td>${n.message}</td>
      <td><span class="badge-status status-issued">${n.type}</span></td>
      <td>${n.createdAt || n.date}</td>
    </tr>
  `).join("");
}

// ---------------------------------------------------------------------------
// Chart Utility
// ---------------------------------------------------------------------------
function renderStudentChart(months, issued, returned) {
  const ctx = document.getElementById("studentReadingChart");
  if (!ctx) return;
  if (studentChart) studentChart.destroy();

  studentChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: months.length ? months : ["Jan", "Feb", "Mar", "Apr", "May", "Jun"],
      datasets: [
        { label: "Issued Books", data: issued, backgroundColor: "#3B82F6", borderRadius: 4 },
        { label: "Returned Books", data: returned, backgroundColor: "#10B981", borderRadius: 4 }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: "top" } },
      scales: { y: { beginAtZero: true } }
    }
  });
}
