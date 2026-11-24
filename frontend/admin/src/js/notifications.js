/* ==========================================================================
   SMART LIBRARY MANAGEMENT SYSTEM - ADMIN NOTIFICATIONS DYNAMIC SCRIPT
   ========================================================================== */

let notificationsData = [];
let activeFilterPill = "All";

function getApiBase() {
  if (window.API_BASE_URL) return window.API_BASE_URL;
  if (window.location.port === '8000') return '';
  return 'http://127.0.0.1:8000';
}

document.addEventListener("DOMContentLoaded", () => {
  fetchAdminNotifications();
  setupEventListeners();
});

// Fetch notifications from Backend FastAPI / PostgreSQL DB
async function fetchAdminNotifications() {
  const tbody = document.getElementById("notifications-table-body");
  if (tbody) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:30px; color:#64748B;">Loading notifications from database...</td></tr>`;
  }

  try {
    const apiBase = getApiBase();
    const response = await fetch(`${apiBase}/api/admin/notifications`);
    if (!response.ok) throw new Error("Failed to fetch notifications");

    const data = await response.json();
    notificationsData = data.notifications || [];
    renderNotificationsTable();

    // When admin views the notifications, automatically mark them as seen and remove badge
    try {
      await fetch(`${apiBase}/api/admin/notifications/mark-all-read`, { method: 'POST' });
      document.querySelectorAll('.admin-header-badge, .notification-badge').forEach(badge => {
        badge.textContent = '';
        badge.style.display = 'none';
      });
    } catch (_) {}
  } catch (err) {
    console.error("Error fetching admin notifications:", err);
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:30px; color:#EF4444;">Failed to connect to backend server.</td></tr>`;
    }
  }
}

// View Switching
function switchView(viewId) {
  document.querySelectorAll(".view-section").forEach(v => v.classList.remove("active-view"));
  const target = document.getElementById(viewId);
  if (target) target.classList.add("active-view");

  const backBtn = document.getElementById("header-back-btn");
  const title = document.getElementById("page-header-title");
  const subtitle = document.getElementById("page-header-subtitle");

  if (viewId === "view-list") {
    if (backBtn) backBtn.style.display = "none";
    if (title) title.textContent = "Notifications & Announcements";
    if (subtitle) subtitle.textContent = "Send announcements, manage notifications and keep your library community informed.";
    fetchAdminNotifications();
  } else if (viewId === "view-create") {
    if (backBtn) backBtn.style.display = "flex";
    if (title) title.textContent = "New Announcement";
    if (subtitle) subtitle.textContent = "Create and send announcements to all or selected students.";
    resetCreateForm();
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Setup Event Listeners
function setupEventListeners() {
  const backBtn = document.getElementById("header-back-btn");
  if (backBtn) backBtn.addEventListener("click", () => switchView("view-list"));

  // Live preview text updates
  const titleInput = document.getElementById("create-ann-title");
  const msgInput = document.getElementById("create-ann-msg");

  if (titleInput) {
    titleInput.addEventListener("input", (e) => {
      const prevTitle = document.getElementById("preview-title");
      if (prevTitle) prevTitle.textContent = e.target.value || "Library Announcement";
    });
  }

  if (msgInput) {
    msgInput.addEventListener("input", (e) => {
      const prevMsg = document.getElementById("preview-msg");
      const counter = document.getElementById("editor-char-counter");
      if (prevMsg) prevMsg.textContent = e.target.value || "Write your message here...";
      if (counter) counter.textContent = `${e.target.value.length}/1000`;
    });
  }

  // Filter pills selection
  document.querySelectorAll(".pill-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".pill-btn").forEach(p => p.classList.remove("active"));
      btn.classList.add("active");
      activeFilterPill = btn.getAttribute("data-filter") || "All";
      renderNotificationsTable();
    });
  });

  // Audience Card Selection
  document.querySelectorAll(".audience-card").forEach(card => {
    card.addEventListener("click", () => {
      document.querySelectorAll(".audience-card").forEach(c => c.classList.remove("selected"));
      card.classList.add("selected");
      const prevAud = document.getElementById("preview-audience");
      if (prevAud) prevAud.textContent = card.getAttribute("data-audience-label") || "All Students";
    });
  });
}

// Render Notifications Table
function renderNotificationsTable() {
  const tbody = document.getElementById("notifications-table-body");
  if (!tbody) return;

  const searchVal = (document.getElementById("notif-search-input")?.value || "").toLowerCase().trim();
  const typeVal = document.getElementById("notif-type-filter")?.value || "All";
  const audienceVal = document.getElementById("notif-aud-filter")?.value || "All";

  const filtered = notificationsData.filter(item => {
    const itemType = (item.type || "").toLowerCase();
    const pillType = activeFilterPill.toLowerCase();
    const matchesPill = activeFilterPill === "All" || itemType.includes(pillType);
    const matchesSearch = !searchVal || (item.title || "").toLowerCase().includes(searchVal) || (item.message || "").toLowerCase().includes(searchVal);
    const matchesType = typeVal === "All" || item.type === typeVal;
    const matchesAudience = audienceVal === "All" || item.audience === audienceVal;

    return matchesPill && matchesSearch && matchesType && matchesAudience;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:30px; color:#64748B;">No notifications found matching your search.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(item => {
    let typeBadgeClass = "badge-announcement";
    let iconClass = "fa-bullhorn";
    const ntype = (item.type || "").toUpperCase();
    if (ntype.includes("NOTIF") || ntype.includes("GENERAL")) {
      typeBadgeClass = "badge-notification";
      iconClass = "fa-bell";
    } else if (ntype.includes("ALERT") || ntype.includes("FINE") || ntype.includes("CANCEL")) {
      typeBadgeClass = "badge-alert";
      iconClass = "fa-circle-exclamation";
    }

    return `
      <tr>
        <td><input type="checkbox" /></td>
        <td>
          <span class="type-badge ${typeBadgeClass}">
            <i class="fa-solid ${iconClass}"></i> ${escapeHtml(item.type || 'Announcement')}
          </span>
        </td>
        <td style="font-weight: 700; color: #0F172A;">${escapeHtml(item.title)}</td>
        <td style="color: #64748B; max-width: 280px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
          ${escapeHtml(item.message)}
        </td>
        <td><span class="audience-pill">${escapeHtml(item.audience || 'All Students')}</span></td>
        <td style="font-size: 0.8rem; color: #64748B;">${escapeHtml(item.dateTime || item.date || '-')}</td>
        <td><span class="status-badge-published">${escapeHtml(item.status || 'Published')}</span></td>
        <td>
          <div class="action-group">
            <button class="action-btn action-view" title="View Details" onclick="viewNotificationDetails('${item.id}')"><i class="fa-solid fa-eye"></i></button>
            <button class="action-btn action-delete" title="Delete" onclick="deleteNotification('${item.id}')"><i class="fa-solid fa-trash-can"></i></button>
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

// Create Announcement Form Submission to Backend API
async function saveAnnouncement(event) {
  event.preventDefault();
  const title = document.getElementById("create-ann-title")?.value.trim();
  const message = document.getElementById("create-ann-msg")?.value.trim();
  const selectedAudience = document.querySelector(".audience-card.selected")?.getAttribute("data-audience-label") || "All Students";

  if (!title || !message) {
    showToast("Please enter title and message!", "danger");
    return;
  }

  const submitBtn = event.target.querySelector("button[type='submit']");
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Sending...`;
  }

  try {
    const apiBase = getApiBase();
    const res = await fetch(`${apiBase}/api/admin/notifications`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title,
        message: message,
        type: "Announcement",
        audience: selectedAudience
      })
    });

    if (!res.ok) throw new Error("Failed to post announcement");

    const data = await res.json();
    showToast("Announcement published successfully to database!", "success");
    switchView("view-list");
  } catch (err) {
    console.error("Save announcement error:", err);
    showToast("Could not save announcement to server.", "danger");
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = `<i class="fa-solid fa-paper-plane"></i> Send Announcement`;
    }
  }
}

// Delete Notification from Backend API
async function deleteNotification(id) {
  if (!confirm("Are you sure you want to delete this announcement/notification?")) return;

  try {
    const apiBase = getApiBase();
    const res = await fetch(`${apiBase}/api/admin/notifications/${id}`, {
      method: "DELETE"
    });

    if (!res.ok) throw new Error("Failed to delete notification");

    notificationsData = notificationsData.filter(item => String(item.id) !== String(id));
    renderNotificationsTable();
    showToast("Notification deleted from database.", "success");
  } catch (err) {
    console.error("Delete notification error:", err);
    showToast("Failed to delete notification from backend.", "danger");
  }
}

function viewNotificationDetails(id) {
  const notif = notificationsData.find(n => String(n.id) === String(id));
  if (notif) {
    alert(`📢 ${notif.title}\n\n${notif.message}\n\nAudience: ${notif.audience}\nDate: ${notif.dateTime}`);
  }
}

// Reset Form
function resetCreateForm() {
  const form = document.getElementById("create-ann-form");
  if (form) form.reset();
  const prevTitle = document.getElementById("preview-title");
  const prevMsg = document.getElementById("preview-msg");
  if (prevTitle) prevTitle.textContent = "Library Announcement";
  if (prevMsg) prevMsg.textContent = "The library will be open from 8:00 AM to 6:00 PM (Monday to Friday)...";
}

// Toast System
function showToast(message, type = "success") {
  let container = document.querySelector(".toast-container");
  if (!container) {
    container = document.createElement("div");
    container.className = "toast-container";
    container.style.cssText = "position: fixed; bottom: 24px; right: 24px; z-index: 200; display: flex; flex-direction: column; gap: 10px;";
    document.body.appendChild(container);
  }

  const toast = document.createElement("div");
  toast.style.cssText = `display: flex; align-items: center; gap: 12px; padding: 12px 20px; background-color: #0F172A; color: #FFF; border-radius: 12px; box-shadow: 0 10px 15px rgba(0,0,0,0.15); font-size: 0.875rem; font-weight: 600; border-left: 4px solid ${type === 'success' ? '#16A34A' : '#EF4444'};`;
  toast.innerHTML = `<i class="fa-solid ${type === 'success' ? 'fa-circle-check' : 'fa-triangle-exclamation'}"></i><span>${escapeHtml(message)}</span>`;

  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transition = "opacity 0.3s ease";
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function escapeHtml(str) {
  return String(str || "").replace(/[&<>"']/g, function(m) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m];
  });
}

/* ==========================================================================
   AI AGENT AUTOMATION & DEMO TESTING HANDLERS
   ========================================================================== */

function onCallModeChanged() {
  const modeSelect = document.getElementById("demo-call-mode");
  const badge = document.getElementById("call-mode-badge");
  if (!modeSelect || !badge) return;

  if (modeSelect.value === "live") {
    badge.textContent = "Live Call Mode (Uses Vobiz Credits)";
    badge.style.background = "#DCFCE7";
    badge.style.color = "#15803D";
  } else {
    badge.textContent = "Simulation Mode (₹0 Credits)";
    badge.style.background = "#FEF3C7";
    badge.style.color = "#B45309";
  }
}

async function triggerOverdueDbScan() {
  const btn = document.getElementById("btn-scan-overdue");
  const originalHtml = btn ? btn.innerHTML : "";
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Scanning DB...`;
  }

  try {
    const apiBase = getApiBase();
    const res = await fetch(`${apiBase}/api/admin/notifications/trigger-overdue-check?force=true`, {
      method: "POST"
    });
    const data = await res.json();
    if (res.ok) {
      const overdueCount = data.overdueNotificationsSent ?? data.overdue_books_found ?? 0;
      const finesCount = data.finesUpdated ?? 0;
      showToast(`Scan Complete! Fines Updated: ${finesCount}, Overdue Notices Sent: ${overdueCount}`, "success");
      fetchAdminNotifications();
    } else {
      showToast(data.detail || "Failed to scan overdue books", "danger");
    }
  } catch (err) {
    console.error("Overdue scan error:", err);
    showToast("Network error during overdue database scan.", "danger");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalHtml;
    }
  }
}

async function triggerSeatExpiryScan() {
  const btn = document.getElementById("btn-scan-seat");
  const originalHtml = btn ? btn.innerHTML : "";
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Checking Seats...`;
  }

  try {
    const apiBase = getApiBase();
    const res = await fetch(`${apiBase}/api/admin/notifications/trigger-seat-expiry-check`, {
      method: "POST"
    });
    const data = await res.json();
    if (res.ok) {
      const expiredCount = data.expiredCount ?? data.expired_seats_count ?? 0;
      showToast(`Seat Expiry Check: ${expiredCount} unclaimed seat(s) released!`, "success");
      fetchAdminNotifications();
    } else {
      showToast(data.detail || "Failed to check expired seats", "danger");
    }
  } catch (err) {
    console.error("Seat expiry scan error:", err);
    showToast("Network error checking seat expiration.", "danger");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalHtml;
    }
  }
}

async function sendDemoAiEmail(event) {
  if (event) event.preventDefault();
  const btn = document.getElementById("btn-send-demo-email");
  const toEmail = document.getElementById("demo-email-to")?.value?.trim();
  const studentName = document.getElementById("demo-email-name")?.value?.trim() || "Student";
  const emailType = document.getElementById("demo-email-type")?.value || "overdue";

  if (!toEmail) {
    showToast("Please enter an email address.", "danger");
    return;
  }

  const originalHtml = btn ? btn.innerHTML : "";
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Dispatching AI Email...`;
  }

  try {
    const apiBase = getApiBase();
    const res = await fetch(`${apiBase}/api/admin/notifications/test-ai-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient_email: toEmail,
        student_name: studentName,
        email_type: emailType,
        book_title: "Clean Code: A Handbook of Agile Software Craftsmanship",
        days_overdue: 4,
        fine_amount: 100.0,
        seat_code: "FL-01",
        floor_name: "1st Floor - Study Hall"
      })
    });
    const data = await res.json();
    if (res.ok && data.sent) {
      showToast(`AI Email sent successfully to ${toEmail}! Check your inbox.`, "success");
    } else {
      showToast(data.message || data.detail || "Email could not be delivered.", "danger");
    }
  } catch (err) {
    console.error("AI email demo error:", err);
    showToast("Network error while sending demo email.", "danger");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalHtml;
    }
  }
}

async function triggerDemoVoiceCall(event) {
  if (event) event.preventDefault();
  const btn = document.getElementById("btn-trigger-demo-call");
  const phone = document.getElementById("demo-call-phone")?.value?.trim();
  const studentName = document.getElementById("demo-call-name")?.value?.trim() || "Student";
  const callType = document.getElementById("demo-call-type")?.value || "overdue";
  const mode = document.getElementById("demo-call-mode")?.value || "simulation";

  if (!phone) {
    showToast("Please enter a destination phone number.", "danger");
    return;
  }

  const originalHtml = btn ? btn.innerHTML : "";
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Processing Call...`;
  }

  try {
    const apiBase = getApiBase();
    const res = await fetch(`${apiBase}/api/voice/trigger-call`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone_number: phone,
        student_name: studentName,
        call_type: callType,
        book_title: "Clean Code",
        days_overdue: 4,
        fine_amount: 100.0,
        seat_code: "FL-01",
        floor_name: "1st Floor - Study Hall",
        slot_time: "11:00 AM",
        mode: mode
      })
    });
    const data = await res.json();

    if (res.ok) {
      const scriptText = data.spoken_script || data.simulated_script || "(Script generated)";
      if (mode === "simulation") {
        showToast("Voice Simulation Complete (₹0 spent)!", "success");
        alert(
          "🎙️ [VOICE CALL SIMULATION - ₹0 CREDITS]\n\n" +
          "📞 To Phone: " + phone + "\n" +
          "👤 Student: " + studentName + "\n" +
          "📋 Call Type: " + (callType === 'overdue' ? 'Overdue Book & Fine Notice' : '15-Min Seat Cancelled Notice') + "\n\n" +
          "📜 Spoken Script (Indian English):\n" +
          "\"" + scriptText + "\"\n\n" +
          "✅ Result: " + (data.message || "Simulation logged successfully.")
        );
      } else {
        if (data.success || data.status === "initiated") {
          showToast(`Live Call placed! Phone ${phone} will ring shortly.`, "success");
          alert(
            "📞 [REAL VOBIZ VOICE CALL PLACED]\n\n" +
            "Destination: " + phone + "\n" +
            "Student: " + studentName + "\n" +
            "Vobiz Request ID: " + (data.call_uuid || "Active") + "\n\n" +
            "Your phone should ring within 5 to 10 seconds. When answered, the Indian English AI Voice will speak:\n\n" +
            "\"" + scriptText + "\""
          );
        } else {
          showToast(data.message || data.error || "Failed to trigger live call.", "danger");
        }
      }
    } else {
      showToast(data.detail || "Failed to trigger voice call.", "danger");
    }
  } catch (err) {
    console.error("Voice call demo error:", err);
    showToast("Network error while triggering voice call.", "danger");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalHtml;
    }
  }
}

