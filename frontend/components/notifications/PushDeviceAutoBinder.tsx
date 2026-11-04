"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

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
 * Automatically connects the user's current device / browser push subscription
 * to their authenticated user account as soon as they log in or visit any dashboard page.
 * Guarantees that mobile notifications (Android, Windows, etc.) are always delivered
 * to the last active device without manual re-configuration.
 */
export default function PushDeviceAutoBinder({ userId }: { userId: string }) {
  const pathname = usePathname();
  const lastSyncRef = useRef<number>(0);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !("serviceWorker" in navigator) ||
      !("Notification" in window) ||
      !userId
    ) {
      return;
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
            } catch {}
          }

          if (p256dh && auth) {
            lastSyncRef.current = Date.now();
            const res = await fetch("/api/notifications/push/subscribe", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                endpoint: sub.endpoint,
                keys: { p256dh, auth },
                userId,
                userAgent: navigator.userAgent,
                deviceName: navigator.userAgent.includes("Android")
                  ? "Android PWA"
                  : navigator.userAgent.includes("iPhone")
                  ? "iOS PWA"
                  : "Desktop PWA",
              }),
            }).catch(() => null);

            // If subscription was revoked or expired on push service, self-heal immediately
            if (res && res.status === 410) {
              try { await sub.unsubscribe(); } catch {}
              const keyRes = await fetch("/api/notifications/push/public-key").catch(() => null);
              const keyData = await keyRes?.json().catch(() => null);
              if (keyData?.publicKey) {
                const keyArr = urlBase64ToUint8Array(keyData.publicKey);
                const freshSub = await reg.pushManager.subscribe({
                  userVisibleOnly: true,
                  applicationServerKey: keyArr as unknown as BufferSource,
                }).catch(() => null);
                if (freshSub) {
                  const rawFresh = freshSub.toJSON();
                  await fetch("/api/notifications/push/subscribe", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      endpoint: freshSub.endpoint,
                      keys: rawFresh.keys,
                      userId,
                      userAgent: navigator.userAgent,
                    }),
                  }).catch(() => {});
                }
              }
            }
          }
        }
      } catch (err) {
        // Silently handle any browser push permission anomalies
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
  }, [userId, pathname]);

  return null;
}

