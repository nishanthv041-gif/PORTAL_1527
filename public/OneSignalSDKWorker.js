/**
 * OneSignal & Unified PWA Web Push Service Worker
 * SRT Universal School Portal
 * 
 * Supports:
 * 1. Unified App Shell Caching & Offline Engine (via /sw.js)
 * 2. OneSignal Push Notifications (via OneSignalSDK.sw.js v16)
 * 3. Direct VAPID Web Push (Android Chrome, iOS Safari PWA, Windows & macOS)
 * 4. Lock-screen popups with vibration & sound for chat messages, announcements, meetings & alerts
 * 5. WhatsApp-style home screen app icon badge count (setAppBadge / clearAppBadge)
 * 6. Notification click navigation directly to the chat thread or target page
 */

// Import Core High-Performance Service Worker & App Shell Caching Engine
try {
  importScripts("/sw.js");
} catch (swErr) {
  console.warn("[OneSignal Worker] Could not load /sw.js caching engine:", swErr);
}

// 1. Core Lifecycle: Immediate activation without waiting for existing tabs to close
self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// 2. Import OneSignal Web SDK v16 Worker
try {
  importScripts("https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js");
} catch (osErr) {
  console.warn("[OneSignal Worker] Could not load OneSignal SDK script:", osErr);
}

// ============================================================================
// 3. Dedicated Push Listener for Direct VAPID & Portal System Notifications
// Guarantees lock-screen banner displays on Android & iOS even if OneSignal skips
// ============================================================================
self.addEventListener("push", (event) => {
  if (!event.data) return;

  const handlePushEvent = async () => {
    let title = "SRT Universal School Portal";
    let body = "You have a new school message.";
    let targetUrl = "/dashboard";
    let iconUrl = "/icon-192x192.png";
    let badgeUrl = "/badge-72x72.png";
    let tag = `srt-notif-${Date.now()}`;
    let notificationId = null;
    let unreadCount = 1;

    try {
      const payload = event.data.json();
      if (payload.title) title = payload.title;
      if (payload.body) body = payload.body;
      else if (payload.message) body = payload.message;

      if (payload.url) targetUrl = payload.url;
      else if (payload.data && payload.data.url) targetUrl = payload.data.url;
      else if (payload.link) targetUrl = payload.link;

      if (payload.icon) iconUrl = payload.icon;
      if (payload.badge) badgeUrl = payload.badge;

      if (payload.tag) tag = payload.tag;
      else if (payload.data && payload.data.tag) tag = payload.data.tag;

      if (payload.data && payload.data.notificationId) {
        notificationId = payload.data.notificationId;
      }

      const rawCount =
        payload.unreadCount ??
        payload.badgeCount ??
        payload.data?.unreadCount ??
        payload.custom?.a?.unreadCount ??
        1;
      unreadCount = Math.max(1, parseInt(rawCount, 10) || 1);
    } catch {
      try {
        const text = event.data.text();
        if (text) body = text;
      } catch {}
    }

    // Update WhatsApp-style home screen app icon badge
    try {
      if ("setAppBadge" in self.navigator) {
        await self.navigator.setAppBadge(unreadCount);
      } else if (self.registration && "setAppBadge" in self.registration) {
        await self.registration.setAppBadge(unreadCount);
      }
    } catch (badgeErr) {
      console.debug("[Worker] setAppBadge note:", badgeErr);
    }

    // High-priority lock screen notification options
    const notificationOptions = {
      body: body,
      icon: iconUrl || "/icon-192x192.png",
      badge: badgeUrl || "/badge-72x72.png",
      vibrate: [200, 100, 200],
      timestamp: Date.now(),
      requireInteraction: true,
      renotify: true,
      tag: tag,
      data: {
        url: targetUrl || "/dashboard",
        tag: tag,
        notificationId: notificationId,
        unreadCount: unreadCount,
      },
      actions: [
        {
          action: "open",
          title: "Open Message",
        },
      ],
    };

    try {
      await self.registration.showNotification(title, notificationOptions);
    } catch (showErr) {
      console.warn("[Worker] Primary showNotification failed, attempting simplified display:", showErr);
      try {
        await self.registration.showNotification(title, {
          body: body,
          icon: "/icon-192x192.png",
          badge: "/badge-72x72.png",
          tag: tag,
          data: { url: targetUrl },
        });
      } catch (fallbackErr) {
        console.error("[Worker] Failed to show notification:", fallbackErr);
      }
    }
  };

  event.waitUntil(handlePushEvent());
});

// ============================================================================
// 5. Notification Click Handler: Focuses or opens the relevant chat/page
// ============================================================================
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  // Clear app badge upon notification interaction
  try {
    if ("clearAppBadge" in self.navigator) {
      self.navigator.clearAppBadge();
    } else if (self.registration && "clearAppBadge" in self.registration) {
      self.registration.clearAppBadge();
    }
  } catch {}

  const notifData = event.notification.data || {};
  const notifId = notifData.notificationId;
  const rawUrl = notifData.url || "/dashboard";
  const fullTargetUrl = new URL(rawUrl, self.location.origin).href;

  if (notifId) {
    fetch("/api/notifications/mark-read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notificationId: notifId }),
    }).catch(() => {});
  }

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windowClients) => {
        for (const client of windowClients) {
          if (client.url.startsWith(self.location.origin)) {
            if ("navigate" in client) {
              client.navigate(fullTargetUrl);
            }
            if ("focus" in client) {
              return client.focus();
            }
            return;
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(fullTargetUrl);
        }
      })
  );
});
