document.addEventListener('DOMContentLoaded', async () => {
  initLocalStudentProfile();
  await loadSidebar();
  initSimulatorToggle();
  await fetchCheckInData();
  startCheckInAutoSync(); // Continuous background polling so admin barcode check-in updates live!
  startLiveGpsTracking(); // Start real-time continuous GPS tracking
  startAdminGeofenceAutoSync(); // Continuous background polling so admin changes reflect without page refresh
  bindLogout();

  // Resume tracking and sync if user switches back to tab or device wakes up
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      if (!simulateInsideLibrary) {
        startLiveGpsTracking();
      }
      pollAdminGeofenceSettings();
      fetchCheckInData();
    }
  });

  window.addEventListener('beforeunload', () => {
    stopLiveGpsTracking();
    stopAdminGeofenceAutoSync();
    stopCheckInAutoSync();
  });
});

function escapeHTML(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

let countdownInterval = null;
let currentReservation = null;
let currentUserProfile = null;
let currentGeoStatus = null;
let simulateInsideLibrary = false; // Always defaults to Live Device GPS (NOT simulated)

// Library center coordinates and boundary (dynamically synced with admin settings)
let libraryLat = null;
let libraryLon = null;
let libraryRadius = 120.0;
let isGeofenceConfigured = false;

// Default fallback when GPS permission is denied or searching
const OUTSIDE_LAT = 20.7989000;
const OUTSIDE_LON = 76.7020000;

let userLat = OUTSIDE_LAT;
let userLon = OUTSIDE_LON;
let userAccuracy = null;
let hasReceivedRealGps = false;

// Watch and polling handles
let liveGpsWatchId = null;
let liveGpsHeartbeatTimer = null;
let adminGeofencePollTimer = null;
let lastServerSyncTimestamp = 0;
let checkInAutoSyncTimer = null;
let lastKnownReservationStatus = null;

function startCheckInAutoSync() {
  stopCheckInAutoSync();
  // Continuous background synchronization every 2.5 seconds so admin barcode scans reflect live!
  checkInAutoSyncTimer = setInterval(async () => {
    if (!document.hidden) {
      await fetchCheckInData();
    }
  }, 2500);
}

function stopCheckInAutoSync() {
  if (checkInAutoSyncTimer !== null) {
    clearInterval(checkInAutoSyncTimer);
    checkInAutoSyncTimer = null;
  }
}

function showLiveStatusNotification(title, message) {
  let toast = document.getElementById('live-checkin-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'live-checkin-toast';
    toast.style.cssText = `
      position: fixed;
      top: 24px;
      right: 24px;
      z-index: 99999;
      background: #064e3b;
      color: #ffffff;
      padding: 14px 20px;
      border-radius: 12px;
      box-shadow: 0 10px 25px rgba(0,0,0,0.25);
      border-left: 5px solid #10b981;
      font-family: inherit;
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 280px;
      max-width: 400px;
      animation: toastFadeIn 0.3s ease;
      transition: opacity 0.3s ease, transform 0.3s ease;
    `;
    const styleSheet = document.createElement('style');
    styleSheet.textContent = `@keyframes toastFadeIn { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }`;
    document.head.appendChild(styleSheet);
    document.body.appendChild(toast);
  }

  const safeTitle = typeof escapeHTML === 'function' ? escapeHTML(title) : title;
  const safeMsg = typeof escapeHTML === 'function' ? escapeHTML(message) : message;

  toast.innerHTML = `
    <div style="font-weight: 700; font-size: 14px; display: flex; align-items: center; gap: 8px;">
      <i class="fa-solid fa-bell" style="color: #34d399;"></i>
      <span>${safeTitle}</span>
    </div>
    <div style="font-size: 12.5px; color: #d1fae5; line-height: 1.4;">
      ${safeMsg}
    </div>
  `;
  toast.style.display = 'flex';
  toast.style.opacity = '1';

  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => { toast.style.display = 'none'; }, 300);
  }, 4500);
}

/**
 * Calculates high-precision distance between two GPS points using Haversine formula in meters
 */
function calculateHaversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Radius of Earth in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Synchronizes library geofence center, radius, and active status dynamically.
 * Returns true if any setting changed.
 */
function applyGeofenceSettings(geoData) {
  if (!geoData) return false;

  let changed = false;

  // Active / Configured status
  const configured = (geoData.configured !== undefined)
    ? Boolean(geoData.configured)
    : (geoData.isConfigured !== false && geoData.isActive !== false);

  if (isGeofenceConfigured !== configured) {
    isGeofenceConfigured = configured;
    changed = true;
  }

  // Latitude
  const newLat = (geoData.library_lat !== undefined && geoData.library_lat !== null)
    ? geoData.library_lat
    : (geoData.latitude !== undefined ? geoData.latitude : null);

  if (newLat !== null && newLat !== undefined && !isNaN(parseFloat(newLat))) {
    const parsedLat = parseFloat(newLat);
    if (libraryLat !== parsedLat) {
      libraryLat = parsedLat;
      changed = true;
    }
  } else if (!configured) {
    if (libraryLat !== null) {
      libraryLat = null;
      changed = true;
    }
  }

  // Longitude
  const newLon = (geoData.library_lon !== undefined && geoData.library_lon !== null)
    ? geoData.library_lon
    : (geoData.longitude !== undefined ? geoData.longitude : null);

  if (newLon !== null && newLon !== undefined && !isNaN(parseFloat(newLon))) {
    const parsedLon = parseFloat(newLon);
    if (libraryLon !== parsedLon) {
      libraryLon = parsedLon;
      changed = true;
    }
  } else if (!configured) {
    if (libraryLon !== null) {
      libraryLon = null;
      changed = true;
    }
  }

  // Radius limit
  const newRad = (geoData.boundary_limit_meters !== undefined && geoData.boundary_limit_meters !== null)
    ? geoData.boundary_limit_meters
    : (geoData.radiusMeters !== undefined ? geoData.radiusMeters : geoData.radius);

  if (newRad !== null && newRad !== undefined && !isNaN(parseFloat(newRad))) {
    const parsedRad = parseFloat(newRad);
    if (libraryRadius !== parsedRad) {
      libraryRadius = parsedRad;
      changed = true;
    }
  }

  // If simulator is active, keep it pinned to current library center
  if (simulateInsideLibrary && libraryLat !== null && libraryLon !== null) {
    userLat = libraryLat;
    userLon = libraryLon;
  }

  return changed;
}

/**
 * Periodically fetches latest geofence settings from admin API in the background.
 * Updates boundary limit and center coordinates live without requiring page refresh!
 */
async function pollAdminGeofenceSettings() {
  try {
    const apiBase = typeof getApiBase === 'function' ? getApiBase() : '';
    const res = await fetch(`${apiBase}/api/admin/geofence-settings`);
    if (res.ok) {
      const data = await res.json();
      const changed = applyGeofenceSettings(data);
      if (changed) {
        updateLiveDistanceInstant();
      }
    }
  } catch (err) {
    // Silent background poll
  }
}

function startAdminGeofenceAutoSync() {
  stopAdminGeofenceAutoSync();
  // Poll every 2.5 seconds to guarantee immediate boundary/coordinate sync
  adminGeofencePollTimer = setInterval(pollAdminGeofenceSettings, 2500);
}

function stopAdminGeofenceAutoSync() {
  if (adminGeofencePollTimer !== null) {
    clearInterval(adminGeofencePollTimer);
    adminGeofencePollTimer = null;
  }
}

async function loadSidebar() {
  const placeholder = document.getElementById('sidebar-placeholder');
  const updateActive = (root) => {
    if (!root) return;
    const navItems = root.querySelectorAll('.nav-item');
    navItems.forEach(item => {
      const href = item.getAttribute('href');
      if (href && (href.includes('check-in.html') || href.includes('attendance'))) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });
  };

  if (placeholder) {
    updateActive(placeholder);
  }

  try {
    const res = await fetch('sidebar.html');
    if (!res.ok) return;
    const html = await res.text();
    if (placeholder) {
      placeholder.innerHTML = html;
      updateActive(placeholder);
    }
  } catch (err) {
    // Graceful fallback to pre-rendered HTML
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

function initSimulatorToggle() {
  const simBtn = document.getElementById('btn-toggle-sim');
  const simText = document.getElementById('sim-btn-text');
  if (!simBtn) return;

  // Initial state on page open / refresh: Live Device GPS (NOT simulated)
  simulateInsideLibrary = false;
  simBtn.classList.remove('active');
  simText.textContent = "Simulate Inside Library";
  updateGpsSignalDisplay("USING LIVE GPS", 40, "#3b82f6");

  simBtn.addEventListener('click', () => {
    simulateInsideLibrary = !simulateInsideLibrary;
    if (simulateInsideLibrary) {
      stopLiveGpsTracking();
      simBtn.classList.add('active');
      simText.textContent = "Simulating: Inside Library (Active)";
      if (libraryLat !== null && libraryLon !== null) {
        userLat = libraryLat;
        userLon = libraryLon;
      }
      updateGpsSignalDisplay("ACCURATE (Simulated)", 95, "#10b981");
      updateLiveDistanceInstant();
      syncGeofenceWithBackend();
    } else {
      simBtn.classList.remove('active');
      simText.textContent = "Simulate Inside Library";
      updateGpsSignalDisplay("USING LIVE GPS", 40, "#3b82f6");
      startLiveGpsTracking();
    }
  });
}

/**
 * Continuous real-time GPS tracking using navigator.geolocation.watchPosition
 * Updates coordinates and recalculated distance live as the user moves.
 */
function startLiveGpsTracking() {
  if (simulateInsideLibrary) return;

  if (!navigator.geolocation) {
    console.warn("Geolocation is not supported by your browser.");
    updateGpsSignalDisplay("GPS NOT SUPPORTED", 20, "#ef4444");
    userLat = OUTSIDE_LAT;
    userLon = OUTSIDE_LON;
    updateLiveDistanceInstant();
    return;
  }

  stopLiveGpsTracking();

  updateGpsSignalDisplay("TRACKING LIVE GPS...", 45, "#3b82f6");

  const geoOptions = {
    enableHighAccuracy: true,
    timeout: 10000,
    maximumAge: 1000
  };

  // 1. Immediate initial reading
  navigator.geolocation.getCurrentPosition(
    (pos) => onGpsLocationUpdate(pos),
    (err) => onGpsLocationError(err),
    geoOptions
  );

  // 2. Continuous real-time position watcher (fires as device moves)
  try {
    liveGpsWatchId = navigator.geolocation.watchPosition(
      (pos) => onGpsLocationUpdate(pos),
      (err) => onGpsLocationError(err),
      geoOptions
    );
  } catch (e) {
    console.warn("watchPosition error, fallback to heartbeat polling:", e);
  }

  // 3. Heartbeat polling (every 2.5s) to guarantee real-time updates across various mobile browsers
  liveGpsHeartbeatTimer = setInterval(() => {
    if (!simulateInsideLibrary && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => onGpsLocationUpdate(pos),
        () => {},
        { enableHighAccuracy: true, timeout: 6000, maximumAge: 1000 }
      );
    }
  }, 2500);
}

function stopLiveGpsTracking() {
  if (liveGpsWatchId !== null) {
    try {
      navigator.geolocation.clearWatch(liveGpsWatchId);
    } catch (_) {}
    liveGpsWatchId = null;
  }
  if (liveGpsHeartbeatTimer !== null) {
    clearInterval(liveGpsHeartbeatTimer);
    liveGpsHeartbeatTimer = null;
  }
}

function onGpsLocationUpdate(pos) {
  if (simulateInsideLibrary) return;
  if (!pos || !pos.coords) return;

  userLat = pos.coords.latitude;
  userLon = pos.coords.longitude;
  hasReceivedRealGps = true;
  userAccuracy = pos.coords.accuracy ? Math.round(pos.coords.accuracy) : null;

  const acc = userAccuracy || 10;
  const isGood = acc < 60;
  updateGpsSignalDisplay(`±${acc}m (${isGood ? 'LIVE GPS' : 'LOW ACCURACY'})`, isGood ? 90 : 50, isGood ? "#10b981" : "#f59e0b");

  // Instantly compute and re-render distance with zero delay
  updateLiveDistanceInstant();

  // Sync with backend API (throttled to every 3.5 seconds)
  const now = Date.now();
  if (now - lastServerSyncTimestamp > 3500) {
    lastServerSyncTimestamp = now;
    syncGeofenceWithBackend();
  }
}

function onGpsLocationError(err) {
  if (simulateInsideLibrary) return;
  console.warn("Real GPS access message:", err.message);

  if (!hasReceivedRealGps) {
    updateGpsSignalDisplay("GPS SEARCHING / DENIED", 25, "#ef4444");
    updateLiveDistanceInstant();
  }
}

function updateGpsSignalDisplay(text, percent, color) {
  const signalText = document.getElementById('signal-text');
  const signalBar = document.getElementById('signal-bar');
  if (signalText) signalText.textContent = text;
  if (signalBar) {
    signalBar.style.width = `${percent}%`;
    signalBar.style.backgroundColor = color || '#facc15';
  }
}

/**
 * Instantly computes relative distance and updates the UI without waiting for network response.
 * Uses exact synchronized library coordinates.
 */
function updateLiveDistanceInstant() {
  if (!isGeofenceConfigured || libraryLat === null || libraryLon === null) {
    currentGeoStatus = {
      configured: false,
      inside: false,
      relative_distance_meters: 0,
      boundary_limit_meters: libraryRadius,
      library_lat: null,
      library_lon: null,
      user_lat: userLat,
      user_lon: userLon
    };
    renderUIState();
    return;
  }

  let dist = 0;
  let inside = false;

  if (simulateInsideLibrary) {
    userLat = libraryLat;
    userLon = libraryLon;
    dist = 8.0;
    inside = true;
  } else {
    dist = calculateHaversineMeters(userLat, userLon, libraryLat, libraryLon);
    inside = dist <= libraryRadius;
  }

  currentGeoStatus = {
    configured: true,
    inside: inside,
    relative_distance_meters: dist,
    boundary_limit_meters: libraryRadius,
    library_lat: libraryLat,
    library_lon: libraryLon,
    user_lat: userLat,
    user_lon: userLon,
    accuracy_meters: userAccuracy
  };

  renderUIState();
}

/**
 * Periodically verifies with backend geofence validator to keep server session in sync.
 * Also synchronizes latest library coordinates and boundary returned from backend!
 */
async function syncGeofenceWithBackend() {
  const apiBase = typeof getApiBase === 'function' ? getApiBase() : '';

  try {
    const res = await fetch(`${apiBase}/api/student/validate-geofence`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ latitude: userLat, longitude: userLon })
    });

    if (res.ok) {
      const data = await res.json();
      applyGeofenceSettings(data);
      currentGeoStatus = data;
      renderUIState();
    }
  } catch (e) {
    // If backend is momentarily unreachable, the instant local Haversine computation keeps running smoothly
  }
}

async function fetchCheckInData() {
  try {
    const apiBase = typeof getApiBase === 'function' ? getApiBase() : '';
    const urlParams = new URLSearchParams(window.location.search);
    const bookingId = urlParams.get('bookingId') || urlParams.get('booking_id') || '';

    // Fetch initial geofence setting from admin
    try {
      const geoRes = await fetch(`${apiBase}/api/admin/geofence-settings`);
      if (geoRes.ok) {
        const geoData = await geoRes.json();
        applyGeofenceSettings(geoData);
      }
    } catch (_) {}

    const token = localStorage.getItem('access_token') || sessionStorage.getItem('access_token');
    const headers = { 'Accept': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    let queryStr = bookingId ? `?booking_id=${encodeURIComponent(bookingId)}` : '';
    const rawUser = localStorage.getItem('user_info') || localStorage.getItem('student_info');
    if (rawUser) {
      try {
        const u = JSON.parse(rawUser);
        if (u.id) headers['X-User-Id'] = u.id;
        if (u.email) headers['X-User-Email'] = u.email;
        const uid = u.id || u.user_id || u.rollNumber || u.roll_number;
        if (uid) {
          queryStr += (queryStr ? '&' : '?') + `user_id=${encodeURIComponent(uid)}`;
        }
      } catch (_) {}
    }

    const res = await fetch(`${apiBase}/api/student/active-checkin${queryStr}`, {
      headers,
      credentials: 'include'
    });
    if (!res.ok) throw new Error('Failed to retrieve active checkin');
    const data = await res.json();

    if (data && data.geofence) {
      applyGeofenceSettings(data.geofence);
    }

    populateStudentData(data);
  } catch (err) {
    console.warn('Backend endpoint unavailable:', err);
    populateStudentData(null);
  }
}

function initLocalStudentProfile() {
  try {
    const rawUser = localStorage.getItem('user_info') || localStorage.getItem('student_info');
    if (rawUser) {
      const u = JSON.parse(rawUser);
      currentUserProfile = u;
      const nameStr = u.name || u.full_name || u.student_name || 'Student';
      const roll = u.roll_number || u.rollNumber || u.libraryCardNumber || '-';
      const deptStr = `${u.department || 'Student'} • ${u.class_name || u.role || 'Library Member'}`.trim();

      const headerName = document.getElementById('student-name');
      if (headerName) headerName.textContent = nameStr;
      const headerRole = document.getElementById('student-role');
      if (headerRole) headerRole.textContent = u.role || 'Student';

      const cardName = document.getElementById('card-student-name');
      if (cardName) cardName.textContent = nameStr;

      const cardDept = document.getElementById('card-student-dept');
      if (cardDept) cardDept.innerHTML = `<i class="fa-solid fa-graduation-cap"></i> ${escapeHTML(deptStr)}`;

      const rollEl = document.getElementById('metric-roll-no');
      if (rollEl) rollEl.textContent = roll;

      const cardAvatar = document.getElementById('card-student-avatar');
      if (cardAvatar) {
        if (u.avatar_url || u.avatarUrl) {
          cardAvatar.innerHTML = `<img src="${u.avatar_url || u.avatarUrl}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;" alt="Avatar">`;
        } else {
          const parts = nameStr.trim().split(/\s+/).filter(Boolean);
          const initials = parts.length > 1 ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase() : nameStr.slice(0, 2).toUpperCase();
          cardAvatar.textContent = initials;
        }
      }
    }
  } catch (_) {}

  // Immediately render clear/empty state before backend response
  currentReservation = null;
  renderUIState();
}

function populateStudentData(data) {
  if (data && data.user) {
    const u = data.user;
    currentUserProfile = u;
    const nameStr = u.name || 'Student';
    const roll = u.rollNumber || u.libraryCardNumber || '-';
    const deptStr = `${u.department || 'Student'} • ${u.role || 'Member'}`.trim();

    // Header Profile
    const headerName = document.getElementById('student-name');
    if (headerName) headerName.textContent = nameStr;
    const headerRole = document.getElementById('student-role');
    if (headerRole) headerRole.textContent = u.role || 'Student';

    if (u.avatarUrl) {
      const img = document.getElementById('student-avatar');
      if (img) {
        img.src = u.avatarUrl;
        img.style.display = 'block';
      }
      const fallback = document.getElementById('avatar-fallback');
      if (fallback) fallback.style.display = 'none';
    }

    // Main Card Student Profile (Prominent display of current student)
    const cardName = document.getElementById('card-student-name');
    if (cardName) cardName.textContent = nameStr;

    const cardDept = document.getElementById('card-student-dept');
    if (cardDept) cardDept.innerHTML = `<i class="fa-solid fa-graduation-cap"></i> ${escapeHTML(deptStr)}`;

    const rollEl = document.getElementById('metric-roll-no');
    if (rollEl) rollEl.textContent = roll;

    const cardAvatar = document.getElementById('card-student-avatar');
    if (cardAvatar) {
      if (u.avatarUrl) {
        cardAvatar.innerHTML = `<img src="${u.avatarUrl}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;" alt="Avatar">`;
      } else {
        const parts = nameStr.trim().split(/\s+/).filter(Boolean);
        const initials = parts.length > 1 ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase() : nameStr.slice(0, 2).toUpperCase();
        cardAvatar.textContent = initials;
      }
    }
  }

  const newReservation = data ? data.reservation : null;
  const newStatus = newReservation ? newReservation.status : null;

  if (lastKnownReservationStatus === 'RESERVED' && newStatus === 'CHECKED_IN') {
    playBeep('checkin');
    showLiveStatusNotification('Attendance Recorded! ✅', `Admin verified your barcode. Seat ${newReservation.seatLabel || newReservation.seatId} is now active.`);
  } else if (lastKnownReservationStatus === 'CHECKED_IN' && (!newStatus || newStatus === 'CHECKED_OUT' || newStatus === 'CANCELLED')) {
    playBeep('checkout');
    showLiveStatusNotification('Check-Out Recorded 👋', 'Seat released successfully. Thank you for visiting!');
  }

  lastKnownReservationStatus = newStatus;
  currentReservation = newReservation;
  updateLiveDistanceInstant();
  renderUIState(); // Ensure UI state (No Seat Booked vs Active Seat) updates immediately!
}

/**
 * Renders the state of the UI based on real-time distance and reservation state
 */
function renderUIState() {
  clearInterval(countdownInterval);

  const geoCard = document.getElementById('geofence-card');
  const radarWrapper = document.getElementById('radar-wrapper');
  const verifiedCard = document.getElementById('verified-card');
  const distEl = document.getElementById('metric-distance');
  const boundEl = document.getElementById('metric-boundary');
  const headlineEl = document.getElementById('geo-card-headline');
  const statusPill = document.getElementById('geo-status-pill');
  const verifiedTitle = document.getElementById('verified-title');
  const verifiedDesc = document.getElementById('verified-desc');
  const mainBtn = document.getElementById('btn-main-action');
  const seatLabel = document.getElementById('seat-label');
  const floorName = document.getElementById('floor-name');
  const slotTime = document.getElementById('slot-time');
  const timerBadge = document.getElementById('slot-timer-badge');
  const noBookingBox = document.getElementById('no-booking-box');
  const studentCoordsEl = document.getElementById('student-coords');
  const centerCoordsEl = document.getElementById('center-coords');

  const dist = currentGeoStatus ? currentGeoStatus.relative_distance_meters : 0;
  const bound = isGeofenceConfigured ? libraryRadius : 0;
  const isInside = (isGeofenceConfigured && currentGeoStatus) ? currentGeoStatus.inside : false;

  // Update Live Real-Time Coordinates Matching Display
  if (studentCoordsEl) {
    if (simulateInsideLibrary) {
      studentCoordsEl.textContent = (libraryLat !== null && libraryLon !== null)
        ? `${libraryLat.toFixed(5)}, ${libraryLon.toFixed(5)} (Sim)`
        : 'Simulated';
    } else if (hasReceivedRealGps && userLat && userLon) {
      studentCoordsEl.textContent = `${userLat.toFixed(5)}, ${userLon.toFixed(5)}`;
    } else {
      studentCoordsEl.textContent = "Detecting GPS...";
    }
  }

  if (centerCoordsEl) {
    if (isGeofenceConfigured && libraryLat !== null && libraryLon !== null) {
      centerCoordsEl.textContent = `${libraryLat.toFixed(5)}, ${libraryLon.toFixed(5)}`;
    } else {
      centerCoordsEl.textContent = "Not Set";
    }
  }

  // Update Metric Columns dynamically
  if (isGeofenceConfigured && (hasReceivedRealGps || simulateInsideLibrary)) {
    distEl.textContent = `${Math.round(dist)}m`;
  } else if (!isGeofenceConfigured) {
    distEl.textContent = "—";
  } else {
    distEl.textContent = "Locating...";
  }

  boundEl.textContent = isGeofenceConfigured ? `${Math.round(bound)}m` : "—";

  const activeDetails = document.getElementById('seat-active-details');
  const noneDetails = document.getElementById('seat-none-details');
  const sessionIndicator = document.getElementById('seat-session-indicator');
  const sessionText = document.getElementById('seat-session-text');
  const shieldIcon = document.getElementById('geo-shield-icon');
  const cancelBtn = document.getElementById('btn-cancel-reservation');

  // ==========================================
  // CASE 1: NO ACTIVE RESERVATION
  // ==========================================
  if (!currentReservation) {
    if (activeDetails) activeDetails.style.display = 'none';
    if (noneDetails) noneDetails.style.display = 'block';

    geoCard.className = "geofence-card nobooking";
    if (radarWrapper) radarWrapper.className = "radar-wrapper nobooking";
    if (verifiedCard) verifiedCard.className = "verified-card nobooking";

    if (headlineEl) headlineEl.textContent = "SESSION STATUS:";
    if (statusPill) {
      statusPill.textContent = "NO SEAT BOOKED";
      statusPill.style.background = "rgba(255,255,255,0.18)";
      statusPill.style.borderColor = "rgba(255,255,255,0.25)";
    }

    if (shieldIcon) {
      shieldIcon.innerHTML = '<i class="fa-solid fa-info"></i>';
      shieldIcon.style.backgroundColor = '#64748b';
    }

    if (verifiedTitle) verifiedTitle.textContent = "SEAT RESERVATION REQUIRED";
    if (verifiedDesc) verifiedDesc.textContent = "You do not have a seat booked right now. Please select an available desk from the Seat Map to proceed.";

    if (seatLabel) seatLabel.textContent = "No Seat Booked";
    if (floorName) floorName.textContent = "Please book from Seat Map";
    if (slotTime) slotTime.textContent = "No Active Slot";
    if (timerBadge) timerBadge.className = "timer-badge-slot";

    if (mainBtn) {
      mainBtn.disabled = false;
      mainBtn.className = "btn-action-main";
      mainBtn.innerHTML = `<i class="fa-solid fa-chair"></i> <span>BOOK A SEAT ON SEAT MAP</span>`;
      mainBtn.onclick = () => { window.location.href = 'book-seat.html'; };
    }

    if (cancelBtn) cancelBtn.style.display = 'none';
    if (noBookingBox) noBookingBox.style.display = 'none';
    return;
  }

  // Active Reservation Exists
  if (activeDetails) activeDetails.style.display = 'block';
  if (noneDetails) noneDetails.style.display = 'none';
  if (noBookingBox) noBookingBox.style.display = 'none';

  const r = currentReservation;
  const currentSeat = r.seatLabel || r.seatId || '-';
  if (seatLabel) seatLabel.textContent = `Seat ${currentSeat}`;
  if (floorName) floorName.textContent = r.floorName || 'Ground Floor';
  const formattedStart = typeof formatStartTime === 'function' ? formatStartTime(r.startTime) : (r.timeSlot || 'Current Slot');

  // ==========================================
  // CASE 2: ALREADY CHECKED IN -> CHECKOUT OPTION
  // ==========================================
  if (r.status === 'CHECKED_IN') {
    geoCard.className = "geofence-card checked-in";
    if (radarWrapper) radarWrapper.className = "radar-wrapper";
    if (verifiedCard) verifiedCard.className = "verified-card";

    if (headlineEl) headlineEl.textContent = "ATTENDANCE STATUS:";
    if (statusPill) {
      statusPill.textContent = "CHECKED-IN • PRESENT";
      statusPill.style.background = "rgba(16, 185, 129, 0.4)";
      statusPill.style.borderColor = "rgba(52, 211, 153, 0.8)";
    }

    if (shieldIcon) {
      shieldIcon.innerHTML = '<i class="fa-solid fa-check"></i>';
      shieldIcon.style.backgroundColor = '#10b981';
    }

    if (sessionIndicator && sessionText) {
      sessionIndicator.style.background = "rgba(16, 185, 129, 0.35)";
      sessionIndicator.style.borderColor = "rgba(52, 211, 153, 0.7)";
      sessionText.innerHTML = `<span style="color:#a7f3d0;">In-Use • Active Study Session</span>`;
    }

    if (timerBadge) timerBadge.className = "timer-badge-slot";
    if (slotTime) slotTime.innerHTML = `<i class="fa-solid fa-circle-check" style="color:#10b981;"></i> ${formattedStart}`;

    const verifiedCheckBadge = document.getElementById('verified-check-badge');
    if (verifiedCheckBadge) {
      verifiedCheckBadge.innerHTML = '<i class="fa-solid fa-check"></i>';
      verifiedCheckBadge.style.color = '#10b981';
      verifiedCheckBadge.style.borderColor = '#10b981';
    }

    if (verifiedTitle) verifiedTitle.textContent = "ATTENDANCE ACTIVE: SEAT OCCUPIED";
    if (verifiedDesc) verifiedDesc.textContent = `Seat ${currentSeat} is currently assigned to you. When leaving the library, present your ID at the exit scanner to check out and release the seat.`;

    if (mainBtn) {
      mainBtn.disabled = false;
      mainBtn.className = "btn-action-main btn-checkout-active";
      mainBtn.innerHTML = `<i class="fa-solid fa-arrow-right-from-bracket"></i> <span>CHECK-OUT & RELEASE SEAT</span>`;
      mainBtn.onclick = () => submitBarcodeScanAction();
    }

    if (cancelBtn) cancelBtn.style.display = 'none';
    return;
  }

  // ==========================================
  // CASE 3: RESERVED SEAT -> PENDING CHECK-IN
  // ==========================================
  geoCard.className = "geofence-card";
  if (radarWrapper) radarWrapper.className = "radar-wrapper";
  if (verifiedCard) verifiedCard.className = "verified-card";

  if (headlineEl) headlineEl.textContent = "RESERVATION STATUS:";
  if (statusPill) {
    statusPill.textContent = "SEAT RESERVED • PENDING SCAN";
    statusPill.style.background = "rgba(59, 130, 246, 0.35)";
    statusPill.style.borderColor = "rgba(147, 197, 253, 0.7)";
  }

  if (shieldIcon) {
    shieldIcon.innerHTML = '<i class="fa-solid fa-clock"></i>';
    shieldIcon.style.backgroundColor = '#2563eb';
  }

  if (sessionIndicator && sessionText) {
    sessionIndicator.style.background = "rgba(59, 130, 246, 0.25)";
    sessionIndicator.style.borderColor = "rgba(147, 197, 253, 0.5)";
    sessionText.textContent = "Reserved • Ready for Check-In";
  }

  if (timerBadge) timerBadge.className = "timer-badge-slot countdown-active";

  // 15-minute Check-In Countdown Window
  const deadlineMs = r.checkInDeadline ? new Date(r.checkInDeadline).getTime() : (new Date(r.startTime).getTime() + 15 * 60 * 1000);

  function updateCheckinCountdown() {
    const diff = deadlineMs - Date.now();
    if (diff <= 0) {
      clearInterval(countdownInterval);
      if (slotTime) slotTime.innerHTML = `<span style="color:#ef4444;"><i class="fa-solid fa-triangle-exclamation"></i> Window Expired</span>`;
      if (statusPill) {
        statusPill.textContent = "CHECK-IN WINDOW EXPIRED";
        statusPill.style.background = "rgba(239, 68, 68, 0.35)";
      }
      if (verifiedTitle) verifiedTitle.textContent = "15-MINUTE WINDOW EXPIRED";
      if (verifiedDesc) verifiedDesc.textContent = "The 15-minute check-in deadline has expired. This reservation has been cancelled.";
      if (mainBtn) {
        mainBtn.disabled = true;
        mainBtn.className = "btn-action-main";
        mainBtn.innerHTML = `<i class="fa-solid fa-ban"></i> <span>CHECK-IN WINDOW EXPIRED</span>`;
      }
      return;
    }

    const mins = Math.floor(diff / 60000);
    const secs = Math.floor((diff % 60000) / 1000);
    const pad = (n) => n < 10 ? '0' + n : n;
    if (slotTime) slotTime.innerHTML = `<i class="fa-solid fa-stopwatch" style="color:#facc15;"></i> ${pad(mins)}:${pad(secs)} Remaining`;
  }

  updateCheckinCountdown();
  countdownInterval = setInterval(updateCheckinCountdown, 1000);

  if (verifiedTitle) verifiedTitle.textContent = "SEAT RESERVED • ENTRANCE SCAN READY";
  if (verifiedDesc) verifiedDesc.textContent = `Your seat ${currentSeat} is reserved. Show your College ID barcode at the entrance scanner to check in.`;

  if (mainBtn) {
    mainBtn.disabled = false;
    mainBtn.className = "btn-action-main";
    mainBtn.innerHTML = `<i class="fa-solid fa-circle-check"></i> <span>CONFIRM CHECK-IN TO SEAT ${escapeHTML(currentSeat)}</span>`;
    mainBtn.onclick = () => submitBarcodeScanAction();
  }

  const verifiedCheckBadge = document.getElementById('verified-check-badge');
  if (verifiedCheckBadge) {
    verifiedCheckBadge.innerHTML = '<i class="fa-solid fa-check"></i>';
    verifiedCheckBadge.style.color = '#2563eb';
    verifiedCheckBadge.style.borderColor = '#2563eb';
  }

  if (cancelBtn) {
    cancelBtn.style.display = 'flex';
    cancelBtn.disabled = false;
    cancelBtn.innerHTML = `<i class="fa-solid fa-ban"></i> <span>Cancel Seat Reservation</span>`;
    cancelBtn.onclick = () => submitCancelBooking(r.id, currentSeat);
  }
}

let audioCtx = null;
function playBeep(type = 'checkin') {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    if (type === 'checkin') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.setValueAtTime(1174.66, now + 0.1);
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
      osc.start(now);
      osc.stop(now + 0.25);
    } else if (type === 'checkout') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(659.25, now);
      osc.frequency.setValueAtTime(523.25, now + 0.12);
      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
      osc.start(now);
      osc.stop(now + 0.3);
    } else {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, now);
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
      osc.start(now);
      osc.stop(now + 0.2);
    }
  } catch (e) {}
}

async function submitBarcodeScanAction() {
  let roll = (currentUserProfile && (currentUserProfile.rollNumber || currentUserProfile.libraryCardNumber));
  if (!roll) {
    try {
      const u = JSON.parse(localStorage.getItem('user_info') || '{}');
      roll = u.roll_number || u.rollNumber || u.library_card_number || u.libraryCardNumber || u.roll;
    } catch (_) {}
  }
  if (!roll) roll = '';
  const btn = document.getElementById('btn-main-action');
  const prevHtml = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> <span>SCANNING BARCODE & RECORDING...</span>`;
  }

  try {
    const apiBase = typeof getApiBase === 'function' ? getApiBase() : '';
    const res = await fetch(`${apiBase}/api/student/scan-barcode`, {
      method: 'POST',
      headers: typeof getAuthHeaders === 'function' ? getAuthHeaders({ 'Content-Type': 'application/json' }) : { 'Content-Type': 'application/json' },
      body: JSON.stringify({ barcode: roll })
    });

    const data = await res.json();
    if (!res.ok) {
      playBeep('error');
      throw new Error(data.detail || 'Barcode scan failed');
    }

    const isCheckout = data.action === 'CHECKED_OUT';
    playBeep(isCheckout ? 'checkout' : 'checkin');

    alert(`✅ ${data.message || (isCheckout ? 'Checked out successfully!' : 'Checked in successfully!')}`);
    await fetchCheckInData();
  } catch (err) {
    alert(err.message || 'Scan failed');
    if (btn) {
      btn.innerHTML = prevHtml;
      btn.disabled = false;
    }
  }
}

async function submitCheckIn(reservationId) {
  const btn = document.getElementById('btn-main-action');
  btn.disabled = true;
  btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> <span>CHECKING IN & RECORDING ATTENDANCE...</span>`;


  try {
    const apiBase = typeof getApiBase === 'function' ? getApiBase() : '';
    const authHeaders = typeof getAuthHeaders === 'function' ? getAuthHeaders({ 'Content-Type': 'application/json' }) : { 'Content-Type': 'application/json' };
    const res = await fetch(`${apiBase}/api/student/checkin`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        reservationId: reservationId,
        latitude: userLat,
        longitude: userLon
      })
    });

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      const errMsg = (data && data.detail) || 'Check-in failed';
      throw new Error(errMsg);
    }

    btn.innerHTML = `<i class="fa-solid fa-circle-check"></i> <span>CHECKED IN SUCCESSFULLY!</span>`;
    btn.style.backgroundColor = '#059669';

    // Immediately reload data to transition to Checked-In & Checkout UI
    setTimeout(async () => {
      await fetchCheckInData();
    }, 800);
  } catch (err) {
    alert(err.message || 'Check-in failed');
    btn.disabled = false;
    btn.innerHTML = `<i class="fa-solid fa-circle-check"></i> <span>CHECK-IN AT LIBRARY</span>`;
  }
}

async function submitCheckOut(reservationId, seatName) {
  if (!confirm(`Are you sure you want to check out from Seat ${seatName || ''}? This will record your checkout time in attendance logs and release the seat so others can book it.`)) {
    return;
  }

  const btn = document.getElementById('btn-main-action');
  btn.disabled = true;
  btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> <span>CHECKING OUT...</span>`;

  try {
    const apiBase = typeof getApiBase === 'function' ? getApiBase() : '';
    const authHeaders = typeof getAuthHeaders === 'function' ? getAuthHeaders({ 'Content-Type': 'application/json' }) : { 'Content-Type': 'application/json' };
    const res = await fetch(`${apiBase}/api/student/checkout`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        reservationId: reservationId,
        latitude: userLat,
        longitude: userLon
      })
    });

    const data = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error((data && data.detail) || 'Checkout failed');
    }

    btn.innerHTML = `<i class="fa-solid fa-circle-check"></i> <span>CHECKED OUT & SEAT RELEASED!</span>`;
    btn.style.backgroundColor = '#dc2626';

    alert(`Checked out successfully from Seat ${seatName || ''}! Attendance updated and seat is now free for others.`);

    setTimeout(() => {
      window.location.href = 'book-seat.html';
    }, 1000);
  } catch (err) {
    alert(err.message || 'Checkout failed');
    btn.disabled = false;
    btn.innerHTML = `<i class="fa-solid fa-arrow-right-from-bracket"></i> <span>CHECK-OUT & RELEASE SEAT</span>`;
  }
}

async function submitCancelBooking(reservationId, seatName) {
  if (!confirm(`Are you sure you want to cancel your reservation for Seat ${seatName || ''}? This will immediately release the seat so other students can book it.`)) {
    return;
  }

  const cancelBtn = document.getElementById('btn-cancel-reservation');
  if (cancelBtn) {
    cancelBtn.disabled = true;
    cancelBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> <span>CANCELLING...</span>`;
  }

  try {
    const apiBase = typeof getApiBase === 'function' ? getApiBase() : '';
    const authHeaders = typeof getAuthHeaders === 'function' ? getAuthHeaders({ 'Content-Type': 'application/json' }) : { 'Content-Type': 'application/json' };
    const res = await fetch(`${apiBase}/api/student/cancel`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ reservationId })
    });

    const data = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error((data && data.detail) || 'Cancellation failed');
    }

    alert(`Reservation for Seat ${seatName || ''} cancelled successfully! The seat is now released.`);
    window.location.href = 'book-seat.html';
  } catch (err) {
    alert(err.message || 'Failed to cancel reservation');
    if (cancelBtn) {
      cancelBtn.disabled = false;
      cancelBtn.innerHTML = `<i class="fa-solid fa-ban"></i> <span>Cancel Seat Reservation</span>`;
    }
  }
}

function formatStartTime(isoStr) {
  if (!isoStr) return 'Active Slot';
  try {
    const d = new Date(isoStr);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch (_) {
    return isoStr;
  }
}