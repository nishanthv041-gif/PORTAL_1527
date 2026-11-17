/**
 * App Icon Badging API Manager (WhatsApp-Style)
 * 
 * Synchronizes the unread notification badge on the installed PWA / Native app icon:
 * 1. Native Capacitor (iOS APNs / Android launcher): @capawesome/capacitor-badge
 * 2. Web Browsers (Chrome / Edge / Safari PWA): navigator.setAppBadge() / navigator.clearAppBadge()
 * 3. ServiceWorker-side via message channel for background sync
 */

import { Capacitor } from "@capacitor/core";

async function getNativeBadgePlugin(): Promise<any | null> {
  if (typeof window === "undefined" || !Capacitor.isNativePlatform()) {
    return null;
  }
  try {
    const mod = await import("@capawesome/capacitor-badge");
    return mod.Badge || mod;
  } catch (err) {
    console.debug("[BadgeManager] Native Badge plugin load note:", err);
    return null;
  }
}

export async function setAppBadgeCount(count: number): Promise<void> {
  const safeCount = Math.max(0, Math.floor(count));

  // 1. Native Mobile App (Capacitor iOS & Android)
  if (typeof window !== "undefined" && Capacitor.isNativePlatform()) {
    try {
      const Badge = await getNativeBadgePlugin();
      if (Badge) {
        if (safeCount > 0) {
          await Badge.set({ count: safeCount });
        } else {
          await Badge.clear();
        }
        return;
      }
    } catch (err) {
      console.debug("[BadgeManager] Native Badge.set note:", err);
    }
  }

  // 2. Direct browser / OS Web Badging API
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

  // 3. Synchronize with Service Worker & IndexedDB (Web only)
  if (typeof window !== "undefined" && !Capacitor.isNativePlatform() && "serviceWorker" in navigator) {
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
  // 1. Native Mobile App (Capacitor iOS & Android)
  if (typeof window !== "undefined" && Capacitor.isNativePlatform()) {
    try {
      const Badge = await getNativeBadgePlugin();
      if (Badge) {
        await Badge.clear();
        return;
      }
    } catch (err) {
      console.debug("[BadgeManager] Native Badge.clear note:", err);
    }
  }

  // 2. Browser Web Badging API
  if (typeof window !== "undefined" && "clearAppBadge" in navigator) {
    try {
      await (navigator as any).clearAppBadge();
    } catch (err) {
      console.debug("[BadgeManager] navigator.clearAppBadge note:", err);
    }
  }

  // 3. Service Worker
  if (typeof window !== "undefined" && !Capacitor.isNativePlatform() && "serviceWorker" in navigator) {
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
