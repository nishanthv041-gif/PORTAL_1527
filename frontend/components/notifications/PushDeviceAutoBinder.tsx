"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getOrCreateDeviceFingerprint } from "@/frontend/hooks/usePushNotification";
import { Bell, X } from "lucide-react";

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
 * PushDeviceAutoBinder
 * 
 * Automatically connects the user's active device / browser to their account:
 * 1. Android Capacitor App: Registers via @capacitor/push-notifications and syncs FCM token to /api/push/register.
 * 2. PC Desktop & iOS Safari PWA: Auto-renews Web Push via ServiceWorker and syncs to /api/push/register.
 * 3. Shows a responsive prompt banner on iOS Safari / Desktop when permission is "default".
 */
export default function PushDeviceAutoBinder({ userId }: { userId: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const lastSyncRef = useRef<number>(0);
  const [showPromptBanner, setShowPromptBanner] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !userId) return;

    // Check if running inside Capacitor native platform
    const isCapacitor = Boolean(
      (window as any)?.Capacitor?.isNativePlatform &&
      (window as any).Capacitor.isNativePlatform()
    );

    if (isCapacitor) {
      // ------------------------------------------------------------------------
      // NATIVE ANDROID / CAPACITOR PUSH NOTIFICATIONS
      // ------------------------------------------------------------------------
      (async () => {
        try {
          const { PushNotifications } = await import("@capacitor/push-notifications");

          let permStatus = await PushNotifications.checkPermissions();
          if (permStatus.receive === "prompt") {
            permStatus = await PushNotifications.requestPermissions();
          }

          if (permStatus.receive === "granted") {
            await PushNotifications.register();

            // Listen for FCM token registration
            await PushNotifications.addListener("registration", async (token) => {
              try {
                await fetch("/api/push/register", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    platform: "ANDROID",
                    token: token.value,
                    endpoint: `fcm:${token.value}`,
                    deviceName: "Android Capacitor App",
                    userAgent: navigator.userAgent,
                  }),
                });
              } catch (regErr) {
                console.warn("[PushDeviceAutoBinder] Capacitor token sync error:", regErr);
              }
            });

            // Listen for notification tapped / opened by user
            await PushNotifications.addListener(
              "pushNotificationActionPerformed",
              (action) => {
                const targetUrl = action.notification.data?.url || "/notifications";
                if (targetUrl) {
                  router.push(targetUrl);
                }
              }
            );
          }
        } catch (capErr) {
          console.warn("[PushDeviceAutoBinder] Capacitor Push init warning:", capErr);
        }
      })();
      return;
    }

    // ------------------------------------------------------------------------
    // WEB & iOS SAFARI PWA PUSH NOTIFICATIONS
    // ------------------------------------------------------------------------
    if (!("serviceWorker" in navigator) || !("Notification" in window)) {
      return;
    }

    // If permission is default, prompt user with gentle banner (required for iOS Safari user gesture)
    if (Notification.permission === "default") {
      const bannerDismissed = sessionStorage.getItem("srt_notif_banner_dismissed");
      if (!bannerDismissed) {
        setShowPromptBanner(true);
      }
    }

    // Rate-limit sync to once every 15 seconds per session
    const now = Date.now();
    if (now - lastSyncRef.current < 15000) {
      return;
    }

    const bindCurrentDevice = async () => {
      try {
        if (Notification.permission !== "granted") {
          return;
        }

        const reg = await navigator.serviceWorker.ready;
        let sub = await reg.pushManager.getSubscription();

        // If permission is granted but subscription is missing or expired, auto-renew it
        if (!sub) {
          const keyRes = await fetch("/api/notifications/push/public-key").catch(() => null);
          const keyData = await keyRes?.json().catch(() => null);
          if (keyData?.publicKey) {
            const keyArr = urlBase64ToUint8Array(keyData.publicKey);
            sub = await reg.pushManager
              .subscribe({
                userVisibleOnly: true,
                applicationServerKey: keyArr as unknown as BufferSource,
              })
              .catch(() => null);
          }
        }

        if (sub) {
          const raw = sub.toJSON();
          let p256dh = raw.keys?.p256dh;
          let auth = raw.keys?.auth;

          if ((!p256dh || !auth) && sub.getKey) {
            try {
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
            } catch { }
          }

          if (p256dh && auth) {
            lastSyncRef.current = Date.now();
            const fingerprint = getOrCreateDeviceFingerprint();

            // Sync to /api/push/register and /api/notifications/push/subscribe
            await fetch("/api/push/register", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                platform: navigator.userAgent.includes("iPhone") || navigator.userAgent.includes("iPad") ? "IOS" : "WEB",
                endpoint: sub.endpoint,
                token: sub.endpoint,
                keys: { p256dh, auth },
                deviceFingerprint: fingerprint,
                userAgent: navigator.userAgent,
                deviceName: navigator.userAgent.includes("iPhone")
                  ? "iPhone Safari PWA"
                  : navigator.userAgent.includes("Android")
                    ? "Android Chrome PWA"
                    : "Desktop PWA",
              }),
            }).catch(() => null);
          }
        }
      } catch (err) {
        console.warn("[PushDeviceAutoBinder] Sync note:", err);
      }
    };

    bindCurrentDevice();

    const handleVisibility = () => {
      if (!document.hidden) {
        bindCurrentDevice();
      }
    };

    window.addEventListener("focus", bindCurrentDevice);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.removeEventListener("focus", bindCurrentDevice);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [userId, pathname, router]);

  // Handler for user gesture permission request (Required by iOS Safari)
  const handleEnableNotifications = async () => {
    setIsRegistering(true);
    try {
      if ("Notification" in window) {
        const perm = await Notification.requestPermission();
        if (perm === "granted") {
          setShowPromptBanner(false);
          const reg = await navigator.serviceWorker.ready;
          const keyRes = await fetch("/api/notifications/push/public-key").catch(() => null);
          const keyData = await keyRes?.json().catch(() => null);
          if (keyData?.publicKey) {
            const keyArr = urlBase64ToUint8Array(keyData.publicKey);
            const sub = await reg.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: keyArr as unknown as BufferSource,
            });
            if (sub) {
              const raw = sub.toJSON();
              await fetch("/api/push/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  platform: navigator.userAgent.includes("iPhone") ? "IOS" : "WEB",
                  endpoint: sub.endpoint,
                  token: sub.endpoint,
                  keys: raw.keys,
                  deviceName: navigator.userAgent.includes("iPhone") ? "iPhone Safari PWA" : "Desktop PWA",
                  userAgent: navigator.userAgent,
                }),
              });
            }
          }
        } else {
          setShowPromptBanner(false);
        }
      }
    } catch (e) {
      console.warn("Permission request error:", e);
    } finally {
      setIsRegistering(false);
    }
  };

  const handleDismissBanner = () => {
    sessionStorage.setItem("srt_notif_banner_dismissed", "true");
    setShowPromptBanner(false);
  };

  if (!showPromptBanner) return null;

  return (
    <aside
      aria-label="Notification prompt"
      style={{
        position: "fixed",
        bottom: "max(1rem, env(safe-area-inset-bottom))",
        right: "max(1rem, env(safe-area-inset-right))",
        zIndex: 9999,
        background: "var(--card-bg, #ffffff)",
        border: "1px solid var(--border-color, #e2e8f0)",
        borderRadius: "14px",
        padding: "0.85rem 1.15rem",
        boxShadow: "0 10px 30px rgba(0, 0, 0, 0.15)",
        display: "flex",
        alignItems: "center",
        gap: "0.85rem",
        maxWidth: "min(92vw, 380px)",
        boxSizing: "border-box",
        animation: "slideInUp 0.3s ease",
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: "50%",
          background: "rgba(37, 99, 235, 0.12)",
          color: "var(--primary, #2563eb)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Bell size={18} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <h4 style={{ margin: 0, fontSize: "0.88rem", fontWeight: 700, color: "var(--text-primary, #0f172a)" }}>
          Enable Notifications
        </h4>
        <p style={{ margin: "0.15rem 0 0", fontSize: "0.78rem", color: "var(--text-secondary, #64748b)" }}>
          Receive instant alerts for messages, report cards, and announcements.
        </p>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexShrink: 0 }}>
        <button
          type="button"
          onClick={handleEnableNotifications}
          disabled={isRegistering}
          style={{
            padding: "0.4rem 0.75rem",
            background: "var(--primary, #2563eb)",
            color: "#ffffff",
            border: "none",
            borderRadius: "8px",
            fontSize: "0.78rem",
            fontWeight: 600,
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          {isRegistering ? "..." : "Enable"}
        </button>

        <button
          type="button"
          onClick={handleDismissBanner}
          style={{
            background: "transparent",
            border: "none",
            color: "var(--text-secondary, #94a3b8)",
            cursor: "pointer",
            padding: "0.25rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          aria-label="Dismiss"
        >
          <X size={16} />
        </button>
      </div>
    </aside>
  );
}


