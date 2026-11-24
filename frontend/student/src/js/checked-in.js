/* =====================================================================
   CONFIG — point these at your real backend endpoints.
   ===================================================================== */
const API_BASE = "/api"; // e.g. "https://your-domain.com/api"

const ENDPOINTS = {
  status: `${API_BASE}/attendance/status`, // GET  -> status object (see shape below)
  scan:   `${API_BASE}/attendance/scan`,   // POST -> { attendanceLog, message } after check-in
};

/* Expected shape of GET /attendance/status:
{
  "registrationStatus": "ACTIVE",
  "attendanceLog": 216,
  "totalHours": 300,
  "autoLogout": true,
  "studentIdVerified": true,
  "campus": "Shegaon Campus",
  "attendanceStatus": "VERIFIED",
  "verificationMessage": "Verification complete. Your physical presence at the central library is confirmed. You may now scan your QR to check in below."
}

Expected shape of POST /attendance/scan response:
{
  "attendanceLog": 217,
  "message": "Checked in at 10:42 AM"
}
*/

/* ---------------------------------------------------------------------
   DOM refs
   --------------------------------------------------------------------- */
const skeletonCard = document.getElementById('skeletonCard');
const errorCard    = document.getElementById('errorCard');
const content      = document.getElementById('content');
const retryBtn     = document.getElementById('retryBtn');

const els = {
  registrationStatus:  document.getElementById('registrationStatus'),
  attendanceLog:       document.getElementById('attendanceLog'),
  totalHours:          document.getElementById('totalHours'),
  autoLogout:          document.getElementById('autoLogout'),
  campusName:          document.getElementById('campusName'),
  attendanceStatus:    document.getElementById('attendanceStatus'),
  verificationMessage: document.getElementById('verificationMessage'),
};

const scanBtn = document.getElementById('scanBtn');
const toast   = document.getElementById('toast');

/* ---------------------------------------------------------------------
   Fetch helper
   --------------------------------------------------------------------- */
async function fetchJSON(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      // 'Authorization': `Bearer ${yourToken}`,   // add if your API needs auth
      ...(options.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

/* ---------------------------------------------------------------------
   Render
   --------------------------------------------------------------------- */
function renderStatus(data) {
  els.registrationStatus.textContent  = data.registrationStatus ?? '—';
  els.attendanceLog.textContent       = data.attendanceLog ?? '—';
  els.totalHours.textContent          = data.totalHours ?? '—';
  els.autoLogout.textContent          = data.autoLogout ? 'ENABLED' : 'DISABLED';
  els.campusName.textContent          = data.campus ?? '—';
  els.attendanceStatus.textContent    = data.attendanceStatus ?? '—';
  els.verificationMessage.textContent = data.verificationMessage ?? '';
}

/* ---------------------------------------------------------------------
   State switching
   --------------------------------------------------------------------- */
function showLoading() {
  skeletonCard.hidden = false;
  errorCard.hidden = true;
  content.hidden = true;
}

function showContent() {
  skeletonCard.hidden = true;
  errorCard.hidden = true;
  content.hidden = false;
}

function showError() {
  skeletonCard.hidden = true;
  errorCard.hidden = false;
  content.hidden = true;
}

/* ---------------------------------------------------------------------
   Load status from backend
   --------------------------------------------------------------------- */
async function loadStatus() {
  showLoading();
  try {
    const data = await fetchJSON(ENDPOINTS.status);
    renderStatus(data);
    showContent();
  } catch (err) {
    console.error('Failed to load attendance status:', err);
    showError();
  }
}

retryBtn.addEventListener('click', loadStatus);

/* ---------------------------------------------------------------------
   Check-in action
   --------------------------------------------------------------------- */
scanBtn.addEventListener('click', async () => {
  scanBtn.disabled = true;
  scanBtn.textContent = 'SCANNING…';
  toast.hidden = true;

  try {
    const result = await fetchJSON(ENDPOINTS.scan, { method: 'POST' });

    if (typeof result.attendanceLog !== 'undefined') {
      els.attendanceLog.textContent = result.attendanceLog;
    }

    toast.textContent = result.message ?? 'Checked in successfully.';
    toast.classList.remove('is-error');
    toast.hidden = false;

    scanBtn.textContent = 'CHECKED IN';
    setTimeout(() => {
      scanBtn.disabled = false;
      scanBtn.textContent = 'SCAN QR & CHECK-IN';
    }, 2500);

  } catch (err) {
    console.error('Check-in failed:', err);
    toast.textContent = 'Check-in is not possible.You are not in range.';
    toast.classList.add('is-error');
    toast.hidden = false;

    scanBtn.disabled = false;
    scanBtn.textContent = 'SCAN QR & CHECK-IN';
  }
});

/* ---------------------------------------------------------------------
   Bottom navigation
   --------------------------------------------------------------------- */
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('is-active'));
    tab.classList.add('is-active');
    console.log('Tab opened:', tab.dataset.tab);
  });
});

/* ---------------------------------------------------------------------
   Kick things off
   --------------------------------------------------------------------- */
loadStatus();