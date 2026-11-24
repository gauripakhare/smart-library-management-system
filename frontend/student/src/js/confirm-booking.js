document.addEventListener('DOMContentLoaded', async () => {
  await loadSidebar();
  initTabs();
  fetchInitialData();
  setupModalEvents();
  bindLogout();
  countdownTicker = setInterval(updateCountdownBadges, 1000);
});

let allBookings = [];
let activeTab = 'upcoming';
let countdownTicker = null;

async function loadSidebar() {
  try {
    const res = await fetch('sidebar.html');
    if (!res.ok) throw new Error('Could not load sidebar.html');
    const html = await res.text();
    const placeholder = document.getElementById('sidebar-placeholder');
    placeholder.innerHTML = html;

    const navItems = placeholder.querySelectorAll('.nav-item');
    navItems.forEach(item => {
      const href = item.getAttribute('href');
      if (href && (href.includes('confirm-booking.html') || href.includes('seat-reservation.html'))) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });
  } catch (err) {
    console.error('Sidebar load failed:', err);
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

function isUpcomingBooking(item) {
  const status = statusOf(item);
  if (status === 'checked_in') return true;
  if (status === 'reserved') {
    if (item.checkInDeadline) {
      const deadline = new Date(item.checkInDeadline).getTime();
      if (Date.now() > deadline) return false;
    }
    return true;
  }
  return false;
}

function updateTabBadges() {
  const upcomingCount = allBookings.filter(isUpcomingBooking).length;
  const pastCount = allBookings.length - upcomingCount;

  const upcomingBadge = document.getElementById('count-upcoming');
  const pastBadge = document.getElementById('count-past');
  if (upcomingBadge) upcomingBadge.textContent = upcomingCount;
  if (pastBadge) pastBadge.textContent = pastCount;
}

function initTabs() {
  const upcomingBtn = document.getElementById('tab-upcoming');
  const pastBtn = document.getElementById('tab-past');

  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('tab') === 'past') {
    activeTab = 'past';
    upcomingBtn.classList.remove('active');
    pastBtn.classList.add('active');
  }

  upcomingBtn.addEventListener('click', () => {
    upcomingBtn.classList.add('active');
    pastBtn.classList.remove('active');
    activeTab = 'upcoming';
    renderBookings();
  });

  pastBtn.addEventListener('click', () => {
    pastBtn.classList.add('active');
    upcomingBtn.classList.remove('active');
    activeTab = 'past';
    renderBookings();
  });
}

async function fetchInitialData() {
  try {
    const apiBase = typeof getApiBase === 'function' ? getApiBase() : '';
    const res = await fetch(`${apiBase}/api/student/my-bookings`);
    if (!res.ok) throw new Error('Failed to fetch bookings');
    const data = await res.json();

    populateUser(data.user, data.notificationsCount);
    allBookings = Array.isArray(data.bookings) ? data.bookings : [];

    updateTabBadges();

    // Auto-switch to past tab if there are no upcoming bookings but past bookings exist
    const upcomingCount = allBookings.filter(isUpcomingBooking).length;
    const urlParams = new URLSearchParams(window.location.search);
    if (!urlParams.get('tab') && upcomingCount === 0 && allBookings.length > 0) {
      activeTab = 'past';
      const upcomingBtn = document.getElementById('tab-upcoming');
      const pastBtn = document.getElementById('tab-past');
      if (upcomingBtn) upcomingBtn.classList.remove('active');
      if (pastBtn) pastBtn.classList.add('active');
    }

    renderBookings();
  } catch (err) {
    renderBookings();
  }
}

function populateUser(user, notifCount) {
  if (user) {
    document.getElementById('student-name').textContent = user.name || '';
    document.getElementById('student-role').textContent = user.role || '';
    if (user.avatarUrl) {
      const img = document.getElementById('student-avatar');
      img.src = user.avatarUrl;
      img.style.display = 'block';
      document.getElementById('avatar-fallback').style.display = 'none';
    }
  }

  const badge = document.getElementById('notif-badge');
  if (notifCount > 0) {
    badge.textContent = notifCount;
    badge.style.display = 'flex';
  }
}

function statusOf(item) {
  return (item.status || '').toLowerCase();
}

function renderBookings() {
  const container = document.getElementById('bookings-container');
  container.innerHTML = '';

  const filtered = allBookings.filter(b => {
    if (activeTab === 'upcoming') {
      return isUpcomingBooking(b);
    }
    return !isUpcomingBooking(b);
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 40px; color: #94a3b8;">
        <i class="fa-solid fa-calendar-xmark" style="font-size: 2.5rem; margin-bottom: 12px; display: block;"></i>
        <p>No ${activeTab === 'upcoming' ? 'upcoming' : 'past'} seat bookings found.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(item => {
    const displayTime = typeof formatStartTime === 'function' ? formatStartTime(item.startTime) : (item.startTimeFormatted || item.timeSlot);
    const isReserved = statusOf(item) === 'reserved';
    const isCheckedIn = statusOf(item) === 'checked_in';
    const isCheckedOut = statusOf(item) === 'checked_out';
    const isExpired = statusOf(item) === 'expired';

    let statusDisplay = item.status;
    if (isCheckedOut) statusDisplay = 'CHECKED OUT';
    else if (isCheckedIn) statusDisplay = 'CHECKED IN (ACTIVE)';
    else if (isExpired) statusDisplay = 'EXPIRED (NO SHOW)';
    else if (isReserved) statusDisplay = 'RESERVED';

    const inTimeFormatted = item.checkInTime && typeof formatStartTime === 'function' ? formatStartTime(item.checkInTime) : null;
    const outTimeFormatted = item.checkOutTime && typeof formatStartTime === 'function' ? formatStartTime(item.checkOutTime) : null;

    return `
    <div class="booking-card">
      <div class="booking-main-info">
        <div class="seat-avatar-box">
          <i class="fa-solid fa-chair"></i>
        </div>
        <div class="booking-details">
          <h4 class="seat-title">${item.floorName || ''} – ${item.seatLabel || item.seatId}</h4>
          <div class="booking-meta-row">
            <span class="booking-meta-item"><i class="fa-regular fa-calendar"></i> ${item.date}</span>
            <span class="booking-meta-item"><i class="fa-regular fa-clock"></i> ${displayTime}</span>
            ${inTimeFormatted ? `<span class="booking-meta-item" style="color: #10b981; font-weight: 500;"><i class="fa-solid fa-arrow-right-to-bracket" style="color: #10b981;"></i> In: ${inTimeFormatted}</span>` : ''}
            ${outTimeFormatted ? `<span class="booking-meta-item" style="color: #64748b; font-weight: 500;"><i class="fa-solid fa-arrow-right-from-bracket" style="color: #94a3b8;"></i> Out: ${outTimeFormatted}</span>` : ''}
          </div>
        </div>
      </div>

      <div class="booking-status-actions">
        <span class="status-pill ${statusOf(item)}">${statusDisplay}</span>
        ${isReserved
          ? `<span class="checkin-countdown" data-booking-id="${item.id}" data-start="${item.startTime}" data-deadline="${item.checkInDeadline}">Updating...</span>`
          : ''}
        ${isReserved
          ? `<a href="check-in.html" class="btn-checkin-link" style="text-decoration:none; padding: 6px 12px; background: #2563eb; color: #fff; border-radius: 6px; font-size: 0.85rem; font-weight: 500; display: inline-flex; align-items: center; gap: 6px;">
              <i class="fa-solid fa-arrow-right-to-bracket"></i> Check In
            </a>
            <button type="button" class="btn-cancel-action" onclick="performCancel('${item.id}', '${item.seatLabel || item.seatId}')" style="padding: 6px 12px; background: #ffffff; color: #dc2626; border: 1px solid #fca5a5; border-radius: 6px; font-size: 0.85rem; font-weight: 500; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;">
              <i class="fa-solid fa-ban"></i> Cancel Booking
            </button>`
          : ''}
        ${isCheckedIn
          ? `<button type="button" class="btn-checkout-action" onclick="performCheckout('${item.id}', '${item.seatLabel || item.seatId}')" style="padding: 6px 12px; background: #ef4444; color: #fff; border: none; border-radius: 6px; font-size: 0.85rem; font-weight: 500; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;">
              <i class="fa-solid fa-arrow-right-from-bracket"></i> Check Out
            </button>`
          : ''}
        <button type="button" class="btn-view-details" onclick="openDetailsModal('${item.id}')">
          <i class="fa-regular fa-eye"></i> View Details
        </button>
      </div>
    </div>
  `;
  }).join('');

  updateCountdownBadges();
}

function updateCountdownBadges() {
  document.querySelectorAll('.checkin-countdown').forEach(el => {
    const startMs = el.dataset.start ? new Date(el.dataset.start).getTime() : 0;
    const deadline = new Date(el.dataset.deadline).getTime();
    const now = Date.now();

    // Upcoming: start time hasn't arrived yet
    if (startMs && now < startMs) {
      const remainingMs = startMs - now;
      const totalSeconds = Math.ceil(remainingMs / 1000);
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;
      el.textContent = `Check-in opens in ${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
      el.classList.remove('expired');
      return;
    }

    // Start time has arrived! Check-in window is open!
    if (startMs && now >= startMs && now <= deadline) {
      const key = 'auto_opened_checkin_' + el.dataset.bookingId;
      if (!sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, 'true');
        window.location.href = 'check-in.html';
        return;
      }
    }

    // Check-in window open (15 min from start)
    const remainingMs = deadline - now;
    if (remainingMs <= 0) {
      el.textContent = 'Check-in window expired';
      el.classList.add('expired');
      return;
    }

    const totalSeconds = Math.floor(remainingMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    el.textContent = `Check in within ${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    el.classList.remove('expired');
  });
}

function setupModalEvents() {
  const modal = document.getElementById('details-modal');
  const closeBtn = document.getElementById('modal-close');

  closeBtn.addEventListener('click', () => {
    modal.style.display = 'none';
  });

  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.style.display = 'none';
  });
}

window.openDetailsModal = function (bookingId) {
  const booking = allBookings.find(b => String(b.id) === String(bookingId));
  if (!booking) return;

  const displayTime = typeof formatStartTime === 'function' ? formatStartTime(booking.startTime) : (booking.startTimeFormatted || booking.timeSlot);
  const modal = document.getElementById('details-modal');
  const content = document.getElementById('modal-body-content');

  const inTime = booking.checkInTime && typeof formatStartTime === 'function' ? formatStartTime(booking.checkInTime) : null;
  const outTime = booking.checkOutTime && typeof formatStartTime === 'function' ? formatStartTime(booking.checkOutTime) : null;

  let statusDisplay = booking.status;
  if (statusOf(booking) === 'checked_out') statusDisplay = 'CHECKED OUT';
  else if (statusOf(booking) === 'checked_in') statusDisplay = 'CHECKED IN (ACTIVE)';
  else if (statusOf(booking) === 'expired') statusDisplay = 'EXPIRED (NO SHOW)';

  content.innerHTML = `
    <div class="modal-row"><span class="modal-label">Seat:</span><span>${booking.seatLabel || booking.seatId}</span></div>
    <div class="modal-row"><span class="modal-label">Floor:</span><span>${booking.floorName || '-'}</span></div>
    <div class="modal-row"><span class="modal-label">Booking Date:</span><span>${booking.date}</span></div>
    <div class="modal-row"><span class="modal-label">Scheduled Time:</span><span>${displayTime}</span></div>
    <div class="modal-row"><span class="modal-label">Status:</span><span class="status-pill ${statusOf(booking)}">${statusDisplay}</span></div>
    ${inTime ? `<div class="modal-row"><span class="modal-label">Actual Check-In:</span><span style="color:#10b981; font-weight:600;">${inTime}</span></div>` : ''}
    ${outTime ? `<div class="modal-row"><span class="modal-label">Actual Check-Out:</span><span style="color:#475569; font-weight:600;">${outTime}</span></div>` : ''}
    ${statusOf(booking) === 'reserved'
      ? `<div style="margin-top: 18px; display: flex; justify-content: flex-end; gap: 10px;">
          <button type="button" onclick="performCancel('${booking.id}', '${booking.seatLabel || booking.seatId}'); document.getElementById('details-modal').style.display='none';" style="padding: 8px 16px; background: #ffffff; color: #dc2626; border: 1px solid #fca5a5; border-radius: 6px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 8px;">
            <i class="fa-solid fa-ban"></i> Cancel Booking
          </button>
          <a href="check-in.html" style="text-decoration:none; padding: 8px 16px; background: #2563eb; color: #fff; border-radius: 6px; font-weight: 600; display: inline-flex; align-items: center; gap: 8px;">
            <i class="fa-solid fa-arrow-right-to-bracket"></i> Check In
          </a>
        </div>`
      : ''}
    ${statusOf(booking) === 'checked_in'
      ? `<div style="margin-top: 18px; display: flex; justify-content: flex-end;">
          <button type="button" onclick="performCheckout('${booking.id}', '${booking.seatLabel || booking.seatId}'); document.getElementById('details-modal').style.display='none';" style="padding: 8px 16px; background: #ef4444; color: #fff; border: none; border-radius: 6px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 8px;">
            <i class="fa-solid fa-arrow-right-from-bracket"></i> Check Out & Release Seat
          </button>
        </div>`
      : ''}
  `;

  modal.style.display = 'flex';
};

async function performCancel(bookingId, seatName) {
  if (!confirm(`Are you sure you want to cancel your reservation for Seat ${seatName || ''}? This will release the seat so other students can book it.`)) {
    return;
  }

  try {
    const apiBase = typeof getApiBase === 'function' ? getApiBase() : '';
    const res = await fetch(`${apiBase}/api/student/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reservationId: bookingId })
    });

    const data = await res.json().catch(() => null);
    if (!res.ok) {
      alert((data && data.detail) || 'Failed to cancel reservation');
      return;
    }

    alert(`Reservation for Seat ${seatName || ''} cancelled successfully! Seat is now free for others.`);
    await fetchInitialData();
  } catch (err) {
    alert('Failed to connect to server for cancellation.');
  }
}
window.performCancel = performCancel;

async function performCheckout(bookingId, seatName) {
  if (!confirm(`Are you sure you want to check out from Seat ${seatName || ''}? This will release the seat so others can book it.`)) {
    return;
  }

  try {
    const apiBase = typeof getApiBase === 'function' ? getApiBase() : '';
    const res = await fetch(`${apiBase}/api/student/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reservationId: bookingId })
    });

    const data = await res.json().catch(() => null);
    if (!res.ok) {
      alert((data && data.detail) || 'Checkout failed');
      return;
    }

    alert(`Checked out successfully! Seat ${seatName || ''} is now released and available for others.`);
    await fetchInitialData();
  } catch (err) {
    alert('Failed to connect to server for checkout.');
  }
}
window.performCheckout = performCheckout;
