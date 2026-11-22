/**
 * Nipo Portal (SRT Universal School) - Progressive Web App Service Worker
 * Version: 3.2.0
 * Features: Offline fallback shell, fast static caching, Web Push notifications, OS click navigation.
 * Security: Strict bypass for all /api/, NextAuth, and dynamic private data.
 */

const CACHE_NAME = "srt-pwa-v19-live";
const PRECACHE_ASSETS = [
  "/offline.html",
  "/manifest.webmanifest",
  "/manifest.json",
  "/favicon.ico",
  "/favicon.svg",
  "/icons/icon-192x192.png",
  "/icons/icon-512x512.png",
  "/icons/apple-touch-icon.png",
  "/logo/srt-logo.svg",
];

// Optional OneSignal Push SDK Integration
try {
  importScripts("https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js");
} catch (e) {}

// 1. Install Event: Pre-cache static offline shell immediately
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn("[SW] Non-fatal precache asset failure:", err);
      });
    })
  );
  self.skipWaiting();
});

// 2. Activate Event: Immediately purge all outdated/broken caches & take control
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.info("[SW] Deleting obsolete cache:", key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// ============================================================================
// INDEXEDDB UNREAD BADGE COUNTER & BADGING API ENGINE
// Maintains persistent unread count for OS app icon badges even when app is closed
// ============================================================================
const BADGE_DB_NAME = "srt-portal-pwa-badging";
const BADGE_STORE_NAME = "badge_meta";
const BADGE_KEY = "unread_count";

function openBadgeDb() {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in self)) {
      return reject(new Error("IndexedDB not supported in SW"));
    }
    const req = indexedDB.open(BADGE_DB_NAME, 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(BADGE_STORE_NAME)) {
        db.createObjectStore(BADGE_STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getStoredBadgeCount() {
  try {
    const db = await openBadgeDb();
    return new Promise((resolve) => {
      const tx = db.transaction(BADGE_STORE_NAME, "readonly");
      const store = tx.objectStore(BADGE_STORE_NAME);
      const req = store.get(BADGE_KEY);
      req.onsuccess = () => resolve(typeof req.result === "number" ? req.result : 0);
      req.onerror = () => resolve(0);
    });
  } catch {
    return 0;
  }
}

async function setStoredBadgeCount(count) {
  try {
    const safeCount = Math.max(0, parseInt(count, 10) || 0);
    const db = await openBadgeDb();
    return new Promise((resolve) => {
      const tx = db.transaction(BADGE_STORE_NAME, "readwrite");
      const store = tx.objectStore(BADGE_STORE_NAME);
      store.put(safeCount, BADGE_KEY);
      tx.oncomplete = () => resolve(safeCount);
      tx.onerror = () => resolve(safeCount);
    });
  } catch {
    return 0;
  }
}

async function incrementStoredBadgeCount(delta = 1) {
  const current = await getStoredBadgeCount();
  const next = Math.max(0, current + delta);
  await setStoredBadgeCount(next);
  return next;
}

async function applyAppBadge(count) {
  const num = Math.max(0, parseInt(count, 10) || 0);
  try {
    if (num > 0) {
      if ("setAppBadge" in navigator) {
        await navigator.setAppBadge(num);
      } else if (self.registration && "setAppBadge" in self.registration) {
        await self.registration.setAppBadge(num);
      }
    } else {
      if ("clearAppBadge" in navigator) {
        await navigator.clearAppBadge();
      } else if (self.registration && "clearAppBadge" in self.registration) {
        await self.registration.clearAppBadge();
      }
    }
  } catch (err) {
    console.debug("[SW Badge] Badging API invocation skipped:", err);
  }
}

async function removeAppBadge() {
  await setStoredBadgeCount(0);
  await applyAppBadge(0);
}

async function broadcastBadgeToClients(count) {
  try {
    const windowClients = await clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windowClients) {
      client.postMessage({ type: "APP_BADGE_CHANGED", count });
    }
  } catch { }
}

// Immediate Activation, Cache Management, and Badging Message Listener
self.addEventListener("message", (event) => {
  if (event.data) {
    if (event.data.type === "SKIP_WAITING") {
      self.skipWaiting();
    }
    if (event.data.type === "CLEAR_CACHES") {
      caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))));
    }
    if (event.data.type === "SET_BADGE") {
      const c = event.data.count || 0;
      setStoredBadgeCount(c).then((newCount) => {
        applyAppBadge(newCount);
      });
    }
    if (event.data.type === "CLEAR_BADGE") {
      removeAppBadge();
    }
    if (event.data.type === "GET_BADGE") {
      getStoredBadgeCount().then((count) => {
        if (event.source && event.source.postMessage) {
          event.source.postMessage({ type: "BADGE_COUNT_RESPONSE", count });
        }
      });
    }
  }
});

// Background Sync & Periodic Sync for Midnight Master State Refresh
self.addEventListener("sync", (event) => {
  if (event.tag === "midnight-master-sync" || event.tag === "sync-notifications") {
    event.waitUntil(
      broadcastBadgeToClients(-1)
    );
  }
});

self.addEventListener("periodicsync", (event) => {
  if (event.tag === "daily-midnight-sync") {
    event.waitUntil(
      broadcastBadgeToClients(-1)
    );
  }
});

// 3. Fetch Event: Strict security and intelligent routing
self.addEventListener("fetch", (event) => {
  const request = event.request;

  // Only handle GET requests; all mutations bypass directly
  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  // SECURITY GUARD: Never intercept or cache API, NextAuth, or real-time routes
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.includes("/auth/") ||
    url.pathname.includes("session") ||
    url.pathname.includes("token") ||
    url.searchParams.has("nocache")
  ) {
    return; // Pass through to network directly
  }

  // Handle HTML Page Navigations: Resilient Network-First with Safe Fallback
  // NEVER reject and NEVER abort prematurely, ensuring the home page always loads smoothly on phones!
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          // Live server response succeeded - return directly to the browser
          return networkResponse;
        })
        .catch(async (fetchError) => {
          console.warn("[SW] Navigation network fetch failed, using fallback:", fetchError);
          // Network failed (offline or network error) - fallback to cached offline shell
          try {
            const cache = await caches.open(CACHE_NAME);
            const cachedOffline = await cache.match("/offline.html");
            if (cachedOffline) {
              return cachedOffline;
            }
          } catch (cacheErr) {}

          // Resilient 200 HTML response: NEVER reject (which causes ERR_FAILED in Chrome)
          return new Response(
            `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>SRT Portal</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #060a28; color: #fff; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; text-align: center; padding: 20px; box-sizing: border-box; }
    .card { background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); padding: 2rem; border-radius: 12px; max-width: 400px; width: 100%; }
    h2 { color: #f2b84b; margin-top: 0; }
    p { color: #cbd5e1; font-size: 0.95rem; line-height: 1.5; }
    .btn { display: inline-block; background: #2563eb; color: #fff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; margin-top: 1rem; border: none; cursor: pointer; }
  </style>
</head>
<body>
  <div class="card">
    <h2>SRT Portal</h2>
    <p>Please check your internet connection and tap Retry.</p>
    <button class="btn" onclick="window.location.reload()">Retry Connection</button>
  </div>
</body>
</html>`,
            {
              status: 200,
              headers: { "Content-Type": "text/html; charset=utf-8" },
            }
          );
        })
    );
    return;
  }

  // Handle Static Assets (/_next/static/, /icons/, /images/, /fonts/, .js, .css) with Stale-While-Revalidate
  const isStaticAsset =
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname.startsWith("/images/") ||
    url.pathname.startsWith("/logo/") ||
    url.pathname.startsWith("/fonts/") ||
    url.pathname.endsWith(".js") ||
    url.pathname.endsWith(".css") ||
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".svg") ||
    url.pathname.endsWith(".ico") ||
    url.pathname.endsWith(".webp") ||
    url.pathname.endsWith(".woff2");

  if (isStaticAsset) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cachedResponse = await cache.match(request);
        const fetchPromise = fetch(request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              cache.put(request, networkResponse.clone());
            }
            return networkResponse;
          })
          .catch(() => cachedResponse);

        return cachedResponse || fetchPromise;
      })
    );
    return;
  }

  // Default: Network with cache fallback
  event.respondWith(
    fetch(request).catch(async () => {
      const cached = await caches.match(request);
      return cached || new Response("", { status: 408, statusText: "Network Timeout" });
    })
  );
});

// In-memory deduplication set for sliding 60-second window to eliminate repeating / duplicate pushes
const seenPushIdentifiers = new Map();

// 4. Push Event: Show OS-level notifications from Web Push API
self.addEventListener("push", (event) => {
  const showPushNotification = async () => {
    let title = "SRT Portal";
    let body = "You have a new school notification.";
    let targetUrl = "/dashboard";
    let iconUrl = "/icon-192x192.png";
    let badgeUrl = "/badge-72x72.png";
    let tag = null;
    let notificationId = null;
    let unreadCount = 1;

    if (event.data) {
      try {
        const payload = event.data.json();
        if (payload.title) title = payload.title;
        if (payload.body) body = payload.body;
        if (payload.url) targetUrl = payload.url;
        else if (payload.data && payload.data.url) targetUrl = payload.data.url;
        if (payload.icon) iconUrl = payload.icon;
        if (payload.badge) badgeUrl = payload.badge;
        if (payload.tag) tag = payload.tag;
        else if (payload.data && payload.data.tag) tag = payload.data.tag;
        if (payload.data && payload.data.notificationId) notificationId = payload.data.notificationId;

        if (payload.unreadCount !== undefined) {
          unreadCount = parseInt(payload.unreadCount, 10) || 0;
        } else if (payload.badgeCount !== undefined) {
          unreadCount = parseInt(payload.badgeCount, 10) || 0;
        } else if (payload.data && payload.data.unreadCount !== undefined) {
          unreadCount = parseInt(payload.data.unreadCount, 10) || 0;
        }
      } catch {
        try {
          const txt = event.data.text();
          if (txt) body = txt;
        } catch { }
      }
    }

    // Stable deterministic tag
    tag = tag || (notificationId ? "notif-" + notificationId : "srt-general");

    // Deduplication check: drop duplicate pushes delivered via multiple channels within 60s
    const dedupeIdentifier = notificationId ? "id:" + notificationId : (tag !== "srt-general" ? "tag:" + tag : "content:" + title + ":" + body);
    const now = Date.now();
    const lastSeen = seenPushIdentifiers.get(dedupeIdentifier);
    if (lastSeen && (now - lastSeen < 60000)) {
      console.log("[ServiceWorker] Dropping duplicate push received within 60s:", dedupeIdentifier);
      return;
    }
    seenPushIdentifiers.set(dedupeIdentifier, now);

    // Prune stale cache entries (> 2 minutes)
    for (const [key, ts] of seenPushIdentifiers.entries()) {
      if (now - ts > 120000) {
        seenPushIdentifiers.delete(key);
      }
    }

    // WhatsApp-Style App Icon Badge Update:
    // Call navigator.setAppBadge or self.registration.setAppBadge and persist to IndexedDB
    try {
      if ("setAppBadge" in self.navigator) {
        await self.navigator.setAppBadge(unreadCount);
      } else if (self.registration && "setAppBadge" in self.registration) {
        await self.registration.setAppBadge(unreadCount);
      }
      await setStoredBadgeCount(unreadCount);
      await broadcastBadgeToClients(unreadCount);
    } catch (badgeErr) {
      console.debug("[ServiceWorker] App badge update note:", badgeErr);
    }

    const options = {
      body: body,
      icon: iconUrl || "/icon-192x192.png",
      badge: badgeUrl || "/badge-72x72.png",
      vibrate: [200, 100, 200],
      timestamp: Date.now(),
      requireInteraction: true,
      renotify: true,
      tag: tag,
      data: {
        url: targetUrl || "/",
        tag: tag,
        notificationId: notificationId,
        unreadCount: unreadCount,
      },
    };

    try {
      await self.registration.showNotification(title, options);
    } catch (err) {
      console.warn("[ServiceWorker] Primary showNotification failed, attempting resilient fallback:", err);
      try {
        await self.registration.showNotification(title, {
          body: body,
          icon: "/icon-192x192.png",
          badge: "/badge-72x72.png",
          tag: tag,
          renotify: true,
          requireInteraction: true,
          data: {
            url: targetUrl || "/",
            tag: tag,
            notificationId: notificationId,
            unreadCount: unreadCount,
          },
        });
      } catch (fallbackErr) {
        console.error("[ServiceWorker] Fallback showNotification failed:", fallbackErr);
      }
    }
  };

  event.waitUntil(showPushNotification());
});

// 5. Notification Click Event: Navigate to relevant portal page and clear badge
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  // If user clicked the "Dismiss" action button, don't focus or navigate
  if (event.action === "close") {
    return;
  }

  const notifData = event.notification.data || {};
  const notifId = notifData.notificationId;
  const rawUrl = notifData.url || "/dashboard";
  const fullTargetUrl = new URL(rawUrl, self.location.origin).href;

  // Background mark-as-read and clear/decrement badge
  if (notifId) {
    fetch("/api/notifications/mark-read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notificationId: notifId }),
    }).catch(() => { });
  }

  // Clear or decrement badge upon interaction
  removeAppBadge().catch(() => { });
  broadcastBadgeToClients(0).catch(() => { });

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windowClients) => {
        // If an open window matches our origin, focus and navigate it
        for (const client of windowClients) {
          if (client.url.startsWith(self.location.origin)) {
            if ("navigate" in client) {
              client.navigate(fullTargetUrl).catch(() => {});
            }
            if ("focus" in client) {
              return client.focus().catch(() => {});
            }
            return;
          }
        }
        // Otherwise, open a new window
        if (clients.openWindow) {
          return clients.openWindow(fullTargetUrl).catch(() => {});
        }
      })
  );
});
