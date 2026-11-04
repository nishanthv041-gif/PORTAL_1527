"use client";

import { useEffect } from "react";

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
 * PwaRegistration
 * Registers the Service Worker (/sw.js) securely in the browser.
 * Ensures zero blocking of page loading and handles updates smoothly.
 */
export default function PwaRegistration() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    // Only register on production or HTTPS or localhost
    const isLocalhost =
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1" ||
      window.location.hostname.endsWith(".local");

    if (window.location.protocol !== "https:" && !isLocalhost) {
      return;
    }

    const registerSW = async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
        });

        // Check for updates periodically (every 60 minutes)
        setInterval(() => {
          registration.update().catch(() => {});
        }, 60 * 60 * 1000);

        // When a new service worker is found and installed, inform if needed
        registration.onupdatefound = () => {
          const installingWorker = registration.installing;
          if (installingWorker) {
            installingWorker.onstatechange = () => {
              if (
                installingWorker.state === "installed" &&
                navigator.serviceWorker.controller
              ) {
                // New content is available; will activate on next refresh or claim
                console.info("[PWA] SRT Portal updated in background.");
              }
            };
          }
        };

        // Self-Healing Push Subscription Helper: Ensures active device subscription is bound to the logged-in user
        const syncActiveSubscription = async () => {
          if (typeof window === "undefined" || !("Notification" in window) || Notification.permission !== "granted") {
            return;
          }

          try {
            const readyReg = await navigator.serviceWorker.ready;
            let sub = await readyReg.pushManager.getSubscription();

            // If subscription is missing or revoked, renew it automatically with the current VAPID key
            if (!sub) {
              const keyRes = await fetch("/api/notifications/push/public-key").catch(() => null);
              const keyData = await keyRes?.json().catch(() => null);
              if (keyData?.publicKey) {
                const keyArr = urlBase64ToUint8Array(keyData.publicKey);
                sub = await readyReg.pushManager.subscribe({
                  userVisibleOnly: true,
                  applicationServerKey: keyArr as unknown as BufferSource,
                }).catch(() => null);
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
                await fetch("/api/notifications/push/subscribe", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    endpoint: sub.endpoint,
                    keys: { p256dh, auth },
                    userAgent: navigator.userAgent,
                  }),
                }).catch(() => {});
              }
            }
          } catch (err) {
            console.warn("[PWA] Push subscription sync skipped:", err);
          }
        };

        // Run sync on startup
        syncActiveSubscription();

        // Also re-sync when user returns to app or tab gains focus (e.g. after logging in)
        window.addEventListener("focus", syncActiveSubscription);
        document.addEventListener("visibilitychange", () => {
          if (!document.hidden) syncActiveSubscription();
        });
      } catch (err) {
        console.warn("[PWA] Service worker registration deferred:", err);
      }
    };

    // Register after the window has completely loaded to preserve fast initial page load & TTFB
    if (document.readyState === "complete") {
      registerSW();
    } else {
      window.addEventListener("load", registerSW, { once: true });
    }
  }, []);

  return null;
}

