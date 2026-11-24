document.addEventListener('DOMContentLoaded', async () => {
  await loadSidebar();
  initSummaryPage();
});

async function loadSidebar() {
  try {
    const res = await fetch('sidebar.html');
    if (!res.ok) throw new Error('Could not load sidebar.html');
    const html = await res.text();
    const placeholder = document.getElementById('sidebar-placeholder');
    placeholder.innerHTML = html;

    const navItems = placeholder.querySelectorAll('.nav-item');
    navItems.forEach(item => {
      const href = item.getAttribute('href') || '';
      if (href.includes('book-seat.html') || href.includes('seat-reservation.html')) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });
  } catch (err) {
    console.error('Sidebar load failed:', err);
  }
}

function initSummaryPage() {
  const urlParams = new URLSearchParams(window.location.search);

  const seatId = urlParams.get('seatId') || '-';
  const date = urlParams.get('date') || '-';
  const startTime = urlParams.get('startTime') || '';
  const slotText = urlParams.get('slotText') || '-';
  const floor = urlParams.get('floor') || 'ground';
  const floorText = urlParams.get('floorText') || (floor === 'ground' ? 'Ground Floor' : 'First Floor');

  // Populate Review Details (Start Time only, never show end time)
  let displayStartTime = slotText;
  if (startTime && typeof formatStartTime === 'function') {
    displayStartTime = formatStartTime(startTime);
  } else if (displayStartTime && displayStartTime.includes('-')) {
    displayStartTime = displayStartTime.split('-')[0].trim();
  }

  document.getElementById('summary-seat-title').textContent = `${floorText} – Seat ${seatId}`;
  document.getElementById('summary-date').textContent = date;
  document.getElementById('summary-slot').textContent = displayStartTime;
  document.getElementById('summary-floor').textContent = floorText;

  // Cancel Button: returns to book-seat map
  document.getElementById('btn-cancel-summary').addEventListener('click', () => {
    window.location.href = 'book-seat.html';
  });

  // Book Seat Button: actually creates the reservation, then hands the
  // resulting booking id off to the My Bookings page.
  const bookBtn = document.getElementById('btn-confirm-booking');
  bookBtn.addEventListener('click', async () => {
    if (!startTime) {
      alert('Missing start time - please go back and pick a start time.');
      return;
    }

    bookBtn.disabled = true;
    bookBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Reserving...';

    const payload = {
      seatId: seatId,
      startTime: startTime,
      floor: floor,
      floorName: floorText
    };

    try {
      const apiBase = typeof getApiBase === 'function' ? getApiBase() : '';
      const res = await fetch(`${apiBase}/api/student/create-booking`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        const message = (data && data.detail) || 'This seat could not be booked. It may have just been taken.';
        alert(message);
        bookBtn.disabled = false;
        bookBtn.innerHTML = '<i class="fa-regular fa-circle-check"></i> <span>Book Seat</span>';
        return;
      }

      const bookingId = data && data.reservation ? data.reservation.id : '';
      window.location.href = `check-in.html?bookingId=${encodeURIComponent(bookingId)}`;
    } catch (e) {
      alert('Could not reach the booking server. Please ensure the backend is running and try again.');
      bookBtn.disabled = false;
      bookBtn.innerHTML = '<i class="fa-regular fa-circle-check"></i> <span>Book Seat</span>';
    }
  });
}
