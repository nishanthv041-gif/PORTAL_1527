/**
 * Nipo Portal (SRT Universal School) - Progressive Web App Service Worker
 * Version: 3.0.0
 * Features: Offline fallback shell, fast static caching, Web Push notifications, OS click navigation.
 * Security: Strict bypass for all /api/, NextAuth, and dynamic private data.
 */

const CACHE_NAME = "srt-pwa-v8";
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

// 1. Install Event: Pre-cache static offline shell
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS);
    })
  );
  self.skipWaiting();
});

// 2. Activate Event: Clean up outdated caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Immediate Activation Message Listener (prevents Service Worker from getting stuck in waiting phase)
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
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

  // Handle HTML Page Navigations (Network-First with Offline Fallback)
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .catch(async () => {
          const cache = await caches.open(CACHE_NAME);
          const cachedOffline = await cache.match("/offline.html");
          return cachedOffline || Response.error();
        })
    );
    return;
  }

  // Handle Static Assets (/_next/static/, /icons/, /images/, /fonts/) with Stale-While-Revalidate
  const isStaticAsset =
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname.startsWith("/images/") ||
    url.pathname.startsWith("/logo/") ||
    url.pathname.startsWith("/fonts/") ||
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".svg") ||
    url.pathname.endsWith(".ico") ||
    url.pathname.endsWith(".webp");

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
      return cached || Response.error();
    })
  );
});

// 4. Push Event: Show OS-level notifications from Web Push API
self.addEventListener("push", (event) => {
  const showPushNotification = async () => {
    let title = "Nipo Portal";
    let body = "You have a new school update.";
    let targetUrl = "/dashboard";
    let iconUrl = self.location.origin + "/icons/icon-192x192.png";
    let badgeUrl = self.location.origin + "/icons/icon-192x192.png";
    let tag = "nipo-" + Date.now();

    if (event.data) {
      try {
        const payload = event.data.json();
        if (payload.title) title = payload.title;
        if (payload.body) body = payload.body;
        if (payload.url) targetUrl = payload.url;
        else if (payload.data && payload.data.url) targetUrl = payload.data.url;
        if (payload.icon) {
          iconUrl = payload.icon.startsWith("http") ? payload.icon : self.location.origin + payload.icon;
        }
        if (payload.badge) {
          badgeUrl = payload.badge.startsWith("http") ? payload.badge : self.location.origin + payload.badge;
        }
        if (payload.tag) tag = payload.tag;
      } catch {
        try {
          const txt = event.data.text();
          if (txt) body = txt;
        } catch {}
      }
    }

    const options = {
      body: body,
      icon: iconUrl,
      badge: badgeUrl,
      vibrate: [200, 100, 200],
      timestamp: Date.now(),
      data: {
        url: targetUrl,
      },
      tag: tag,
      renotify: true,
      actions: [
        { action: "open", title: "Open" }
      ],
    };

    try {
      await self.registration.showNotification(title, options);
    } catch (err) {
      console.warn("[ServiceWorker] Primary showNotification failed, attempting resilient fallback:", err);
      try {
        await self.registration.showNotification(title, {
          body: body,
          icon: iconUrl,
          tag: tag,
          data: {
            url: targetUrl,
          },
        });
      } catch (fallbackErr) {
        console.error("[ServiceWorker] Fallback showNotification failed:", fallbackErr);
      }
    }
  };

  event.waitUntil(showPushNotification());
});

// 5. Notification Click Event: Navigate to relevant portal page
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  // If user clicked the "Dismiss" action button, don't focus or navigate
  if (event.action === "close") {
    return;
  }

  const targetUrl =
    (event.notification.data && event.notification.data.url) || "/dashboard";

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windowClients) => {
        // If an open window matches our origin, focus and navigate it
        for (const client of windowClients) {
          if (
            client.url.startsWith(self.location.origin) &&
            "focus" in client
          ) {
            client.focus();
            if ("navigate" in client) {
              return client.navigate(targetUrl);
            }
            return;
          }
        }
        // Otherwise, open a new window
        if (clients.openWindow) {
          return clients.openWindow(targetUrl);
        }
      })
  );
});
