"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Bell, X, CheckCircle2 } from "lucide-react";
import {
  initOneSignal,
  loginToOneSignal,
  requestOneSignalPermission,
  promptOneSignalSlidedown,
  hasOneSignalPermission,
} from "@/frontend/lib/onesignal";

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
  // Always render children immediately - 0ms portal loading without any blocking overlays
  const [showBanner, setShowBanner] = useState(false);
  const isSyncingRef = useRef(false);

  // Background Push Subscription Sync (Completely non-blocking fire-and-forget)
  const syncPushSubscriptionInBackground = useCallback(async () => {
    if (isSyncingRef.current) return;
    isSyncingRef.current = true;

    try {
      // 1. OneSignal User Identification (links device to PostgreSQL user.id)
      if (userId) {
        await loginToOneSignal(userId);
      }

      // 2. Auxiliary Native Web Push fallback sync
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        return;
      }

      const readyPromise = navigator.serviceWorker.ready;
      const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 2500));
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
      // Non-blocking silent catch
    } finally {
      isSyncingRef.current = false;
    }
  }, [userId]);

  // Initial Permission Check and OneSignal linking on mount
  useEffect(() => {
    try {
      if (typeof window === "undefined") return;

      // Initialize OneSignal Web SDK v16
      initOneSignal().then(() => {
        if (userId) {
          loginToOneSignal(userId);
        }
      });

      if (typeof Notification === "undefined" || !("Notification" in window)) {
        return;
      }

      const isGranted = Notification.permission === "granted" || hasOneSignalPermission();
      if (isGranted) {
        setShowBanner(false);
        syncPushSubscriptionInBackground();
      } else if (Notification.permission === "default") {
        const dismissed = sessionStorage.getItem("srt_notif_gate_dismissed");
        if (dismissed !== "true") {
          setShowBanner(true);
          // Also optionally trigger OneSignal slidedown prompt after slight delay
          setTimeout(() => {
            promptOneSignalSlidedown().catch(() => {});
          }, 1500);
        }
      }
    } catch {
      // Non-blocking
    }
  }, [userId, syncPushSubscriptionInBackground]);

  // 1-click Enable Notifications via OneSignal Web Push
  const handleRequestPermission = async () => {
    try {
      // Trigger OneSignal Web Push permission request
      const granted = await requestOneSignalPermission();
      if (granted || Notification.permission === "granted") {
        setShowBanner(false);
        if (userId) {
          await loginToOneSignal(userId);
        }
        syncPushSubscriptionInBackground();
      } else {
        handleDismiss();
      }
    } catch {
      handleDismiss();
    }
  };

  const handleDismiss = () => {
    try {
      if (typeof window !== "undefined") {
        sessionStorage.setItem("srt_notif_gate_dismissed", "true");
      }
    } catch {}
    setShowBanner(false);
  };

  return (
    <>
      {/* 0ms Instant Children Rendering: Dashboard and all content is always accessible immediately */}
      {children}

      {/* Sleek, Non-Blocking Floating Notification Banner for OneSignal Push */}
      {showBanner && (
        <aside
          role="region"
          aria-label="OneSignal Notification Permission"
          style={{
            position: "fixed",
            bottom: "1.25rem",
            right: "1.25rem",
            zIndex: 99999,
            maxWidth: "390px",
            background: "rgba(15, 23, 42, 0.96)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            border: "1px solid rgba(59, 130, 246, 0.4)",
            borderRadius: "16px",
            padding: "1.1rem 1.25rem",
            boxShadow: "0 10px 30px rgba(0, 0, 0, 0.4), 0 0 15px rgba(37, 99, 235, 0.2)",
            color: "#f8fafc",
            display: "flex",
            flexDirection: "column",
            gap: "0.75rem",
            fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
            animation: "fadeInUp 0.3s ease-out",
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem" }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: "10px",
                background: "rgba(245, 158, 11, 0.15)",
                border: "1px solid rgba(245, 158, 11, 0.4)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#f59e0b",
                flexShrink: 0,
              }}
            >
              <Bell size={20} />
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: "0.88rem", fontWeight: 700, color: "#ffffff" }}>
                  Enable Push Notifications
                </span>
                <button
                  type="button"
                  onClick={handleDismiss}
                  aria-label="Dismiss notification banner"
                  style={{
                    background: "none",
                    border: "none",
                    color: "#94a3b8",
                    cursor: "pointer",
                    padding: "2px",
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  <X size={16} />
                </button>
              </div>
              <p style={{ margin: "0.3rem 0 0 0", fontSize: "0.78rem", color: "#cbd5e1", lineHeight: 1.4 }}>
                Get instant lock-screen alerts for new messages, attendance updates, bus tracking, and exam results.
              </p>
            </div>
          </div>

          <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.25rem" }}>
            <button
              type="button"
              onClick={handleRequestPermission}
              style={{
                flex: 1,
                padding: "0.6rem 0.95rem",
                borderRadius: "8px",
                background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
                color: "#ffffff",
                border: "none",
                fontSize: "0.82rem",
                fontWeight: 700,
                cursor: "pointer",
                boxShadow: "0 2px 8px rgba(37, 99, 235, 0.35)",
              }}
            >
              Enable Notifications
            </button>
            <button
              type="button"
              onClick={handleDismiss}
              style={{
                padding: "0.6rem 0.95rem",
                borderRadius: "8px",
                background: "rgba(255, 255, 255, 0.08)",
                color: "#cbd5e1",
                border: "1px solid rgba(255, 255, 255, 0.15)",
                fontSize: "0.82rem",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Later
            </button>
          </div>
        </aside>
      )}
    </>
  );
}
