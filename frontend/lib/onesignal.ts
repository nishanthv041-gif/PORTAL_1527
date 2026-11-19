"use client";

import OneSignal from "react-onesignal";

export const ONESIGNAL_APP_ID =
  process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID ||
  "721f0fa5-683c-4edc-93ce-35a8786d655b";

let isInitialized = false;
let initPromise: Promise<void> | null = null;

/**
 * Initialize OneSignal Web SDK v16 with App ID: 721f0fa5-683c-4edc-93ce-35a8786d655b
 */
export async function initOneSignal(): Promise<void> {
  if (typeof window === "undefined") return;
  if (isInitialized) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      const win = window as any;
      if (win.OneSignal && (win.OneSignal.User || win.OneSignal._isInitialized)) {
        isInitialized = true;
        return;
      }

      await OneSignal.init({
        appId: ONESIGNAL_APP_ID,
        allowLocalhostAsSecureOrigin: true,
        serviceWorkerParam: { scope: "/" },
        serviceWorkerPath: "/OneSignalSDKWorker.js",
      });
      isInitialized = true;
      console.log("[OneSignal] Initialized with App ID:", ONESIGNAL_APP_ID);
    } catch (err: any) {
      if (err?.message?.includes("already initialized") || String(err).includes("already initialized")) {
        isInitialized = true;
      } else {
        console.warn("[OneSignal] Initialization note:", err);
      }
    }
  })();

  return initPromise;
}

/**
 * Link the logged-in user's device directly to their PostgreSQL user.id (external_id)
 */
export async function loginToOneSignal(userId: string): Promise<boolean> {
  if (typeof window === "undefined" || !userId) return false;
  try {
    await initOneSignal();
    const cleanId = String(userId).trim();
    const win = window as any;
    if (win.OneSignal && typeof win.OneSignal.login === "function") {
      await win.OneSignal.login(cleanId);
    } else {
      await OneSignal.login(cleanId);
    }
    console.log("[OneSignal] User linked with external_id:", cleanId);
    return true;
  } catch (err) {
    console.warn("[OneSignal] Login link warning:", err);
    return false;
  }
}

/**
 * Unlink device on logout
 */
export async function logoutFromOneSignal(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const win = window as any;
    if (win.OneSignal && typeof win.OneSignal.logout === "function") {
      await win.OneSignal.logout();
    } else if (isInitialized) {
      await OneSignal.logout();
    }
  } catch (err) {
    console.debug("[OneSignal] Logout warning:", err);
  }
}

/**
 * Request notification permission via OneSignal Native Prompt
 */
export async function requestOneSignalPermission(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  try {
    await initOneSignal();
    const win = window as any;
    if (win.OneSignal && win.OneSignal.Notifications && typeof win.OneSignal.Notifications.requestPermission === "function") {
      await win.OneSignal.Notifications.requestPermission();
      return Boolean(win.OneSignal.Notifications.permission);
    }
    await OneSignal.Notifications.requestPermission();
    return Boolean(OneSignal.Notifications.permission);
  } catch (err) {
    console.warn("[OneSignal] Request permission error:", err);
    return false;
  }
}

/**
 * Prompt user via OneSignal Slidedown banner
 */
export async function promptOneSignalSlidedown(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    await initOneSignal();
    const win = window as any;
    if (win.OneSignal && win.OneSignal.Slidedown && typeof win.OneSignal.Slidedown.promptPush === "function") {
      await win.OneSignal.Slidedown.promptPush();
      return;
    }
    await OneSignal.Slidedown.promptPush();
  } catch (err) {
    console.warn("[OneSignal] Slidedown prompt error:", err);
  }
}

/**
 * Check if permission is currently granted
 */
export function hasOneSignalPermission(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      return true;
    }
    const win = window as any;
    if (win.OneSignal && win.OneSignal.Notifications) {
      return Boolean(win.OneSignal.Notifications.permission);
    }
    return Boolean(OneSignal.Notifications.permission);
  } catch {
    return false;
  }
}

export default OneSignal;
