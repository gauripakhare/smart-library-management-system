document.addEventListener("DOMContentLoaded", async () => {
    const radiusRange = document.getElementById('radius-range');
    const radiusValue = document.getElementById('radius-value');
    const latitudeInput = document.getElementById('latitude-input');
    const longitudeInput = document.getElementById('longitude-input');
    const saveBtn = document.getElementById('save-btn');
    const unsetBtn = document.getElementById('unset-btn');
    const detectGpsBtn = document.getElementById('detect-gps-btn');
    const detectGpsText = document.getElementById('detect-gps-text');
    const gpsAccuracyBadge = document.getElementById('gps-accuracy-badge');
    const gpsFeedback = document.getElementById('gps-feedback');
    const gpsFeedbackText = document.getElementById('gps-feedback-text');
    const googleMapsLink = document.getElementById('google-maps-link');
    const actionStatusMsg = document.getElementById('action-status-msg');
    const actionStatusText = document.getElementById('action-status-text');

    const statusBanner = document.getElementById('status-banner');
    const statusIndicatorDot = document.getElementById('status-indicator-dot');
    const statusTitle = document.getElementById('status-title');
    const statusSubtitle = document.getElementById('status-subtitle');
    const statusPill = document.getElementById('status-pill');

    function getApiBase() {
        if (window.API_BASE_URL) return window.API_BASE_URL;
        if (window.location.port === '8000') return '';
        return 'http://127.0.0.1:8000';
    }

    function showActionStatus(message, isError = false) {
        if (!actionStatusMsg || !actionStatusText) return;
        actionStatusText.textContent = message;
        if (isError) {
            actionStatusMsg.className = "text-xs font-medium text-red-600 flex items-center gap-1";
            actionStatusMsg.querySelector('i').className = "fa-solid fa-circle-exclamation text-red-500";
        } else {
            actionStatusMsg.className = "text-xs font-medium text-emerald-600 flex items-center gap-1";
            actionStatusMsg.querySelector('i').className = "fa-solid fa-circle-check text-emerald-600";
        }
        actionStatusMsg.classList.remove('hidden');
        setTimeout(() => {
            actionStatusMsg.classList.add('hidden');
        }, 4000);
    }

    function updateGoogleMapsLink(lat, lon) {
        if (!googleMapsLink) return;
        if (lat && lon && !isNaN(lat) && !isNaN(lon)) {
            googleMapsLink.href = `https://www.google.com/maps?q=${lat},${lon}`;
            googleMapsLink.classList.remove('hidden');
        } else {
            googleMapsLink.classList.add('hidden');
        }
    }

    function renderStatusState(isActive, lat, lon, radius) {
        if (!statusBanner) return;

        if (isActive && lat && lon) {
            statusBanner.className = "flex items-center justify-between p-4 rounded-xl border border-emerald-200 bg-emerald-50/70 transition";
            statusIndicatorDot.className = "w-3 h-3 rounded-full bg-emerald-500 animate-pulse";
            statusTitle.textContent = "Geofence Status: ACTIVE & CONFIGURED";
            statusSubtitle.textContent = `Library Center: ${lat.toFixed(5)}, ${lon.toFixed(5)} | Allowed Radius: ${radius}m`;
            statusPill.className = "text-[11px] font-bold px-2.5 py-1 rounded-full bg-emerald-200 text-emerald-800";
            statusPill.textContent = "ACTIVE";
            updateGoogleMapsLink(lat, lon);
        } else {
            statusBanner.className = "flex items-center justify-between p-4 rounded-xl border border-amber-200 bg-amber-50/70 transition";
            statusIndicatorDot.className = "w-3 h-3 rounded-full bg-amber-400";
            statusTitle.textContent = "Geofence Status: UNSET / INACTIVE";
            statusSubtitle.textContent = "Library location is unset. Capture GPS from this device or enter coordinates to activate.";
            statusPill.className = "text-[11px] font-bold px-2.5 py-1 rounded-full bg-amber-200 text-amber-800";
            statusPill.textContent = "UNSET";
            updateGoogleMapsLink(null, null);
        }
    }

    // 1. Backend API कडून सुरुवातीच्या सेटिंग्ज लोड करणे
    async function fetchGeofenceSettings() {
        try {
            const apiBase = getApiBase();
            const response = await fetch(`${apiBase}/api/admin/geofence-settings`);
            if (!response.ok) throw new Error('Failed to fetch geofence settings');
            const data = await response.json();

            const rad = data.radius || data.radiusMeters || 120;
            radiusRange.value = rad;
            radiusValue.innerText = `${rad} m`;

            const lat = data.latitude !== null && data.latitude !== undefined ? data.latitude : '';
            const lon = data.longitude !== null && data.longitude !== undefined ? data.longitude : '';

            latitudeInput.value = lat;
            longitudeInput.value = lon;

            renderStatusState(data.isActive && data.isConfigured, parseFloat(lat), parseFloat(lon), rad);
        } catch (error) {
            console.warn("Backend notice, using current values:", error);
            renderStatusState(false, null, null, radiusRange.value || 120);
        }
    }

    // 2. Slider बदलल्यावर व्हॅल्यू डायनॅमिकली अपडेट करणे
    radiusRange.addEventListener('input', (e) => {
        radiusValue.innerText = `${e.target.value} m`;
    });

    // 3. Quick Preset Radius बटणे
    document.querySelectorAll('.preset-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const val = parseInt(btn.dataset.radius);
            if (val) {
                radiusRange.value = val;
                radiusValue.innerText = `${val} m`;
            }
        });
    });

    // 4. GPS Auto-Detection: सध्याच्या मोबाईल किंवा लॅपटॉपचे थेट लोकेशन कॅप्चर करणे
    detectGpsBtn.addEventListener('click', () => {
        if (!navigator.geolocation) {
            alert('Your browser does not support GPS geolocation. Please use a modern browser on mobile/laptop.');
            return;
        }

        detectGpsBtn.disabled = true;
        detectGpsText.textContent = "Detecting current device GPS location...";
        gpsAccuracyBadge.classList.add('hidden');
        gpsFeedback.classList.add('hidden');

        navigator.geolocation.getCurrentPosition(
            (position) => {
                const lat = position.coords.latitude;
                const lon = position.coords.longitude;
                const acc = Math.round(position.coords.accuracy || 5);

                latitudeInput.value = lat.toFixed(7);
                longitudeInput.value = lon.toFixed(7);

                gpsAccuracyBadge.textContent = `±${acc}m Accuracy`;
                gpsAccuracyBadge.className = `text-[10px] font-semibold px-2 py-0.5 rounded ${acc < 25 ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`;
                gpsAccuracyBadge.classList.remove('hidden');

                gpsFeedbackText.textContent = `GPS Captured: (${lat.toFixed(5)}, ${lon.toFixed(5)})! Click 'Save & Activate Location' to confirm.`;
                gpsFeedback.classList.remove('hidden');

                updateGoogleMapsLink(lat, lon);

                detectGpsBtn.disabled = false;
                detectGpsText.textContent = "Location Captured! (Click to re-capture)";
            },
            (error) => {
                console.error("GPS error:", error);
                let msg = "Could not retrieve GPS location.";
                if (error.code === 1) msg = "Location permission denied. Please allow location access in your browser settings.";
                else if (error.code === 2) msg = "Position unavailable. Please ensure GPS/Location is turned ON.";
                else if (error.code === 3) msg = "GPS request timed out. Please try again.";

                alert(msg);
                detectGpsBtn.disabled = false;
                detectGpsText.textContent = "Set Location from This Device (Capture GPS)";
            },
            {
                enableHighAccuracy: true,
                timeout: 12000,
                maximumAge: 0
            }
        );
    });

    // 5. 'Save & Activate Location' बटण दाबल्यावर लोकेशन सेव्ह करणे
    saveBtn.addEventListener('click', async () => {
        const lat = parseFloat(latitudeInput.value);
        const lon = parseFloat(longitudeInput.value);
        const rad = parseInt(radiusRange.value);

        if (isNaN(lat) || isNaN(lon) || lat === 0 || lon === 0) {
            alert("कृपया प्रथम 'Capture GPS' वर क्लिक करा किंवा योग्य Latitude व Longitude प्रविष्ट करा.");
            return;
        }

        const updatedSettings = {
            library_name: "Main Library",
            radius: rad,
            radius_meters: rad,
            latitude: lat,
            longitude: lon
        };

        saveBtn.disabled = true;
        saveBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Saving & Activating...`;

        try {
            const apiBase = getApiBase();
            const response = await fetch(`${apiBase}/api/admin/geofence-settings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updatedSettings)
            });

            if (response.ok) {
                const resData = await response.json();
                renderStatusState(true, lat, lon, rad);
                showActionStatus("Location saved and geofence activated successfully!");
            } else {
                showActionStatus("Failed to save settings to server.", true);
            }
        } catch (error) {
            console.error("Error saving settings:", error);
            showActionStatus("Could not connect to backend server.", true);
        } finally {
            saveBtn.disabled = false;
            saveBtn.innerHTML = `<i class="fa-solid fa-floppy-disk"></i> <span>Save & Activate Location</span>`;
        }
    });

    // 6. 'Unset Location' बटण दाबल्यावर सध्याचे लोकेशन अनसेट करणे
    unsetBtn.addEventListener('click', async () => {
        const confirmUnset = confirm("Are you sure you want to UNSET the current library location? Once unset, students cannot check in until you set a new location.");
        if (!confirmUnset) return;

        unsetBtn.disabled = true;
        unsetBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Unsetting...`;

        try {
            const apiBase = getApiBase();
            const response = await fetch(`${apiBase}/api/admin/geofence-settings/unset`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });

            if (response.ok) {
                latitudeInput.value = '';
                longitudeInput.value = '';
                gpsAccuracyBadge.classList.add('hidden');
                gpsFeedback.classList.add('hidden');
                detectGpsText.textContent = "Set Location from This Device (Capture GPS)";
                renderStatusState(false, null, null, parseInt(radiusRange.value) || 120);
                showActionStatus("Location has been unset! You can now capture or set a new location.");
            } else {
                showActionStatus("Failed to unset location.", true);
            }
        } catch (error) {
            console.error("Error unsetting location:", error);
            showActionStatus("Connection error while unsetting.", true);
        } finally {
            unsetBtn.disabled = false;
            unsetBtn.innerHTML = `<i class="fa-solid fa-ban"></i> <span>Unset Location</span>`;
        }
    });

    // इनपुट्स मॅन्युअली बदलल्यास Google Maps लिंक अपडेट करणे
    [latitudeInput, longitudeInput].forEach(inp => {
        inp.addEventListener('input', () => {
            const lat = parseFloat(latitudeInput.value);
            const lon = parseFloat(longitudeInput.value);
            updateGoogleMapsLink(lat, lon);
        });
    });

    // पेज लोड झाल्यावर डेटा आणा
    fetchGeofenceSettings();
});