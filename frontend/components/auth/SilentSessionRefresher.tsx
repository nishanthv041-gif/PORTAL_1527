"use client";

import { useEffect, useRef } from "react";
import { useMidnightMasterRefresh } from "@/frontend/hooks/useMidnightMasterRefresh";
import { syncAppBadgeWithServer } from "@/frontend/lib/pwa/badgeManager";
import { persistNativeSession } from "@/frontend/lib/authPersistence";

/**
 * SilentSessionRefresher
 * 
 * Ensures:
 * 1. Permanent Login (Never Auto-Logout): Silently refreshes JWT access token
 *    in the background and persists session to @capacitor/preferences on native mobile.
 * 2. 12:00 AM Silent Master Refresh: Mounts the jittered midnight state sync.
 * 3. App Icon Badging: Synchronizes app badge on launch.
 */
export default function SilentSessionRefresher() {
  // Mount 12:00 AM jittered midnight state refresh
  useMidnightMasterRefresh();

  const lastRefreshRef = useRef<number>(Date.now());

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Immediately dismiss native Capacitor splash screen so app launches with zero lag
    try {
      const { Capacitor } = require("@capacitor/core");
      if (Capacitor.isNativePlatform()) {
        import("@capacitor/splash-screen")
          .then(({ SplashScreen }) => {
            SplashScreen.hide({ fadeOutDuration: 100 }).catch(() => {});
          })
          .catch(() => {});
      }
    } catch {}

    // Initial badge sync on portal launch
    syncAppBadgeWithServer().catch(() => {});

    // Silent background token refresh function with native session persistence
    const silentlyRefreshToken = async () => {
      try {
        const res = await fetch("/api/auth/session", {
          cache: "no-store",
          headers: { "Cache-Control": "no-cache" },
        });
        if (res.ok) {
          lastRefreshRef.current = Date.now();
          const data = await res.json();
          if (data?.user?.id) {
            persistNativeSession({
              userId: data.user.id,
              role: data.user.role || "USER",
              name: data.user.name,
              email: data.user.email,
              loginTimestamp: Date.now(),
            }).catch(() => {});
          }
        }
      } catch (err) {
        console.debug("[SessionKeeper] Background token touch note:", err);
      }
    };

    // Run initial refresh check
    silentlyRefreshToken();

    // Silent refresh every 3 hours while portal is open
    const interval = setInterval(() => {
      silentlyRefreshToken();
    }, 3 * 3600 * 1000);

    // Refresh when user returns to the portal if more than 2 hours have passed
    const handleVisibility = () => {
      if (!document.hidden && Date.now() - lastRefreshRef.current > 2 * 3600 * 1000) {
        silentlyRefreshToken();
        syncAppBadgeWithServer().catch(() => {});
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", handleVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", handleVisibility);
    };
  }, []);

  return null;
}
