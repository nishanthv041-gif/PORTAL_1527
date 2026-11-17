importScripts("https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js");

// WhatsApp-Style App Icon Badge Handler for OneSignal Push Notifications
self.addEventListener("push", (event) => {
  try {
    if (event.data) {
      const payload = event.data.json();
      const count =
        payload?.custom?.a?.unreadCount ??
        payload?.data?.unreadCount ??
        payload?.unreadCount ??
        payload?.custom?.a?.badgeCount ??
        1;
      const safeCount = Math.max(0, parseInt(count, 10) || 0);

      if ("setAppBadge" in self.navigator) {
        self.navigator.setAppBadge(safeCount);
      } else if (self.registration && "setAppBadge" in self.registration) {
        self.registration.setAppBadge(safeCount);
      }
    }
  } catch {
    // Non-blocking
  }
});

self.addEventListener("notificationclick", (event) => {
  try {
    if ("clearAppBadge" in self.navigator) {
      self.navigator.clearAppBadge();
    } else if (self.registration && "clearAppBadge" in self.registration) {
      self.registration.clearAppBadge();
    }
  } catch {
    // Non-blocking
  }
});
