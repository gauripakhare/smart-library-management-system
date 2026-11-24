/**
 * Library Barcode Attendance Scanner Controller
 * Supports:
 * 1. Hardware USB Barcode Scanner (auto-captures keystrokes & Enter)
 * 2. Device Webcam Barcode Scanner (via BarcodeDetector API)
 * 3. Manual Entry Fallback
 * 4. Synthesized Audio Beeps for Check-In and Check-Out
 */

document.addEventListener('DOMContentLoaded', () => {
  startLiveClock();
  initBarcodeScanner();
  loadTodayAttendanceLogs();
  initQuickTestButtons();
  initCameraScanner();
});

function startLiveClock() {
  const clockEl = document.getElementById('live-clock-time');
  if (!clockEl) return;
  function update() {
    const now = new Date();
    const t12 = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
    const t24 = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    clockEl.textContent = `${t12} (${t24})`;
  }
  update();
  setInterval(update, 1000);
}

let audioCtx = null;

// Synthesize pleasant Audio Beeps using Web Audio API (Zero external audio files needed)
function playBeep(type = 'checkin') {
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }

    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    if (type === 'checkin') {
      // Cheerful high-pitch double beep
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now); // A5
      osc.frequency.setValueAtTime(1174.66, now + 0.1); // D6
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
      osc.start(now);
      osc.stop(now + 0.25);
    } else if (type === 'checkout') {
      // Warm descending chime
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(659.25, now); // E5
      osc.frequency.setValueAtTime(523.25, now + 0.12); // C5
      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
      osc.start(now);
      osc.stop(now + 0.3);
    } else {
      // Error buzz
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, now);
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
      osc.start(now);
      osc.stop(now + 0.2);
    }
  } catch (err) {
    console.warn('Audio playback error:', err);
  }
}

function getApiBaseUrl() {
  if (window.API_BASE_URL) return window.API_BASE_URL;
  if (window.location.port === '8000') return '';
  return 'http://127.0.0.1:8000';
}

function initBarcodeScanner() {
  const form = document.getElementById('barcode-form');
  const input = document.getElementById('barcode-input');

  let barcodeBuffer = '';
  let lastKeyTime = Date.now();

  // 1. Keep input focused automatically so Barcode to PC / USB scanner writes directly
  function ensureFocus() {
    if (input && document.activeElement !== input) {
      input.focus();
    }
  }

  window.addEventListener('click', (e) => {
    if (e.target.tagName !== 'BUTTON' && e.target.tagName !== 'A' && e.target.tagName !== 'SELECT' && e.target.tagName !== 'TEXTAREA') {
      ensureFocus();
    }
  });

  // Ensure focus initially
  setTimeout(ensureFocus, 200);

  // 2. Global Keyboard Listener for "Barcode to PC" Virtual Keyboard Emulation
  window.addEventListener('keydown', (e) => {
    // If user is focused on a different editable element, do not hijack
    if (document.activeElement && document.activeElement !== input && 
       (document.activeElement.tagName === 'TEXTAREA' || document.activeElement.tagName === 'SELECT')) {
      return;
    }

    const now = Date.now();
    // Fast scanner input: if pause > 500ms, reset buffer
    if (now - lastKeyTime > 500) {
      barcodeBuffer = '';
    }
    lastKeyTime = now;

    // When Barcode to PC or USB scanner sends 'Enter' or 'Tab' key:
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      const codeFromInput = input ? input.value.trim() : '';
      const finalCode = (codeFromInput || barcodeBuffer).trim();

      if (finalCode) {
        if (input) input.value = '';
        barcodeBuffer = '';
        processBarcodeScan(finalCode);
      }
      return;
    }

    // Accumulate regular printable characters
    if (e.key && e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
      barcodeBuffer += e.key;
      if (input && document.activeElement !== input) {
        input.value = barcodeBuffer;
      }
    }
  });

  // Handle direct paste event (if Barcode to PC sends via clipboard)
  if (input) {
    input.addEventListener('paste', (e) => {
      setTimeout(() => {
        const val = input.value.trim();
        if (val) {
          input.value = '';
          barcodeBuffer = '';
          processBarcodeScan(val);
        }
      }, 50);
    });
  }

  // 3. Form submit listener (for manual typing and click on 'Scan' button)
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const barcode = input.value.trim();
      if (!barcode) return;

      input.value = '';
      barcodeBuffer = '';
      await processBarcodeScan(barcode);
    });
  }

  // 4. Background auto-polling (every 4 seconds) to catch HTTP scans from Barcode to PC
  setInterval(() => {
    loadTodayAttendanceLogs();
  }, 4000);
}


async function processBarcodeScan(barcode) {
  const submitBtn = document.getElementById('submit-scan-btn');
  const cardContainer = document.getElementById('result-card-container');
  const idleState = document.getElementById('idle-state');
  const activeResult = document.getElementById('active-result');

  submitBtn.disabled = true;
  submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i>`;

  try {
    const apiBase = getApiBaseUrl();
    const res = await fetch(`${apiBase}/api/attendance/scan-barcode`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ barcode: barcode })
    });

    const data = await res.json();

    if (!res.ok) {
      playBeep('error');
      showErrorState(data.detail || 'Student not found or scan error.');
      return;
    }

    // Success! Determine whether it was Check-In or Check-Out
    const isCheckout = data.action === 'CHECKED_OUT';
    playBeep(isCheckout ? 'checkout' : 'checkin');

    // Display result card
    renderResultCard(data);

    // Refresh logs feed
    loadTodayAttendanceLogs();

  } catch (err) {
    playBeep('error');
    showErrorState(err.message || 'Network connection error.');
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = `<span>Scan</span><i class="fa-solid fa-arrow-right"></i>`;
    const input = document.getElementById('barcode-input');
    if (input) input.focus();
  }
}

function renderResultCard(data) {
  const idleState = document.getElementById('idle-state');
  const activeResult = document.getElementById('active-result');
  const cardContainer = document.getElementById('result-card-container');

  idleState.classList.add('hidden');
  activeResult.classList.remove('hidden');

  const isCheckout = data.action === 'CHECKED_OUT';

  // Apply card border & glow animations
  cardContainer.className = `h-full bg-white rounded-2xl border-2 p-6 shadow-sm flex flex-col justify-center items-center text-center transition-all duration-300 ${isCheckout ? 'checkout-glow' : 'checkin-glow'}`;

  // Badge Pill
  const badgePill = document.getElementById('res-badge-pill');
  const badgeIcon = document.getElementById('res-badge-icon');
  const badgeText = document.getElementById('res-badge-text');
  const actionCircle = document.getElementById('res-action-circle');

  if (isCheckout) {
    badgePill.className = 'inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider shadow-sm bg-blue-100 text-blue-800';
    badgeIcon.className = 'fa-solid fa-arrow-right-from-bracket';
    badgeText.textContent = 'CHECK-OUT SUCCESSFUL';
    actionCircle.className = 'absolute bottom-0 right-0 w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm shadow';
    actionCircle.innerHTML = '<i class="fa-solid fa-door-open"></i>';
  } else {
    badgePill.className = 'inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider shadow-sm bg-emerald-100 text-emerald-800';
    badgeIcon.className = 'fa-solid fa-circle-check';
    badgeText.textContent = 'CHECK-IN SUCCESSFUL';
    actionCircle.className = 'absolute bottom-0 right-0 w-8 h-8 rounded-full bg-emerald-500 text-white flex items-center justify-center text-sm shadow';
    actionCircle.innerHTML = '<i class="fa-solid fa-check"></i>';
  }

  // Student Info
  const st = data.student || {};
  document.getElementById('res-student-name').textContent = st.name || 'Student';
  document.getElementById('res-roll-no').textContent = `Roll: ${st.rollNumber || st.libraryCardNumber || '-'}`;
  document.getElementById('res-dept').textContent = st.department || st.className || 'College Student';

  // Avatar / Fallback Initials
  const fallbackEl = document.getElementById('res-avatar-fallback');
  const imgEl = document.getElementById('res-avatar-img');
  const initials = (st.name || 'ST').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  fallbackEl.textContent = initials;

  if (st.avatarUrl) {
    imgEl.src = st.avatarUrl;
    imgEl.classList.remove('hidden');
    fallbackEl.classList.add('hidden');
  } else {
    imgEl.classList.add('hidden');
    fallbackEl.classList.remove('hidden');
  }

  // Seat & Timestamp
  const seat = data.seat || {};
  const seatCodeEl = document.getElementById('res-seat-code');
  if (seat.seatCode && seat.seatCode !== 'None') {
    seatCodeEl.textContent = `${seat.seatCode} ${seat.floor ? '(' + seat.floor + ')' : ''}`;
  } else {
    seatCodeEl.textContent = 'General Library Entry';
  }

  const now = new Date();
  const fallbackTime = `${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })} (${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })})`;
  document.getElementById('res-timestamp').textContent = data.time || fallbackTime;

  // Time Spent / Duration
  const durationRow = document.getElementById('res-duration-row');
  const durationEl = document.getElementById('res-duration');
  if (isCheckout && data.duration) {
    durationRow.classList.remove('hidden');
    durationEl.textContent = data.duration;
  } else {
    durationRow.classList.add('hidden');
  }

  document.getElementById('res-message').textContent = data.message || '';
}

function showErrorState(msg) {
  const cardContainer = document.getElementById('result-card-container');
  const idleState = document.getElementById('idle-state');
  const activeResult = document.getElementById('active-result');

  idleState.classList.add('hidden');
  activeResult.classList.remove('hidden');

  cardContainer.className = 'h-full bg-white rounded-2xl border-2 p-6 shadow-sm flex flex-col justify-center items-center text-center transition-all duration-300 error-glow';

  const badgePill = document.getElementById('res-badge-pill');
  const badgeIcon = document.getElementById('res-badge-icon');
  const badgeText = document.getElementById('res-badge-text');

  badgePill.className = 'inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider shadow-sm bg-red-100 text-red-800';
  badgeIcon.className = 'fa-solid fa-triangle-exclamation';
  badgeText.textContent = 'SCAN ERROR';

  const errNow = new Date();
  const errTime = `${errNow.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })} (${errNow.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })})`;

  document.getElementById('res-student-name').textContent = 'Verification Failed';
  document.getElementById('res-roll-no').textContent = 'Invalid ID';
  document.getElementById('res-dept').textContent = 'Please retry or verify card';
  document.getElementById('res-seat-code').textContent = '-';
  document.getElementById('res-timestamp').textContent = errTime;
  document.getElementById('res-duration-row').classList.add('hidden');
  document.getElementById('res-message').textContent = msg;

  const fallbackEl = document.getElementById('res-avatar-fallback');
  fallbackEl.textContent = '!';
  fallbackEl.className = 'w-24 h-24 rounded-full bg-red-500 text-white flex items-center justify-center text-3xl font-bold shadow-lg';
  document.getElementById('res-avatar-img').classList.add('hidden');
  fallbackEl.classList.remove('hidden');
}

async function loadTodayAttendanceLogs() {
  const tbody = document.getElementById('logs-tbody');
  const countBadge = document.getElementById('scan-count-badge');
  const refreshBtn = document.getElementById('refresh-logs-btn');

  try {
    const apiBase = getApiBaseUrl();
    const res = await fetch(`${apiBase}/api/admin/attendance-logs?filter=day`);
    if (!res.ok) return;

    const logs = await res.json();
    countBadge.textContent = logs.length;

    if (!logs.length) {
      tbody.innerHTML = `<tr><td colspan="7" class="py-8 text-center text-slate-400">No students scanned today yet. Ready for scans.</td></tr>`;
      return;
    }

    tbody.innerHTML = logs.map(l => {
      const isCheckedOut = Boolean(l.checkOut && l.checkOut !== '-');
      const actionBadge = isCheckedOut
        ? `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200"><i class="fa-solid fa-arrow-right-from-bracket"></i> Checked Out</span>`
        : `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200"><i class="fa-solid fa-circle-check"></i> Present / In</span>`;

      return `
        <tr class="hover:bg-slate-50/80 transition">
          <td class="py-3 px-4 font-bold text-slate-800">${escapeHtml(l.studentName)}</td>
          <td class="py-3 px-4 font-mono text-slate-600">${escapeHtml(l.rollNo)}</td>
          <td class="py-3 px-4">${actionBadge}</td>
          <td class="py-3 px-4 text-slate-700 font-semibold">${escapeHtml(l.seatCode || 'General Entry')}</td>
          <td class="py-3 px-4 text-slate-600">${escapeHtml(l.checkIn)}</td>
          <td class="py-3 px-4 text-slate-600">${escapeHtml(l.checkOut)}</td>
          <td class="py-3 px-4">
            <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600">
              <i class="fa-solid fa-barcode text-slate-400"></i> ${escapeHtml(l.verificationMethod || 'BARCODE')}
            </span>
          </td>
        </tr>
      `;
    }).join('');

  } catch (err) {
    console.warn('Failed to load logs:', err);
  }
}

function initQuickTestButtons() {
  document.querySelectorAll('.test-roll-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const roll = btn.getAttribute('data-roll');
      if (roll) {
        processBarcodeScan(roll);
      }
    });
  });

  const refreshBtn = document.getElementById('refresh-logs-btn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      loadTodayAttendanceLogs();
    });
  }
}

// Webcam Barcode Scanner via browser BarcodeDetector API (Zero external npm libraries needed)
let cameraStream = null;
let cameraInterval = null;

function initCameraScanner() {
  const toggleBtn = document.getElementById('toggle-camera-btn');
  const container = document.getElementById('camera-container');
  const video = document.getElementById('webcam-video');
  const btnText = document.getElementById('camera-btn-text');

  toggleBtn.addEventListener('click', async () => {
    if (cameraStream) {
      stopCamera();
      container.classList.add('hidden');
      btnText.textContent = 'Open Webcam Scanner';
    } else {
      try {
        cameraStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' }
        });
        video.srcObject = cameraStream;
        container.classList.remove('hidden');
        btnText.textContent = 'Close Webcam Scanner';
        startDetectingBarcodes(video);
      } catch (err) {
        alert('Could not access camera: ' + err.message);
      }
    }
  });
}

let zxingReader = null;

function stopCamera() {
  if (zxingReader) {
    try {
      zxingReader.reset();
    } catch (e) {}
  }
  if (cameraStream) {
    cameraStream.getTracks().forEach(t => t.stop());
    cameraStream = null;
  }
  if (cameraInterval) {
    clearInterval(cameraInterval);
    cameraInterval = null;
  }
}

function startDetectingBarcodes(video) {
  // Option 1: Native BarcodeDetector API with all barcode symbologies
  if ('BarcodeDetector' in window) {
    try {
      const detector = new BarcodeDetector({
        formats: ['code_128', 'code_39', 'code_93', 'codabar', 'itf', 'ean_13', 'ean_8', 'qr_code', 'upc_a', 'upc_e']
      });

      cameraInterval = setInterval(async () => {
        if (video.readyState >= 2) {
          try {
            const barcodes = await detector.detect(video);
            if (barcodes.length > 0) {
              const rawValue = barcodes[0].rawValue;
              if (rawValue) {
                stopCamera();
                document.getElementById('camera-container').classList.add('hidden');
                document.getElementById('camera-btn-text').textContent = 'Open Webcam Scanner';
                processBarcodeScan(rawValue);
              }
            }
          } catch (e) {
            // detection frame error
          }
        }
      }, 350);
      return;
    } catch (e) {
      console.warn('BarcodeDetector initialization fallback to ZXing:', e);
    }
  }

  // Option 2: Fallback to ZXing BrowserMultiFormatReader
  if (window.ZXing && window.ZXing.BrowserMultiFormatReader) {
    try {
      if (!zxingReader) {
        zxingReader = new ZXing.BrowserMultiFormatReader();
      }
      zxingReader.decodeFromVideoElement(video, (result, err) => {
        if (result && result.getText()) {
          const rawValue = result.getText();
          stopCamera();
          document.getElementById('camera-container').classList.add('hidden');
          document.getElementById('camera-btn-text').textContent = 'Open Webcam Scanner';
          processBarcodeScan(rawValue);
        }
      });
      return;
    } catch (err) {
      console.warn('ZXing initialization note:', err);
    }
  }

  console.warn('Neither BarcodeDetector nor ZXing is active. Use USB scanner or manual entry.');
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
