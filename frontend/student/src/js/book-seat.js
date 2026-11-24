document.addEventListener('DOMContentLoaded', async () => {
  await loadSidebar();
  fetchUserProfile();
  await initFormControls();
  bindLogout();
  // Live auto-polling every 4 seconds so booked/occupied seats appear instantly
  setInterval(() => {
    if (!selectedSeatId) {
      fetchSeatMap();
    }
  }, 4000);
});

async function fetchUserProfile() {
  try {
    const apiBase = typeof getApiBase === 'function' ? getApiBase() : '';
    const res = await fetch(`${apiBase}/api/student/seat-config`);
    if (!res.ok) throw new Error('API config offline');
    const data = await res.json();
    populateUser(data.user, data.notificationsCount);
  } catch (err) {
    // Backend unreachable - leave the header placeholders as-is.
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

let selectedSeatId = null;
let selectedStartTimeIso = null;

// How far apart the selectable start times are, in minutes.
const TIME_STEP_MINUTES = 5;
// How long the booking window stays open, in minutes.
const BOOKING_WINDOW_MINUTES = 30;

// Offset between this browser's clock and the backend's clock, in ms.
// timeSlotRefreshTimer keeps the dropdown in sync with the real current
// time even if the tab stays open for a while.
let serverTimeOffsetMs = 0;
let timeSlotRefreshTimer = null;

function nowSynced() {
  return new Date(Date.now() + serverTimeOffsetMs);
}

// Dynamic Sidebar Loader
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

async function initFormControls() {
  const floorSelect = document.getElementById('floor-select');
  const dateInput = document.getElementById('booking-date');
  const nextBtn = document.getElementById('next-action-btn');

  // Format local date YYYY-MM-DD correctly according to browser local timezone
  const now = new Date();
  const localYear = now.getFullYear();
  const localMonth = String(now.getMonth() + 1).padStart(2, '0');
  const localDay = String(now.getDate()).padStart(2, '0');
  dateInput.value = `${localYear}-${localMonth}-${localDay}`;

  initTimeInput();
  // Wire floor navigation tabs
  const tabGround = document.getElementById('tab-floor-ground');
  const tabFirst = document.getElementById('tab-floor-first');

  function syncFloorTabs(floor) {
    if (tabGround && tabFirst) {
      if (floor === 'first') {
        tabFirst.classList.add('active');
        tabGround.classList.remove('active');
      } else {
        tabGround.classList.add('active');
        tabFirst.classList.remove('active');
      }
    }
  }

  if (tabGround && tabFirst) {
    tabGround.addEventListener('click', () => {
      floorSelect.value = 'ground';
      syncFloorTabs('ground');
      updateFloorTitle();
      fetchSeatMap();
    });

    tabFirst.addEventListener('click', () => {
      floorSelect.value = 'first';
      syncFloorTabs('first');
      updateFloorTitle();
      fetchSeatMap();
    });
  }

  // Ensure default floor selection syncs with tabs on init
  syncFloorTabs(floorSelect.value);

  updateFloorTitle();
  await fetchSeatMap();

  floorSelect.addEventListener('change', () => {
    syncFloorTabs(floorSelect.value);
    updateFloorTitle();
    fetchSeatMap();
  });

  dateInput.addEventListener('change', () => {
    updateSelectedTimeFromInput();
    fetchSeatMap();
  });

  nextBtn.addEventListener('click', () => {
    if (!selectedSeatId || !selectedStartTimeIso) return;

    const floor = floorSelect.value;
    const floorText = floorSelect.options[floorSelect.selectedIndex].text;
    const startDate = new Date(selectedStartTimeIso);
    const slotText = typeof formatStartTime === 'function' ? formatStartTime(startDate) : startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const params = new URLSearchParams({
      seatId: selectedSeatId,
      date: dateInput.value,
      startTime: selectedStartTimeIso,
      slotText: slotText,
      floor: floor,
      floorText: floorText
    });

    window.location.href = `booking-summary.html?${params.toString()}`;
  });
}

function initTimeInput() {
  const timeInput = document.getElementById('time-slot');
  if (timeInput) {
    timeInput.addEventListener('click', () => {
      if (typeof timeInput.showPicker === 'function') {
        try {
          timeInput.showPicker();
        } catch (_) {}
      }
    });
  }

  // Set default to current time
  setQuickSlotOffset(0);

  // Wire quick slot buttons
  document.querySelectorAll('.btn-slot-quick').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.btn-slot-quick').forEach(b => {
        b.style.background = '#fff';
        b.style.color = '#475569';
        b.style.borderColor = '#cbd5e1';
      });
      btn.style.background = '#2563eb';
      btn.style.color = '#fff';
      btn.style.borderColor = '#2563eb';

      const offset = parseInt(btn.dataset.offset || '0', 10);
      setQuickSlotOffset(offset);
      fetchSeatMap();
    });
  });

  timeInput.addEventListener('change', () => {
    validateAndEnforce30MinLimit();
    updateSelectedTimeFromInput();
    fetchSeatMap();
  });

  timeInput.addEventListener('input', () => {
    validateAndEnforce30MinLimit();
    updateSelectedTimeFromInput();
  });
}

function setQuickSlotOffset(offsetMinutes) {
  const timeInput = document.getElementById('time-slot');
  if (!timeInput) return;

  const targetDate = new Date(Date.now() + offsetMinutes * 60 * 1000);
  const hh = String(targetDate.getHours()).padStart(2, '0');
  const mm = String(targetDate.getMinutes()).padStart(2, '0');
  timeInput.value = `${hh}:${mm}`;

  updateSelectedTimeFromInput();
}

function parseTimeValue(val) {
  if (!val) return null;
  val = String(val).trim();
  const isPM = /pm/i.test(val);
  const isAM = /am/i.test(val);
  const clean = val.replace(/am|pm/gi, '').trim();
  const parts = clean.split(':').map(p => parseInt(p, 10));
  if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) return null;
  let hh = parts[0];
  let mm = parts[1];
  if (isPM && hh < 12) hh += 12;
  if (isAM && hh === 12) hh = 0;
  return { hh, mm };
}

function validateAndEnforce30MinLimit() {
  const timeInput = document.getElementById('time-slot');
  if (!timeInput || !timeInput.value) return;

  const parsed = parseTimeValue(timeInput.value);
  if (!parsed) return;

  let chosenH = parsed.hh;
  let chosenM = parsed.mm;

  const now = new Date();
  // Auto-detect: if user entered 9:00 at 9 PM (21:00) on a 24-hour clock
  if (chosenH < 12 && now.getHours() >= 12 && (chosenH + 12 - now.getHours() >= -1 && chosenH + 12 - now.getHours() <= 1)) {
    chosenH += 12;
  }

  const chosen = new Date(now.getFullYear(), now.getMonth(), now.getDate(), chosenH, chosenM, 0);

  // Midnight rollover check (e.g. at 23:45 user selects 00:05)
  if (chosen.getTime() - now.getTime() < -12 * 60 * 60 * 1000) {
    chosen.setDate(chosen.getDate() + 1);
  }

  const diffMs = chosen.getTime() - now.getTime();
  const diffMins = diffMs / (60 * 1000);

  // If chosen time is in the past or more than 30 minutes in future:
  if (diffMins < -2 || diffMins > 31) {
    alert("Notice: Seat bookings can only be reserved up to 30 minutes from current time.");
    setQuickSlotOffset(0);
  }
}

function updateSelectedTimeFromInput() {
  const timeInput = document.getElementById('time-slot');
  const dateInput = document.getElementById('booking-date');
  if (!timeInput) return;

  const now = new Date();
  let parsed = parseTimeValue(timeInput.value);
  let hh = now.getHours();
  let mm = now.getMinutes();

  if (parsed) {
    hh = parsed.hh;
    mm = parsed.mm;
    // Auto-detect: if user entered 9:00 at 9 PM (21:00) on a 24-hour clock
    if (hh < 12 && now.getHours() >= 12 && (hh + 12 - now.getHours() >= -1 && hh + 12 - now.getHours() <= 1)) {
      hh += 12;
    }
  }

  // Ensure timeInput shows 24h format HH:mm standard
  timeInput.value = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;

  const defaultYear = now.getFullYear();
  const defaultMonth = now.getMonth() + 1;
  const defaultDay = now.getDate();

  let year = defaultYear, month = defaultMonth, day = defaultDay;
  if (dateInput && dateInput.value) {
    const parts = dateInput.value.split('-').map(Number);
    if (parts.length === 3) {
      if (parts[0] > 1000) {
        year = parts[0]; month = parts[1]; day = parts[2];
      } else {
        day = parts[0]; month = parts[1]; year = parts[2];
      }
    }
  }

  const localDate = new Date(year, month - 1, day, hh, mm, 0, 0);
  selectedStartTimeIso = localDate.toISOString();
}

function updateFloorTitle() {
  const floor = document.getElementById('floor-select').value;
  const title = document.getElementById('map-floor-title');
  if (floor === 'ground') {
    title.textContent = 'Ground Floor – Seat Map';
  } else {
    title.textContent = 'First Floor – Seat Map';
  }
}

async function fetchSeatMap() {
  const floor = document.getElementById('floor-select').value;

  selectedSeatId = null;
  const nextBtn = document.getElementById('next-action-btn');
  nextBtn.disabled = true;
  nextBtn.innerHTML = 'Proceed to Booking <i class="fa-solid fa-arrow-right"></i>';

  if (!selectedStartTimeIso) {
    updateSelectedTimeFromInput();
  }

  // Render the structural layout immediately so the student never waits or sees blank
  renderStructuralMatrix(floor);

  try {
    const apiBase = typeof getApiBase === 'function' ? getApiBase() : '';
    const headers = typeof getAuthHeaders === 'function' ? getAuthHeaders() : {};
    const res = await fetch(
      `${apiBase}/api/student/seats?floor=${encodeURIComponent(floor)}&start_time=${encodeURIComponent(selectedStartTimeIso)}`,
      { headers }
    );
    if (!res.ok) {
      const errText = await res.text();
      console.warn('API seats request failed:', res.status, errText);
      return;
    }
    const data = await res.json();
    renderMatrix(data, floor);
  } catch (err) {
    console.error('Failed to fetch seat map from server:', err);
  }
}

// Ground Floor: 9 Departments ordered Left-to-Right on screen (which is user's Right-to-Left 1 to 9):
// 1) Master of Business Administration
// 2) Mechanical Engineering
// 3) Electronics and Telecommunications Engineering (ENTC1)
// 4) Electronics and Telecommunications Engineering (ENTC2)
// 5) Electrical Engineering
// 6) Pure Science
// 7) Computer/IT Engineering (COMP1)
// 8) Computer/IT Engineering (COMP2)
// 9) Religious Section
const GROUND_FLOOR_DEPTS = [
  { num: 9, code: 'REL', title: 'Religious Section', icon: 'fa-solid fa-place-of-worship', rows: 8 },
  { num: 8, code: 'COMP2', title: 'Computer/IT Engineering', icon: 'fa-solid fa-laptop', rows: 8 },
  { num: 7, code: 'COMP1', title: 'Computer/IT Engineering', icon: 'fa-solid fa-laptop', rows: 8 },
  { num: 6, code: 'SCI', title: 'Pure Science', icon: 'fa-solid fa-atom', rows: 8 },
  { num: 5, code: 'ELEC', title: 'Electrical Engineering', icon: 'fa-solid fa-bolt', rows: 8 },
  { num: 4, code: 'ENTC2', title: 'Electronics and Telecommunications Engineering', icon: 'fa-solid fa-microchip', rows: 8 },
  { num: 3, code: 'ENTC1', title: 'Electronics and Telecommunications Engineering', icon: 'fa-solid fa-tower-broadcast', rows: 8 },
  { num: 2, code: 'MECH', title: 'Mechanical Engineering', icon: 'fa-solid fa-gear', rows: 8 },
  { num: 1, code: 'MBA', title: 'Master of Business Administration', icon: 'fa-solid fa-graduation-cap', rows: 8 }
];

// Top Departments for First Floor (ordered Left-to-Right on screen, which is Right-to-Left 1 to 8 as specified)
const FIRST_FLOOR_DEPTS = [
  { code: 'COMP', title: 'Computer & IT', icon: 'fa-solid fa-laptop', rows: 3 },
  { code: 'ET', title: 'Electronics & Tele', icon: 'fa-solid fa-tower-broadcast', rows: 3 },
  { code: 'ENTC', title: 'Electronic & Telecommunications', icon: 'fa-solid fa-microchip', rows: 3 },
  { code: 'ELEC', title: 'Electrical Engineering', icon: 'fa-solid fa-bolt', rows: 3 },
  { code: 'MECH', title: 'Mechanical Engineering', icon: 'fa-solid fa-gear', rows: 3 },
  { code: 'MBA', title: 'Master of Business Administration', icon: 'fa-solid fa-graduation-cap', rows: 3 },
  { code: 'SCI', title: 'Pure Science', icon: 'fa-solid fa-atom', rows: 3 },
  { code: 'NTJ', title: 'Non Technical Journal', icon: 'fa-solid fa-newspaper', rows: 3 }
];

function renderMatrix(data, floor) {
  const container = document.getElementById('seat-matrix');
  const counter = document.getElementById('total-seat-counter');
  container.innerHTML = '';
  if (counter) counter.style.display = 'none';

  if (!data || !Array.isArray(data.seats)) return;

  const statusBySeatCode = {};
  let bookedCount = 0;
  let occupiedCount = 0;
  let availableCount = 0;

  data.seats.forEach(s => {
    const st = (s.status || 'available').toLowerCase();
    statusBySeatCode[s.seatCode] = st;
    if (st === 'occupied') occupiedCount++;
    else if (st === 'reserved') bookedCount++;
    else availableCount++;
  });

  const bEl = document.getElementById('student-booked-count');
  const aEl = document.getElementById('student-available-count');
  const oEl = document.getElementById('student-occupied-count');
  if (bEl) bEl.textContent = bookedCount;
  if (aEl) aEl.textContent = availableCount;
  if (oEl) oEl.textContent = occupiedCount;

  if (floor === 'first') {
    renderFirstFloorLayout(container, statusBySeatCode);
  } else {
    renderGroundFloorLayout(container, statusBySeatCode);
  }
}

// Structural generator rendering placeholders before API responds
function renderStructuralMatrix(floor) {
  const container = document.getElementById('seat-matrix');
  const counter = document.getElementById('total-seat-counter');
  container.innerHTML = '';
  if (counter) counter.style.display = 'none';

  if (floor === 'first') {
    renderFirstFloorLayout(container, {});
  } else {
    renderGroundFloorLayout(container, {});
  }
}

// -------------------------------------------------------------
// FIRST FLOOR: Architectural Layout (8 Departments + 4 Sections)
// -------------------------------------------------------------
function renderFirstFloorLayout(container, statusBySeatCode) {
  const ffContainer = document.createElement('div');
  ffContainer.className = 'first-floor-container';

  // 1. Top Row: 8 Departments Grid
  const deptsGrid = document.createElement('div');
  deptsGrid.className = 'ff-departments-grid';

  FIRST_FLOOR_DEPTS.forEach(dept => {
    const card = document.createElement('div');
    card.className = 'dept-card';

    // Department Icon
    const icon = document.createElement('i');
    icon.className = `${dept.icon} dept-icon`;
    card.appendChild(icon);

    // Department Title
    const title = document.createElement('div');
    title.className = 'dept-title';
    title.textContent = dept.title;
    card.appendChild(title);

    // Subheaders: A and B
    const subheaders = document.createElement('div');
    subheaders.className = 'dept-subheaders';
    subheaders.innerHTML = '<span>A</span><span>B</span>';
    card.appendChild(subheaders);

    // 3 Rows of 2 Seats = 6 Seats
    const rowsContainer = document.createElement('div');
    rowsContainer.className = 'dept-seats-rows';

    for (let r = 1; r <= dept.rows; r++) {
      const pair = document.createElement('div');
      pair.className = 'dept-seat-pair';

      ['A', 'B'].forEach(pos => {
        const seatId = `F-${dept.code}-${pos}${r}`;
        const status = statusBySeatCode[seatId] || 'available';
        const seatBtn = createFirstFloorSeatButton(seatId, status, dept.title);
        pair.appendChild(seatBtn);
      });

      rowsContainer.appendChild(pair);
    }

    card.appendChild(rowsContainer);
    deptsGrid.appendChild(card);
  });

  ffContainer.appendChild(deptsGrid);

  // 2. Middle Section: Left Wings + Center Corridor + Right Wings
  const middleSection = document.createElement('div');
  middleSection.className = 'ff-middle-section';

  // Left Wing:
  // - IEEE block: 16 seats total (8 - 8 on each side A and B)
  // - Audio video dvd section: no seat, shown as department name card only
  const leftWing = document.createElement('div');
  leftWing.className = 'side-wing';
  leftWing.appendChild(createSectionBox('IEEE Back Volume Section', 'fa-solid fa-book-bookmark', 16, 'IEEE', 8, statusBySeatCode));
  leftWing.appendChild(createDepartmentFacilityBox('Audio Video DVD Section', 'fa-solid fa-film', 'Audio-Visual Reference & Digital Media Resource Room'));
  middleSection.appendChild(leftWing);

  // Center Corridor Walkway
  const corridor = document.createElement('div');
  corridor.className = 'center-corridor';
  corridor.innerHTML = `
    <i class="fa-solid fa-person-walking corridor-icon"></i>
    <div class="corridor-text">Central Library Walkway</div>
    <div class="corridor-dashed-line"></div>
  `;
  middleSection.appendChild(corridor);

  // Right Wing:
  // - Career Awareness Section: 12 seats (6 - 6 on each side A and B)
  // - PhD Cell: 4 seats (2 - 2 on each side A and B)
  const rightWing = document.createElement('div');
  rightWing.className = 'side-wing';
  rightWing.appendChild(createSectionBox('Career Awareness Section', 'fa-solid fa-user-tie', 12, 'CAS', 6, statusBySeatCode));
  rightWing.appendChild(createSectionBox('PhD Cell', 'fa-solid fa-user-graduate', 4, 'PHD', 2, statusBySeatCode));
  middleSection.appendChild(rightWing);

  ffContainer.appendChild(middleSection);

  // 3. Bottom Entrance Row
  const entranceRow = document.createElement('div');
  entranceRow.className = 'ff-entrance-row';
  entranceRow.innerHTML = `
    <span class="entrance-arrow">↑</span>
    <div class="entrance-badge">
      <i class="fa-solid fa-book-open-reader"></i>
      <span>ENTRANCE</span>
    </div>
    <span class="entrance-arrow">↑</span>
  `;
  ffContainer.appendChild(entranceRow);

  container.appendChild(ffContainer);
}

// -------------------------------------------------------------
// GROUND FLOOR: Architectural Layout (9 Departments, 144 Seats)
// -------------------------------------------------------------
function renderGroundFloorLayout(container, statusBySeatCode) {
  const gfContainer = document.createElement('div');
  gfContainer.className = 'ground-floor-container';

  // 1. 9 Departments Grid (16 seats each = 144 seats)
  const deptsGrid = document.createElement('div');
  deptsGrid.className = 'gf-departments-grid';

  GROUND_FLOOR_DEPTS.forEach(dept => {
    const card = document.createElement('div');
    card.className = 'dept-card gf-dept-card';

    // Department Number Badge (1 to 9 ordered right to left)
    const numBadge = document.createElement('div');
    numBadge.className = 'dept-num-badge';
    numBadge.textContent = dept.num;
    card.appendChild(numBadge);

    // Department Icon
    const icon = document.createElement('i');
    icon.className = `${dept.icon} dept-icon`;
    card.appendChild(icon);

    // Department Title
    const title = document.createElement('div');
    title.className = 'dept-title';
    title.textContent = dept.title;
    card.appendChild(title);

    // Subheaders: A and B
    const subheaders = document.createElement('div');
    subheaders.className = 'dept-subheaders';
    subheaders.innerHTML = '<span>A</span><span>B</span>';
    card.appendChild(subheaders);

    // 7 Rows of 2 Seats = 14 Seats
    const rowsContainer = document.createElement('div');
    rowsContainer.className = 'dept-seats-rows';

    for (let r = 1; r <= dept.rows; r++) {
      const pair = document.createElement('div');
      pair.className = 'dept-seat-pair';

      ['A', 'B'].forEach(pos => {
        const seatId = `G-${dept.code}-${pos}${r}`;
        const status = statusBySeatCode[seatId] || 'available';
        const seatBtn = createFirstFloorSeatButton(seatId, status, dept.title);
        pair.appendChild(seatBtn);
      });

      rowsContainer.appendChild(pair);
    }

    card.appendChild(rowsContainer);
    deptsGrid.appendChild(card);
  });

  gfContainer.appendChild(deptsGrid);

  // 2. Bottom Entrance Row with arrows
  const entranceRow = document.createElement('div');
  entranceRow.className = 'ff-entrance-row gf-entrance-row';
  entranceRow.innerHTML = `
    <span class="entrance-arrow">↑</span>
    <div class="entrance-badge">
      <i class="fa-solid fa-book-open-reader"></i>
      <span>ENTRANCE</span>
    </div>
    <span class="entrance-arrow">↑</span>
  `;
  gfContainer.appendChild(entranceRow);

  container.appendChild(gfContainer);
}

function createDepartmentFacilityBox(title, iconClass, description) {
  const box = document.createElement('div');
  box.className = 'section-box-card facility-dept-card';
  box.innerHTML = `
    <div class="section-card-header">
      <div class="section-title-wrap">
        <i class="${iconClass}"></i>
        <span>${title}</span>
      </div>
      <span class="section-badge facility-badge">Department / Section</span>
    </div>
    <div class="facility-content">
      <div class="facility-icon-circle">
        <i class="${iconClass}"></i>
      </div>
      <div class="facility-details">
        <span class="facility-title">${title}</span>
        <span class="facility-desc">${description || 'Digital Media & Reference Section'}</span>
        <span class="facility-tag"><i class="fa-solid fa-circle-info"></i> Walk-in Reference Section (No seat booking)</span>
      </div>
    </div>
  `;
  return box;
}

function createSectionBox(title, iconClass, totalSeats, codePrefix, rowCount, statusBySeatCode) {
  const box = document.createElement('div');
  box.className = 'section-box-card';

  const header = document.createElement('div');
  header.className = 'section-card-header';
  header.innerHTML = `
    <div class="section-title-wrap">
      <i class="${iconClass}"></i>
      <span>${title}</span>
    </div>
  `;
  box.appendChild(header);

  const layout = document.createElement('div');
  layout.className = 'section-seats-layout';

  const subheaders = document.createElement('div');
  subheaders.className = 'section-subheaders';
  subheaders.innerHTML = '<span>A</span><span>B</span>';
  layout.appendChild(subheaders);

  const rowsContainer = document.createElement('div');
  rowsContainer.className = 'section-rows-container';

  for (let r = 1; r <= rowCount; r++) {
    const pair = document.createElement('div');
    pair.className = 'section-seat-pair';

    ['A', 'B'].forEach(pos => {
      const seatId = `F-${codePrefix}-${pos}${r}`;
      const status = statusBySeatCode[seatId] || 'available';
      const seatBtn = createFirstFloorSeatButton(seatId, status, title);
      pair.appendChild(seatBtn);
    });

    rowsContainer.appendChild(pair);
  }

  layout.appendChild(rowsContainer);
  box.appendChild(layout);

  return box;
}

function createFirstFloorSeatButton(seatId, initialStatus, sectionLabel) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `ff-seat-btn ${initialStatus}`;
  btn.dataset.seatId = seatId;
  btn.title = `${sectionLabel ? sectionLabel + ' - ' : ''}Seat ${seatId} (${initialStatus.toUpperCase()})`;

  // Display clean seat position number (e.g. A1, B2)
  const posWithRow = seatId.split('-').pop();
  btn.textContent = posWithRow;

  if (initialStatus === 'reserved' || initialStatus === 'occupied') {
    btn.disabled = true;
    return btn;
  }

  btn.addEventListener('click', () => {
    document.querySelectorAll('.ff-seat-btn.selected, .seat-btn.selected').forEach(el => el.classList.remove('selected'));
    btn.classList.add('selected');

    selectedSeatId = seatId;
    const nextBtn = document.getElementById('next-action-btn');
    nextBtn.disabled = false;
    nextBtn.innerHTML = `Proceed to Booking (${seatId}) <i class="fa-solid fa-arrow-right"></i>`;
  });

  return btn;
}

// -------------------------------------------------------------
// GROUND FLOOR: Standard 5x5 Matrix Layout
// -------------------------------------------------------------
function getFloorLayout(floor) {
  return {
    columns: [
      { id: 'c1', title: 'Column 1', sub: ['A', 'B'] },
      { id: 'c2', title: 'Column 2', sub: ['A', 'B'] },
      { id: 'c3', title: 'Column 3', sub: ['A', 'B'] },
      { id: 'c4', title: 'Column 4', sub: ['A', 'B'] },
      { id: 'c5', title: 'Column 5', sub: ['A', 'B'] }
    ],
    rows: ['Row 1', 'Row 2', 'Row 3', 'Row 4', 'Row 5']
  };
}

function renderStructure(columns, rows, container, floor, statusBySeatCode) {
  // 1. Column and sub-column headers
  const headerRow = document.createElement('div');
  headerRow.className = 'matrix-header-row';

  const emptyCorner = document.createElement('div');
  emptyCorner.className = 'row-label';
  headerRow.appendChild(emptyCorner);

  columns.forEach(col => {
    const colBox = document.createElement('div');
    colBox.className = 'column-group';

    const colTitle = document.createElement('span');
    colTitle.className = 'column-header-title';
    colTitle.textContent = col.title;
    colBox.appendChild(colTitle);

    if (col.sub && col.sub.length > 0) {
      const subRow = document.createElement('div');
      subRow.className = 'sub-header-row';
      col.sub.forEach(letter => {
        const subLetter = document.createElement('span');
        subLetter.className = 'sub-header-title';
        subLetter.textContent = letter;
        subRow.appendChild(subLetter);
      });
      colBox.appendChild(subRow);
    }
    headerRow.appendChild(colBox);
  });
  container.appendChild(headerRow);

  // 2. Seat Rows
  rows.forEach((rowName, rIdx) => {
    const rowEl = document.createElement('div');
    rowEl.className = 'matrix-row';

    const label = document.createElement('div');
    label.className = 'row-label';
    label.textContent = typeof rowName === 'string' ? rowName : `Row ${rIdx + 1}`;
    rowEl.appendChild(label);

    columns.forEach((col, cIdx) => {
      const pair = document.createElement('div');
      pair.className = 'seat-pair';

      ['A', 'B'].forEach(pos => {
        const seatId = `G-R${rIdx + 1}-C${cIdx + 1}-${pos}`;
        const status = statusBySeatCode[seatId] || 'available';
        const seatBtn = createSeatButton(seatId, status);
        pair.appendChild(seatBtn);
      });

      rowEl.appendChild(pair);
    });

    container.appendChild(rowEl);
  });
}

function createSeatButton(seatId, initialStatus) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `seat-btn ${initialStatus}`;
  btn.dataset.seatId = seatId;
  btn.title = seatId;

  if (initialStatus === 'reserved' || initialStatus === 'occupied') {
    btn.disabled = true;
    return btn;
  }

  btn.addEventListener('click', () => {
    document.querySelectorAll('.seat-btn.selected, .ff-seat-btn.selected').forEach(el => el.classList.remove('selected'));
    btn.classList.add('selected');

    selectedSeatId = seatId;
    const nextBtn = document.getElementById('next-action-btn');
    nextBtn.disabled = false;
    nextBtn.innerHTML = `Proceed to Booking (${seatId}) <i class="fa-solid fa-arrow-right"></i>`;
  });

  return btn;
}
