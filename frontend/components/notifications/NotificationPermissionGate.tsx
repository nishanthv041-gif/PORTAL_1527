"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import { Bell, ShieldCheck, AlertTriangle, RefreshCw, Smartphone, CheckCircle2 } from "lucide-react";

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
  const [status, setStatus] = useState<"checking" | "granted" | "prompt" | "subscribing" | "denied">("checking");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Sync Push Subscription with backend PostgreSQL
  const syncPushSubscription = useCallback(async (permissionGranted: boolean) => {
    if (!permissionGranted) return;
    setStatus("subscribing");

    try {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        setStatus("granted");
        return;
      }

      const reg = await navigator.serviceWorker.ready;

      // 1. Fetch VAPID Public Key
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
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(applicationServerKey),
        });
      }

      // 3. POST subscription to PostgreSQL (/api/push/subscribe & /api/push/register)
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
        }).catch((err) => console.warn("[PermissionGate] Push subscribe sync warning:", err));
      }

      setStatus("granted");
    } catch (err: any) {
      console.warn("[PermissionGate] Subscription error:", err);
      // Unlock if permission was granted even if network subscription sync had a hiccup
      setStatus("granted");
    }
  }, [userId]);

  // Initial Permission Check
  useEffect(() => {
    if (typeof window === "undefined") return;

    // Non-supporting environments (e.g. headless browsers without notification API) bypass cleanly
    if (!("Notification" in window)) {
      setStatus("granted");
      return;
    }

    const currentPerm = Notification.permission;
    if (currentPerm === "granted") {
      syncPushSubscription(true);
    } else if (currentPerm === "denied") {
      setStatus("denied");
    } else {
      setStatus("prompt");
    }
  }, [syncPushSubscription]);

  // Handle User Clicking "Enable Notifications"
  const handleRequestPermission = async () => {
    setErrorMessage(null);
    try {
      if (!("Notification" in window)) {
        setStatus("granted");
        return;
      }

      const result = await Notification.requestPermission();
      if (result === "granted") {
        await syncPushSubscription(true);
      } else if (result === "denied") {
        setStatus("denied");
      } else {
        setStatus("prompt");
      }
    } catch (err: any) {
      setErrorMessage(err?.message || "Could not request notification permissions.");
      setStatus("prompt");
    }
  };

  // Re-check after user toggles permissions in browser settings
  const handleCheckAgain = () => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setStatus("granted");
      return;
    }

    if (Notification.permission === "granted") {
      syncPushSubscription(true);
    } else if (Notification.permission === "denied") {
      window.location.reload();
    } else {
      setStatus("prompt");
    }
  };

  // If granted or not client, unlock and render dashboard content directly
  if (status === "granted") {
    return <>{children}</>;
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 999999,
        backgroundColor: "#0f172a",
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

        {status === "checking" ? (
          <div>
            <h2 style={{ fontSize: "1.25rem", fontWeight: 700, margin: "0 0 0.5rem 0" }}>
              Verifying Portal Security...
            </h2>
            <p style={{ color: "#94a3b8", fontSize: "0.85rem", margin: 0 }}>
              Checking active lock-screen push notification device credentials.
            </p>
          </div>
        ) : status === "subscribing" ? (
          <div>
            <div style={{ margin: "1.5rem 0" }}>
              <RefreshCw size={32} color="#3b82f6" style={{ animation: "spin 1s linear infinite" }} />
              <style jsx>{`
                @keyframes spin {
                  from { transform: rotate(0deg); }
                  to { transform: rotate(360deg); }
                }
              `}</style>
            </div>
            <h2 style={{ fontSize: "1.25rem", fontWeight: 700, margin: "0 0 0.5rem 0" }}>
              Activating System Push Delivery...
            </h2>
            <p style={{ color: "#94a3b8", fontSize: "0.85rem", margin: 0 }}>
              Binding your device to SRT Universal School high-priority notification service.
            </p>
          </div>
        ) : status === "denied" ? (
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
          </div>
        ) : (
          <div>
            <h2 style={{ fontSize: "1.3rem", fontWeight: 800, margin: "0 0 0.5rem 0", color: "#ffffff" }}>
              Enable System Notifications
            </h2>
            <p style={{ color: "#94a3b8", fontSize: "0.88rem", lineHeight: 1.5, margin: "0 0 1.25rem 0" }}>
              Hello <strong>{userName}</strong>. SRT Universal School requires real-time push alerts so you never miss 
              urgent messages, attendance alerts, exam report cards, or bus transit updates directly on your device lock screen.
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
          </div>
        )}
      </div>
    </div>
  );
}
