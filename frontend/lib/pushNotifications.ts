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

export const APP_ID = ONESIGNAL_APP_ID;

let isNativeInitialized = false;

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
    console.debug("[PushNotifications] Native plugin load note:", err);
    return (window as any)?.OneSignal || null;
  }
}

/**
 * Platform-Aware Push Initializer
 * - Native iOS/Android: Initializes OneSignal via onesignal-cordova-plugin
 * - Web Browsers: Initializes OneSignal Web SDK v16 with ServiceWorker
 */
export async function initPushNotifications(userId?: string): Promise<void> {
  if (typeof window === "undefined") return;

  if (Capacitor.isNativePlatform()) {
    try {
      const nativeOS = await getNativeOneSignal();
      if (nativeOS && !isNativeInitialized) {
        // OneSignal Cordova SDK v5+ initialization
        if (typeof nativeOS.initialize === "function") {
          nativeOS.initialize(APP_ID);
        } else if (typeof nativeOS.setAppId === "function") {
          nativeOS.setAppId(APP_ID);
        }

        // Request native push notification permission
        if (nativeOS.Notifications?.requestPermission) {
          await nativeOS.Notifications.requestPermission(true);
        }

        isNativeInitialized = true;
        console.log("[PushNotifications] Native OneSignal initialized successfully for app:", APP_ID);
      }

      if (userId && nativeOS) {
        if (typeof nativeOS.login === "function") {
          await nativeOS.login(String(userId).trim());
          console.log("[PushNotifications] Native OneSignal linked to user ID:", userId);
        }
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
 * Link user to OneSignal push service on login (external_id = userId)
 */
export async function loginToPushService(userId: string): Promise<boolean> {
  if (typeof window === "undefined" || !userId) return false;

  if (Capacitor.isNativePlatform()) {
    try {
      const nativeOS = await getNativeOneSignal();
      if (nativeOS && typeof nativeOS.login === "function") {
        await nativeOS.login(String(userId).trim());
        console.log("[PushNotifications] Native push linked to user:", userId);
        return true;
      }
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
      const nativeOS = await getNativeOneSignal();
      if (nativeOS?.Notifications?.requestPermission) {
        const granted = await nativeOS.Notifications.requestPermission(true);
        return Boolean(granted);
      }
      return true;
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
