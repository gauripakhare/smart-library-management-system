document.addEventListener('DOMContentLoaded', async () => {
  await loadAdminSidebar();
  initSeatReservationDashboard();
});

// Dynamic Admin Sidebar Loader
async function loadAdminSidebar() {
  try {
    const res = await fetch('admin-sidebar.html');
    if (!res.ok) throw new Error('Failed to load admin-sidebar.html');
    const htmlText = await res.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlText, 'text/html');
    const sidebar = doc.querySelector('.sidebar');

    if (sidebar) {
      document.getElementById('sidebar-placeholder').appendChild(sidebar);

      // Highlight active route
      const navItems = sidebar.querySelectorAll('.nav-item');
      navItems.forEach(item => {
        const href = item.getAttribute('href') || '';
        const page = item.getAttribute('data-page') || '';
        if (href.includes('seat-reservation') || page === 'seat-reservation') {
          item.classList.add('active');
        } else {
          item.classList.remove('active');
        }
      });

      const script = document.createElement('script');
      script.src = 'src/js/admin-sidebar.js';
      document.body.appendChild(script);
    }
  } catch (err) {
    console.error('Sidebar load failed:', err);
  }
}

// Seat Reservation Controller: 100% Dynamic API Consumption
function initSeatReservationDashboard() {
  const groundDate = document.getElementById('ground-date-select');
  const groundSlot = document.getElementById('ground-slot-select');
  const firstDate = document.getElementById('first-date-select');
  const firstSlot = document.getElementById('first-slot-select');
  const refreshBtn = document.getElementById('btn-refresh-data');

  // Set default initial date to today without restricting min, allowing past dates
  const todayIso = new Date().toISOString().split('T')[0];
  groundDate.value = todayIso;
  firstDate.value = todayIso;
  // Intentionally NO min constraint so admins can inspect past dates and times freely!

  // Immediately generate all time slots with zero delay
  initImmediateTimeSlots();

  // Real-time clock in topbar
  updateLiveDateTime();
  setInterval(updateLiveDateTime, 60000);

  // Initial Load from API
  loadDashboardData();

  // Floor Toggle Tabs
  const tabGround = document.getElementById('admin-tab-ground');
  const tabFirst = document.getElementById('admin-tab-first');
  const groundCard = document.getElementById('ground-floor-card');
  const firstCard = document.getElementById('first-floor-card');

  if (tabGround && tabFirst) {
    tabGround.addEventListener('click', () => {
      tabGround.classList.add('active');
      tabFirst.classList.remove('active');
      if (groundCard) groundCard.style.display = 'block';
      if (firstCard) firstCard.style.display = 'none';
      fetchFloorMap('ground');
    });

    tabFirst.addEventListener('click', () => {
      tabFirst.classList.add('active');
      tabGround.classList.remove('active');
      if (firstCard) firstCard.style.display = 'block';
      if (groundCard) groundCard.style.display = 'none';
      fetchFloorMap('first');
    });
  }

  // Primary View Switcher: Floor Map vs Past Bookings History
  const tabBtnMap = document.getElementById('tab-btn-map');
  const tabBtnHistory = document.getElementById('tab-btn-history');
  const floorMapWrapper = document.getElementById('floor-map-view-wrapper');
  const historyWrapper = document.getElementById('past-bookings-view-wrapper');

  if (tabBtnMap && tabBtnHistory) {
    tabBtnMap.addEventListener('click', () => {
      tabBtnMap.classList.add('active');
      tabBtnHistory.classList.remove('active');
      if (floorMapWrapper) floorMapWrapper.style.display = 'block';
      if (historyWrapper) historyWrapper.style.display = 'none';
    });

    tabBtnHistory.addEventListener('click', () => {
      tabBtnHistory.classList.add('active');
      tabBtnMap.classList.remove('active');
      if (floorMapWrapper) floorMapWrapper.style.display = 'none';
      if (historyWrapper) historyWrapper.style.display = 'flex';
      fetchPastBookingHistory();
    });
  }

  // History Filter Controls
  const historyDateFilter = document.getElementById('history-filter-date');
  const historyTimeFilter = document.getElementById('history-filter-time');
  const historyFloorFilter = document.getElementById('history-filter-floor');
  const historyStatusFilter = document.getElementById('history-filter-status');
  const historySearchFilter = document.getElementById('history-filter-search');
  const historyResetBtn = document.getElementById('btn-history-reset');
  const historyRefreshBtn = document.getElementById('btn-refresh-history');

  if (historyDateFilter) historyDateFilter.addEventListener('change', () => fetchPastBookingHistory());
  if (historyTimeFilter) historyTimeFilter.addEventListener('change', () => fetchPastBookingHistory());
  if (historyFloorFilter) historyFloorFilter.addEventListener('change', () => fetchPastBookingHistory());
  if (historyStatusFilter) historyStatusFilter.addEventListener('change', () => fetchPastBookingHistory());
  if (historySearchFilter) {
    let searchTimeout = null;
    historySearchFilter.addEventListener('input', () => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => fetchPastBookingHistory(), 300);
    });
  }

  if (historyResetBtn) {
    historyResetBtn.addEventListener('click', () => {
      if (historyDateFilter) historyDateFilter.value = '';
      if (historyTimeFilter) historyTimeFilter.value = 'all';
      if (historyFloorFilter) historyFloorFilter.value = 'all';
      if (historyStatusFilter) historyStatusFilter.value = 'all';
      if (historySearchFilter) historySearchFilter.value = '';
      fetchPastBookingHistory();
    });
  }

  if (historyRefreshBtn) {
    historyRefreshBtn.addEventListener('click', async () => {
      historyRefreshBtn.disabled = true;
      historyRefreshBtn.innerHTML = '<i class="fa-solid fa-arrows-rotate fa-spin"></i> <span>Loading...</span>';
      await fetchPastBookingHistory();
      historyRefreshBtn.disabled = false;
      historyRefreshBtn.innerHTML = '<i class="fa-solid fa-arrows-rotate"></i> <span>Refresh Records</span>';
    });
  }

  // Initial history count pre-fetch
  fetchPastBookingHistory();

  // Event Listeners for Floor Filters
  groundDate.addEventListener('change', () => fetchFloorMap('ground'));
  groundSlot.addEventListener('change', () => fetchFloorMap('ground'));

  firstDate.addEventListener('change', () => fetchFloorMap('first'));
  firstSlot.addEventListener('change', () => fetchFloorMap('first'));

  refreshBtn.addEventListener('click', async () => {
    refreshBtn.disabled = true;
    refreshBtn.innerHTML = '<i class="fa-solid fa-arrows-rotate fa-spin"></i> <span>Refreshing...</span>';
    await loadDashboardData();
    await fetchPastBookingHistory();
    refreshBtn.disabled = false;
    refreshBtn.innerHTML = '<i class="fa-solid fa-arrows-rotate"></i> <span>Refresh Seat Data</span>';
  });

  function updateLiveDateTime() {
    const now = new Date();
    const options = { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' };
    const dtEl = document.getElementById('live-datetime');
    if (dtEl) dtEl.textContent = now.toLocaleDateString('en-US', options);
  }

  function getApiBase() {
    if (window.API_BASE_URL) return window.API_BASE_URL;
    if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1" || window.location.protocol === "file:") {
      return "http://127.0.0.1:8000/api";
    }
    return "/api";
  }
  const API_BASE = getApiBase();

  // Generate and populate all 30-minute standard time slots immediately (07:00 AM to 11:00 PM)
  function initImmediateTimeSlots() {
    const slots = [];
    const now = new Date();
    const currentHour = now.getHours();
    const currentMin = now.getMinutes() >= 30 ? 30 : 0;
    const currentSlotId = `${String(currentHour).padStart(2, '0')}:${String(currentMin).padStart(2, '0')}`;

    for (let h = 7; h < 23; h++) {
      for (const m of [0, 30]) {
        const slotId = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        const startH12 = h % 12 === 0 ? 12 : h % 12;
        const startAmPm = h < 12 ? 'AM' : 'PM';
        const startStr = `${String(startH12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${startAmPm}`;

        const endM = (m + 30) % 60;
        const endH = m === 30 ? h + 1 : h;
        const endH12 = endH % 12 === 0 ? 12 : endH % 12;
        const endAmPm = endH < 12 ? 'AM' : 'PM';
        const endStr = `${String(endH12).padStart(2, '0')}:${String(endM).padStart(2, '0')} ${endAmPm}`;

        slots.push({ id: slotId, label: `${startStr} - ${endStr}` });
      }
    }

    let defaultSlotId = slots[0].id;
    if (currentHour >= 7 && currentHour < 23) {
      defaultSlotId = currentSlotId;
    }

    const optionsHtml = slots.map(s => `
      <option value="${s.id}" ${s.id === defaultSlotId ? 'selected' : ''}>${s.label}</option>
    `).join('');

    if (groundSlot) groundSlot.innerHTML = optionsHtml;
    if (firstSlot) firstSlot.innerHTML = optionsHtml;
  }

  // Fetch Full Dashboard Configuration & Metrics
  async function loadDashboardData() {
    try {
      const res = await fetch(`${API_BASE}/admin/seat-overview`);
      if (!res.ok) throw new Error('API offline');
      const data = await res.json();

      // Top Overview Statistics
      if (data.metrics) {
        populateMetrics(data.metrics);
      }

      // Time Slot Options (sync if returned from backend)
      if (Array.isArray(data.timeSlots) && data.timeSlots.length > 0) {
        populateSlots(data.timeSlots);
      }

      // Live Floors
      if (data.groundFloor) {
        renderFloor('ground', data.groundFloor);
      }
      if (data.firstFloor) {
        renderFloor('first', data.firstFloor);
      }
    } catch (err) {
      console.warn('Backend API currently unreachable:', err);
    }
  }

  function populateSlots(slots, targetFloorKey = null) {
    if (!slots || slots.length === 0) return;
    const currentGroundVal = groundSlot ? groundSlot.value : null;
    const currentFirstVal = firstSlot ? firstSlot.value : null;

    const buildOptionsHtml = (currVal) => slots.map(s => {
      const val = s.id || s.value || s;
      const cnt = s.bookingCount != null ? s.bookingCount : null;
      let lbl = s.display;
      if (!lbl) {
        const rawLbl = s.label || s.name || s;
        lbl = cnt != null ? `${rawLbl} (${cnt} Booked)` : rawLbl;
      }
      const sel = val === currVal ? 'selected' : '';
      return `<option value="${val}" ${sel}>${lbl}</option>`;
    }).join('');

    if ((!targetFloorKey || targetFloorKey === 'ground') && groundSlot) {
      const selVal = currentGroundVal || groundSlot.value;
      groundSlot.innerHTML = buildOptionsHtml(selVal);
      if (selVal && groundSlot.querySelector(`option[value="${selVal}"]`)) {
        groundSlot.value = selVal;
      }
    }
    if ((!targetFloorKey || targetFloorKey === 'first') && firstSlot) {
      const selVal = currentFirstVal || firstSlot.value;
      firstSlot.innerHTML = buildOptionsHtml(selVal);
      if (selVal && firstSlot.querySelector(`option[value="${selVal}"]`)) {
        firstSlot.value = selVal;
      }
    }
  }

  function populateMetrics(m) {
    document.getElementById('metric-total-seats').textContent = m.totalSeats ?? '--';
    document.getElementById('metric-seats-per-floor').textContent = m.perFloor != null ? `(Per Floor: ${m.perFloor})` : '';
    document.getElementById('metric-booked-seats').textContent = m.bookedSeats ?? '--';
    document.getElementById('metric-booked-percent').textContent = m.bookedPercent != null ? `(${m.bookedPercent}% of total)` : '';
    document.getElementById('metric-available-seats').textContent = m.availableSeats ?? '--';
    document.getElementById('metric-available-percent').textContent = m.availablePercent != null ? `(${m.availablePercent}% of total)` : '';
    document.getElementById('metric-occupied-seats').textContent = m.occupiedSeats ?? '--';
    document.getElementById('metric-occupied-sub').textContent = m.occupiedSeats > 0 ? `(${m.occupiedSeats} in session)` : '(Currently no occupied seats)';
  }

  // Fetch updated seat grid when date/slot changes on an individual floor
  async function fetchFloorMap(floorKey) {
    const isGround = floorKey === 'ground';
    const dateInput = isGround ? groundDate : firstDate;
    const slotSelect = isGround ? groundSlot : firstSlot;
    const date = dateInput ? dateInput.value : '';
    const slot = slotSelect ? slotSelect.value : '';

    if (!slot) return;

    try {
      const res = await fetch(`${API_BASE}/admin/floor-seats?floor=${floorKey}&date=${date}&slot=${slot}`);
      if (!res.ok) throw new Error(`Floor ${floorKey} data offline`);
      const data = await res.json();

      // Dynamically update the slot options for this floor with date-specific booking counts
      if (Array.isArray(data.timeSlots) && data.timeSlots.length > 0) {
        populateSlots(data.timeSlots, floorKey);
      }

      renderFloor(floorKey, data);
    } catch (err) {
      console.error(`Error loading ${floorKey} floor data:`, err);
    }
  }

  // Ground Floor 9 Departments Structure (matching student side UI)
  const GROUND_FLOOR_DEPTS = [
    { num: 9, code: 'REL', title: 'Religious Section', icon: 'fa-solid fa-place-of-worship', rows: 7 },
    { num: 8, code: 'COMP2', title: 'Computer/IT Engineering', icon: 'fa-solid fa-laptop', rows: 7 },
    { num: 7, code: 'COMP1', title: 'Computer/IT Engineering', icon: 'fa-solid fa-laptop', rows: 7 },
    { num: 6, code: 'SCI', title: 'Pure Science', icon: 'fa-solid fa-atom', rows: 7 },
    { num: 5, code: 'ELEC', title: 'Electrical Engineering', icon: 'fa-solid fa-bolt', rows: 7 },
    { num: 4, code: 'ENTC2', title: 'Electronics and Telecommunications Engineering', icon: 'fa-solid fa-microchip', rows: 7 },
    { num: 3, code: 'ENTC1', title: 'Electronics and Telecommunications Engineering', icon: 'fa-solid fa-tower-broadcast', rows: 7 },
    { num: 2, code: 'MECH', title: 'Mechanical Engineering', icon: 'fa-solid fa-gear', rows: 7 },
    { num: 1, code: 'MBA', title: 'Master of Business Administration', icon: 'fa-solid fa-graduation-cap', rows: 7 }
  ];

  // First Floor 8 Departments Structure (matching student side UI)
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

  // REAL-TIME AUTO POLLING: Update top overview metrics periodically without overwriting user's filtered views
  setInterval(async () => {
    if (document.hidden) return;
    try {
      const res = await fetch(`${API_BASE}/admin/seat-overview`);
      if (res.ok) {
        const data = await res.json();
        if (data.metrics) populateMetrics(data.metrics);
      }
    } catch (_) {}
  }, 10000);

  function renderFloor(floorKey, floorData) {
    const isGround = floorKey === 'ground';
    const prefix = isGround ? 'ground' : 'first';
    const container = document.getElementById(`${prefix}-seat-grid`);
    if (!floorData || !container) return;

    const bookedCount = floorData.bookedCount ?? 0;
    const occupiedCount = floorData.occupiedCount ?? 0;
    const availableCount = floorData.availableCount ?? 0;
    const totalBooked = bookedCount + occupiedCount;

    document.getElementById(`${prefix}-booked-count`).textContent = bookedCount;
    document.getElementById(`${prefix}-available-count`).textContent = availableCount;
    document.getElementById(`${prefix}-occupied-count`).textContent = occupiedCount;

    const badge = document.getElementById(`${prefix}-seat-badge`);
    if (floorData.totalSeats != null) {
      badge.textContent = `${floorData.totalSeats} Total Seats`;
      badge.style.display = 'inline-block';
    } else {
      badge.style.display = 'none';
    }

    // Update Slot Summary Banner
    const banner = document.getElementById(`${prefix}-slot-summary-banner`);
    const bannerText = document.getElementById(`${prefix}-slot-summary-text`);
    const slotSelect = isGround ? groundSlot : firstSlot;
    const dateVal = floorData.selectedDate || (isGround ? groundDate.value : firstDate.value);

    let slotLabel = '';
    if (slotSelect && slotSelect.selectedOptions && slotSelect.selectedOptions[0]) {
      slotLabel = slotSelect.selectedOptions[0].textContent.split('(')[0].trim();
    }
    if (!slotLabel && floorData.selectedSlot) {
      slotLabel = floorData.selectedSlot;
    }

    if (banner && bannerText) {
      bannerText.innerHTML = `Time Slot: <strong>${slotLabel}</strong> &bull; Total Bookings: <strong style="color: #4f46e5; font-size: 0.95rem;">${totalBooked} Booked</strong> &bull; Date: <strong>${dateVal}</strong>`;
      banner.style.display = 'flex';
    }

    // Build status and student lookup from backend seat map
    const DEPT_MAP = { 1: 'MBA', 2: 'MECH', 3: 'ENTC1', 4: 'ENTC2', 5: 'ELEC', 6: 'SCI', 7: 'COMP1', 8: 'COMP2', 9: 'REL' };
    const COL_MAP = Object.fromEntries(Object.entries(DEPT_MAP).map(([k, v]) => [v, Number(k)]));

    const statusBySeatCode = {};
    const studentBySeatCode = {};
    if (floorData.seats) {
      Object.entries(floorData.seats).forEach(([key, seatInfo]) => {
        if (seatInfo && seatInfo.id) {
          const st = (seatInfo.status || 'available').toLowerCase();
          statusBySeatCode[seatInfo.id] = st;
          statusBySeatCode[key] = st;
          if (seatInfo.student) {
            studentBySeatCode[seatInfo.id] = seatInfo.student;
            studentBySeatCode[key] = seatInfo.student;
          }

          // Bidirectional alias mapping: G-R{r}-C{c}-{pos} <-> G-{dept}-{pos}{r}
          const parts = seatInfo.id.split('-');
          if (parts.length === 4 && parts[0] === 'G') {
            const r = parts[1].replace('R', '');
            const c = parseInt(parts[2].replace('C', ''), 10);
            const pos = parts[3];
            if (DEPT_MAP[c]) {
              const alias = `G-${DEPT_MAP[c]}-${pos}${r}`;
              statusBySeatCode[alias] = st;
              if (seatInfo.student) studentBySeatCode[alias] = seatInfo.student;
            }
          } else if (parts.length === 3 && parts[0] === 'G') {
            const dept = parts[1];
            const pos = parts[2][0];
            const r = parts[2].slice(1);
            if (COL_MAP[dept]) {
              const alias = `G-R${r}-C${COL_MAP[dept]}-${pos}`;
              statusBySeatCode[alias] = st;
              if (seatInfo.student) studentBySeatCode[alias] = seatInfo.student;
            }
          }
        }
      });
    }

    container.innerHTML = '';
    if (floorKey === 'first') {
      renderAdminFirstFloor(container, statusBySeatCode, studentBySeatCode);
    } else {
      renderAdminGroundFloor(container, statusBySeatCode, studentBySeatCode);
    }
  }

  function renderAdminGroundFloor(container, statusBySeatCode, studentBySeatCode = {}) {
    const gfContainer = document.createElement('div');
    gfContainer.className = 'ground-floor-container';

    const deptsGrid = document.createElement('div');
    deptsGrid.className = 'gf-departments-grid';

    GROUND_FLOOR_DEPTS.forEach(dept => {
      const card = document.createElement('div');
      card.className = 'dept-card gf-dept-card';

      const numBadge = document.createElement('div');
      numBadge.className = 'dept-num-badge';
      numBadge.textContent = dept.num;
      card.appendChild(numBadge);

      const icon = document.createElement('i');
      icon.className = `${dept.icon} dept-icon`;
      card.appendChild(icon);

      const title = document.createElement('div');
      title.className = 'dept-title';
      title.textContent = dept.title;
      card.appendChild(title);

      const subheaders = document.createElement('div');
      subheaders.className = 'dept-subheaders';
      subheaders.innerHTML = '<span>A</span><span>B</span>';
      card.appendChild(subheaders);

      const rowsContainer = document.createElement('div');
      rowsContainer.className = 'dept-seats-rows';

      for (let r = 1; r <= dept.rows; r++) {
        const pair = document.createElement('div');
        pair.className = 'dept-seat-pair';

        ['A', 'B'].forEach(pos => {
          const seatId = `G-${dept.code}-${pos}${r}`;
          const aliasId = `G-R${r}-C${dept.num}-${pos}`;
          const status = statusBySeatCode[seatId] || statusBySeatCode[aliasId] || 'available';
          const student = studentBySeatCode[seatId] || studentBySeatCode[aliasId] || null;
          const seatBtn = createAdminSeatButton(seatId, status, dept.title, student);
          pair.appendChild(seatBtn);
        });

        rowsContainer.appendChild(pair);
      }

      card.appendChild(rowsContainer);
      deptsGrid.appendChild(card);
    });

    gfContainer.appendChild(deptsGrid);

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

  function renderAdminFirstFloor(container, statusBySeatCode, studentBySeatCode = {}) {
    const ffContainer = document.createElement('div');
    ffContainer.className = 'first-floor-container';

    const deptsGrid = document.createElement('div');
    deptsGrid.className = 'ff-departments-grid';

    FIRST_FLOOR_DEPTS.forEach(dept => {
      const card = document.createElement('div');
      card.className = 'dept-card';

      const icon = document.createElement('i');
      icon.className = `${dept.icon} dept-icon`;
      card.appendChild(icon);

      const title = document.createElement('div');
      title.className = 'dept-title';
      title.textContent = dept.title;
      card.appendChild(title);

      const subheaders = document.createElement('div');
      subheaders.className = 'dept-subheaders';
      subheaders.innerHTML = '<span>A</span><span>B</span>';
      card.appendChild(subheaders);

      const rowsContainer = document.createElement('div');
      rowsContainer.className = 'dept-seats-rows';

      for (let r = 1; r <= dept.rows; r++) {
        const pair = document.createElement('div');
        pair.className = 'dept-seat-pair';

        ['A', 'B'].forEach(pos => {
          const seatId = `F-${dept.code}-${pos}${r}`;
          const status = statusBySeatCode[seatId] || 'available';
          const student = studentBySeatCode[seatId] || null;
          const seatBtn = createAdminSeatButton(seatId, status, dept.title, student);
          pair.appendChild(seatBtn);
        });

        rowsContainer.appendChild(pair);
      }

      card.appendChild(rowsContainer);
      deptsGrid.appendChild(card);
    });

    ffContainer.appendChild(deptsGrid);

    const middleSection = document.createElement('div');
    middleSection.className = 'ff-middle-section';

    const leftWing = document.createElement('div');
    leftWing.className = 'side-wing';
    leftWing.appendChild(createAdminSectionBox('IEEE Back Volume Section', 'fa-solid fa-book-bookmark', 'IEEE', 8, statusBySeatCode, studentBySeatCode));
    leftWing.appendChild(createAdminFacilityBox('Audio Video DVD Section', 'fa-solid fa-film', 'Audio-Visual Reference & Digital Media Resource Room'));
    middleSection.appendChild(leftWing);

    const corridor = document.createElement('div');
    corridor.className = 'center-corridor';
    corridor.innerHTML = `
      <i class="fa-solid fa-person-walking corridor-icon"></i>
      <div class="corridor-text">Central Library Walkway</div>
      <div class="corridor-dashed-line"></div>
    `;
    middleSection.appendChild(corridor);

    const rightWing = document.createElement('div');
    rightWing.className = 'side-wing';
    rightWing.appendChild(createAdminSectionBox('Career Awareness Section', 'fa-solid fa-user-tie', 'CAS', 6, statusBySeatCode, studentBySeatCode));
    rightWing.appendChild(createAdminSectionBox('PhD Cell', 'fa-solid fa-user-graduate', 'PHD', 2, statusBySeatCode, studentBySeatCode));
    middleSection.appendChild(rightWing);

    ffContainer.appendChild(middleSection);

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

  function createAdminFacilityBox(title, iconClass, description) {
    const box = document.createElement('div');
    box.className = 'section-box-card facility-dept-card';
    box.innerHTML = `
      <div class="section-card-header">
        <div class="section-title-wrap">
          <i class="${iconClass}"></i>
          <span>${title}</span>
        </div>
        <span class="section-badge facility-badge">Facility</span>
      </div>
      <div class="facility-content">
        <div class="facility-icon-circle">
          <i class="${iconClass}"></i>
        </div>
        <div class="facility-details">
          <span class="facility-title">${title}</span>
          <span class="facility-desc">${description}</span>
          <span class="facility-tag"><i class="fa-solid fa-circle-info"></i> Walk-in Reference Section</span>
        </div>
      </div>
    `;
    return box;
  }

  function createAdminSectionBox(title, iconClass, codePrefix, rowCount, statusBySeatCode, studentBySeatCode = {}) {
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
        const student = studentBySeatCode[seatId] || null;
        const seatBtn = createAdminSeatButton(seatId, status, title, student);
        pair.appendChild(seatBtn);
      });

      rowsContainer.appendChild(pair);
    }

    layout.appendChild(rowsContainer);
    box.appendChild(layout);

    return box;
  }

  function createAdminSeatButton(seatId, status, sectionLabel, studentLabel) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `ff-seat-btn ${status}`;
    btn.dataset.seatId = seatId;
    let titleStr = `${sectionLabel ? sectionLabel + ' - ' : ''}Seat ${seatId} (${status.toUpperCase()})`;
    if (studentLabel) {
      titleStr += (status === 'occupied' ? `\nOccupied by: ` : `\nReserved by: `) + studentLabel;
    }
    btn.title = titleStr;

    const posWithRow = seatId.split('-').pop();
    btn.textContent = posWithRow;

    if (studentLabel) {
      btn.style.cursor = 'pointer';
      btn.onclick = () => {
        alert(`📌 Seat: ${seatId}\nStatus: ${status.toUpperCase()}\nStudent: ${studentLabel}\nSection: ${sectionLabel || 'Central Library'}`);
      };
    }

    return btn;
  }

  // =======================================================
  // PAST BOOKING HISTORY CONTROLLER
  // =======================================================
  async function fetchPastBookingHistory() {
    const dateInput = document.getElementById('history-filter-date');
    const timeInput = document.getElementById('history-filter-time');
    const floorInput = document.getElementById('history-filter-floor');
    const statusInput = document.getElementById('history-filter-status');
    const searchInput = document.getElementById('history-filter-search');

    const dateVal = dateInput && dateInput.value ? dateInput.value.trim() : 'all';
    const timeVal = timeInput ? timeInput.value : 'all';
    const floorVal = floorInput ? floorInput.value : 'all';
    const statusVal = statusInput ? statusInput.value : 'all';
    const searchVal = searchInput ? searchInput.value.trim() : '';

    const indicator = document.getElementById('active-date-indicator');
    if (indicator) {
      indicator.textContent = dateVal === 'all' || !dateVal ? 'Showing: All Dates' : `Showing: ${formatDateNice(dateVal)}`;
    }

    const tableBody = document.getElementById('history-table-body');
    if (tableBody) {
      tableBody.innerHTML = '<tr><td colspan="9" class="h-loading-cell"><i class="fa-solid fa-spinner fa-spin"></i> Loading records...</td></tr>';
    }

    try {
      const url = `${API_BASE}/admin/seat-history?date=${encodeURIComponent(dateVal)}&time=${encodeURIComponent(timeVal)}&floor=${encodeURIComponent(floorVal)}&status=${encodeURIComponent(statusVal)}&search=${encodeURIComponent(searchVal)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('History API failed');
      const data = await res.json();

      // 1. Update View tab badge
      const badgeTotal = document.getElementById('view-tab-history-badge');
      if (badgeTotal) {
        badgeTotal.textContent = data.summary?.allTimeTotal ?? data.totalRecords ?? 0;
      }

      // 2. Update KPI Chips
      if (data.summary) {
        const kpiTotal = document.getElementById('kpi-total-bookings');
        const kpiCheckedIn = document.getElementById('kpi-checked-in');
        const kpiCheckedOut = document.getElementById('kpi-checked-out');
        const kpiExpired = document.getElementById('kpi-expired');

        if (kpiTotal) kpiTotal.textContent = data.summary.totalBookings ?? 0;
        if (kpiCheckedIn) kpiCheckedIn.textContent = data.summary.checkedIn ?? 0;
        if (kpiCheckedOut) kpiCheckedOut.textContent = data.summary.checkedOut ?? 0;
        if (kpiExpired) kpiExpired.textContent = (data.summary.expired ?? 0) + (data.summary.cancelled ?? 0);
      }

      // 3. Update Record count badge
      const recBadge = document.getElementById('table-records-badge');
      if (recBadge) recBadge.textContent = `${data.totalRecords ?? 0} Records`;

      // 4. Render Date Chips ("kontya date la kiti hotya")
      renderDateChips(data.dailyCounts || [], dateVal, data.summary?.allTimeTotal);

      // 5. Render Records Table
      renderHistoryTable(data.records || []);

    } catch (err) {
      console.error('Error fetching past booking history:', err);
      if (tableBody) {
        tableBody.innerHTML = '<tr><td colspan="9" class="h-loading-cell" style="color: #ef4444;"><i class="fa-solid fa-triangle-exclamation"></i> Error loading past booking history</td></tr>';
      }
    }
  }

  function renderDateChips(dailyCounts, selectedDate, allTimeTotal) {
    const container = document.getElementById('history-date-chips');
    if (!container) return;

    const isAllActive = selectedDate === 'all' || !selectedDate;
    const chipsHtml = [];

    // All Dates Chip
    chipsHtml.push(`
      <div class="date-chip ${isAllActive ? 'active' : ''}" data-date="all">
        <div class="date-chip-header">
          <span class="date-chip-day">Summary</span>
          <span class="date-chip-count">${allTimeTotal ?? dailyCounts.reduce((acc, c) => acc + (c.totalBookings || 0), 0)} Total</span>
        </div>
        <div class="date-chip-date">All Dates</div>
        <div class="date-chip-pills">
          <span>Click to view all</span>
        </div>
      </div>
    `);

    dailyCounts.forEach(dc => {
      const isCardActive = selectedDate === dc.date;
      chipsHtml.push(`
        <div class="date-chip ${isCardActive ? 'active' : ''}" data-date="${dc.date}">
          <div class="date-chip-header">
            <span class="date-chip-day">${dc.dayName || ''}</span>
            <span class="date-chip-count">${dc.totalBookings} Bookings</span>
          </div>
          <div class="date-chip-date">${dc.dateFormatted || dc.date}</div>
          <div class="date-chip-pills">
            <span><span class="dot-mini in"></span> ${dc.checkedIn} In</span>
            <span><span class="dot-mini out"></span> ${dc.checkedOut} Out</span>
            ${dc.expired > 0 ? `<span><span class="dot-mini exp"></span> ${dc.expired} Exp</span>` : ''}
          </div>
        </div>
      `);
    });

    container.innerHTML = chipsHtml.join('');

    // Attach click listeners to date chips
    container.querySelectorAll('.date-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const dVal = chip.dataset.date;
        const dateInput = document.getElementById('history-filter-date');
        if (dateInput) {
          dateInput.value = dVal === 'all' ? '' : dVal;
        }
        fetchPastBookingHistory();
      });
    });
  }

  function renderHistoryTable(records) {
    const tableBody = document.getElementById('history-table-body');
    if (!tableBody) return;

    if (records.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="9" class="h-loading-cell">
            <i class="fa-regular fa-folder-open" style="font-size: 1.8rem; margin-bottom: 8px; display: block; opacity: 0.5;"></i>
            No seat bookings found for the selected date & time criteria.
          </td>
        </tr>
      `;
      return;
    }

    tableBody.innerHTML = records.map((r, idx) => {
      const statusKey = (r.status || 'RESERVED').toLowerCase();
      let badgeClass = 'reserved';
      let badgeLabel = 'Reserved';
      let badgeIcon = 'fa-regular fa-clock';

      if (statusKey === 'checked_in') {
        badgeClass = 'checked_in';
        badgeLabel = 'Checked In';
        badgeIcon = 'fa-solid fa-circle-check';
      } else if (statusKey === 'checked_out') {
        badgeClass = 'checked_out';
        badgeLabel = 'Checked Out';
        badgeIcon = 'fa-solid fa-right-from-bracket';
      } else if (statusKey === 'expired') {
        badgeClass = 'expired';
        badgeLabel = 'Expired';
        badgeIcon = 'fa-solid fa-circle-xmark';
      } else if (statusKey === 'cancelled') {
        badgeClass = 'cancelled';
        badgeLabel = 'Cancelled';
        badgeIcon = 'fa-solid fa-ban';
      }

      const initials = (r.studentName || 'Student').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();

      return `
        <tr>
          <td><span style="color: #94a3b8; font-weight: 600;">${idx + 1}</span></td>
          <td>
            <div style="font-weight: 700; color: #1e293b;">${r.dateFormatted || r.date}</div>
            <div style="font-size: 0.72rem; color: #64748b;">${r.dayName || ''}</div>
          </td>
          <td>
            <div class="h-time-cell">
              <span class="h-time-slot">${r.timeSlot}</span>
              <span class="h-time-sub">IST (${r.startTime24 || ''} - ${r.endTime24 || ''})</span>
            </div>
          </td>
          <td><span class="h-seat-badge">${r.seatCode}</span></td>
          <td><span style="font-size: 0.82rem; color: #475569;">${r.floor || 'Ground'} Floor</span></td>
          <td>
            <div class="h-student-cell">
              <div class="h-student-avatar">${initials}</div>
              <div class="h-student-info">
                <span class="h-student-name">${r.studentName}</span>
                <span class="h-student-roll">Roll: ${r.rollNumber} · ${r.className || ''}</span>
              </div>
            </div>
          </td>
          <td><span style="color: #10b981; font-weight: 600;">${r.checkInTime || '-'}</span></td>
          <td><span style="color: #3b82f6; font-weight: 600;">${r.checkOutTime || '-'}</span></td>
          <td>
            <span class="h-badge ${badgeClass}">
              <i class="${badgeIcon}"></i>
              ${badgeLabel}
            </span>
          </td>
        </tr>
      `;
    }).join('');
  }

  function formatDateNice(isoStr) {
    if (!isoStr || isoStr === 'all') return 'All Dates';
    try {
      const parts = isoStr.split('-');
      const d = new Date(parts[0], parts[1] - 1, parts[2]);
      return d.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch (_) {
      return isoStr;
    }
  }
}