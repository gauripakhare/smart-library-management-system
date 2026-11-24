/**
 * Central API Configuration, Auth Helper & Client-Side Local Cache
 * Automatically attaches logged-in student authentication headers to all API calls.
 * Caches GET API responses in browser memory & sessionStorage for 0ms instantaneous page loads.
 */
(function (global) {
  'use strict';

  // Determine backend base URL dynamically:
  function getApiBase() {
    if (global.API_BASE_URL) return global.API_BASE_URL;
    if (global.location.port === '8000') return '';
    return 'http://127.0.0.1:8000';
  }

  // Helper to get auth headers for the currently logged-in student
  function getAuthHeaders(extraHeaders = {}) {
    const headers = { ...extraHeaders };
    try {
      const token = localStorage.getItem('access_token');
      if (token && !headers['Authorization']) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const rawUser = localStorage.getItem('user_info');
      if (rawUser) {
        const u = JSON.parse(rawUser);
        if (u.id && !headers['X-User-Id']) {
          headers['X-User-Id'] = String(u.id);
        }
        if (u.email && !headers['X-User-Email']) {
          headers['X-User-Email'] = String(u.email);
        }
      }
    } catch (e) {
      console.warn('getAuthHeaders error:', e);
    }
    return headers;
  }

  // Format a Date or ISO timestamp into the browser's local 12-hour and 24-hour start time (e.g., "09:00 PM (21:00)")
  function formatStartTime(dateOrIso) {
    if (!dateOrIso) return '-';
    try {
      let d = null;
      if (typeof dateOrIso === 'string') {
        if (dateOrIso.includes('T') || dateOrIso.includes('-')) {
          const isoStr = (!dateOrIso.endsWith('Z') && !dateOrIso.includes('+')) ? dateOrIso + 'Z' : dateOrIso;
          d = new Date(isoStr);
        } else if (dateOrIso.includes(':')) {
          return dateOrIso;
        }
      } else if (dateOrIso instanceof Date) {
        d = dateOrIso;
      }
      if (d && !isNaN(d.getTime())) {
        const t12 = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
        const t24 = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
        return `${t12} (${t24})`;
      }
    } catch (e) {
      console.warn('formatStartTime error:', e);
    }
    return String(dateOrIso);
  }

  // Client-Side Browser Local Cache
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
    constructor() {
      this.memCache = new Map();
    }
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

  // Intercept window.fetch for Auth + Local Cache
  const originalFetch = global.fetch;
  global.fetch = async function (resource, init = {}) {
    const method = (init && init.method ? init.method.toUpperCase() : 'GET');
    const urlStr = typeof resource === 'string' ? resource : (resource && resource.url ? resource.url : '');
    const apiBase = getApiBase();
    const isApi = urlStr.includes('/api/') || (apiBase && urlStr.startsWith(apiBase));

    // If mutation, invalidate related cache
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
      if (isApi) {
        const pathSegments = urlStr.split('?')[0].split('/').slice(0, 5).join('/');
        cache.invalidate(pathSegments);
      }
      const options = { ...init };
      if (isApi) options.headers = getAuthHeaders(options.headers || {});
      return originalFetch.call(this, resource, options);
    }

    // Check eligible GET cache
    const isEligible = isApi && method === 'GET' &&
                       !BYPASS_PATTERNS.some(p => urlStr.includes(p)) &&
                       (!init.headers || !init.headers['Cache-Control'] || init.headers['Cache-Control'] !== 'no-cache');

    if (isEligible) {
      const cached = cache.get(urlStr);
      if (cached && cached.payload) {
        // Stale-while-revalidate in background
        setTimeout(() => {
          const bgOpts = { ...init, headers: getAuthHeaders(init.headers || {}) };
          originalFetch.call(this, resource, bgOpts).then(async (freshRes) => {
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

    const options = { ...init };
    if (isApi) options.headers = getAuthHeaders(options.headers || {});
    const response = await originalFetch.call(this, resource, options);

    if (isEligible && response.ok) {
      try {
        const clone = response.clone();
        const text = await clone.text();
        cache.set(urlStr, {
          bodyText: text,
          status: response.status,
          statusText: response.statusText,
          headers: Array.from(response.headers.entries())
        });
      } catch (_) {}
    }

    return response;
  };

  global.getApiBase = getApiBase;
  global.getAuthHeaders = getAuthHeaders;
  global.formatStartTime = formatStartTime;
})(window);
