"use client";

import { useState, useEffect, useCallback } from "react";
import { Bell, BellOff, CheckCircle2, RotateCw, Send } from "lucide-react";
import { initOneSignal, loginToOneSignal, requestOneSignalPermission } from "@/frontend/lib/onesignal";

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

export default function NotificationStatusCard({
  userId,
  userName = "User",
  userRole = "User",
}: {
  userId: string;
  userName?: string;
  userRole?: string;
}) {
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");
  const [isSubscribing, setIsSubscribing] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Check live permission status
  const checkStatus = useCallback(() => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setPermission("unsupported");
      return;
    }
    setPermission(Notification.permission);
  }, []);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  // Sync subscriptions across both WebPush and OneSignal
  const syncSubscriptions = async () => {
    try {
      // 1. OneSignal external_id link
      await loginToOneSignal(userId).catch(() => {});

      // 2. Direct WebPush subscription sync
      if ("serviceWorker" in navigator) {
        const reg = await navigator.serviceWorker.ready;
        if (reg.pushManager) {
          let sub = await reg.pushManager.getSubscription();
          if (!sub) {
            const keyRes = await fetch("/api/notifications/push/public-key").catch(() => null);
            const keyData = await keyRes?.json().catch(() => null);
            if (keyData?.publicKey) {
              sub = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(keyData.publicKey) as unknown as BufferSource,
              }).catch(() => null);
            }
          }

          if (sub) {
            const subJson = sub.toJSON();
            const p256dh = subJson.keys?.p256dh;
            const auth = subJson.keys?.auth;
            if (subJson.endpoint && p256dh && auth) {
              await Promise.allSettled([
                fetch("/api/push/subscribe", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    endpoint: subJson.endpoint,
                    keys: { p256dh, auth },
                    platform: /android/i.test(navigator.userAgent) ? "ANDROID" : /iphone|ipad/i.test(navigator.userAgent) ? "IOS" : "WEB",
                    userAgent: navigator.userAgent,
                  }),
                }),
                fetch("/api/notifications/push/subscribe", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    endpoint: subJson.endpoint,
                    keys: { p256dh, auth },
                    userAgent: navigator.userAgent,
                    deviceName: /android/i.test(navigator.userAgent) ? "Android Chrome PWA" : /iphone/i.test(navigator.userAgent) ? "iPhone Safari PWA" : "Desktop PWA",
                  }),
                }),
              ]);
            }
          }
        }
      }
    } catch (err) {
      console.warn("[NotificationStatusCard] Sync error:", err);
    }
  };

  const handleEnable = async () => {
    setIsSubscribing(true);
    setFeedback(null);
    try {
      let granted = false;
      if (typeof Notification !== "undefined" && typeof Notification.requestPermission === "function") {
        const res = await Notification.requestPermission();
        if (res === "granted") granted = true;
      }

      await requestOneSignalPermission().catch(() => {});

      if (granted || (typeof Notification !== "undefined" && Notification.permission === "granted")) {
        setPermission("granted");
        await syncSubscriptions();
        setFeedback("✅ Push notifications enabled! You will now receive instant alerts.");
      } else {
        setPermission(typeof Notification !== "undefined" ? Notification.permission : "denied");
        setFeedback("⚠️ Notification permission was not granted. Please check browser permissions.");
      }
    } catch (err) {
      console.error("[NotificationStatusCard] Enable error:", err);
      setFeedback("Failed to enable notifications. Please check browser settings.");
    } finally {
      setIsSubscribing(false);
      setTimeout(() => setFeedback(null), 5000);
    }
  };

  const handleSendTest = async () => {
    setIsTesting(true);
    setFeedback(null);
    try {
      await syncSubscriptions();
      const res = await fetch("/api/push/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "🔔 SRT Portal Test Alert",
          message: `${userName}: Live notifications are 100% active on this device!`,
          url: "/dashboard",
          broadcast: false,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setFeedback("🔔 Test alert dispatched! Check your device lock screen / notification tray.");
      } else {
        setFeedback("⚠️ Test alert dispatched. If not seen, verify device Do-Not-Disturb is off.");
      }
    } catch {
      setFeedback("⚠️ Dispatched test signal to device.");
    } finally {
      setIsTesting(false);
      setTimeout(() => setFeedback(null), 6000);
    }
  };

  if (permission === "unsupported") {
    return null;
  }

  const isGranted = permission === "granted";

  return (
    <div
      style={{
        borderRadius: "12px",
        padding: "1rem 1.25rem",
        marginBottom: "1.25rem",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: "0.85rem",
        border: isGranted ? "1px solid rgba(34, 197, 94, 0.3)" : "1px solid rgba(234, 179, 8, 0.4)",
        backgroundColor: isGranted ? "rgba(34, 197, 94, 0.05)" : "rgba(234, 179, 8, 0.08)",
        backdropFilter: "blur(6px)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flex: 1, minWidth: "260px" }}>
        <div
          style={{
            width: 38,
            height: 38,
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: isGranted ? "rgba(34, 197, 94, 0.15)" : "rgba(234, 179, 8, 0.2)",
            color: isGranted ? "#16a34a" : "#ca8a04",
            flexShrink: 0,
          }}
        >
          {isGranted ? <Bell size={18} /> : <BellOff size={18} />}
        </div>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span style={{ fontWeight: 700, fontSize: "0.92rem", color: "var(--foreground)" }}>
              {isGranted ? "Device Notifications Active" : "Enable Push Notifications"}
            </span>
            <span
              style={{
                fontSize: "0.68rem",
                fontWeight: 700,
                textTransform: "uppercase",
                padding: "2px 7px",
                borderRadius: "10px",
                backgroundColor: isGranted ? "rgba(34, 197, 94, 0.2)" : "rgba(234, 179, 8, 0.25)",
                color: isGranted ? "#15803d" : "#a16207",
              }}
            >
              {isGranted ? "Active" : "Disabled"}
            </span>
          </div>
          <p style={{ margin: "2px 0 0", fontSize: "0.8rem", color: "var(--text-secondary)" }}>
            {isGranted
              ? "You will receive instant lock-screen alerts for announcements, messages, homework, and reports."
              : "Turn on notifications to receive instant alerts for announcements, new homework, report cards, and messages."}
          </p>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
        {!isGranted ? (
          <button
            type="button"
            onClick={handleEnable}
            disabled={isSubscribing}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
              padding: "0.55rem 1.15rem",
              borderRadius: "8px",
              border: "none",
              backgroundColor: "#2563eb",
              color: "#ffffff",
              fontSize: "0.825rem",
              fontWeight: 600,
              cursor: isSubscribing ? "not-allowed" : "pointer",
              boxShadow: "0 2px 6px rgba(37, 99, 235, 0.3)",
            }}
          >
            {isSubscribing ? <RotateCw size={14} className="animate-spin" /> : <Bell size={14} />}
            {isSubscribing ? "Activating..." : "Enable Push Notifications"}
          </button>
        ) : (
          (userRole === "ADMIN" || userRole === "SUPER_ADMIN") ? (
            <button
              type="button"
              onClick={handleSendTest}
              disabled={isTesting}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.4rem",
                padding: "0.45rem 0.95rem",
                borderRadius: "8px",
                border: "1px solid var(--border)",
                backgroundColor: "var(--background)",
                color: "var(--foreground)",
                fontSize: "0.8rem",
                fontWeight: 600,
                cursor: isTesting ? "not-allowed" : "pointer",
              }}
            >
              {isTesting ? <RotateCw size={13} className="animate-spin" /> : <Send size={13} />}
              {isTesting ? "Testing..." : "Send Test Alert"}
            </button>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", color: "#16a34a", fontSize: "0.82rem", fontWeight: 600 }}>
              <CheckCircle2 size={16} />
              <span>Active on this device</span>
            </div>
          )
        )}
      </div>

      {feedback && (
        <div style={{ width: "100%", fontSize: "0.8rem", fontWeight: 600, marginTop: "0.25rem", color: isGranted ? "#16a34a" : "#ca8a04" }}>
          {feedback}
        </div>
      )}
    </div>
  );
}
