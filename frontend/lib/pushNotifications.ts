"use client";

import { Capacitor } from "@capacitor/core";
import {
  initOneSignal as initOneSignalWeb,
  loginToOneSignal as loginToOneSignalWeb,
  logoutFromOneSignal as logoutFromOneSignalWeb,
  requestOneSignalPermission as requestOneSignalPermissionWeb,
  hasOneSignalPermission as hasOneSignalPermissionWeb,
  ONESIGNAL_APP_ID,
} from "./onesignal";
import { setAppBadgeCount } from "./pwa/badgeManager";

export const APP_ID = ONESIGNAL_APP_ID;

let isNativeInitialized = false;
let isCapacitorPushListenersRegistered = false;

/**
 * Check if the app is currently running inside Capacitor (native iOS/Android)
 */
export function isNativeApp(): boolean {
  return typeof window !== "undefined" && Capacitor.isNativePlatform();
}

/**
 * Get native OneSignal instance safely (avoids SSR window crashes)
 */
async function getNativeOneSignal(): Promise<any | null> {
  if (typeof window === "undefined" || !Capacitor.isNativePlatform()) {
    return null;
  }

  // 1. Check window.plugins.OneSignal (Cordova bridge)
  if ((window as any)?.plugins?.OneSignal) {
    return (window as any).plugins.OneSignal;
  }

  // 2. Try dynamic import of onesignal-cordova-plugin
  try {
    const pluginModule = await import("onesignal-cordova-plugin");
    return pluginModule.default || pluginModule;
  } catch (err) {
    console.debug("[PushNotifications] Native OneSignal plugin load note:", err);
    return (window as any)?.OneSignal || null;
  }
}

/**
 * Get @capacitor/push-notifications plugin safely
 */
async function getCapacitorPushPlugin(): Promise<any | null> {
  if (typeof window === "undefined" || !Capacitor.isNativePlatform()) {
    return null;
  }
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    return PushNotifications;
  } catch (err) {
    console.debug("[PushNotifications] @capacitor/push-notifications plugin load note:", err);
    return null;
  }
}

/**
 * Register native device token to backend PostgreSQL (/api/push/register)
 */
async function sendTokenToBackend(token: string, userId?: string) {
  try {
    const platform = Capacitor.getPlatform().toUpperCase(); // "ANDROID" | "IOS"
    await fetch("/api/push/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token,
        platform,
        deviceName: `${platform === "ANDROID" ? "Android" : "iOS"} Native App`,
        userAgent: navigator.userAgent,
        userId: userId || undefined,
      }),
    });
    console.log(`[PushNotifications] Registered native ${platform} push token with backend.`);
  } catch (err) {
    console.debug("[PushNotifications] Token register note:", err);
  }
}

/**
 * Setup Capacitor Native Push Listeners (FCM / APNs)
 */
async function setupCapacitorPushListeners(userId?: string) {
  if (isCapacitorPushListenersRegistered) return;
  const PushNotifications = await getCapacitorPushPlugin();
  if (!PushNotifications) return;

  try {
    // 1. On Token Registration -> Send to backend
    await PushNotifications.addListener("registration", (token: { value: string }) => {
      console.log("[PushNotifications] Native device token received:", token.value?.slice(0, 20) + "...");
      sendTokenToBackend(token.value, userId);
    });

    // 2. On Registration Error
    await PushNotifications.addListener("registrationError", (error: any) => {
      console.warn("[PushNotifications] Native device token registration failed:", error);
    });

    // 3. Foreground Notification Received -> Update App Icon Badge
    await PushNotifications.addListener("pushNotificationReceived", (notification: any) => {
      console.log("[PushNotifications] Notification received in foreground:", notification.title);
      const rawCount =
        notification.data?.unreadCount ||
        notification.badge ||
        notification.data?.badgeCount;
      if (rawCount !== undefined) {
        setAppBadgeCount(Number(rawCount) || 1).catch(() => {});
      }
    });

    // 4. Notification Action Performed (Tapped) -> Navigate to URL
    await PushNotifications.addListener("pushNotificationActionPerformed", (action: any) => {
      const data = action.notification?.data;
      const targetUrl = data?.url || "/dashboard";
      console.log("[PushNotifications] Notification tapped. Navigating to:", targetUrl);
      if (typeof window !== "undefined") {
        window.location.href = targetUrl;
      }
    });

    isCapacitorPushListenersRegistered = true;
  } catch (err) {
    console.debug("[PushNotifications] Setup listeners note:", err);
  }
}

/**
 * Platform-Aware Push Initializer
 * - Native iOS/Android: Initializes OneSignal via onesignal-cordova-plugin AND @capacitor/push-notifications
 * - Web Browsers: Initializes OneSignal Web SDK v16 with ServiceWorker
 */
export async function initPushNotifications(userId?: string): Promise<void> {
  if (typeof window === "undefined") return;

  if (Capacitor.isNativePlatform()) {
    try {
      // 1. Initialize Capacitor Push Listeners & Request Registration
      await setupCapacitorPushListeners(userId);
      const PushNotifications = await getCapacitorPushPlugin();
      if (PushNotifications) {
        const permStatus = await PushNotifications.checkPermissions();
        if (permStatus.receive === "granted") {
          await PushNotifications.register();
        }
      }

      // 2. Initialize Native OneSignal SDK
      const nativeOS = await getNativeOneSignal();
      if (nativeOS && !isNativeInitialized) {
        if (typeof nativeOS.initialize === "function") {
          nativeOS.initialize(APP_ID);
        } else if (typeof nativeOS.setAppId === "function") {
          nativeOS.setAppId(APP_ID);
        }

        if (nativeOS.Notifications?.requestPermission) {
          await nativeOS.Notifications.requestPermission(true);
        }

        isNativeInitialized = true;
        console.log("[PushNotifications] Native OneSignal initialized successfully for app:", APP_ID);
      }

      if (userId && nativeOS && typeof nativeOS.login === "function") {
        await nativeOS.login(String(userId).trim());
        console.log("[PushNotifications] Native OneSignal linked to user ID:", userId);
      }
    } catch (err) {
      console.warn("[PushNotifications] Native initialization error:", err);
    }
  } else {
    // Desktop & Mobile Web Browser
    try {
      await initOneSignalWeb();
      if (userId) {
        await loginToOneSignalWeb(userId);
      }
    } catch (err) {
      console.warn("[PushNotifications] Web initialization error:", err);
    }
  }
}

/**
 * Link user to push services on login (external_id = userId)
 */
export async function loginToPushService(userId: string): Promise<boolean> {
  if (typeof window === "undefined" || !userId) return false;

  if (Capacitor.isNativePlatform()) {
    try {
      const nativeOS = await getNativeOneSignal();
      if (nativeOS && typeof nativeOS.login === "function") {
        await nativeOS.login(String(userId).trim());
        console.log("[PushNotifications] Native push linked to user:", userId);
      }

      const PushNotifications = await getCapacitorPushPlugin();
      if (PushNotifications) {
        await PushNotifications.register();
      }
      return true;
    } catch (err) {
      console.warn("[PushNotifications] Native login link error:", err);
    }
    return false;
  }

  return await loginToOneSignalWeb(userId);
}

/**
 * Unlink user from push service on logout
 */
export async function logoutFromPushService(): Promise<void> {
  if (typeof window === "undefined") return;

  if (Capacitor.isNativePlatform()) {
    try {
      const nativeOS = await getNativeOneSignal();
      if (nativeOS && typeof nativeOS.logout === "function") {
        await nativeOS.logout();
      }
    } catch (err) {
      console.debug("[PushNotifications] Native logout error:", err);
    }
    return;
  }

  await logoutFromOneSignalWeb();
}

/**
 * Request notification permission from the user
 */
export async function requestPushPermission(): Promise<boolean> {
  if (typeof window === "undefined") return false;

  if (Capacitor.isNativePlatform()) {
    try {
      let isGranted = false;

      // 1. Try Capacitor PushNotifications request
      const PushNotifications = await getCapacitorPushPlugin();
      if (PushNotifications) {
        const result = await PushNotifications.requestPermissions();
        if (result.receive === "granted") {
          await PushNotifications.register();
          isGranted = true;
        }
      }

      // 2. Try Native OneSignal request
      const nativeOS = await getNativeOneSignal();
      if (nativeOS?.Notifications?.requestPermission) {
        const granted = await nativeOS.Notifications.requestPermission(true);
        if (granted) isGranted = true;
      }

      return isGranted;
    } catch (err) {
      console.warn("[PushNotifications] Native permission request error:", err);
      return false;
    }
  }

  return await requestOneSignalPermissionWeb();
}

/**
 * Check if push notification permission is granted
 */
export async function checkPushPermission(): Promise<boolean> {
  if (typeof window === "undefined") return false;

  if (Capacitor.isNativePlatform()) {
    try {
      const PushNotifications = await getCapacitorPushPlugin();
      if (PushNotifications) {
        const permStatus = await PushNotifications.checkPermissions();
        if (permStatus.receive === "granted") return true;
      }

      const nativeOS = await getNativeOneSignal();
      if (nativeOS?.Notifications?.hasPermission) {
        const hasPerm = await nativeOS.Notifications.hasPermission();
        return Boolean(hasPerm);
      }
      if (nativeOS?.Notifications?.permission !== undefined) {
        return Boolean(nativeOS.Notifications.permission);
      }
      return true;
    } catch {
      return false;
    }
  }

  return hasOneSignalPermissionWeb();
}
