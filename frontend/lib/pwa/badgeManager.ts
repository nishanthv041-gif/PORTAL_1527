/**
 * App Icon Badging API Manager (WhatsApp-Style)
 * 
 * Synchronizes the unread notification badge on the installed PWA app icon:
 * 1. Client-side via navigator.setAppBadge() / navigator.clearAppBadge()
 * 2. ServiceWorker-side via message channel for IndexedDB persistence
 */

export async function setAppBadgeCount(count: number): Promise<void> {
  const safeCount = Math.max(0, Math.floor(count));

  // 1. Direct browser / OS Badging API
  if (typeof window !== "undefined" && "setAppBadge" in navigator) {
    try {
      if (safeCount > 0) {
        await (navigator as any).setAppBadge(safeCount);
      } else {
        await (navigator as any).clearAppBadge();
      }
    } catch (err) {
      console.debug("[BadgeManager] navigator.setAppBadge note:", err);
    }
  }

  // 2. Synchronize with Service Worker & IndexedDB
  if (typeof window !== "undefined" && "serviceWorker" in navigator) {
    try {
      const reg = await navigator.serviceWorker.ready;
      if (reg.active) {
        reg.active.postMessage({
          type: safeCount > 0 ? "SET_BADGE" : "CLEAR_BADGE",
          count: safeCount,
        });
      }
    } catch {}
  }
}

export async function clearAppBadgeCount(): Promise<void> {
  if (typeof window !== "undefined" && "clearAppBadge" in navigator) {
    try {
      await (navigator as any).clearAppBadge();
    } catch (err) {
      console.debug("[BadgeManager] navigator.clearAppBadge note:", err);
    }
  }

  if (typeof window !== "undefined" && "serviceWorker" in navigator) {
    try {
      const reg = await navigator.serviceWorker.ready;
      if (reg.active) {
        reg.active.postMessage({ type: "CLEAR_BADGE" });
      }
    } catch {}
  }
}

/**
 * Fetches latest unread count from the server and updates app icon badge
 */
export async function syncAppBadgeWithServer(): Promise<number> {
  if (typeof window === "undefined") return 0;
  try {
    const res = await fetch("/api/notifications/unread-count", {
      headers: { "Cache-Control": "no-cache" },
    });
    if (res.ok) {
      const data = await res.json();
      const count = typeof data.count === "number" ? data.count : 0;
      await setAppBadgeCount(count);
      return count;
    }
  } catch (err) {
    console.debug("[BadgeManager] Server unread count sync note:", err);
  }
  return 0;
}
