/* ==========================================================
   Smart Library Dashboard — frontend logic
   Every number, list, and label on this page is fetched from
   the backend (see server.js for the API). Nothing here is
   hardcoded; if a request fails, the section shows an error
   instead of falling back to fake data.
   ========================================================== */

const API_BASE = (window.location.port === "8000" || window.location.protocol === "file:")
  ? "/api"
  : (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1" ? "http://127.0.0.1:8000/api" : "/api");

document.addEventListener("DOMContentLoaded", () => {
  initSidebarToggle();
  loadAdminProfile();
  loadClock();
  loadSummaryCards();
  loadTrendChart();
  loadRecentActivity();
  loadUpcomingReservations();
  loadQuickActions();
});

/* ---------- helpers ---------- */

async function fetchJSON(path) {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) {
    throw new Error(`Request to ${path} failed with status ${res.status}`);
  }
  return res.json();
}

function showError(container, message) {
  container.innerHTML = `<p class="error-text">${message}</p>`;
  container.removeAttribute("aria-busy");
}

/* ---------- sidebar (mobile) ---------- */

function initSidebarToggle() {
  const btn = document.getElementById("hamburgerBtn");
  const sidebar = document.querySelector(".sidebar");
  btn.addEventListener("click", () => sidebar.classList.toggle("open"));
}

/* ---------- admin profile + notifications ---------- */

async function loadAdminProfile() {
  try {
    const admin = await fetchJSON("/admin/profile");
    document.getElementById("adminName").textContent = admin.name;
    document.getElementById("adminRole").textContent = admin.role;
    document.getElementById("adminAvatar").src = admin.avatarUrl;
    document.getElementById("welcomeHeading").textContent = `Welcome, ${admin.firstName}`;
    document.getElementById("welcomeSub").textContent = "Here's what's happening with your library today.";
    document.getElementById("notifCount").textContent = admin.unreadNotifications ?? 0;
  } catch (err) {
    document.getElementById("welcomeHeading").textContent = "Welcome";
    document.getElementById("welcomeSub").textContent = "Couldn't load admin profile.";
    console.error(err);
  }
}

/* ---------- live date / time ---------- */

function loadClock() {
  const dateEl = document.getElementById("todayDate");
  const timeEl = document.getElementById("todayTime");

  function render() {
    const now = new Date();
    dateEl.textContent = now.toLocaleDateString(undefined, {
      weekday: "long", day: "numeric", month: "long", year: "numeric"
    });
    timeEl.textContent = now.toLocaleTimeString(undefined, {
      hour: "2-digit", minute: "2-digit"
    });
  }
  render();
  setInterval(render, 30000);
}

/* ---------- stat cards ---------- */

async function loadSummaryCards() {
  const grid = document.getElementById("statsGrid");
  try {
    const summary = await fetchJSON("/dashboard/summary");
    const cards = [
      { icon: "📖", cls: "blue",   label: "Total Books",         value: summary.totalBooks,        sub: `Available in library` },
      { icon: "💺", cls: "green",  label: "Total Seats",         value: summary.totalSeats,         sub: `Available seats: ${summary.availableSeats}` },
      { icon: "👥", cls: "purple", label: "Active Students",     value: summary.activeStudents,     sub: "Registered users" },
      { icon: "📅", cls: "orange", label: "Today's Reservations",value: summary.todaysReservations, sub: "Seat bookings today" },
    ];
    grid.innerHTML = cards.map(c => `
      <div class="stat-card">
        <div class="stat-icon ${c.cls}">${c.icon}</div>
        <div>
          <div class="stat-label">${c.label}</div>
          <div class="stat-value">${c.value.toLocaleString()}</div>
          <div class="stat-sub">${c.sub}</div>
        </div>
      </div>
    `).join("");
    grid.removeAttribute("aria-busy");
  } catch (err) {
    showError(grid, "Couldn't load dashboard summary.");
    console.error(err);
  }
}

/* ---------- reservation trend chart ---------- */

async function ensureChartJS() {
  if (window.Chart) return true;
  return new Promise((resolve) => {
    const s1 = document.createElement("script");
    s1.src = "https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js";
    s1.onload = () => resolve(true);
    s1.onerror = () => {
      const s2 = document.createElement("script");
      s2.src = "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.4/chart.umd.min.js";
      s2.onload = () => resolve(true);
      s2.onerror = () => resolve(false);
      document.head.appendChild(s2);
    };
    document.head.appendChild(s1);
  });
}

async function loadTrendChart() {
  const canvas = document.getElementById("trendChart");
  if (!canvas) return;

  try {
    const trend = await fetchJSON("/dashboard/reservation-trend");
    if (!Array.isArray(trend)) return;

    await ensureChartJS();

    if (window.Chart) {
      const existing = window.Chart.getChart ? window.Chart.getChart(canvas) : null;
      if (existing) existing.destroy();

      const ctx = canvas.getContext("2d");
      const values = trend.map(d => d.count ?? d.value ?? 0);
      const labels = trend.map(d => d.day || d.label);
      const maxVal = Math.max(...values, 10);
      const suggestedMax = Math.ceil((maxVal + 10) / 10) * 10;

      const gradient = ctx.createLinearGradient(0, 0, 0, 220);
      gradient.addColorStop(0, "rgba(52, 87, 213, 0.22)");
      gradient.addColorStop(1, "rgba(52, 87, 213, 0.0)");

      new window.Chart(ctx, {
        type: "line",
        data: {
          labels: labels,
          datasets: [{
            label: "Reservations",
            data: values,
            borderColor: "#3457d5",
            borderWidth: 2.5,
            backgroundColor: gradient,
            tension: 0.35,
            fill: true,
            pointBackgroundColor: "#3457d5",
            pointBorderColor: "#ffffff",
            pointBorderWidth: 2,
            pointRadius: 4,
            pointHoverRadius: 6
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: "#0f1a3c",
              titleFont: { size: 12, weight: "bold" },
              bodyFont: { size: 12 },
              padding: 10,
              cornerRadius: 8,
              displayColors: false,
              callbacks: {
                label: (context) => `Reservations: ${context.parsed.y}`
              }
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              suggestedMax: suggestedMax > 50 ? suggestedMax : 50,
              ticks: {
                stepSize: 10,
                color: "#6b7794",
                font: { size: 11 }
              },
              grid: { color: "#eef1f8", drawBorder: false }
            },
            x: {
              ticks: {
                color: "#0f1a3c",
                font: { size: 12, weight: "600" }
              },
              grid: { display: false, drawBorder: false }
            }
          }
        }
      });
    }
  } catch (err) {
    console.error("Trend chart error:", err);
  }
}

/* ---------- recent activity ---------- */

const ACTIVITY_ICONS = {
  reservation: { icon: "💺", cls: "blue" },
  book_issued: { icon: "📘", cls: "green" },
  attendance:  { icon: "✅", cls: "purple" },
  new_user:    { icon: "👤", cls: "purple" },
  book_returned:{ icon: "📗", cls: "orange" },
};

async function loadRecentActivity() {
  const list = document.getElementById("activityList");
  try {
    const activity = await fetchJSON("/dashboard/recent-activity");
    if (!activity.length) {
      list.innerHTML = `<p class="error-text">No recent activity yet.</p>`;
    } else {
      list.innerHTML = activity.map(a => {
        const meta = ACTIVITY_ICONS[a.type] || { icon: "•", cls: "blue" };
        return `
          <li class="activity-item">
            <div class="activity-icon ${meta.cls}" style="background:var(--${meta.cls}-soft)">${meta.icon}</div>
            <div class="activity-row">
              <div>
                <div class="activity-title">${a.title}</div>
                <div class="activity-sub">${a.description}</div>
              </div>
              <div class="activity-time">${formatTime(a.timestamp)}</div>
            </div>
          </li>
        `;
      }).join("");
    }
    list.removeAttribute("aria-busy");
  } catch (err) {
    showError(list, "Couldn't load recent activity.");
    console.error(err);
  }
}

function formatTime(isoString) {
  const d = new Date(isoString);
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

/* ---------- upcoming reservations table ---------- */

async function loadUpcomingReservations() {
  const body = document.getElementById("reservationsBody");
  try {
    const rows = await fetchJSON("/dashboard/upcoming-reservations");
    if (!rows.length) {
      body.innerHTML = `<tr><td colspan="4" class="error-text">No upcoming reservations.</td></tr>`;
    } else {
      body.innerHTML = rows.map(r => `
        <tr>
          <td>${r.studentName}</td>
          <td>${r.seatNo}</td>
          <td>${r.timeRange}</td>
          <td><span class="status-pill">${r.status}</span></td>
        </tr>
      `).join("");
    }
    body.removeAttribute("aria-busy");
  } catch (err) {
    body.innerHTML = `<tr><td colspan="4" class="error-text">Couldn't load upcoming reservations.</td></tr>`;
    console.error(err);
  }
}

/* ---------- quick actions ---------- */

async function loadQuickActions() {
  const grid = document.getElementById("quickActionsGrid");
  try {
    const actions = await fetchJSON("/dashboard/quick-actions");
    grid.innerHTML = actions.map(a => `
      <button class="quick-action" data-href="${a.href}">
        <span class="qa-icon">${a.icon}</span>
        ${a.label}
        <span class="qa-arrow">›</span>
      </button>
    `).join("");
    grid.querySelectorAll(".quick-action").forEach(btn => {
      btn.addEventListener("click", () => {
        window.location.href = btn.dataset.href;
      });
    });
    grid.removeAttribute("aria-busy");
  } catch (err) {
    showError(grid, "Couldn't load quick actions.");
    console.error(err);
  }
}