let currentScheduleFilter = null;

document.addEventListener('DOMContentLoaded', async () => {
  await loadSidebar();
  startLiveClock();
  fetchDashboardData();
  // Real-time polling every 2.5 seconds
  setInterval(fetchDashboardData, 2500);
  bindLogout();
});

function startLiveClock() {
  const clockEl = document.getElementById('live-clock-time') || document.getElementById('live-clock');
  function update() {
    if (!clockEl) return;
    const now = new Date();
    clockEl.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
  update();
  setInterval(update, 1000);
}

async function loadSidebar() {
  try {
    const res = await fetch('sidebar.html');
    if (!res.ok) throw new Error('Could not load sidebar.html');
    const html = await res.text();
    document.getElementById('sidebar-placeholder').innerHTML = html;
  } catch (err) {
    console.error('Sidebar navigation load failed:', err);
  }
}

function bindLogout() {
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('#logout-btn, #mobile-logout-btn');
    if (!btn) return;

    e.preventDefault();
    if (!confirm('Are you sure you want to log out?')) return;

    localStorage.removeItem('access_token');
    localStorage.removeItem('user_info');
    localStorage.removeItem('student_info');
    document.cookie = 'access_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT;';
    document.cookie = 'cetguru_access_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT;';
    window.location.href = '../login.html';
  });
}

function setSchedulePreview(type) {
  currentScheduleFilter = type;

  // Update switcher button highlights
  const btnFemale = document.getElementById('btn-sched-female');
  const btnMale = document.getElementById('btn-sched-male');
  const btnSunday = document.getElementById('btn-sched-sunday');

  if (btnFemale) btnFemale.classList.toggle('active', type === 'Female');
  if (btnMale) btnMale.classList.toggle('active', type === 'Male');
  if (btnSunday) btnSunday.classList.toggle('active', type === 'Sunday');

  // If user selected Male or Female, optionally persist in user profile
  if (type === 'Male' || type === 'Female') {
    try {
      const apiBase = typeof getApiBase === 'function' ? getApiBase() : '';
      fetch(`${apiBase}/api/student/set-gender`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gender: type })
      }).catch(() => {});
    } catch (_) {}
  }

  fetchDashboardData();
}

// Make setSchedulePreview globally accessible for onclick handlers
window.setSchedulePreview = setSchedulePreview;

async function fetchDashboardData() {
  try {
    const apiBase = typeof getApiBase === 'function' ? getApiBase() : '';
    let query = '';
    if (currentScheduleFilter === 'Male') {
      query = '?gender=Male';
    } else if (currentScheduleFilter === 'Female') {
      query = '?gender=Female';
    } else if (currentScheduleFilter === 'Sunday') {
      query = '?day=Sunday';
    }

    const res = await fetch(`${apiBase}/api/student/seat-dashboard${query}`);
    if (!res.ok) return;
    const data = await res.json();
    populateUI(data);
  } catch (err) {
    console.error('Seat dashboard sync failed:', err);
  }
}

function populateUI(data) {
  if (!data) return;

  let currentUser = data.user;
  const rawLocalUser = localStorage.getItem('user_info') || localStorage.getItem('student_info');
  if (rawLocalUser) {
    try {
      const localUser = JSON.parse(rawLocalUser);
      if (localUser && localUser.name) {
        currentUser = { ...currentUser, ...localUser };
      }
    } catch (e) {}
  }

  // 1. User Profile Details
  if (currentUser) {
    const nameEl = document.getElementById('student-name');
    const greetingEl = document.getElementById('greeting-name');
    const roleEl = document.getElementById('student-role');
    const avatarImg = document.getElementById('student-avatar');
    const avatarFallback = document.getElementById('avatar-fallback');

    const nameStr = currentUser.name || currentUser.full_name || 'Student';
    if (nameEl) nameEl.textContent = nameStr;
    if (greetingEl) greetingEl.textContent = nameStr;
    if (roleEl) roleEl.textContent = currentUser.class_name || currentUser.role || 'Library Member';

    if ((currentUser.avatarUrl || currentUser.avatar_url) && avatarImg) {
      avatarImg.src = currentUser.avatarUrl || currentUser.avatar_url;
      avatarImg.style.display = 'block';
      if (avatarFallback) avatarFallback.style.display = 'none';
    } else if (avatarFallback) {
      const parts = nameStr.trim().split(/\s+/);
      const initials = parts.length > 1 ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase() : nameStr.slice(0, 2).toUpperCase();
      avatarFallback.textContent = initials;
    }

    if (window.populateStudentHeaderInfo) {
      window.populateStudentHeaderInfo(currentUser);
    }

    // Default switcher active button based on user profile if not manually selected
    if (!currentScheduleFilter && currentUser.gender) {
      const isMale = currentUser.gender.toLowerCase() === 'male';
      const btnFemale = document.getElementById('btn-sched-female');
      const btnMale = document.getElementById('btn-sched-male');
      if (btnFemale && btnMale) {
        btnFemale.classList.toggle('active', !isMale);
        btnMale.classList.toggle('active', isMale);
      }
    }
  }

  // 2. Notification Badge
  const badge = document.getElementById('notif-badge');
  if (badge) {
    if (data.notificationsCount > 0) {
      badge.textContent = data.notificationsCount;
      badge.style.display = 'flex';
    } else {
      badge.style.display = 'none';
    }
  }

  // 3. Real-Time Metric Cards
  if (data.today) {
    const todayEl = document.getElementById('metric-today');
    if (todayEl) todayEl.textContent = data.today;
  }

  // Library Operational Hours & Rules
  if (data.libraryHours) {
    const hoursEl = document.getElementById('metric-hours');
    if (hoursEl) hoursEl.textContent = data.libraryHours;
  }

  // Gender / Group Tag Pill
  const genderTagEl = document.getElementById('metric-gender-tag');
  if (genderTagEl) {
    if (data.isSunday) {
      genderTagEl.textContent = 'Sunday (All)';
      genderTagEl.className = 'gender-tag-pill tag-sunday';
    } else if (data.effectiveGender === 'Male') {
      genderTagEl.textContent = 'Male';
      genderTagEl.className = 'gender-tag-pill tag-male';
    } else {
      genderTagEl.textContent = 'Female';
      genderTagEl.className = 'gender-tag-pill';
    }
  }

  // Open / Closed Status Badge
  const libStatusBadge = document.getElementById('library-status-badge');
  if (libStatusBadge) {
    if (data.isOpen) {
      libStatusBadge.innerHTML = '<i class="fa-solid fa-circle status-dot"></i> Open Now';
      libStatusBadge.className = 'open-badge';
    } else {
      libStatusBadge.innerHTML = '<i class="fa-solid fa-circle status-dot"></i> Closed Now';
      libStatusBadge.className = 'closed-badge';
    }
  }

  // Schedule Rule Description Note
  const ruleNoteEl = document.getElementById('metric-schedule-rule');
  if (ruleNoteEl) {
    ruleNoteEl.textContent = data.scheduleRule || '';
  }

  // Highlight active timing rule in the top schedule banner
  const badgeMale = document.getElementById('rule-badge-male');
  const badgeFemale = document.getElementById('rule-badge-female');
  const badgeSunday = document.getElementById('rule-badge-sunday');

  if (badgeMale && badgeFemale && badgeSunday) {
    badgeMale.classList.remove('active-rule');
    badgeFemale.classList.remove('active-rule');
    badgeSunday.classList.remove('active-rule');

    if (data.isSunday) {
      badgeSunday.classList.add('active-rule');
    } else if (data.effectiveGender === 'Male') {
      badgeMale.classList.add('active-rule');
    } else {
      badgeFemale.classList.add('active-rule');
    }
  }

  if (data.availableSeats !== undefined) {
    const seatsEl = document.getElementById('metric-seats');
    if (seatsEl) seatsEl.textContent = `${data.availableSeats}`;

    const totalSeatsEl = document.getElementById('metric-total-seats');
    if (totalSeatsEl && data.totalSeats) {
      totalSeatsEl.textContent = `${data.availableSeats} of ${data.totalSeats} seats`;
    }
  }

  // 4. Active Reservation Live Banner
  const activeContainer = document.getElementById('active-booking-container');
  const activeCard = document.getElementById('active-session-card');
  const activePill = document.getElementById('active-seat-pill');
  const activeStatus = document.getElementById('active-seat-status');
  const activeSeatName = document.getElementById('active-seat-name');
  const activeMeta = document.getElementById('active-meta-line');
  const activeActions = document.getElementById('active-card-actions');

  if (data.reservation && (data.reservation.status === 'RESERVED' || data.reservation.status === 'CHECKED_IN')) {
    if (activeContainer) activeContainer.style.display = 'block';

    const seatCode = data.reservation.seatCode || data.reservation.seatLabel || data.reservation.seatId || 'Assigned Seat';
    const floorLabel = data.reservation.floorName || data.reservation.floor || 'Ground Floor';
    if (activeSeatName) activeSeatName.textContent = `Seat: ${seatCode} (${floorLabel})`;

    if (data.reservation.status === 'CHECKED_IN') {
      if (activeCard) activeCard.className = 'active-session-card status-checked-in';
      if (activePill) activePill.className = 'active-seat-pill status-active';
      if (activeStatus) activeStatus.textContent = 'CHECKED IN & ACTIVE';
      if (activeMeta) activeMeta.textContent = 'Session active • Ready for GPS checkout when leaving';
      if (activeActions) {
        activeActions.innerHTML = `
          <a href="check-in.html" class="btn-live-checkout">
            <i class="fa-solid fa-arrow-right-from-bracket"></i> Check-Out & Release Seat
          </a>
        `;
      }
    } else {
      if (activeCard) activeCard.className = 'active-session-card';
      if (activePill) activePill.className = 'active-seat-pill';
      if (activeStatus) activeStatus.textContent = 'RESERVED';
      const slotTime = data.reservation.timeSlot || 'Scheduled';
      if (activeMeta) activeMeta.textContent = `Time Slot: ${slotTime} • Ready for Live GPS Check-in`;
      if (activeActions) {
        activeActions.innerHTML = `
          <a href="check-in.html" class="btn-live-checkin">
            <i class="fa-solid fa-location-dot"></i> Self Check-In Now
          </a>
        `;
      }
    }
  } else {
    if (activeContainer) activeContainer.style.display = 'none';
  }
}

async function askSeatAgent(message) {
  const response = await fetch("http://localhost:8000/api/agent/seat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      message: message
    })
  });
  return await response.json();
}