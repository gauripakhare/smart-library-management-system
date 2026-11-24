/* ==========================================================================
   SMART LIBRARY MANAGEMENT SYSTEM - ADMIN REPORTS MODULE (DYNAMIC)
   ========================================================================== */

const API_BASE_URL = "http://127.0.0.1:8000/api/reports";

let currentTab = "overview";
let primaryChart = null;
let secondaryChart = null;

document.addEventListener("DOMContentLoaded", () => {
  initTabNavigation();
  initFilterControls();
  initExportHandlers();
  loadReportData();
});

/**
 * Tab Navigation Setup
 */
function initTabNavigation() {
  const tabs = document.querySelectorAll(".tab-btn");
  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      tabs.forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      currentTab = tab.getAttribute("data-tab");
      document.getElementById("report-search-input").value = "";
      loadReportData();
    });
  });
}

/**
 * Filter Controls Event Handlers
 */
function initFilterControls() {
  document.getElementById("date-preset-filter").addEventListener("change", loadReportData);
  document.getElementById("dept-filter").addEventListener("change", loadReportData);
  document.getElementById("status-filter").addEventListener("change", loadReportData);
  document.getElementById("btn-refresh-report").addEventListener("click", loadReportData);

  let searchTimeout = null;
  document.getElementById("report-search-input").addEventListener("input", () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(loadReportData, 300);
  });
}

/**
 * PDF / CSV Export Handlers
 */
function initExportHandlers() {
  const exportPdfBtn = document.getElementById("export-pdf-btn");
  const exportCsvBtn = document.getElementById("export-csv-btn");
  const downloadReportBtn = document.getElementById("download-report-btn");

  if (downloadReportBtn) {
    downloadReportBtn.addEventListener("click", () => triggerDownload("pdf"));
  }
  if (exportPdfBtn) {
    exportPdfBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      triggerDownload("pdf");
    });
  }
  if (exportCsvBtn) {
    exportCsvBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      triggerDownload("csv");
    });
  }
}

function triggerDownload(format) {
  const preset = document.getElementById("date-preset-filter").value;
  const dept = document.getElementById("dept-filter").value;
  let url = `${API_BASE_URL}/download?report_type=${currentTab}&format=${format}`;
  if (preset && preset !== "all") url += `&preset=${preset}`;
  if (dept && dept !== "all") url += `&department=${encodeURIComponent(dept)}`;
  
  window.open(url, "_blank");
}

/**
 * Main Data Dispatcher
 */
async function loadReportData() {
  const preset = document.getElementById("date-preset-filter").value;
  const dept = document.getElementById("dept-filter").value;
  const status = document.getElementById("status-filter").value;
  const search = document.getElementById("report-search-input").value;

  let queryParams = new URLSearchParams();
  if (preset && preset !== "all") queryParams.append("preset", preset);
  if (dept && dept !== "all") queryParams.append("department", dept);
  if (status && status !== "all") queryParams.append("status", status);
  if (search && search.trim()) queryParams.append("search", search.trim());

  const queryString = queryParams.toString() ? `?${queryParams.toString()}` : "";

  try {
    let endpoint = `${API_BASE_URL}/${currentTab}${queryString}`;
    let res = await fetch(endpoint);
    let data = await res.json();

    if (!data.success) {
      console.error("Report fetch error:", data);
      return;
    }

    switch (currentTab) {
      case "overview":
        renderOverviewReport(data);
        break;
      case "books":
        renderBooksReport(data);
        break;
      case "students":
        renderStudentsReport(data);
        break;
      case "issues":
        renderIssuesReport(data);
        break;
      case "fines":
        renderFinesReport(data);
        break;
      case "attendance":
        renderAttendanceReport(data);
        break;
      case "seats":
        renderSeatsReport(data);
        break;
      case "notifications":
        renderNotificationsReport(data);
        break;
      default:
        renderOverviewReport(data);
    }
  } catch (err) {
    console.error("Error loading report data:", err);
  }
}

// ---------------------------------------------------------------------------
// 1. OVERVIEW REPORT
// ---------------------------------------------------------------------------
function renderOverviewReport(data) {
  const kpis = data.kpis || {};
  document.getElementById("kpi-cards-grid").innerHTML = `
    <div class="kpi-card blue">
      <div class="kpi-header"><div class="kpi-icon-box"><i class="fa-solid fa-book"></i></div><span class="kpi-label">Total Books</span></div>
      <div class="kpi-value">${kpis.totalBooks || 0}</div>
      <div class="kpi-trend"><span class="trend-subtext">Catalog Inventory</span></div>
    </div>
    <div class="kpi-card green">
      <div class="kpi-header"><div class="kpi-icon-box"><i class="fa-solid fa-user-group"></i></div><span class="kpi-label">Registered Students</span></div>
      <div class="kpi-value">${kpis.totalStudents || 0}</div>
      <div class="kpi-trend"><span class="trend-subtext">Active Accounts</span></div>
    </div>
    <div class="kpi-card purple">
      <div class="kpi-header"><div class="kpi-icon-box"><i class="fa-solid fa-book-open"></i></div><span class="kpi-label">Books Issued</span></div>
      <div class="kpi-value">${kpis.booksIssued || 0}</div>
      <div class="kpi-trend"><span class="trend-subtext">Current Period</span></div>
    </div>
    <div class="kpi-card orange">
      <div class="kpi-header"><div class="kpi-icon-box"><i class="fa-solid fa-arrow-rotate-left"></i></div><span class="kpi-label">Books Returned</span></div>
      <div class="kpi-value">${kpis.booksReturned || 0}</div>
      <div class="kpi-trend"><span class="trend-subtext">Successfully Returned</span></div>
    </div>
    <div class="kpi-card pink">
      <div class="kpi-header"><div class="kpi-icon-box"><i class="fa-solid fa-indian-rupee-sign"></i></div><span class="kpi-label">Fines Collected</span></div>
      <div class="kpi-value">₹ ${(kpis.totalFinesCollected || 0).toLocaleString()}</div>
      <div class="kpi-trend"><span class="trend-subtext">Pending: ₹ ${(kpis.totalFinesPending || 0).toLocaleString()}</span></div>
    </div>
  `;

  // Render Charts
  document.getElementById("primary-chart-title").textContent = "Issue vs Return Monthly Trend";
  document.getElementById("secondary-chart-title").textContent = "Seat Utilization Overview";

  const charts = data.charts || {};
  renderBarChart("primaryReportChart", charts.months || [], [
    { label: "Issued", data: charts.issuedMonthly || [], backgroundColor: "#3B82F6" },
    { label: "Returned", data: charts.returnedMonthly || [], backgroundColor: "#10B981" }
  ]);

  const seatData = charts.seatUtilization || { occupied: kpis.occupiedSeats || 0, available: kpis.availableSeats || 274 };
  renderDoughnutChart("secondaryReportChart", ["Occupied", "Available"], [seatData.occupied, seatData.available], ["#EF4444", "#10B981"]);

  // Render Overview Table (Quick Summary)
  document.getElementById("table-section-title").textContent = "Quick Analytics Summary";
  document.getElementById("table-records-count").textContent = `Live Database Metrics`;
  
  document.getElementById("report-table-head").innerHTML = `
    <tr>
      <th>Metric Name</th>
      <th>Count / Value</th>
      <th>Category</th>
      <th>Status</th>
    </tr>
  `;
  document.getElementById("report-table-body").innerHTML = `
    <tr><td>Total Library Books</td><td><b>${kpis.totalBooks}</b></td><td>Catalog Inventory</td><td><span class="badge-status status-available">Active</span></td></tr>
    <tr><td>Registered Students</td><td><b>${kpis.totalStudents}</b></td><td>User Base</td><td><span class="badge-status status-available">Active</span></td></tr>
    <tr><td>Total Books Issued</td><td><b>${kpis.booksIssued}</b></td><td>Circulation</td><td><span class="badge-status status-issued">Issued</span></td></tr>
    <tr><td>Total Books Returned</td><td><b>${kpis.booksReturned}</b></td><td>Circulation</td><td><span class="badge-status status-returned">Returned</span></td></tr>
    <tr><td>Fines Collected</td><td><b>₹ ${kpis.totalFinesCollected}</b></td><td>Finance</td><td><span class="badge-status status-paid">Collected</span></td></tr>
    <tr><td>Fines Pending</td><td><b>₹ ${kpis.totalFinesPending}</b></td><td>Finance</td><td><span class="badge-status status-unpaid">Pending</span></td></tr>
  `;
}

// ---------------------------------------------------------------------------
// 2. BOOKS REPORT
// ---------------------------------------------------------------------------
function renderBooksReport(data) {
  const kpis = data.kpis || {};
  document.getElementById("kpi-cards-grid").innerHTML = `
    <div class="kpi-card blue"><div class="kpi-header"><div class="kpi-icon-box"><i class="fa-solid fa-book"></i></div><span class="kpi-label">Total Titles</span></div><div class="kpi-value">${kpis.totalBooks || 0}</div></div>
    <div class="kpi-card green"><div class="kpi-header"><div class="kpi-icon-box"><i class="fa-solid fa-copy"></i></div><span class="kpi-label">Total Copies</span></div><div class="kpi-value">${kpis.totalCopies || 0}</div></div>
    <div class="kpi-card purple"><div class="kpi-header"><div class="kpi-icon-box"><i class="fa-solid fa-check-double"></i></div><span class="kpi-label">Available Copies</span></div><div class="kpi-value">${kpis.availableCopies || 0}</div></div>
    <div class="kpi-card orange"><div class="kpi-header"><div class="kpi-icon-box"><i class="fa-solid fa-hand-holding-hand"></i></div><span class="kpi-label">Issued Copies</span></div><div class="kpi-value">${kpis.issuedCopies || 0}</div></div>
    <div class="kpi-card pink"><div class="kpi-header"><div class="kpi-icon-box"><i class="fa-solid fa-triangle-exclamation"></i></div><span class="kpi-label">Low Stock</span></div><div class="kpi-value">${kpis.lowStockCount || 0}</div></div>
  `;

  const inventory = data.inventory || [];
  const popular = data.popularBooks || [];

  document.getElementById("primary-chart-title").textContent = "Top Most Popular Issued Books";
  document.getElementById("secondary-chart-title").textContent = "Stock Availability Breakdown";

  renderHorizontalBarChart("primaryReportChart", popular.map(p => p.title), popular.map(p => p.issuedCount), "#3B82F6");
  renderDoughnutChart("secondaryReportChart", ["Available Copies", "Issued Copies", "Low Stock Titles"], [kpis.availableCopies, kpis.issuedCopies, kpis.lowStockCount], ["#10B981", "#3B82F6", "#EF4444"]);

  document.getElementById("table-section-title").textContent = "Book Inventory Report";
  document.getElementById("table-records-count").textContent = `Showing ${inventory.length} books`;

  document.getElementById("report-table-head").innerHTML = `
    <tr>
      <th>ISBN</th>
      <th>Title</th>
      <th>Author</th>
      <th>Category</th>
      <th>Total Copies</th>
      <th>Available</th>
      <th>Times Issued</th>
      <th>Status</th>
    </tr>
  `;

  document.getElementById("report-table-body").innerHTML = inventory.map(b => `
    <tr>
      <td><code>${b.isbn}</code></td>
      <td><b>${b.title}</b></td>
      <td>${b.author}</td>
      <td>${b.category}</td>
      <td>${b.totalCopies}</td>
      <td>${b.availableCopies}</td>
      <td><b>${b.issuedCount}</b></td>
      <td><span class="badge-status ${b.status === 'Available' ? 'status-available' : (b.status === 'Low Stock' ? 'status-lowstock' : 'status-overdue')}">${b.status}</span></td>
    </tr>
  `).join("");
}

// ---------------------------------------------------------------------------
// 3. STUDENTS REPORT
// ---------------------------------------------------------------------------
function renderStudentsReport(data) {
  const kpis = data.kpis || {};
  const students = data.students || [];
  const deptDist = data.departmentDistribution || {};

  document.getElementById("kpi-cards-grid").innerHTML = `
    <div class="kpi-card green"><div class="kpi-header"><div class="kpi-icon-box"><i class="fa-solid fa-users"></i></div><span class="kpi-label">Total Students</span></div><div class="kpi-value">${kpis.totalStudents || 0}</div></div>
    <div class="kpi-card blue"><div class="kpi-header"><div class="kpi-icon-box"><i class="fa-solid fa-building"></i></div><span class="kpi-label">Departments</span></div><div class="kpi-value">${kpis.departmentsCount || 0}</div></div>
    <div class="kpi-card purple"><div class="kpi-header"><div class="kpi-icon-box"><i class="fa-solid fa-book-open"></i></div><span class="kpi-label">Active Borrowers</span></div><div class="kpi-value">${students.filter(s => s.activeIssuesCount > 0).length}</div></div>
    <div class="kpi-card pink"><div class="kpi-header"><div class="kpi-icon-box"><i class="fa-solid fa-indian-rupee-sign"></i></div><span class="kpi-label">With Pending Fines</span></div><div class="kpi-value">${students.filter(s => s.pendingFineAmount > 0).length}</div></div>
  `;

  document.getElementById("primary-chart-title").textContent = "Department Distribution";
  document.getElementById("secondary-chart-title").textContent = "Student Borrowing Activity";

  const deptLabels = Object.keys(deptDist);
  const deptValues = Object.values(deptDist);
  renderBarChart("primaryReportChart", deptLabels, [{ label: "Students", data: deptValues, backgroundColor: "#3D539F" }]);
  renderDoughnutChart("secondaryReportChart", ["Active Borrowers", "Inactive Borrowers"], [students.filter(s => s.activeIssuesCount > 0).length, students.filter(s => s.activeIssuesCount === 0).length], ["#10B981", "#64748B"]);

  document.getElementById("table-section-title").textContent = "Registered Students List";
  document.getElementById("table-records-count").textContent = `Showing ${students.length} students`;

  document.getElementById("report-table-head").innerHTML = `
    <tr>
      <th>Student Name</th>
      <th>Roll Number</th>
      <th>Library Card</th>
      <th>Department</th>
      <th>Active Issues</th>
      <th>Pending Fine</th>
      <th>Status</th>
    </tr>
  `;

  document.getElementById("report-table-body").innerHTML = students.map(s => `
    <tr>
      <td><b>${s.name}</b><br><small style="color:#64748B">${s.email}</small></td>
      <td><code>${s.rollNo}</code></td>
      <td>${s.libraryCardNo}</td>
      <td>${s.department}</td>
      <td><b>${s.activeIssuesCount}</b></td>
      <td>₹ ${s.pendingFineAmount}</td>
      <td><span class="badge-status status-available">${s.status}</span></td>
    </tr>
  `).join("");
}

// ---------------------------------------------------------------------------
// 4. ISSUES & RETURNS REPORT
// ---------------------------------------------------------------------------
function renderIssuesReport(data) {
  const kpis = data.kpis || {};
  const issues = data.issues || [];

  document.getElementById("kpi-cards-grid").innerHTML = `
    <div class="kpi-card blue"><div class="kpi-header"><div class="kpi-icon-box"><i class="fa-solid fa-arrow-right-arrow-left"></i></div><span class="kpi-label">Total Issued</span></div><div class="kpi-value">${kpis.totalIssued || 0}</div></div>
    <div class="kpi-card purple"><div class="kpi-header"><div class="kpi-icon-box"><i class="fa-solid fa-book-open"></i></div><span class="kpi-label">Currently Issued</span></div><div class="kpi-value">${kpis.currentlyIssued || 0}</div></div>
    <div class="kpi-card green"><div class="kpi-header"><div class="kpi-icon-box"><i class="fa-solid fa-circle-check"></i></div><span class="kpi-label">Returned</span></div><div class="kpi-value">${kpis.returnedCount || 0}</div></div>
    <div class="kpi-card pink"><div class="kpi-header"><div class="kpi-icon-box"><i class="fa-solid fa-clock-rotate-left"></i></div><span class="kpi-label">Overdue Issues</span></div><div class="kpi-value">${kpis.overdueCount || 0}</div></div>
  `;

  document.getElementById("primary-chart-title").textContent = "Issue vs Return Status";
  document.getElementById("secondary-chart-title").textContent = "Overdue Risk Ratio";

  renderDoughnutChart("primaryReportChart", ["Currently Issued", "Returned"], [kpis.currentlyIssued, kpis.returnedCount], ["#3B82F6", "#10B981"]);
  renderDoughnutChart("secondaryReportChart", ["On-Time / Returned", "Overdue"], [kpis.totalIssued - kpis.overdueCount, kpis.overdueCount], ["#10B981", "#EF4444"]);

  document.getElementById("table-section-title").textContent = "Book Issue & Return Records";
  document.getElementById("table-records-count").textContent = `Showing ${issues.length} transaction records`;

  document.getElementById("report-table-head").innerHTML = `
    <tr>
      <th>Issue Code</th>
      <th>Student Name</th>
      <th>Roll No</th>
      <th>Book Title</th>
      <th>Issue Date</th>
      <th>Due Date</th>
      <th>Return Date</th>
      <th>Status</th>
    </tr>
  `;

  document.getElementById("report-table-body").innerHTML = issues.map(i => `
    <tr>
      <td><code>${i.issueCode}</code></td>
      <td><b>${i.studentName}</b></td>
      <td>${i.rollNo}</td>
      <td>${i.bookTitle}</td>
      <td>${i.issueDate}</td>
      <td>${i.dueDate}</td>
      <td>${i.returnDate}</td>
      <td><span class="badge-status ${i.returnDate !== '-' ? 'status-returned' : (i.status.toLowerCase().includes('overdue') ? 'status-overdue' : 'status-issued')}">${i.returnDate !== '-' ? 'Returned' : i.status}</span></td>
    </tr>
  `).join("");
}

// ---------------------------------------------------------------------------
// 5. FINES REPORT
// ---------------------------------------------------------------------------
function renderFinesReport(data) {
  const kpis = data.kpis || {};
  const fines = data.fines || [];

  document.getElementById("kpi-cards-grid").innerHTML = `
    <div class="kpi-card blue"><div class="kpi-header"><div class="kpi-icon-box"><i class="fa-solid fa-file-invoice-dollar"></i></div><span class="kpi-label">Total Fine Generated</span></div><div class="kpi-value">₹ ${(kpis.totalGenerated || 0).toLocaleString()}</div></div>
    <div class="kpi-card green"><div class="kpi-header"><div class="kpi-icon-box"><i class="fa-solid fa-circle-dollar-to-slot"></i></div><span class="kpi-label">Total Collected</span></div><div class="kpi-value">₹ ${(kpis.totalCollected || 0).toLocaleString()}</div></div>
    <div class="kpi-card pink"><div class="kpi-header"><div class="kpi-icon-box"><i class="fa-solid fa-hand-holding-dollar"></i></div><span class="kpi-label">Pending Collection</span></div><div class="kpi-value">₹ ${(kpis.pendingAmount || 0).toLocaleString()}</div></div>
    <div class="kpi-card purple"><div class="kpi-header"><div class="kpi-icon-box"><i class="fa-solid fa-receipt"></i></div><span class="kpi-label">Total Fine Records</span></div><div class="kpi-value">${kpis.totalFinesCount || 0}</div></div>
  `;

  document.getElementById("primary-chart-title").textContent = "Fine Payment Status Breakdown";
  document.getElementById("secondary-chart-title").textContent = "Payment Methods Distribution";

  renderDoughnutChart("primaryReportChart", ["Collected (Paid)", "Pending (Unpaid)"], [kpis.totalCollected, kpis.pendingAmount], ["#10B981", "#EF4444"]);
  
  const paymentMethods = {};
  fines.forEach(f => {
    let m = f.paymentMethod || "Cash/Online";
    paymentMethods[m] = (paymentMethods[m] || 0) + 1;
  });
  renderBarChart("secondaryReportChart", Object.keys(paymentMethods), [{ label: "Transactions", data: Object.values(paymentMethods), backgroundColor: "#8B5CF6" }]);

  document.getElementById("table-section-title").textContent = "Fine Transaction History";
  document.getElementById("table-records-count").textContent = `Showing ${fines.length} fine records`;

  document.getElementById("report-table-head").innerHTML = `
    <tr>
      <th>Fine Code</th>
      <th>Student Name</th>
      <th>Book Title</th>
      <th>Overdue Days</th>
      <th>Fine Amount</th>
      <th>Paid</th>
      <th>Status</th>
      <th>Payment Method</th>
    </tr>
  `;

  document.getElementById("report-table-body").innerHTML = fines.map(f => `
    <tr>
      <td><code>${f.fineCode}</code></td>
      <td><b>${f.studentName}</b><br><small style="color:#64748B">${f.rollNo}</small></td>
      <td>${f.bookTitle}</td>
      <td>${f.daysOverdue} days</td>
      <td>₹ ${f.fineAmount}</td>
      <td>₹ ${f.finePaid}</td>
      <td><span class="badge-status ${f.status === 'Paid' ? 'status-paid' : 'status-unpaid'}">${f.status}</span></td>
      <td>${f.paymentMethod}</td>
    </tr>
  `).join("");
}

// ---------------------------------------------------------------------------
// 6. ATTENDANCE REPORT
// ---------------------------------------------------------------------------
function renderAttendanceReport(data) {
  const kpis = data.kpis || {};
  const logs = data.attendance || [];

  document.getElementById("kpi-cards-grid").innerHTML = `
    <div class="kpi-card blue"><div class="kpi-header"><div class="kpi-icon-box"><i class="fa-regular fa-calendar-days"></i></div><span class="kpi-label">Total Check-ins</span></div><div class="kpi-value">${kpis.totalLogs || 0}</div></div>
    <div class="kpi-card green"><div class="kpi-header"><div class="kpi-icon-box"><i class="fa-solid fa-chart-line"></i></div><span class="kpi-label">Attendance Rate</span></div><div class="kpi-value">${kpis.attendanceRate || 0}%</div></div>
    <div class="kpi-card purple"><div class="kpi-header"><div class="kpi-icon-box"><i class="fa-solid fa-user-check"></i></div><span class="kpi-label">Total Registered Students</span></div><div class="kpi-value">${kpis.totalStudents || 0}</div></div>
  `;

  document.getElementById("primary-chart-title").textContent = "Daily Verification Method Breakdown";
  document.getElementById("secondary-chart-title").textContent = "Check-in Status Distribution";

  const methods = {};
  logs.forEach(l => {
    let m = l.method || "GEOFENCE";
    methods[m] = (methods[m] || 0) + 1;
  });
  renderBarChart("primaryReportChart", Object.keys(methods), [{ label: "Check-ins", data: Object.values(methods), backgroundColor: "#10B981" }]);
  renderDoughnutChart("secondaryReportChart", ["Present", "Checked-Out"], [logs.filter(l => l.checkOutTime === '-').length, logs.filter(l => l.checkOutTime !== '-').length], ["#3B82F6", "#64748B"]);

  document.getElementById("table-section-title").textContent = "Student Attendance Logs";
  document.getElementById("table-records-count").textContent = `Showing ${logs.length} check-in entries`;

  document.getElementById("report-table-head").innerHTML = `
    <tr>
      <th>Student Name</th>
      <th>Roll No</th>
      <th>Department</th>
      <th>Date</th>
      <th>Check-in Time</th>
      <th>Check-out Time</th>
      <th>Verification Method</th>
      <th>Status</th>
    </tr>
  `;

  document.getElementById("report-table-body").innerHTML = logs.map(l => `
    <tr>
      <td><b>${l.studentName}</b></td>
      <td><code>${l.rollNo}</code></td>
      <td>${l.department}</td>
      <td>${l.date}</td>
      <td>${l.checkInTime}</td>
      <td>${l.checkOutTime}</td>
      <td><span class="badge-status status-issued">${l.method}</span></td>
      <td><span class="badge-status status-present">${l.status}</span></td>
    </tr>
  `).join("");
}

// ---------------------------------------------------------------------------
// 7. SEATS REPORT
// ---------------------------------------------------------------------------
function renderSeatsReport(data) {
  const kpis = data.kpis || {};
  const bookings = data.bookings || [];

  document.getElementById("kpi-cards-grid").innerHTML = `
    <div class="kpi-card blue"><div class="kpi-header"><div class="kpi-icon-box"><i class="fa-solid fa-chair"></i></div><span class="kpi-label">Total Seats</span></div><div class="kpi-value">${kpis.totalSeats || 274}</div></div>
    <div class="kpi-card green"><div class="kpi-header"><div class="kpi-icon-box"><i class="fa-solid fa-couch"></i></div><span class="kpi-label">Available Seats</span></div><div class="kpi-value">${kpis.availableSeats || 274}</div></div>
    <div class="kpi-card pink"><div class="kpi-header"><div class="kpi-icon-box"><i class="fa-solid fa-user-lock"></i></div><span class="kpi-label">Occupied Seats</span></div><div class="kpi-value">${kpis.occupiedSeats || 0}</div></div>
    <div class="kpi-card purple"><div class="kpi-header"><div class="kpi-icon-box"><i class="fa-solid fa-calendar-check"></i></div><span class="kpi-label">Total Reservations</span></div><div class="kpi-value">${kpis.totalBookings || 0}</div></div>
  `;

  document.getElementById("primary-chart-title").textContent = "Seat Occupancy Ratio";
  document.getElementById("secondary-chart-title").textContent = "Floor-Wise Reservation Count";

  renderDoughnutChart("primaryReportChart", ["Occupied", "Available"], [kpis.occupiedSeats, kpis.availableSeats], ["#EF4444", "#10B981"]);

  const floorCounts = {};
  bookings.forEach(b => {
    let f = b.floor || "Ground Floor";
    floorCounts[f] = (floorCounts[f] || 0) + 1;
  });
  renderBarChart("secondaryReportChart", Object.keys(floorCounts), [{ label: "Bookings", data: Object.values(floorCounts), backgroundColor: "#F59E0B" }]);

  document.getElementById("table-section-title").textContent = "Seat Reservation Log";
  document.getElementById("table-records-count").textContent = `Showing ${bookings.length} seat bookings`;

  document.getElementById("report-table-head").innerHTML = `
    <tr>
      <th>Seat Code</th>
      <th>Floor</th>
      <th>Student Name</th>
      <th>Roll No</th>
      <th>Booking Date</th>
      <th>Time Slot</th>
      <th>Status</th>
    </tr>
  `;

  document.getElementById("report-table-body").innerHTML = bookings.map(b => `
    <tr>
      <td><code>${b.seatCode}</code></td>
      <td>${b.floor}</td>
      <td><b>${b.studentName}</b></td>
      <td>${b.rollNo}</td>
      <td>${b.bookingDate}</td>
      <td>${b.startTime} - ${b.endTime}</td>
      <td><span class="badge-status ${b.status === 'CHECKED_IN' ? 'status-present' : 'status-reserved'}">${b.status}</span></td>
    </tr>
  `).join("");
}

// ---------------------------------------------------------------------------
// 8. NOTIFICATIONS REPORT
// ---------------------------------------------------------------------------
function renderNotificationsReport(data) {
  const kpis = data.kpis || {};
  const notifs = data.notifications || [];

  document.getElementById("kpi-cards-grid").innerHTML = `
    <div class="kpi-card blue"><div class="kpi-header"><div class="kpi-icon-box"><i class="fa-regular fa-bell"></i></div><span class="kpi-label">Total Sent</span></div><div class="kpi-value">${kpis.totalNotifications || 0}</div></div>
    <div class="kpi-card pink"><div class="kpi-header"><div class="kpi-icon-box"><i class="fa-solid fa-envelope"></i></div><span class="kpi-label">Unread Notifications</span></div><div class="kpi-value">${kpis.unreadCount || 0}</div></div>
  `;

  document.getElementById("primary-chart-title").textContent = "Notification Categories";
  document.getElementById("secondary-chart-title").textContent = "Read Status Breakdown";

  const notifTypes = {};
  notifs.forEach(n => {
    let t = n.type || "GENERAL";
    notifTypes[t] = (notifTypes[t] || 0) + 1;
  });
  renderBarChart("primaryReportChart", Object.keys(notifTypes), [{ label: "Count", data: Object.values(notifTypes), backgroundColor: "#3B82F6" }]);
  renderDoughnutChart("secondaryReportChart", ["Unread", "Read"], [kpis.unreadCount, Math.max(0, kpis.totalNotifications - kpis.unreadCount)], ["#EF4444", "#10B981"]);

  document.getElementById("table-section-title").textContent = "System Notifications Log";
  document.getElementById("table-records-count").textContent = `Showing ${notifs.length} notifications`;

  document.getElementById("report-table-head").innerHTML = `
    <tr>
      <th>Title</th>
      <th>Message</th>
      <th>Type</th>
      <th>Target Recipient</th>
      <th>Date & Time</th>
    </tr>
  `;

  document.getElementById("report-table-body").innerHTML = notifs.map(n => `
    <tr>
      <td><b>${n.title}</b></td>
      <td>${n.message}</td>
      <td><span class="badge-status status-issued">${n.type}</span></td>
      <td>${n.targetUser}</td>
      <td>${n.createdAt}</td>
    </tr>
  `).join("");
}

// ---------------------------------------------------------------------------
// Chart Rendering Utilities
// ---------------------------------------------------------------------------
function renderBarChart(canvasId, labels, datasets) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;
  if (primaryChart && canvasId === "primaryReportChart") primaryChart.destroy();

  const newChart = new Chart(ctx, {
    type: "bar",
    data: { labels: labels.length ? labels : ["No Data"], datasets: datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: "top" } },
      scales: { y: { beginAtZero: true } }
    }
  });

  if (canvasId === "primaryReportChart") primaryChart = newChart;
}

function renderHorizontalBarChart(canvasId, labels, data, color) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;
  if (primaryChart && canvasId === "primaryReportChart") primaryChart.destroy();

  const newChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: labels.length ? labels : ["No Data"],
      datasets: [{ label: "Issues", data: data, backgroundColor: color, borderRadius: 4 }]
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { x: { beginAtZero: true } }
    }
  });

  if (canvasId === "primaryReportChart") primaryChart = newChart;
}

function renderDoughnutChart(canvasId, labels, data, colors) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;
  if (secondaryChart && canvasId === "secondaryReportChart") secondaryChart.destroy();

  const newChart = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: labels,
      datasets: [{ data: data, backgroundColor: colors, borderWidth: 2, borderColor: "#FFFFFF" }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "70%",
      plugins: { legend: { position: "bottom" } }
    }
  });

  if (canvasId === "secondaryReportChart") secondaryChart = newChart;
}
