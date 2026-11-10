"use client";

import { useState, useEffect, useCallback, useRef } from "react";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Returns or creates a persistent device fingerprint in localStorage.
 * Guarantees that multiple devices owned by the same user do not overwrite each other.
 */
export function getOrCreateDeviceFingerprint(): string {
  if (typeof window === "undefined") return "server-env";
  const KEY = "srt_pwa_device_fingerprint";
  let fingerprint = localStorage.getItem(KEY);
  if (!fingerprint) {
    fingerprint = `${navigator.platform || "dev"}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(KEY, fingerprint);
  }
  return fingerprint;
}

export interface UsePushNotificationOptions {
  userId?: string | null;
  autoSyncOnLogin?: boolean;
}

export interface UsePushNotificationReturn {
  isSupported: boolean;
  permission: NotificationPermission | "unsupported";
  subscription: PushSubscription | null;
  deviceFingerprint: string;
  isLoading: boolean;
  error: string | null;
  subscribe: () => Promise<boolean>;
  unsubscribe: () => Promise<boolean>;
  refreshSession: () => Promise<void>;
}

/**
 * Production-ready React hook for PWA push notification lifecycle management.
 * - Waits for ServiceWorker registration to be ready.
 * - Manages permission lifecycle and subscription generation.
 * - Refreshes the 24-hour last_login_at timestamp on login and window focus.
 */
export function usePushNotification(
  options: UsePushNotificationOptions = {}
): UsePushNotificationReturn {
  const { userId = null, autoSyncOnLogin = true } = options;

  const [isSupported, setIsSupported] = useState<boolean>(false);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const deviceFingerprintRef = useRef<string>("");
  const lastSyncTimestampRef = useRef<number>(0);

  // 1. Initial capability detection
  useEffect(() => {
    if (typeof window === "undefined") return;

    const supported =
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window;

    setIsSupported(supported);
    deviceFingerprintRef.current = getOrCreateDeviceFingerprint();

    if (!supported) {
      setPermission("unsupported");
      setIsLoading(false);
      return;
    }

    setPermission(Notification.permission);

    // Watch for Service Worker updates and auto-skip waiting
    navigator.serviceWorker.ready.then((reg) => {
      reg.addEventListener("updatefound", () => {
        const newWorker = reg.installing;
        if (newWorker) {
          newWorker.addEventListener("statechange", () => {
            if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
              newWorker.postMessage({ type: "SKIP_WAITING" });
            }
          });
        }
      });

      return reg.pushManager.getSubscription();
    }).then((sub) => {
      setSubscription(sub);
      setIsLoading(false);
    }).catch((err) => {
      console.warn("[usePushNotification] Init warning:", err);
      setIsLoading(false);
    });
  }, []);

  // 2. Refresh session / sync subscription with backend
  const refreshSession = useCallback(async () => {
    if (!isSupported || Notification.permission !== "granted") return;

    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (!sub) return;

      const raw = sub.toJSON();
      let p256dh = raw.keys?.p256dh;
      let auth = raw.keys?.auth;

      if ((!p256dh || !auth) && sub.getKey) {
        const rawKey = sub.getKey("p256dh");
        if (rawKey) {
          p256dh = btoa(String.fromCharCode(...new Uint8Array(rawKey)))
            .replace(/\+/g, "-")
            .replace(/\//g, "_")
            .replace(/=+$/, "");
        }
        const rawAuth = sub.getKey("auth");
        if (rawAuth) {
          auth = btoa(String.fromCharCode(...new Uint8Array(rawAuth)))
            .replace(/\+/g, "-")
            .replace(/\//g, "_")
            .replace(/=+$/, "");
        }
      }

      if (!p256dh || !auth) return;

      const fingerprint = deviceFingerprintRef.current || getOrCreateDeviceFingerprint();

      await fetch("/api/notifications/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: sub.endpoint,
          keys: { p256dh, auth },
          userId,
          deviceFingerprint: fingerprint,
          userAgent: navigator.userAgent,
          platform: navigator.platform,
        }),
      });

      lastSyncTimestampRef.current = Date.now();
    } catch (err: unknown) {
      console.warn("[usePushNotification] refreshSession warning:", err);
    }
  }, [isSupported, userId]);

  // 3. Auto-sync whenever user logs in or window regains focus
  useEffect(() => {
    if (!autoSyncOnLogin || !userId || !isSupported) return;

    const throttleTime = 30000; // Throttle to max once per 30 seconds
    const now = Date.now();
    if (now - lastSyncTimestampRef.current < throttleTime) return;

    refreshSession();

    const handleFocus = () => {
      if (!document.hidden && Date.now() - lastSyncTimestampRef.current > throttleTime) {
        refreshSession();
      }
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleFocus);

    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleFocus);
    };
  }, [userId, autoSyncOnLogin, isSupported, refreshSession]);

  // 4. Subscribe method
  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!isSupported) {
      setError("Push notifications are not supported on this device/browser.");
      return false;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Prompt user for permission cleanly
      const perm = await Notification.requestPermission();
      setPermission(perm);

      if (perm !== "granted") {
        setIsLoading(false);
        setError("Notification permission was denied.");
        return false;
      }

      // Fetch VAPID public key
      const keyRes = await fetch("/api/notifications/push/public-key");
      const keyData = await keyRes.json();
      if (!keyData?.publicKey) {
        throw new Error("Failed to retrieve VAPID public key from server.");
      }

      const reg = await navigator.serviceWorker.ready;
      const keyBuffer = urlBase64ToUint8Array(keyData.publicKey);

      // Subscribe via PushManager
      const newSub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: keyBuffer as unknown as BufferSource,
      });

      setSubscription(newSub);

      const raw = newSub.toJSON();
      const fingerprint = deviceFingerprintRef.current || getOrCreateDeviceFingerprint();

      // Persist to backend with device fingerprint and refresh 24h window
      await fetch("/api/notifications/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: newSub.endpoint,
          keys: raw.keys,
          userId,
          deviceFingerprint: fingerprint,
          userAgent: navigator.userAgent,
          platform: navigator.platform,
        }),
      });

      setIsLoading(false);
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to subscribe to push notifications.";
      setError(msg);
      setIsLoading(false);
      return false;
    }
  }, [isSupported, userId]);

  // 5. Unsubscribe method
  const unsubscribe = useCallback(async (): Promise<boolean> => {
    if (!subscription) return true;

    setIsLoading(true);
    setError(null);

    try {
      await fetch("/api/notifications/push/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      }).catch(() => {});

      await subscription.unsubscribe();
      setSubscription(null);
      setIsLoading(false);
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to unsubscribe.";
      setError(msg);
      setIsLoading(false);
      return false;
    }
  }, [subscription]);

  return {
    isSupported,
    permission,
    subscription,
    deviceFingerprint: deviceFingerprintRef.current,
    isLoading,
    error,
    subscribe,
    unsubscribe,
    refreshSession,
  };
}
