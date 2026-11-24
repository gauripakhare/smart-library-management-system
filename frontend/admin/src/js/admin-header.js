/**
 * Admin Header & Universal Client-Side Local Cache (Stale-While-Revalidate)
 * Pure Browser Local Cache (Memory + sessionStorage) - No Redis.
 * Accelerates all admin data requests to 0ms for instant page loading.
 */
(function (global) {
  'use strict';
  if (global.__SMART_LIB_ADMIN_LOCAL_CACHE__) return;
  global.__SMART_LIB_ADMIN_LOCAL_CACHE__ = true;

  const CACHE_PREFIX = 'lib_admin_cache_v1_';
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
  if (!header) return;

  let actions = header.querySelector('.header-right, .topbar-right, .header-actions');
  if (!actions) {
    actions = document.createElement('div');
    actions.className = 'admin-header-actions';
    header.appendChild(actions);
  }

  let notification = header.querySelector(
    '.notification-btn, .notification-wrapper, .notification-box, .bell-icon, #notifBtn, .icon-btn'
  );
  let profile = header.querySelector(
    '.user-profile, .admin-dropdown, .student-profile, .admin-chip'
  );

  if (notification && notification.closest('header') === header) {
    actions.appendChild(notification);
    notification.classList.add('admin-header-notification');
    notification.setAttribute('title', 'Notifications');
    normalizeNotification(notification);
    notification.addEventListener('click', openNotifications);
  } else {
    notification = createNotificationControl();
    actions.prepend(notification);
  }

  if (profile && profile.closest('header') === header) {
    actions.appendChild(profile);
    profile.classList.add('admin-header-profile');
    profile.setAttribute('title', 'Admin Profile');
    normalizeProfile(profile);
  } else {
    profile = createProfileControl();
    actions.appendChild(profile);
  }

  populateAdminHeaderInfo();
});

async function populateAdminHeaderInfo() {
  try {
    const apiBase = window.location.port === '8000' ? '' : 'http://127.0.0.1:8000';
    const token = localStorage.getItem('access_token');
    let nameStr = null;

    if (token) {
      try {
        const res = await fetch(`${apiBase}/api/auth/me`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const userData = await res.json();
          if (userData && userData.name) {
            nameStr = userData.name;
          }
        }
      } catch (e) {
        console.warn('Header auth/me fetch warning:', e);
      }
    }

    if (!nameStr) {
      const rawUser = localStorage.getItem('user_info');
      if (rawUser) {
        try {
          const user = JSON.parse(rawUser);
          if (user && user.name) nameStr = user.name;
        } catch (e) {}
      }
    }

    if (!nameStr) nameStr = 'Admin User';

    const nameEls = document.querySelectorAll('.admin-profile-name, .admin-name, #admin-username, .user-name');
    nameEls.forEach(el => {
      el.textContent = nameStr;
    });

    // Dynamic notification unread count from Database API
    try {
      const notifRes = await fetch(`${apiBase}/api/admin/notifications/unread-count`);
      if (notifRes.ok) {
        const notifData = await notifRes.json();
        const cnt = notifData.unreadCount !== undefined ? notifData.unreadCount : 0;
        document.querySelectorAll('.admin-header-badge, .notification-badge').forEach(badge => {
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
  } catch (err) {
    console.warn('Admin header info error:', err);
  }
}

function openNotifications(event) {
  event.preventDefault();
  window.location.href = 'notifications.html';
}

function normalizeNotification(notification) {
  const badge = notification.querySelector('.notification-badge, .badge, .notify-badge, #notifCount');
  if (badge) {
    badge.style.display = 'none';
  }
  notification.innerHTML = `
    <i class="fa-regular fa-bell" aria-hidden="true"></i>
    ${badge ? badge.outerHTML : '<span class="admin-header-badge" style="display: none;"></span>'}`;
}

function normalizeProfile(profile) {
  const avatar = profile.querySelector('img, .user-avatar-circle, .user-avatar, .avatar, .admin-profile-avatar');
  if (!avatar) return;

  if (avatar.tagName === 'IMG' && avatar.id === 'adminAvatar') {
    avatar.hidden = true;
    if (!profile.querySelector('.admin-profile-avatar')) {
      avatar.insertAdjacentHTML('afterend', '<span class="admin-profile-avatar"><i class="fa-solid fa-user" aria-hidden="true"></i></span>');
    }
    return;
  }

  avatar.className = 'admin-profile-avatar';
  avatar.innerHTML = '<i class="fa-solid fa-user" aria-hidden="true"></i>';
}

function createNotificationControl() {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'admin-header-notification admin-header-button';
  button.title = 'Notifications';
  button.setAttribute('aria-label', 'Notifications');
  button.innerHTML = `
    <i class="fa-regular fa-bell" aria-hidden="true"></i>
    <span class="admin-header-badge" style="display: none;"></span>`;
  button.addEventListener('click', openNotifications);
  return button;
}

function createProfileControl() {
  const profile = document.createElement('a');
  profile.className = 'admin-header-profile admin-profile-link';
  profile.href = '#';
  profile.title = 'Admin Profile';
  profile.innerHTML = `
    <span class="admin-profile-avatar"><i class="fa-solid fa-user" aria-hidden="true"></i></span>
    <span class="admin-profile-name">System Admin</span>
    <i class="fa-solid fa-chevron-down" aria-hidden="true"></i>`;
  return profile;
}
