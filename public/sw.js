/**
 * Nipo Portal (SRT Universal School) - Progressive Web App Service Worker
 * Version: 3.0.0
 * Features: Offline fallback shell, fast static caching, Web Push notifications, OS click navigation.
 * Security: Strict bypass for all /api/, NextAuth, and dynamic private data.
 */

const CACHE_NAME = "srt-pwa-v3";
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
  if (!event.data) return;

  try {
    const data = event.data.json();
    const title = data.title || "Nipo Portal";
    const options = {
      body: data.body || "",
      icon: data.icon || "/icons/icon-192x192.png",
      badge: data.badge || "/icons/icon-192x192.png",
      vibrate: [120, 60, 120],
      data: {
        url: data.url || "/dashboard",
        ...(data.data || {}),
      },
      tag: data.tag || `nipo-push-${Date.now()}`,
      renotify: true,
      requireInteraction: data.priority === "URGENT",
    };

    event.waitUntil(self.registration.showNotification(title, options));
  } catch (err) {
    const text = event.data.text();
    event.waitUntil(
      self.registration.showNotification("Nipo Portal", {
        body: text,
        icon: "/icons/icon-192x192.png",
        data: { url: "/dashboard" },
      })
    );
  }
});

// 5. Notification Click Event: Navigate to relevant portal page
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

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
