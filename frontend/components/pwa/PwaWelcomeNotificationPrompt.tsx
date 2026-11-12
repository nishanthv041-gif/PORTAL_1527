"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import { Bell, CheckCircle2, Loader2, X, AlertTriangle } from "lucide-react";
import styles from "./PwaWelcomeNotificationPrompt.module.css";

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

export default function PwaWelcomeNotificationPrompt() {
  const [isOpen, setIsOpen] = useState(false);
  const [showFloatingPill, setShowFloatingPill] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");
  const [loading, setLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Check notification permission on portal opening
  useEffect(() => {
    if (typeof window === "undefined") return;

    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      setPermission("unsupported");
      return;
    }

    const currentPerm = Notification.permission;
    setPermission(currentPerm);

    // If already granted, no need to show any prompt or floating button
    if (currentPerm === "granted") {
      setIsOpen(false);
      setShowFloatingPill(false);
      return;
    }

    // PERSISTENT: Show prompt while opening the portal until user enables notifications
    const timer = setTimeout(() => {
      setIsOpen(true);
      setShowFloatingPill(false);
    }, 1200);

    return () => clearTimeout(timer);
  }, []);

  const handleDismiss = () => {
    setIsOpen(false);
    // Keep floating trigger available on screen until user enables notifications
    setShowFloatingPill(true);
  };

  const handleOpenPrompt = () => {
    setErrorMsg(null);
    setIsOpen(true);
    setShowFloatingPill(false);
  };

  const handleEnableNotifications = useCallback(async () => {
    setErrorMsg(null);
    setLoading(true);

    try {
      // 1. Request user permission
      const requestedPerm = await Notification.requestPermission();
      setPermission(requestedPerm);

      if (requestedPerm !== "granted") {
        setLoading(false);
        setErrorMsg(
          requestedPerm === "denied"
            ? "Notifications are blocked. Please click the tune/lock icon in your browser URL bar and change Notifications to 'Allow'."
            : "Notification permission was not granted."
        );
        return;
      }

      // 2. Register / retrieve active Service Worker
      let registration = await navigator.serviceWorker.getRegistration();
      if (!registration) {
        registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      }
      await navigator.serviceWorker.ready;

      // 3. Fetch VAPID Public Key
      const keyRes = await fetch("/api/notifications/push/public-key");
      const keyData = await keyRes.json();
      const vapidPublicKey = keyData?.publicKey || "BBIHzbc-DVhlpPB_plCE0gUMpCSsHiqA1Y5FVyP-ax6p0HWnFZILFISth4FYfyAp0gywswCBxz4GfDnXm_c-Agk";

      // 4. Subscribe with PushManager
      const convertedKey = urlBase64ToUint8Array(vapidPublicKey);
      let subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        try {
          await subscription.unsubscribe();
        } catch {}
      }
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: convertedKey as unknown as BufferSource,
      });

      // 5. Send subscription to backend API to register device
      const rawSub = subscription.toJSON();
      let p256dh = rawSub.keys?.p256dh;
      let auth = rawSub.keys?.auth;

      if ((!p256dh || !auth) && subscription.getKey) {
        try {
          const rawKey = subscription.getKey("p256dh");
          if (rawKey) {
            p256dh = btoa(String.fromCharCode(...new Uint8Array(rawKey)))
              .replace(/\+/g, "-")
              .replace(/\//g, "_")
              .replace(/=+$/, "");
          }
          const rawAuth = subscription.getKey("auth");
          if (rawAuth) {
            auth = btoa(String.fromCharCode(...new Uint8Array(rawAuth)))
              .replace(/\+/g, "-")
              .replace(/\//g, "_")
              .replace(/=+$/, "");
          }
        } catch {}
      }

      const payload = {
        endpoint: subscription.endpoint,
        keys: { p256dh, auth },
        userAgent: navigator.userAgent,
        deviceName: navigator.userAgent.includes("Android")
          ? "Android PWA"
          : navigator.userAgent.includes("iPhone")
          ? "iOS PWA"
          : "Desktop PWA",
      };

      await Promise.allSettled([
        fetch("/api/notifications/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }),
        fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }),
      ]);

      // Store endpoint locally
      try {
        localStorage.setItem("nipo_pwa_push_endpoint", subscription.endpoint);
      } catch {}

      setIsSuccess(true);
      setLoading(false);
      setShowFloatingPill(false);

      // Auto-close after showing success
      setTimeout(() => {
        setIsOpen(false);
      }, 2000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error enabling notifications.";
      console.error("[PwaWelcome] Enable push error:", err);
      setErrorMsg(msg);
      setLoading(false);
    }
  }, []);

  if (permission === "granted" || permission === "unsupported") {
    return null;
  }

  return (
    <>
      {/* Floating Action Pill: Always available on screen until user enables notifications */}
      {showFloatingPill && !isOpen && (
        <button
          type="button"
          className={styles.floatingEnablePill}
          onClick={handleOpenPrompt}
          aria-label="Enable notifications"
        >
          <Bell size={18} />
          <span>Enable Notifications</span>
        </button>
      )}

      {/* Main Notification Prompt Modal */}
      {isOpen && (
        <div className={styles.backdrop} role="dialog" aria-modal="true" aria-labelledby="welcome-notif-title">
          <div className={styles.modal}>
            <div className={styles.header}>
              <div className={styles.logoRow}>
                <div className={styles.logoBox}>
                  <Image
                    src="/icons/icon-192x192.png"
                    alt="SRT School Portal"
                    width={38}
                    height={38}
                    priority
                  />
                </div>
                <div>
                  <span className={styles.appBadge}>SRT SCHOOL PORTAL</span>
                  <h3 id="welcome-notif-title" className={styles.title}>
                    Enable Lock Screen Notifications
                  </h3>
                </div>
              </div>
              <button
                type="button"
                className={styles.closeBtn}
                onClick={handleDismiss}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className={styles.body}>
              <p className={styles.desc}>
                Stay updated with instant alerts on your phone lock screen for homework assignments, timetable changes, birthday wishes, report cards, and school announcements.
              </p>

              {permission === "denied" && (
                <div style={{ marginTop: "0.85rem", padding: "0.75rem", background: "rgba(239, 68, 68, 0.08)", border: "1px solid rgba(239, 68, 68, 0.2)", borderRadius: "8px", fontSize: "0.85rem", color: "#dc2626" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontWeight: 600, marginBottom: "0.25rem" }}>
                    <AlertTriangle size={16} /> Notifications Currently Blocked
                  </div>
                  <div>To enable: Tap the lock/tune icon next to the URL in your browser bar, choose <strong>Permissions &gt; Notifications</strong>, and switch to <strong>Allow</strong>.</div>
                </div>
              )}

              {isSuccess ? (
                <div className={styles.successCard}>
                  <CheckCircle2 size={20} color="#059669" />
                  <span>Notifications enabled successfully!</span>
                </div>
              ) : errorMsg ? (
                <div style={{ color: "#ef4444", fontSize: "0.875rem", marginTop: "0.75rem" }}>
                  {errorMsg}
                </div>
              ) : null}
            </div>

            <div className={styles.actions}>
              {!isSuccess && (
                <>
                  <button
                    type="button"
                    className={styles.enableBtn}
                    onClick={handleEnableNotifications}
                    disabled={loading}
                  >
                    {loading ? (
                      <>
                        <Loader2 size={18} className="animate-spin" />
                        <span>Enabling...</span>
                      </>
                    ) : (
                      <>
                        <Bell size={18} />
                        <span>Enable Notifications</span>
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    className={styles.laterBtn}
                    onClick={handleDismiss}
                    disabled={loading}
                  >
                    Maybe Later
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
