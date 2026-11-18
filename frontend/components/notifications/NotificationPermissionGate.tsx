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
  // 0ms Instant check: If already granted, dismissed, or unsupported, unlock immediately without any spinner
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
    return false;
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
      }
    } catch {}
    setIsPermitted(true);
  };

  return (
    <>
      {/* 1. Dashboard is ALWAYS immediately visible to all users - never blank or empty */}
      {children}

      {/* 2. Non-blocking permission prompt overlay: only shown once if not dismissed */}
      {!isPermitted && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 999999,
            backgroundColor: "rgba(15, 23, 42, 0.75)",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1.25rem",
            boxSizing: "border-box",
            fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: "460px",
              background: "#1e293b",
              border: "1px solid rgba(59, 130, 246, 0.35)",
              borderRadius: "24px",
              padding: "2rem 1.75rem",
              boxShadow: "0 25px 60px rgba(0, 0, 0, 0.5), 0 0 30px rgba(37, 99, 235, 0.2)",
              textAlign: "center",
              color: "#f8fafc",
              boxSizing: "border-box",
            }}
          >
            {/* School Crest / Bell Icon */}
            <div style={{ display: "flex", justifyContent: "center", marginBottom: "1.25rem" }}>
              <div
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: "50%",
                  background: "rgba(37, 99, 235, 0.15)",
                  border: "3px solid rgba(245, 158, 11, 0.5)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#f59e0b",
                  boxShadow: "0 0 20px rgba(245, 158, 11, 0.25)",
                }}
              >
                <Bell size={34} />
              </div>
            </div>

            <div
              style={{
                display: "inline-block",
                padding: "0.25rem 0.75rem",
                background: "rgba(59, 130, 246, 0.2)",
                borderRadius: "20px",
                fontSize: "0.75rem",
                fontWeight: 700,
                color: "#60a5fa",
                letterSpacing: "0.05em",
                marginBottom: "0.85rem",
              }}
            >
              SRT UNIVERSAL SCHOOL PORTAL
            </div>

            <h2 style={{ fontSize: "1.35rem", fontWeight: 800, margin: "0 0 0.5rem 0", color: "#ffffff" }}>
              Enable Push Notifications
            </h2>

            <p style={{ color: "#94a3b8", fontSize: "0.88rem", lineHeight: 1.55, margin: "0 0 1.25rem 0" }}>
              Hello <strong>{userName}</strong>. SRT Portal delivers instant lock-screen alert notifications for attendance,
              direct teacher messages, emergency announcements, and live bus transit updates.
            </p>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.55rem",
                textAlign: "left",
                background: "rgba(15, 23, 42, 0.5)",
                border: "1px solid rgba(59, 130, 246, 0.2)",
                borderRadius: "12px",
                padding: "0.85rem 1rem",
                marginBottom: "1.5rem",
                fontSize: "0.82rem",
                color: "#cbd5e1",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <CheckCircle2 size={16} color="#10b981" />
                <span>Instant lock-screen alert notifications from teachers & admin</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <CheckCircle2 size={16} color="#10b981" />
                <span>App icon unread badge counter for all important updates</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <CheckCircle2 size={16} color="#10b981" />
                <span>Urgent bus transit & student attendance notifications</span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleRequestPermission}
              disabled={isSubmitting}
              style={{
                width: "100%",
                padding: "0.95rem 1.25rem",
                borderRadius: "14px",
                background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
                color: "#ffffff",
                border: "none",
                fontWeight: 800,
                fontSize: "1rem",
                cursor: isSubmitting ? "wait" : "pointer",
                boxShadow: "0 4px 18px rgba(37, 99, 235, 0.45)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.5rem",
                marginBottom: "0.75rem",
              }}
            >
              <Bell size={20} />
              <span>{isSubmitting ? "Connecting..." : "Enable Notifications"}</span>
            </button>

            <button
              type="button"
              onClick={handleContinueAnyway}
              style={{
                background: "none",
                border: "none",
                color: "#94a3b8",
                fontSize: "0.85rem",
                cursor: "pointer",
                padding: "0.4rem",
                textDecoration: "underline",
              }}
            >
              Continue to Dashboard &rarr;
            </button>
          </div>
        </div>
      )}
    </>
  );
}
