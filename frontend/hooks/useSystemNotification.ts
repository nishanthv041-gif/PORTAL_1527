"use client";

import { useState, useEffect, useCallback } from "react";

interface PushRegistrationResult {
  isSupported: boolean;
  permission: NotificationPermission;
  isSubscribed: boolean;
  isLoading: boolean;
  error: string | null;
  subscribeToPush: () => Promise<boolean>;
  unsubscribeFromPush: () => Promise<boolean>;
}

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

function getDeviceType(): string {
  if (typeof window === "undefined") return "DESKTOP";
  const ua = navigator.userAgent.toLowerCase();
  if (/android/.test(ua)) return "ANDROID";
  if (/iphone|ipad|ipod/.test(ua)) return "IOS";
  if (/mobile/.test(ua)) return "MOBILE";
  return "DESKTOP";
}

function getOrCreateDeviceFingerprint(): string {
  if (typeof window === "undefined") return "unknown";
  const KEY = "srt_portal_device_fingerprint_v1";
  let fp = localStorage.getItem(KEY);
  if (!fp) {
    fp = `fp_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
    localStorage.setItem(KEY, fp);
  }
  return fp;
}

/**
 * useSystemNotification
 * React hook managing native OS push notification permissions, Service Worker subscriptions,
 * and 24-hour active session registration with the backend.
 */
export function useSystemNotification(userId?: string): PushRegistrationResult {
  const [isSupported, setIsSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize and check current status
  useEffect(() => {
    if (typeof window === "undefined") return;

    const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    setIsSupported(supported);

    if (supported) {
      setPermission(Notification.permission);

      navigator.serviceWorker.ready.then((reg) => {
        reg.pushManager.getSubscription().then((sub) => {
          setIsSubscribed(!!sub);
          // If already granted, touch the backend to refresh last_active_at timestamp
          if (sub && Notification.permission === "granted") {
            const raw = sub.toJSON();
            if (raw.keys?.p256dh && raw.keys?.auth && sub.endpoint) {
              fetch("/api/notifications/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  endpoint: sub.endpoint,
                  keys: {
                    p256dh: raw.keys.p256dh,
                    auth: raw.keys.auth,
                  },
                  device_type: getDeviceType(),
                  device_fingerprint: getOrCreateDeviceFingerprint(),
                  userId,
                }),
              }).catch(() => { });
            }
          }
        }).catch(() => { });
      });
    }
  }, [userId]);

  const subscribeToPush = useCallback(async (): Promise<boolean> => {
    if (!isSupported) {
      setError("Push notifications are not supported in this browser.");
      return false;
    }

    setIsLoading(true);
    setError(null);

    try {
      // 1. Request user permission
      const userChoice = await Notification.requestPermission();
      setPermission(userChoice);

      if (userChoice !== "granted") {
        setError("Notification permission was denied.");
        setIsLoading(false);
        return false;
      }

      // 2. Fetch VAPID public key
      const keyRes = await fetch("/api/notifications/push/public-key");
      const keyData = await keyRes.json();
      if (!keyData.publicKey) {
        throw new Error(keyData.error || "Missing VAPID public key on server");
      }

      // 3. Register / get Service Worker
      const reg = await navigator.serviceWorker.ready;
      let subscription = await reg.pushManager.getSubscription();

      if (!subscription) {
        const convertedVapidKey = urlBase64ToUint8Array(keyData.publicKey);
        subscription = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: convertedVapidKey as unknown as BufferSource,
        });
      }

      // 4. Send subscription to backend registration endpoint
      const raw = subscription.toJSON();
      if (!raw.keys?.p256dh || !raw.keys?.auth) {
        throw new Error("Push subscription did not provide valid cryptography keys.");
      }

      const saveRes = await fetch("/api/notifications/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: subscription.endpoint,
          keys: {
            p256dh: raw.keys.p256dh,
            auth: raw.keys.auth,
          },
          device_type: getDeviceType(),
          device_fingerprint: getOrCreateDeviceFingerprint(),
          userId,
        }),
      });

      if (!saveRes.ok) {
        const saveErr = await saveRes.json().catch(() => ({}));
        throw new Error(saveErr.error || "Failed to persist subscription to database.");
      }

      setIsSubscribed(true);
      setIsLoading(false);
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error subscribing to push notifications";
      setError(msg);
      setIsLoading(false);
      return false;
    }
  }, [isSupported, userId]);

  const unsubscribeFromPush = useCallback(async (): Promise<boolean> => {
    if (!isSupported) return false;
    setIsLoading(true);

    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/notifications/push/unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        }).catch(() => { });
        await sub.unsubscribe();
      }
      setIsSubscribed(false);
      setIsLoading(false);
      return true;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error unsubscribing");
      setIsLoading(false);
      return false;
    }
  }, [isSupported]);

  return {
    isSupported,
    permission,
    isSubscribed,
    isLoading,
    error,
    subscribeToPush,
    unsubscribeFromPush,
  };
}
