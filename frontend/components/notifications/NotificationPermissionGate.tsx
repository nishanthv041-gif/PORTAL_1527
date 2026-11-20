"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Bell, CheckCircle2 } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import OneSignal, {
  initOneSignal,
  loginToOneSignal,
  requestOneSignalPermission,
  hasOneSignalPermission,
} from "@/frontend/lib/onesignal";
import {
  initPushNotifications,
  loginToPushService,
  requestPushPermission,
  checkPushPermission,
} from "@/frontend/lib/pushNotifications";

function urlBase64ToUint8Array(base64String: string): any {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export default function NotificationPermissionGate({
  userId,
  userName = "User",
  userRole = "USER",
  children,
}: {
  userId: string;
  userName?: string;
  userRole?: string;
  children: React.ReactNode;
}) {
  // Instant 0ms check: Default to true so users on PC and mobile are NEVER blocked by a full-screen takeover modal on Ctrl+F5 or reload
  const [isPermitted, setIsPermitted] = useState<boolean>(() => {
    try {
      if (typeof window !== "undefined") {
        const localDismissed = localStorage.getItem("srt_notif_gate_dismissed");
        const sessionDismissed = sessionStorage.getItem("srt_notif_gate_dismissed");
        if (localDismissed === "true" || sessionDismissed === "true") return true;

        if (typeof Notification !== "undefined" && Notification.permission === "granted") {
          return true;
        }
      }
    } catch {
      return true;
    }
    // Default to true on SSR & initial load to guarantee zero modal blocking on Ctrl+F5
    return true;
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSyncingRef = useRef(false);

  // Background Push Subscription Sync (Auxiliary fallback & User Login)
  const syncPushSubscriptionInBackground = useCallback(async () => {
    if (isSyncingRef.current) return;
    isSyncingRef.current = true;

    try {
      // 1. Map logged-in user to OneSignal external_id
      if (userId) {
        await loginToPushService(userId);
        if (!Capacitor.isNativePlatform()) {
          await loginToOneSignal(userId);
        }
      }

      // If running inside native Capacitor app, native SDK handles APNs/FCM directly
      if (Capacitor.isNativePlatform()) {
        return;
      }

      // 2. Auxiliary Native Web Push fallback sync (Browser only)
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        return;
      }

      const readyPromise = navigator.serviceWorker.ready;
      const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000));
      const reg = await Promise.race([readyPromise, timeoutPromise]);

      if (!reg || !reg.pushManager) {
        return;
      }

      let applicationServerKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!applicationServerKey) {
        const keyRes = await fetch("/api/notifications/push/public-key").catch(() => null);
        if (keyRes && keyRes.ok) {
          const keyData = await keyRes.json();
          applicationServerKey = keyData.publicKey;
        }
      }

      if (!applicationServerKey) {
        applicationServerKey = "BBIHzbc-DVhlpPB_plCE0gUMpCSsHiqA1Y5FVyP-ax6p0HWnFZILFISth4FYfyAp0gywswCBxz4GfDnXm_c-Agk";
      }

      let sub = await reg.pushManager.getSubscription().catch(() => null);
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(applicationServerKey),
        }).catch(() => null);
      }

      if (sub) {
        const subJson = sub.toJSON();
        if (subJson.endpoint && subJson.keys?.p256dh && subJson.keys?.auth) {
          await fetch("/api/push/subscribe", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              userId,
              endpoint: subJson.endpoint,
              keys: {
                p256dh: subJson.keys.p256dh,
                auth: subJson.keys.auth,
              },
              platform: /android/i.test(navigator.userAgent) ? "ANDROID" : /iphone|ipad/i.test(navigator.userAgent) ? "IOS" : "WEB",
              userAgent: navigator.userAgent,
            }),
          }).catch(() => {});
        }
      }
    } catch {
      // Non-blocking
    } finally {
      isSyncingRef.current = false;
    }
  }, [userId]);

  // Initial check & Push SDK initialization on mount
  useEffect(() => {
    try {
      if (typeof window === "undefined") return;

      initPushNotifications(userId).then(async () => {
        const hasPerm = await checkPushPermission();
        if (hasPerm) {
          setIsPermitted(true);
        }
      });

      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        setIsPermitted(true);
        syncPushSubscriptionInBackground();
      }
    } catch {
      // Non-blocking
    }
  }, [userId, syncPushSubscriptionInBackground]);

  // Request Notification Permission - Resilient & non-blocking across Android, iOS & Web
  const handleRequestPermission = async () => {
    setIsSubmitting(true);
    try {
      let isGranted = false;

      // 1. Direct native browser notification prompt (zero-delay user gesture response)
      if (typeof Notification !== "undefined" && typeof Notification.requestPermission === "function") {
        try {
          const nativePromise = Notification.requestPermission();
          const timeoutPromise = new Promise<string>((resolve) => setTimeout(() => resolve("timeout"), 2500));
          const permResult = await Promise.race([nativePromise, timeoutPromise]);
          if (permResult === "granted") {
            isGranted = true;
          }
        } catch (e) {
          console.warn("[PermissionGate] Native browser permission note:", e);
        }
      }

      // 2. Request through Push SDKs (Capacitor or OneSignal) with a 2-second timeout
      try {
        const pushPromise = Capacitor.isNativePlatform()
          ? requestPushPermission()
          : requestOneSignalPermission();
        const sdkTimeout = new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 2000));
        const sdkGranted = await Promise.race([pushPromise, sdkTimeout]);
        if (sdkGranted) {
          isGranted = true;
        }
      } catch (e) {
        console.warn("[PermissionGate] Push SDK permission note:", e);
      }

      // 3. Mark gate as permanently dismissed so user is NEVER trapped or prompted again
      try {
        if (typeof window !== "undefined") {
          localStorage.setItem("srt_notif_gate_dismissed", "true");
          sessionStorage.setItem("srt_notif_gate_dismissed", "true");
          document.cookie = "srt_notif_gate_dismissed=true; path=/; max-age=31536000; SameSite=Lax";
        }
      } catch {}

      // 4. Immediately unlock portal entry so users on Android, iOS & PC enter instantly
      setIsPermitted(true);

      // 5. In background, sync subscription if permission was granted
      const checkGranted =
        isGranted ||
        (typeof Notification !== "undefined" && Notification.permission === "granted") ||
        (await checkPushPermission().catch(() => false));

      if (checkGranted) {
        if (userId) {
          loginToPushService(userId).catch(() => {});
          if (!Capacitor.isNativePlatform()) {
            loginToOneSignal(userId).catch(() => {});
          }
        }
        syncPushSubscriptionInBackground().catch(() => {});
      }
    } catch (err) {
      console.warn("[PermissionGate] Permission request completed with fallback:", err);
      // Guarantee portal unlocks even on unexpected platform errors
      setIsPermitted(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleContinueAnyway = () => {
    try {
      if (typeof window !== "undefined") {
        localStorage.setItem("srt_notif_gate_dismissed", "true");
        sessionStorage.setItem("srt_notif_gate_dismissed", "true");
        document.cookie = "srt_notif_gate_dismissed=true; path=/; max-age=31536000; SameSite=Lax";
      }
    } catch {}
    setIsPermitted(true);
  };

  return (
    <>
      {/* 1. Dashboard is ALWAYS immediately visible to all users - never blocked by any modal or prompt */}
      {children}
      {/* Enable Push Notifications background handler active */}
    </>
  );
}
