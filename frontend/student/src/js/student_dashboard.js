/**
 * Smart Library — Student Dashboard JavaScript
 * Fetches dynamic data from FastAPI backend (/api/student/dashboard-summary)
 * Provides real-time synchronization, live digital clock ticker,
 * direct checkout/checkin actions, and operating hours schedule validation.
 */

let currentScheduleCache = null;

document.addEventListener("DOMContentLoaded", () => {
  initSearchHandler();
  startLiveClock();
  loadStudentDashboard();

  // Real-time synchronization loop every 2.5 seconds
  setInterval(loadStudentDashboard, 2500);
});

// API Base URL Resolver
function getBaseUrl() {
  if (typeof window.getApiBase === "function") {
    return window.getApiBase();
  }
  if (window.API_BASE_URL) return window.API_BASE_URL;
  if (window.location.port === "8000") return "";
  return "http://127.0.0.1:8000";
}

const API_ROOT = getBaseUrl();

async function fetchJSON(path) {
  const url = `${API_ROOT}${path}`;
  const token = localStorage.getItem("access_token") || sessionStorage.getItem("access_token");
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} on ${path}`);
  }
  return res.json();
}

/**
 * Live Digital Clock Ticker
 * Updates time (hh:mm:ss AM/PM) and date dynamically every second.
 * Also dynamically computes open/closed state based on library schedule.
 */
function startLiveClock() {
  function tick() {
    const now = new Date();
    const timeEl = document.getElementById("liveClockTime");
    const dateEl = document.getElementById("liveClockDate");

    if (timeEl) {
      const t12 = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true });
      const t24 = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
      timeEl.textContent = `${t12} (${t24})`;
    }

    if (dateEl) {
      dateEl.textContent = now.toLocaleDateString([], {
        weekday: "short",
        day: "numeric",
        month: "short"
      });
    }

    // Dynamic library open/closed check based on student schedule
    if (currentScheduleCache) {
      const heroStatusText = document.getElementById("heroStatusText");
      const heroStatusPill = document.getElementById("heroStatusPill");
      const currentMinutes = now.getHours() * 60 + now.getMinutes();
      const startMin = (currentScheduleCache.startHour !== undefined ? currentScheduleCache.startHour : 8) * 60 + (currentScheduleCache.startMinute || 0);
      const endMin = (currentScheduleCache.endHour !== undefined ? currentScheduleCache.endHour : 24) * 60 + (currentScheduleCache.endMinute || 0);
      const isOpen = currentMinutes >= startMin && currentMinutes < endMin;

      if (heroStatusText) {
        heroStatusText.textContent = isOpen ? "Open Now" : "Closed Now";
      }
      if (heroStatusPill) {
        heroStatusPill.className = `welcome-pill ${isOpen ? 'pill-status-open' : 'pill-status-closed'}`;
      }
    }
  }

  tick();
  setInterval(tick, 1000);
}

/**
 * Main function: Loads all dynamic dashboard data from backend
 */
async function loadStudentDashboard() {
  try {
    const data = await fetchJSON("/api/student/dashboard-summary");
    renderStudentProfile(data.student, data.geofence, data.schedule);
    renderAttendanceStatus(data.attendance, data.activeReservation);
    renderMetrics(data.stats, data.activeReservation);
    renderActiveReservation(data.activeReservation);
    renderIssuedBooks(data.issuedBooks);
    renderRecommendedBooks(data.recommendedBooks);
    renderAttendanceHistory(data.recentAttendance);
  } catch (err) {
    console.warn("[Student Dashboard] Failed to load summary from backend:", err);
    renderFallbackUI();
  }
}

/**
 * 1. Render Student Profile in Header & Hero Section
 */
function renderStudentProfile(student, geofence, schedule) {
  if (!student) return;

  currentScheduleCache = schedule;

  const headerName = document.getElementById("headerStudentName");
  const headerRole = document.getElementById("headerStudentRole");
  const heroName = document.getElementById("heroStudentName");
  const heroClass = document.getElementById("heroStudentClass");
  const heroCardNo = document.getElementById("heroCardNo");
  const heroGeofence = document.getElementById("heroGeofence");
  const heroHoursText = document.getElementById("heroHoursText");
  const heroStatusText = document.getElementById("heroStatusText");
  const heroStatusPill = document.getElementById("heroStatusPill");
  const avatarBox = document.getElementById("avatarBox");

  const studentName = student.name || "Student";
  const studentClass = student.className || "4R";
  const studentDept = student.department || "Computer Science & Engineering";
  const cardNo = student.libraryCard || student.rollNumber || student.roll || "-";

  if (headerName) headerName.textContent = studentName;
  if (headerRole) headerRole.textContent = `${studentClass} • Student`;
  if (heroName) heroName.textContent = studentName;
  if (heroClass) heroClass.textContent = `${studentClass} • ${studentDept}`;
  if (heroCardNo) heroCardNo.textContent = cardNo;

  if (heroGeofence && geofence) {
    heroGeofence.innerHTML = `<i class="fa-solid fa-location-dot"></i> ${escapeHTML(geofence.campusName || "Main Central Library")} • ${escapeHTML(geofence.status || "Geofence Active")}`;
  }

  if (schedule) {
    const genderTag = schedule.isSunday ? "" : (schedule.gender ? ` (${schedule.gender})` : "");
    if (heroHoursText) heroHoursText.textContent = `Hours: ${schedule.libraryHours}${genderTag}`;
    if (heroStatusText) heroStatusText.textContent = schedule.isOpen ? "Open Now" : "Closed Now";
    if (heroStatusPill) {
      heroStatusPill.className = `welcome-pill ${schedule.isOpen ? 'pill-status-open' : 'pill-status-closed'}`;
    }
  }

  // Initials for avatar
  if (avatarBox) {
    if (student.avatarUrl) {
      avatarBox.innerHTML = `<img src="${student.avatarUrl}" alt="Avatar">`;
    } else {
      const parts = studentName.split(" ").filter(Boolean);
      const initials = parts.length > 1 ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase() : parts[0][0].toUpperCase();
      avatarBox.textContent = initials;
    }
  }
}

/**
 * 1.5 Render Attendance Status in Hero Header
 */
function renderAttendanceStatus(attendance, activeReservation) {
  const pill = document.getElementById("heroAttendancePill");
  if (!pill) return;

  const isCheckedIn = (attendance && attendance.isCheckedIn) || (activeReservation && activeReservation.status === "CHECKED_IN");

  if (isCheckedIn) {
    const seat = (attendance && attendance.seatCode) || (activeReservation && (activeReservation.seatCode || activeReservation.seatId || activeReservation.seatLabel)) || "";
    const time = (attendance && attendance.checkInTime) || "";
    const seatText = seat ? ` • Seat ${seat}` : "";
    const timeText = time ? ` (${time})` : "";
    pill.style.display = "inline-flex";
    pill.className = "welcome-pill pill-attendance-checkedin";
    pill.innerHTML = `<i class="fa-solid fa-circle-check" style="color: #34d399;"></i> <span>Checked-In • Present${escapeHTML(seatText)}${escapeHTML(timeText)}</span>`;
  } else if (activeReservation && activeReservation.status === "RESERVED") {
    const seat = activeReservation.seatCode || activeReservation.seatId || activeReservation.seatLabel || "";
    pill.style.display = "inline-flex";
    pill.className = "welcome-pill pill-attendance-reserved";
    pill.innerHTML = `<i class="fa-solid fa-clock-rotate-left" style="color: #93c5fd;"></i> <span>Seat ${escapeHTML(seat)} Reserved • Pending Scan</span>`;
  } else {
    pill.style.display = "inline-flex";
    pill.className = "welcome-pill pill-attendance-none";
    pill.innerHTML = `<i class="fa-regular fa-circle" style="opacity: 0.7;"></i> <span>Not Checked In</span>`;
  }
}

/**
 * 2. Render Metric Summary Cards
 */
function renderMetrics(stats, activeReservation) {
  const notifBadge = document.getElementById("notifBadge");
  const seatStatus = document.getElementById("metricSeatStatus");
  const seatSub = document.getElementById("metricSeatSub");
  const booksIssued = document.getElementById("metricBooksIssued");
  const booksSub = document.getElementById("metricBooksSub");
  const availableSeats = document.getElementById("metricAvailableSeats");
  const availableSub = document.getElementById("metricAvailableSub");
  const visits = document.getElementById("metricVisits");

  if (stats) {
    if (notifBadge) {
      notifBadge.textContent = stats.unreadNotifications || 0;
      notifBadge.style.display = stats.unreadNotifications > 0 ? "flex" : "none";
    }

    if (booksIssued) booksIssued.textContent = stats.booksIssued || 0;
    if (booksSub) {
      booksSub.textContent = stats.dueSoonCount > 0 ? `⚠️ ${stats.dueSoonCount} due within 3 days` : "Active library loans";
    }

    if (availableSeats) availableSeats.textContent = stats.availableSeats !== undefined ? stats.availableSeats : "--";
    if (availableSub) availableSub.textContent = `Out of ${stats.totalSeats || 274} seats`;

    if (visits) visits.textContent = stats.totalVisits || 0;
  }

  if (seatStatus) {
    if (activeReservation) {
      const seatCode = activeReservation.seatCode || activeReservation.seatId || activeReservation.seatLabel || "Assigned";
      seatStatus.textContent = `Seat ${seatCode}`;
      if (seatSub) {
        const isCheckedIn = activeReservation.status === "CHECKED_IN";
        const color = isCheckedIn ? "#10b981" : "#3b82f6";
        const label = isCheckedIn ? "Checked In (Active)" : "Reserved (Pending)";
        seatSub.innerHTML = `<i class="fa-solid fa-circle-check" style="color: ${color};"></i> ${label}`;
      }
    } else {
      seatStatus.textContent = "No Booking";
      if (seatSub) seatSub.innerHTML = `<i class="fa-regular fa-calendar-plus"></i> Ready to reserve`;
    }
  }
}

/**
 * 3. Render Active Reservation Spotlight
 * Prominent Blue Desktop Card arrangement with RED Checkout button when checked in.
 */
function renderActiveReservation(res) {
  const container = document.getElementById("activeSpotlightSection");
  if (!container) return;

  if (!res) {
    container.className = "active-spotlight no-booking";
    container.innerHTML = `
      <div class="spotlight-header">
        <div class="spotlight-title">
          <i class="fa-solid fa-chair" style="color: #2563eb;"></i>
          <span>Study Desk & Attendance Session</span>
        </div>
        <span class="status-tag none">
          <i class="fa-regular fa-circle"></i> Ready to Reserve
        </span>
      </div>
      <div class="spotlight-grid" style="grid-template-columns: 1fr auto;">
        <div>
          <p style="font-size: 14px; color: #334155; margin-bottom: 4px; font-weight: 500;">
            You do not have an active seat reserved right now. Ground and 1st floor reading halls are ready for booking.
          </p>
          <span style="font-size: 12px; color: #64748b;">
            <i class="fa-solid fa-circle-check" style="color: #10b981; margin-right: 4px;"></i> Reserve your desk or punch attendance when you arrive at the library.
          </span>
        </div>
        <div class="spotlight-actions">
          <a href="book-seat.html" class="btn-spotlight btn-spotlight-primary">
            <i class="fa-solid fa-chair"></i> Book a Seat Now
          </a>
          <a href="check-in.html" class="btn-spotlight btn-spotlight-outline">
            <i class="fa-regular fa-calendar-check"></i> Library Check-In
          </a>
        </div>
      </div>
    `;
    return;
  }

  const isCheckedIn = res.status === "CHECKED_IN";
  const seatCode = res.seatCode || res.seatId || res.seatLabel || "Assigned Seat";
  const floorName = res.floorName || res.floor || "Ground Floor";
  const slotTime = res.timeSlot || (res.startTime ? `${res.startTime.split('T')[1]?.substring(0,5)} - ${res.endTime?.split('T')[1]?.substring(0,5)}` : "Current Session");

  if (isCheckedIn) {
    container.className = "active-spotlight checked-in";
    container.innerHTML = `
      <div class="spotlight-header">
        <div class="spotlight-title">
          <i class="fa-solid fa-calendar-check" style="color: #10b981;"></i>
          <span>Active Study Session & Seat Occupancy</span>
        </div>
        <span class="status-tag active">
          <i class="fa-solid fa-circle live-pulse" style="font-size: 8px;"></i>
          <span>Checked-in • Session Active</span>
        </span>
      </div>

      <div class="spotlight-grid">
        <div class="spotlight-item">
          <div class="item-label"><i class="fa-solid fa-chair"></i> Allocated Desk</div>
          <div class="item-val highlight-seat">Seat ${escapeHTML(seatCode)}</div>
        </div>
        <div class="spotlight-item">
          <div class="item-label"><i class="fa-solid fa-layer-group"></i> Reading Hall</div>
          <div class="item-val">${escapeHTML(floorName)}</div>
        </div>
        <div class="spotlight-item">
          <div class="item-label"><i class="fa-regular fa-clock"></i> Active Time Slot</div>
          <div class="item-val">${escapeHTML(slotTime)}</div>
        </div>
        <div class="spotlight-item">
          <div class="item-label"><i class="fa-solid fa-satellite-dish"></i> Attendance Status</div>
          <div class="item-val status-verified">✅ Verified & In-Use</div>
        </div>
        <div class="spotlight-actions">
          <!-- Check-out button (Red theme as requested) -->
          <button type="button" class="btn-spotlight btn-spotlight-checkout" onclick="performDashboardCheckOut('${escapeHTML(res.id)}', '${escapeHTML(seatCode)}')">
            <i class="fa-solid fa-arrow-right-from-bracket"></i> Check-Out Seat
          </button>
          <a href="check-in.html" class="btn-spotlight btn-spotlight-outline">
            <i class="fa-solid fa-location-crosshairs"></i> View GPS Radar
          </a>
        </div>
      </div>
    `;
  } else {
    // RESERVED (Pending check-in)
    container.className = "active-spotlight reserved";
    container.innerHTML = `
      <div class="spotlight-header">
        <div class="spotlight-title">
          <i class="fa-solid fa-calendar-check" style="color: #2563eb;"></i>
          <span>Upcoming Seat Reservation</span>
        </div>
        <span class="status-tag reserved">
          <i class="fa-solid fa-clock-rotate-left live-pulse"></i>
          <span>Reserved • Awaiting Check-In</span>
        </span>
      </div>

      <div class="spotlight-grid">
        <div class="spotlight-item">
          <div class="item-label"><i class="fa-solid fa-chair"></i> Reserved Desk</div>
          <div class="item-val highlight-seat">Seat ${escapeHTML(seatCode)}</div>
        </div>
        <div class="spotlight-item">
          <div class="item-label"><i class="fa-solid fa-layer-group"></i> Reading Hall</div>
          <div class="item-val">${escapeHTML(floorName)}</div>
        </div>
        <div class="spotlight-item">
          <div class="item-label"><i class="fa-regular fa-clock"></i> Booked Slot</div>
          <div class="item-val">${escapeHTML(slotTime)}</div>
        </div>
        <div class="spotlight-item">
          <div class="item-label"><i class="fa-solid fa-hourglass-half"></i> Check-in Status</div>
          <div class="item-val status-pending">⏳ Punch Required</div>
        </div>
        <div class="spotlight-actions">
          <!-- Check-in button -->
          <a href="check-in.html" class="btn-spotlight btn-spotlight-primary">
            <i class="fa-solid fa-location-dot"></i> Punch Check-In Now
          </a>
          <a href="confirm-booking.html" class="btn-spotlight btn-spotlight-outline">
            <i class="fa-solid fa-ticket"></i> View Pass
          </a>
        </div>
      </div>
    `;
  }
}

/**
 * Direct check-out handler right from the dashboard spotlight card
 */
window.performDashboardCheckOut = async function(reservationId, seatCode) {
  if (!confirm(`Are you sure you want to check out from Seat ${seatCode || ''}? This will record your checkout time and release the seat for other students.`)) {
    return;
  }

  try {
    const res = await fetch(`${API_ROOT}/api/student/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reservationId })
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.detail || "Checkout failed");
    }

    alert(`Successfully checked out from Seat ${seatCode || ''}! Seat is now released.`);
    await loadStudentDashboard();
  } catch (err) {
    alert(err.message || "Failed to check out. Please try again from Attendance page.");
  }
};

/**
 * 4. Render Borrowed Books
 */
function renderIssuedBooks(books) {
  const container = document.getElementById("issuedBooksContainer");
  if (!container) return;

  if (!books || books.length === 0) {
    container.innerHTML = `
      <div style="padding: 20px; text-align: center; color: var(--text-muted); background: #f8fafc; border-radius: var(--radius-md); border: 1px dashed var(--border);">
        <i class="fa-solid fa-book-open" style="font-size: 24px; color: var(--text-light); margin-bottom: 8px;"></i>
        <p style="font-size: 13.5px; font-weight: 600;">No books currently issued.</p>
        <p style="font-size: 12px; color: var(--text-light);">Visit the library desk or search catalog to borrow.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = books.map(b => {
    const isDueSoon = b.isDueSoon;
    const badgeClass = isDueSoon ? "due-badge due-soon" : "due-badge";
    const statusText = isDueSoon ? "Due Soon" : "Active Loan";

    return `
      <div class="book-item">
        <div class="book-info">
          <div class="book-icon">
            <i class="fa-solid fa-book"></i>
          </div>
          <div>
            <div class="book-title">${escapeHTML(b.title)}</div>
            <div class="book-author">${escapeHTML(b.author)} • <span style="color: var(--text-light);">Due: ${escapeHTML(b.dueDate)}</span></div>
          </div>
        </div>
        <div class="book-due">
          <span class="${badgeClass}">${escapeHTML(statusText)}</span>
          <div class="due-date">${escapeHTML(b.dueDate)}</div>
        </div>
      </div>
    `;
  }).join("");
}

/**
 * 5. Render Recommended Books from Database Catalog
 */
function renderRecommendedBooks(books) {
  const container = document.getElementById("recBooksGrid");
  if (!container) return;

  if (!books || books.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; padding: 16px; text-align: center; color: var(--text-muted); font-size: 13px;">
        No recommendations available right now.
      </div>
    `;
    return;
  }

  container.innerHTML = books.map(b => `
    <div class="rec-book-card">
      <div class="rec-book-icon">
        <i class="fa-solid fa-book"></i>
      </div>
      <div class="rec-book-details">
        <div class="rec-book-title" title="${escapeHTML(b.title)}">${escapeHTML(b.title)}</div>
        <div class="rec-book-meta">${escapeHTML(b.author)}</div>
        <div class="rec-book-copies"><i class="fa-solid fa-check"></i> ${b.availableCopies || 0} Available (${escapeHTML(b.shelf || "General")})</div>
      </div>
    </div>
  `).join("");
}

/**
 * 6. Render Attendance History
 */
function renderAttendanceHistory(logs) {
  const container = document.getElementById("attendanceLogsList");
  if (!container) return;

  if (!logs || logs.length === 0) {
    container.innerHTML = `
      <div style="padding: 16px; text-align: center; color: var(--text-muted); font-size: 13px;">
        No recent attendance check-in records found.
      </div>
    `;
    return;
  }

  container.innerHTML = logs.map(att => `
    <div class="att-item">
      <div class="att-left">
        <div class="att-check-icon">
          <i class="fa-solid fa-check"></i>
        </div>
        <div>
          <div class="att-date">${escapeHTML(att.date)}</div>
          <div class="att-method"><i class="fa-solid fa-location-crosshairs"></i> ${escapeHTML(att.method || "GEOFENCE")} Verification</div>
        </div>
      </div>
      <div class="att-time">${escapeHTML(att.checkInTime)}</div>
    </div>
  `).join("");
}

/**
 * Global Search Bar Handler (Hit enter to search books)
 */
function initSearchHandler() {
  const searchInput = document.getElementById("globalBookSearch");
  if (!searchInput) return;

  searchInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      const q = searchInput.value.trim();
      if (q) {
        window.location.href = `search-book.html?query=${encodeURIComponent(q)}`;
      } else {
        window.location.href = "search-book.html";
      }
    }
  });
}

function escapeHTML(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderFallbackUI() {
  let storedUser = null;
  try {
    const rawUser = localStorage.getItem("user_info") || sessionStorage.getItem("user_info");
    storedUser = rawUser ? JSON.parse(rawUser) : null;
  } catch (_) {}

  const studentName = storedUser?.name || storedUser?.full_name || storedUser?.student_name || "Student";
  const headerName = document.getElementById("headerStudentName");
  if (headerName) headerName.textContent = studentName;
  const heroName = document.getElementById("heroStudentName");
  if (heroName) heroName.textContent = studentName;
}