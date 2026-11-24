/* ==========================================================================
   SMART LIBRARY MANAGEMENT SYSTEM - STUDENT NOTIFICATIONS DYNAMIC SCRIPT
   ========================================================================== */

let studentNotifs = [];
let selectedCategory = "All";

function getApiBase() {
  if (window.API_BASE_URL) return window.API_BASE_URL;
  if (window.location.port === '8000') return '';
  return 'http://127.0.0.1:8000';
}

document.addEventListener("DOMContentLoaded", () => {
  fetchStudentNotifications();
  setupListeners();
});

// Fetch student notifications from backend API
async function fetchStudentNotifications() {
  const container = document.getElementById("student-notif-list");
  if (container) {
    container.innerHTML = `
      <div style="text-align: center; padding: 40px; color: #64748B; background: #FFF; border-radius: 16px; border: 1px solid #E2E8F0;">
        <i class="fa-solid fa-spinner fa-spin" style="font-size: 1.5rem; color: #3D539F; margin-bottom: 8px;"></i>
        <p style="font-weight: 600;">Loading notifications from server...</p>
      </div>
    `;
  }

  try {
    const apiBase = getApiBase();
    let studentId = "";
    try {
      const raw = localStorage.getItem("user_info") || localStorage.getItem("student_info");
      if (raw) {
        const u = JSON.parse(raw);
        if (u && (u.id || u.roll_number)) studentId = u.id || u.roll_number;
      }
    } catch (e) {}

    const url = studentId 
      ? `${apiBase}/api/student/notifications?user_id=${encodeURIComponent(studentId)}`
      : `${apiBase}/api/student/notifications`;

    const res = await fetch(url);
    if (!res.ok) throw new Error("Failed to load notifications");

    const data = await res.json();
    studentNotifs = data.notifications || [];
    
    updateSummaryCounts();
    renderStudentNotifs();

    // Mark all as read once student views notifications
    try {
      const markUrl = studentId 
        ? `${apiBase}/api/student/notifications/mark-all-read?user_id=${encodeURIComponent(studentId)}`
        : `${apiBase}/api/student/notifications/mark-all-read`;
      await fetch(markUrl, { method: "POST" });
      document.querySelectorAll(".notification-badge").forEach(badge => {
        badge.textContent = "0";
        badge.style.display = "none";
      });
    } catch (_) {}
  } catch (err) {
    console.error("Fetch student notifications error:", err);
    if (container) {
      container.innerHTML = `
        <div style="text-align: center; padding: 40px; color: #EF4444; background: #FFF; border-radius: 16px; border: 1px solid #FEF2F2;">
          <i class="fa-solid fa-circle-exclamation" style="font-size: 1.5rem; margin-bottom: 8px;"></i>
          <p style="font-weight: 600;">Could not connect to backend server.</p>
        </div>
      `;
    }
  }
}

// Update summary card & pill counts
function updateSummaryCounts() {
  let dueDateCount = 0;
  let fineCount = 0;
  let annCount = 0;

  studentNotifs.forEach(item => {
    const cat = (item.category || "").toLowerCase();
    if (cat.includes("due")) dueDateCount++;
    else if (cat.includes("fine") || cat.includes("alert")) fineCount++;
    else annCount++;
  });

  const totalCount = studentNotifs.length;

  // Update Pills
  document.querySelectorAll(".pill-btn").forEach(btn => {
    const filter = btn.getAttribute("data-filter") || "All";
    if (filter === "All") btn.innerHTML = `<i class="fa-solid fa-layer-group"></i> All (${totalCount})`;
    else if (filter === "Due Date") btn.innerHTML = `<i class="fa-regular fa-calendar-check"></i> Due Date (${dueDateCount})`;
    else if (filter === "Fines") btn.innerHTML = `<i class="fa-solid fa-indian-rupee-sign"></i> Fines (${fineCount})`;
    else if (filter === "Announcements") btn.innerHTML = `<i class="fa-solid fa-bullhorn"></i> Announcements (${annCount})`;
  });

  // Update Right Summary Box
  const sumNums = document.querySelectorAll(".sum-box-num");
  if (sumNums.length >= 4) {
    sumNums[0].textContent = dueDateCount;
    sumNums[1].textContent = fineCount;
    sumNums[2].textContent = annCount;
    sumNums[3].textContent = totalCount;
  }
}

function setupListeners() {
  // Pill Buttons
  document.querySelectorAll(".pill-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".pill-btn").forEach(p => p.classList.remove("active"));
      btn.classList.add("active");
      selectedCategory = btn.getAttribute("data-filter") || "All";
      renderStudentNotifs();
    });
  });

  // Search input
  const searchInput = document.getElementById("student-search-input");
  if (searchInput) {
    searchInput.addEventListener("input", renderStudentNotifs);
  }

  // Checkbox Quick Filters
  document.querySelectorAll(".quick-filter-cb").forEach(cb => {
    cb.addEventListener("change", renderStudentNotifs);
  });
}

function renderStudentNotifs() {
  const container = document.getElementById("student-notif-list");
  if (!container) return;

  const searchVal = (document.getElementById("student-search-input")?.value || "").toLowerCase().trim();

  // Active checkboxes
  const cbDueDate = document.getElementById("cb-duedate")?.checked ?? true;
  const cbFines = document.getElementById("cb-fines")?.checked ?? true;
  const cbAnn = document.getElementById("cb-announcements")?.checked ?? true;

  const filtered = studentNotifs.filter(item => {
    const cat = item.category || "Announcements";
    const matchesPill = selectedCategory === "All" || cat.toLowerCase() === selectedCategory.toLowerCase();
    const matchesSearch = !searchVal || item.title.toLowerCase().includes(searchVal) || item.message.toLowerCase().includes(searchVal);

    let matchesCheckbox = true;
    if (cat === "Due Date") matchesCheckbox = cbDueDate;
    if (cat === "Fines" || cat === "Alert") matchesCheckbox = cbFines;
    if (cat === "Announcements") matchesCheckbox = cbAnn;

    return matchesPill && matchesSearch && matchesCheckbox;
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 40px; color: #64748B; background: #FFF; border-radius: 16px; border: 1px solid #E2E8F0;">
        <i class="fa-regular fa-bell-slash" style="font-size: 2rem; color: #94A3B8; margin-bottom: 8px;"></i>
        <p style="font-weight: 600;">No notifications found matching your criteria</p>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(item => `
    <div class="notif-item-card" onclick="markReadAndExpand('${item.id}')" style="cursor:pointer;">
      <div class="notif-card-left">
        <div class="notif-card-icon" style="background-color: ${item.iconBg || '#EEF2FF'}; color: ${item.iconColor || '#2563EB'};">
          <i class="${item.icon || 'fa-regular fa-bell'}"></i>
        </div>
        <div class="notif-card-details">
          <h4 class="notif-card-title">${escapeHtml(item.title)}</h4>
          <p class="notif-card-msg">${escapeHtml(item.message)}</p>
          ${item.bookInfo ? `
            <div class="notif-card-book">
              <i class="fa-solid fa-book-bookmark"></i>
              <span>${escapeHtml(item.bookInfo)}</span>
            </div>
          ` : ''}
        </div>
      </div>

      <div class="notif-card-right">
        <span class="notif-card-time"><i class="fa-regular fa-clock"></i> ${escapeHtml(item.timeAgo || 'Just now')}</span>
        <span class="notif-tag-badge ${item.tagClass || 'badge-announcement-bg badge-announcement-text'}">${escapeHtml(item.category || 'Notification')}</span>
        <i class="fa-solid fa-chevron-right" style="color: #94A3B8; font-size: 0.85rem; margin-top: 4px;"></i>
      </div>
    </div>
  `).join("");
}

async function markReadAndExpand(id) {
  try {
    const apiBase = getApiBase();
    await fetch(`${apiBase}/api/student/notifications/${id}/read`, { method: "POST" });
  } catch (e) {}
}

function escapeHtml(str) {
  return String(str || "").replace(/[&<>"']/g, function(m) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m];
  });
}
