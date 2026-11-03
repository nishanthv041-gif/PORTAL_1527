"use client";

import { useEffect } from "react";

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

