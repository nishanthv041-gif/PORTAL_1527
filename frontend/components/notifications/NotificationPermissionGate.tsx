"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Bell, AlertTriangle, CheckCircle2, ArrowRight } from "lucide-react";

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
  // 0ms instant check: If permission already granted or non-supporting environment, unlock immediately!
  const [status, setStatus] = useState<"granted" | "prompt" | "denied">(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      if (Notification.permission === "granted") return "granted";
      if (Notification.permission === "denied") {
        const dismissed = sessionStorage.getItem("srt_notif_gate_dismissed");
        return dismissed === "true" ? "granted" : "denied";
      }
      const dismissed = sessionStorage.getItem("srt_notif_gate_dismissed");
      return dismissed === "true" ? "granted" : "prompt";
    }
    return "granted";
  });

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isSyncingRef = useRef(false);

  // Background Push Subscription Sync (Completely non-blocking fire-and-forget)
  const syncPushSubscriptionInBackground = useCallback(async () => {
    if (isSyncingRef.current) return;
    isSyncingRef.current = true;

    try {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        return;
      }

      // Race service worker ready with a 2.5-second timeout so it never hangs
      const readyPromise = navigator.serviceWorker.ready;
      const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 2500));
      const reg = await Promise.race([readyPromise, timeoutPromise]);

      if (!reg || !reg.pushManager) {
        return;
      }

      // 1. Fetch or use VAPID Public Key
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

      // 2. Subscribe with PushManager
      let sub = await reg.pushManager.getSubscription().catch(() => null);
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(applicationServerKey),
        }).catch(() => null);
      }

      // 3. POST subscription to PostgreSQL (/api/push/subscribe)
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

  // Initial Permission Check on mount
  useEffect(() => {
    if (typeof window === "undefined") return;

    if (!("Notification" in window)) {
      setStatus("granted");
      return;
    }

    const currentPerm = Notification.permission;
    if (currentPerm === "granted") {
      setStatus("granted");
      // Fire-and-forget in background without any blocking spinner
      syncPushSubscriptionInBackground();
    } else if (currentPerm === "denied") {
      const dismissed = sessionStorage.getItem("srt_notif_gate_dismissed");
      if (dismissed === "true") {
        setStatus("granted");
      } else {
        setStatus("denied");
      }
    } else {
      const dismissed = sessionStorage.getItem("srt_notif_gate_dismissed");
      if (dismissed === "true") {
        setStatus("granted");
      } else {
        setStatus("prompt");
      }
    }
  }, [syncPushSubscriptionInBackground]);

  // Instant 1-second Enable Notifications
  const handleRequestPermission = async () => {
    setErrorMessage(null);
    try {
      if (!("Notification" in window)) {
        setStatus("granted");
        return;
      }

      const result = await Notification.requestPermission();
      if (result === "granted") {
        // Unlock IMMEDIATELY in 0ms!
        setStatus("granted");
        // Sync in background without blocking
        syncPushSubscriptionInBackground();
      } else if (result === "denied") {
        setStatus("denied");
      } else {
        // User closed or dismissed browser dialog - allow entry
        handleContinueAnyway();
      }
    } catch (err: any) {
      handleContinueAnyway();
    }
  };

  const handleContinueAnyway = () => {
    if (typeof window !== "undefined") {
      sessionStorage.setItem("srt_notif_gate_dismissed", "true");
    }
    setStatus("granted");
  };

  const handleCheckAgain = () => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setStatus("granted");
      return;
    }

    if (Notification.permission === "granted") {
      setStatus("granted");
      syncPushSubscriptionInBackground();
    } else if (Notification.permission === "denied") {
      window.location.reload();
    } else {
      setStatus("prompt");
    }
  };

  // If granted or dismissed, immediately render the full school portal dashboard
  if (status === "granted") {
    return <>{children}</>;
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 999999,
        backgroundColor: "rgba(15, 23, 42, 0.85)",
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
          padding: "2rem 1.5rem",
          boxShadow: "0 25px 60px rgba(0, 0, 0, 0.5), 0 0 30px rgba(37, 99, 235, 0.2)",
          textAlign: "center",
          color: "#f8fafc",
          boxSizing: "border-box",
        }}
      >
        {/* School Crest / Portal Logo */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: "1rem" }}>
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
              boxShadow: "0 0 20px rgba(245, 158, 11, 0.25)",
            }}
          >
            <Bell size={36} color="#f59e0b" />
          </div>
        </div>

        {/* Portal Name & Role Badge */}
        <div style={{ marginBottom: "0.75rem" }}>
          <span
            style={{
              display: "inline-block",
              padding: "0.25rem 0.75rem",
              borderRadius: "999px",
              fontSize: "0.75rem",
              fontWeight: 800,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              background: "rgba(37, 99, 235, 0.2)",
              color: "#60a5fa",
              border: "1px solid rgba(37, 99, 235, 0.4)",
            }}
          >
            SRT UNIVERSAL SCHOOL PORTAL
          </span>
        </div>

        {status === "denied" ? (
          <div>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.4rem",
                color: "#ef4444",
                fontWeight: 700,
                fontSize: "0.85rem",
                marginBottom: "0.5rem",
              }}
            >
              <AlertTriangle size={18} /> Notifications Currently Blocked
            </div>
            <h2 style={{ fontSize: "1.2rem", fontWeight: 800, margin: "0 0 0.75rem 0" }}>
              Action Required: Unblock in Browser
            </h2>
            <div
              style={{
                textAlign: "left",
                background: "rgba(15, 23, 42, 0.6)",
                border: "1px solid rgba(239, 68, 68, 0.25)",
                borderRadius: "12px",
                padding: "1rem",
                fontSize: "0.82rem",
                color: "#cbd5e1",
                lineHeight: 1.55,
                marginBottom: "1.25rem",
              }}
            >
              <p style={{ margin: "0 0 0.5rem 0", fontWeight: 700, color: "#f87171" }}>
                How to enable notifications:
              </p>
              <ol style={{ paddingLeft: "1.25rem", margin: 0 }}>
                <li style={{ marginBottom: "0.4rem" }}>
                  Tap or click the <strong>🔒 Padlock / Tune</strong> icon in your browser URL bar.
                </li>
                <li style={{ marginBottom: "0.4rem" }}>
                  Find <strong>Notifications</strong> and switch it to <strong>Allow</strong>.
                </li>
                <li>
                  Click the <strong>Reload & Continue</strong> button below.
                </li>
              </ol>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <button
                type="button"
                onClick={handleCheckAgain}
                style={{
                  width: "100%",
                  padding: "0.85rem 1.25rem",
                  borderRadius: "12px",
                  background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
                  color: "#ffffff",
                  border: "none",
                  fontWeight: 700,
                  fontSize: "0.95rem",
                  cursor: "pointer",
                  boxShadow: "0 4px 14px rgba(37, 99, 235, 0.4)",
                }}
              >
                🔄 I Have Allowed It (Reload & Enter)
              </button>

              <button
                type="button"
                onClick={handleContinueAnyway}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#94a3b8",
                  fontSize: "0.85rem",
                  cursor: "pointer",
                  padding: "0.4rem",
                  textDecoration: "underline",
                }}
              >
                Continue to Portal Without Notifications &rarr;
              </button>
            </div>
          </div>
        ) : (
          <div>
            <h2 style={{ fontSize: "1.3rem", fontWeight: 800, margin: "0 0 0.5rem 0", color: "#ffffff" }}>
              Enable System Notifications
            </h2>
            <p style={{ color: "#94a3b8", fontSize: "0.88rem", lineHeight: 1.5, margin: "0 0 1.25rem 0" }}>
              Hello <strong>{userName}</strong>. SRT Universal School sends real-time push alerts so you never miss 
              urgent messages, attendance updates, or bus transit notifications on your device.
            </p>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.5rem",
                textAlign: "left",
                background: "rgba(15, 23, 42, 0.5)",
                border: "1px solid rgba(59, 130, 246, 0.2)",
                borderRadius: "12px",
                padding: "0.85rem 1rem",
                marginBottom: "1.5rem",
                fontSize: "0.8rem",
                color: "#cbd5e1",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <CheckCircle2 size={16} color="#10b981" />
                <span>Instant lock-screen message alerts from teachers & admin</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <CheckCircle2 size={16} color="#10b981" />
                <span>WhatsApp-style app icon unread badge counter</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <CheckCircle2 size={16} color="#10b981" />
                <span>Urgent bus transit & student attendance notifications</span>
              </div>
            </div>

            {errorMessage && (
              <p style={{ color: "#ef4444", fontSize: "0.8rem", marginBottom: "1rem" }}>
                {errorMessage}
              </p>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <button
                type="button"
                onClick={handleRequestPermission}
                style={{
                  width: "100%",
                  padding: "0.95rem 1.25rem",
                  borderRadius: "14px",
                  background: "linear-gradient(135deg, #f59e0b, #d97706)",
                  color: "#ffffff",
                  border: "none",
                  fontWeight: 800,
                  fontSize: "1rem",
                  cursor: "pointer",
                  boxShadow: "0 4px 18px rgba(245, 158, 11, 0.45)",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "0.5rem",
                }}
              >
                <Bell size={20} />
                <span>Enable Notifications & Enter Portal</span>
              </button>

              <button
                type="button"
                onClick={handleContinueAnyway}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#94a3b8",
                  fontSize: "0.85rem",
                  cursor: "pointer",
                  padding: "0.4rem",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "0.3rem",
                  transition: "color 0.15s ease",
                }}
                onMouseOver={(e) => (e.currentTarget.style.color = "#cbd5e1")}
                onMouseOut={(e) => (e.currentTarget.style.color = "#94a3b8")}
              >
                <span>Continue to Dashboard</span>
                <ArrowRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
