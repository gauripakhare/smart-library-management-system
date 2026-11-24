/**
 * Student Header & Universal Client-Side Local Cache (Stale-While-Revalidate)
 * Pure Browser Local Cache (Memory + sessionStorage) - No Redis.
 * Accelerates all student data requests to 0ms for instant page loading.
 */
(function (global) {
  'use strict';
  if (global.__SMART_LIB_STUDENT_LOCAL_CACHE__) return;
  global.__SMART_LIB_STUDENT_LOCAL_CACHE__ = true;

  const CACHE_PREFIX = 'lib_cache_v1_';
  const DEFAULT_TTL_MS = 45 * 1000;
  const BYPASS_PATTERNS = [
    '/api/auth/login',
    '/api/auth/logout',
    '/api/admin/attendance/barcode-scan',
    '/api/admin/notifications/mark-all-read',
    '/api/student/notifications/mark-all-read'
  ];

  class LocalCacheManager {
    constructor() { this.memCache = new Map(); }
    _makeKey(url) { return CACHE_PREFIX + url; }
    get(url) {
      const now = Date.now();
      if (this.memCache.has(url)) {
        const item = this.memCache.get(url);
        if (now < item.expiresAt) return item;
        this.memCache.delete(url);
      }
      try {
        const raw = sessionStorage.getItem(this._makeKey(url));
        if (raw) {
          const item = JSON.parse(raw);
          if (now < item.expiresAt) {
            this.memCache.set(url, item);
            return item;
          }
          sessionStorage.removeItem(this._makeKey(url));
        }
      } catch (_) {}
      return null;
    }
    set(url, payload, ttlMs = DEFAULT_TTL_MS) {
      const record = { payload, expiresAt: Date.now() + ttlMs, savedAt: Date.now() };
      this.memCache.set(url, record);
      try {
        sessionStorage.setItem(this._makeKey(url), JSON.stringify(record));
      } catch (_) {
        this._purgeOldest();
      }
    }
    _purgeOldest() {
      try {
        const keys = [];
        for (let i = 0; i < sessionStorage.length; i++) {
          const k = sessionStorage.key(i);
          if (k && k.startsWith(CACHE_PREFIX)) keys.push(k);
        }
        keys.slice(0, 5).forEach(k => sessionStorage.removeItem(k));
      } catch (_) {}
    }
    invalidate(urlPrefix = '') {
      for (const [key] of this.memCache.entries()) {
        if (!urlPrefix || key.includes(urlPrefix)) this.memCache.delete(key);
      }
      try {
        const toRemove = [];
        for (let i = 0; i < sessionStorage.length; i++) {
          const k = sessionStorage.key(i);
          if (k && k.startsWith(CACHE_PREFIX) && (!urlPrefix || k.includes(urlPrefix))) {
            toRemove.push(k);
          }
        }
        toRemove.forEach(k => sessionStorage.removeItem(k));
      } catch (_) {}
    }
  }

  const cache = global.SmartLibLocalCache || new LocalCacheManager();
  global.SmartLibLocalCache = cache;

  const originalFetch = global.fetch;
  if (typeof originalFetch === 'function') {
    global.fetch = async function (resource, init = {}) {
      const method = (init && init.method ? init.method.toUpperCase() : 'GET');
      const urlStr = typeof resource === 'string' ? resource : (resource && resource.url ? resource.url : '');

      if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
        if (urlStr.includes('/api/')) {
          const pathSegments = urlStr.split('?')[0].split('/').slice(0, 5).join('/');
          cache.invalidate(pathSegments);
        }
        return originalFetch.call(this, resource, init);
      }

      const isEligible = method === 'GET' &&
                         urlStr.includes('/api/') &&
                         !BYPASS_PATTERNS.some(p => urlStr.includes(p)) &&
                         (!init.headers || !init.headers['Cache-Control'] || init.headers['Cache-Control'] !== 'no-cache');

      if (isEligible) {
        const cached = cache.get(urlStr);
        if (cached && cached.payload) {
          setTimeout(() => {
            originalFetch.call(this, resource, init).then(async (freshRes) => {
              if (freshRes.ok) {
                try {
                  const clone = freshRes.clone();
                  const text = await clone.text();
                  cache.set(urlStr, {
                    bodyText: text,
                    status: freshRes.status,
                    statusText: freshRes.statusText,
                    headers: Array.from(freshRes.headers.entries())
                  });
                } catch (_) {}
              }
            }).catch(() => {});
          }, 20);

          return new Response(cached.payload.bodyText, {
            status: cached.payload.status || 200,
            statusText: cached.payload.statusText || 'OK',
            headers: new Headers(cached.payload.headers || { 'Content-Type': 'application/json' })
          });
        }
      }

      const response = await originalFetch.call(this, resource, init);

      if (isEligible && response.ok) {
        try {
          const clone = response.clone();
          const bodyText = await clone.text();
          cache.set(urlStr, {
            bodyText: bodyText,
            status: response.status,
            statusText: response.statusText,
            headers: Array.from(response.headers.entries())
          });
        } catch (_) {}
      }

      return response;
    };
  }
})(typeof window !== 'undefined' ? window : this);

document.addEventListener('DOMContentLoaded', () => {
  const header = document.querySelector('header');
  if (header) {
    // 1. Remove topbar logout button from header (logout remains in sidebar)
    const logoutBtns = header.querySelectorAll('.mobile-logout-btn, #mobile-logout-btn, [title="Logout"]');
    logoutBtns.forEach(btn => btn.remove());

    // 2. Ensure container header-right / topbar-right exists
    let actions = header.querySelector('.header-right, .topbar-right, .header-actions');
    if (!actions) {
      actions = document.createElement('div');
      actions.className = 'header-right';
      header.appendChild(actions);
    }

    // 3. Find notification control and profile control
    const notificationControl = header.querySelector(
      '.notification-btn, .notification-wrapper, .notification-box, .bell-btn, .notif-btn, .icon-btn, [title="Notifications"], [onclick*="notifications.html"]'
    );
    const profileControl = header.querySelector(
      '.user-profile, .student-profile, [onclick*="profile.html"], .user-profile-chip'
    );

    // 4. Force order: NOTIFICATION FIRST (left of profile), PROFILE SECOND (right)
    if (notificationControl && actions) {
      actions.appendChild(notificationControl);
    }
    if (profileControl && actions) {
      actions.appendChild(profileControl);
    }
  }

  fetchAndPopulateStudentProfile();
});

function populateStudentHeaderInfo(userData = null) {
  try {
    let user = userData;
    if (!user) {
      const rawUser = localStorage.getItem('user_info') || sessionStorage.getItem('user_info');
      const rawStudent = localStorage.getItem('student_info');
      if (rawUser) {
        try { user = JSON.parse(rawUser); } catch (e) {}
      }
      if (!user && rawStudent) {
        try { user = JSON.parse(rawStudent); } catch (e) {}
      }
    }

    const nameStr = (user && (user.name || user.full_name || user.student_name)) ? (user.name || user.full_name || user.student_name) : 'Student';
    const roleStr = (user && (user.class_name || user.class || user.role || user.department)) ? (user.class_name || user.class || user.role || user.department) : 'B.Tech Student';
    const avatarUrl = user ? (user.avatar_url || user.avatarUrl || null) : null;

    const parts = nameStr.trim().split(/\s+/);
    const initials = parts.length > 1 ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase() : nameStr.slice(0, 2).toUpperCase();

    // 1. Name selectors across student pages
    const nameSelectors = [
      '#headerStudentName',
      '#student-name',
      '#user-name',
      '#greeting-name',
      '#student-username',
      '#heroStudentName',
      '.user-name',
      '.chip-name',
      '.student-profile-name',
      '.student-name'
    ];
    document.querySelectorAll(nameSelectors.join(',')).forEach(el => {
      el.textContent = nameStr;
    });

    // 2. Role selectors
    const roleSelectors = [
      '#headerStudentRole',
      '#student-role',
      '.user-role',
      '.chip-role',
      '.student-role'
    ];
    document.querySelectorAll(roleSelectors.join(',')).forEach(el => {
      el.textContent = roleStr;
    });

    // 3. Avatar initials
    const avatarSelectors = [
      '#avatar-fallback',
      '#avatarBox',
      '.chip-avatar',
      '.user-avatar-circle',
      '.student-profile-avatar',
      '.avatar-placeholder',
      '.avatar'
    ];
    document.querySelectorAll(avatarSelectors.join(',')).forEach(el => {
      el.textContent = initials;
      if (!avatarUrl) {
        el.style.background = '#3b82f6';
        el.style.color = '#ffffff';
        el.style.borderRadius = '50%';
        el.style.display = 'inline-flex';
        el.style.alignItems = 'center';
        el.style.justifyContent = 'center';
        el.style.fontWeight = '600';
        el.style.fontSize = '13px';
        el.style.width = '36px';
        el.style.height = '36px';
        el.style.minWidth = '36px';
        el.style.minHeight = '36px';
      }
    });

    // 4. Avatar image element
    const imgEls = document.querySelectorAll('#student-avatar, .avatar-img, .user-avatar, .avatar-lg');
    imgEls.forEach(img => {
      if (avatarUrl) {
        img.src = avatarUrl;
        img.style.display = 'block';
        const fallback = img.previousElementSibling || img.nextElementSibling;
        if (fallback && (fallback.id === 'avatar-fallback' || fallback.classList.contains('avatar-placeholder'))) {
          fallback.style.display = 'none';
        }
      } else {
        img.style.display = 'none';
      }
    });

    if (user && !localStorage.getItem('user_info')) {
      localStorage.setItem('user_info', JSON.stringify(user));
    }
  } catch (err) {
    console.warn('Student header info error:', err);
  }
}

window.populateStudentHeaderInfo = populateStudentHeaderInfo;

async function fetchAndPopulateStudentProfile() {
  populateStudentHeaderInfo();
  try {
    const apiBase = window.location.port === '8000' ? '' : 'http://127.0.0.1:8000';
    const token = localStorage.getItem('access_token') || sessionStorage.getItem('access_token');
    if (!token) return;

    const res = await fetch(`${apiBase}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) {
      const data = await res.json();
      if (data && (data.user || data.name)) {
        const u = data.user || data;
        localStorage.setItem('user_info', JSON.stringify(u));
        localStorage.setItem('student_info', JSON.stringify(u));
        populateStudentHeaderInfo(u);
      }
    }

    // Dynamic Student Notification Badge
    try {
      const notifRes = await fetch(`${apiBase}/api/student/notifications`);
      if (notifRes.ok) {
        const notifData = await notifRes.json();
        const cnt = notifData.unreadCount !== undefined ? notifData.unreadCount : 0;
        document.querySelectorAll('.notification-badge, header [style*="EF4444"]').forEach(badge => {
          if (cnt > 0) {
            badge.textContent = cnt > 99 ? '99+' : cnt;
            badge.style.display = 'inline-flex';
          } else {
            badge.textContent = '';
            badge.style.display = 'none';
          }
        });
      }
    } catch (e) {}
  } catch (e) {
    // Keep local fallback
  }
}
