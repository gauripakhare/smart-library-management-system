/**
 * ==============================================================================
 * SMART LIBRARY - HIGH PERFORMANCE CLIENT-SIDE LOCAL CACHE (STALE-WHILE-REVALIDATE)
 * ==============================================================================
 * Pure Browser Local Cache (Memory + sessionStorage) - No Redis or external service.
 * Speeds up page data loading to 0ms on repeat visits & tab navigation for Admin.
 */
(function (global) {
  'use strict';

  if (global.__SMART_LIB_LOCAL_CACHE__) return;
  global.__SMART_LIB_LOCAL_CACHE__ = true;

  const CACHE_PREFIX = 'lib_admin_cache_v1_';
  const DEFAULT_TTL_MS = 45 * 1000; // 45 seconds fresh cache TTL

  // Real-time actions and critical mutations that must always bypass cache
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

    _makeKey(url) {
      return CACHE_PREFIX + url;
    }

    get(url) {
      const now = Date.now();
      // 1. Ultra-fast in-memory check (0ms)
      if (this.memCache.has(url)) {
        const item = this.memCache.get(url);
        if (now < item.expiresAt) {
          return item;
        }
        this.memCache.delete(url);
      }

      // 2. Check sessionStorage
      try {
        const raw = sessionStorage.getItem(this._makeKey(url));
        if (raw) {
          const item = JSON.parse(raw);
          if (now < item.expiresAt) {
            this.memCache.set(url, item); // rehydrate memory cache
            return item;
          }
          sessionStorage.removeItem(this._makeKey(url));
        }
      } catch (_) {}

      return null;
    }

    set(url, payload, ttlMs = DEFAULT_TTL_MS) {
      const record = {
        payload: payload,
        expiresAt: Date.now() + ttlMs,
        savedAt: Date.now()
      };

      this.memCache.set(url, record);

      try {
        sessionStorage.setItem(this._makeKey(url), JSON.stringify(record));
      } catch (e) {
        this._purgeOldest();
        try {
          sessionStorage.setItem(this._makeKey(url), JSON.stringify(record));
        } catch (_) {}
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
        if (!urlPrefix || key.includes(urlPrefix)) {
          this.memCache.delete(key);
        }
      }
      try {
        const toRemove = [];
        for (let i = 0; i < sessionStorage.length; i++) {
          const k = sessionStorage.key(i);
          if (k && k.startsWith(CACHE_PREFIX)) {
            if (!urlPrefix || k.includes(urlPrefix)) {
              toRemove.push(k);
            }
          }
        }
        toRemove.forEach(k => sessionStorage.removeItem(k));
      } catch (_) {}
    }
  }

  const cache = new LocalCacheManager();
  global.SmartLibLocalCache = cache;

  // Intercept window.fetch to automatically serve from local cache & background revalidate
  const originalFetch = global.fetch;
  if (typeof originalFetch === 'function') {
    global.fetch = async function (resource, init = {}) {
      const method = (init && init.method ? init.method.toUpperCase() : 'GET');
      const urlStr = typeof resource === 'string' ? resource : (resource && resource.url ? resource.url : '');

      // On mutation (POST, PUT, DELETE, PATCH), invalidate related cache immediately
      if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
        if (urlStr.includes('/api/')) {
          const pathSegments = urlStr.split('?')[0].split('/').slice(0, 5).join('/');
          cache.invalidate(pathSegments);
        }
        return originalFetch.call(this, resource, init);
      }

      // Check if eligible for local caching
      const isEligible = method === 'GET' &&
                         urlStr.includes('/api/') &&
                         !BYPASS_PATTERNS.some(p => urlStr.includes(p)) &&
                         (!init.headers || !init.headers['Cache-Control'] || init.headers['Cache-Control'] !== 'no-cache');

      if (isEligible) {
        const cached = cache.get(urlStr);
        if (cached && cached.payload) {
          // Stale-While-Revalidate: fetch in background to refresh local cache silently
          setTimeout(() => {
            originalFetch.call(this, resource, init)
              .then(async (freshRes) => {
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
              })
              .catch(() => {});
          }, 20);

          // Return instant response from local cache
          return new Response(cached.payload.bodyText, {
            status: cached.payload.status || 200,
            statusText: cached.payload.statusText || 'OK',
            headers: new Headers(cached.payload.headers || { 'Content-Type': 'application/json' })
          });
        }
      }

      // Live network request
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
