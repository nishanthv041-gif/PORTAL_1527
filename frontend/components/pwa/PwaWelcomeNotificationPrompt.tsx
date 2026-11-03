"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { Bell, CheckCircle2, Loader2, X } from "lucide-react";
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
  const [loading, setLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // 1. Detect if installed / standalone PWA mode
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true ||
      document.referrer.includes("android-app://");

    // Only prompt inside the installed PWA
    if (!isStandalone) {
      return;
    }

    // 2. Check if notification permission is already granted or unsupported
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      return;
    }

    if (Notification.permission === "granted") {
      return; // Already granted; no prompt needed
    }

    // 3. Check if previously dismissed (cooldown 7 days)
    const dismissedUntil = localStorage.getItem("nipo_pwa_welcome_dismissed");
    if (dismissedUntil && Date.now() < Number(dismissedUntil)) {
      return;
    }

    // Delay display slightly for smooth page entrance
    const timer = setTimeout(() => {
      setIsOpen(true);
    }, 1800);

    return () => clearTimeout(timer);
  }, []);

  const handleDismiss = () => {
    setIsOpen(false);
    try {
      localStorage.setItem(
        "nipo_pwa_welcome_dismissed",
        String(Date.now() + 7 * 24 * 60 * 60 * 1000)
      );
    } catch {}
  };

  const handleEnableNotifications = async () => {
    setErrorMsg(null);
    setLoading(true);

    try {
      // 1. Request user permission
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setLoading(false);
        setErrorMsg("Notification permission was not granted.");
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
      const vapidPublicKey = keyData.publicKey;

      if (!vapidPublicKey) {
        throw new Error("Unable to retrieve push notification security key.");
      }

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

      const res = await fetch("/api/notifications/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: subscription.endpoint,
          keys: { p256dh, auth },
          userAgent: navigator.userAgent,
          deviceName: navigator.userAgent.includes("Android")
            ? "Android PWA"
            : navigator.userAgent.includes("iPhone")
            ? "iOS PWA"
            : "Desktop PWA",
        }),
      });

      const resData = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(
          resData?.error || `Registration failed with server status ${res.status}.`
        );
      }

      // Store endpoint locally so it can be associated automatically on login
      try {
        localStorage.setItem("nipo_pwa_push_endpoint", subscription.endpoint);
      } catch {}

      setIsSuccess(true);
      setLoading(false);

      // Auto close after showing success
      setTimeout(() => {
        setIsOpen(false);
        try {
          localStorage.setItem(
            "nipo_pwa_welcome_dismissed",
            String(Date.now() + 365 * 24 * 60 * 60 * 1000)
          );
        } catch {}
      }, 2200);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error enabling notifications.";
      console.error("[PwaWelcome] Enable push error:", err);
      setErrorMsg(msg);
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className={styles.backdrop} role="dialog" aria-modal="true" aria-labelledby="welcome-notif-title">
      <div className={styles.modal}>
        <div className={styles.header}>
          <div className={styles.logoRow}>
            <div className={styles.logoBox}>
              <Image
                src="/icons/icon-192x192.png"
                alt="Nipo Portal"
                width={38}
                height={38}
                priority
              />
            </div>
            <div>
              <span className={styles.appBadge}>PWA INSTALLED</span>
              <h3 id="welcome-notif-title" className={styles.title}>
                Welcome to Nipo Portal!
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
            Enable notifications to receive important messages, announcements, and account updates directly on your device.
          </p>

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
  );
}
