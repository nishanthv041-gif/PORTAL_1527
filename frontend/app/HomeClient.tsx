"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Capacitor } from "@capacitor/core";
import SplashScreen from "@/frontend/components/ui/SplashScreen";
import ModernLoginForm from "@/frontend/components/ModernLoginForm";
import { getPersistedNativeSession } from "@/frontend/lib/authPersistence";

interface HomeClientProps {
  schoolName?: string;
  schoolLogo?: string | null;
  initialError?: string | null;
  initialReason?: string | null;
  authenticatedRole?: string | null;
}

export default function HomeClient({
  schoolName = "SRT UNIVERSAL SCHOOL",
  schoolLogo = "/logo/srt-logo.svg",
  initialError,
  initialReason,
  authenticatedRole = null,
}: HomeClientProps) {
  const router = useRouter();
  const [showSplash, setShowSplash] = useState(true);

  // On native mobile app, immediately hide the native container splash so the full 3D web animation is visible
  useEffect(() => {
    if (typeof window !== "undefined" && Capacitor.isNativePlatform()) {
      const winCap = (window as unknown as {
        Capacitor?: {
          Plugins?: {
            SplashScreen?: {
              hide: (opts?: { fadeOutDuration?: number }) => Promise<void>;
            };
          };
        };
      })?.Capacitor;

      if (winCap?.Plugins?.SplashScreen?.hide) {
        winCap.Plugins.SplashScreen.hide({ fadeOutDuration: 0 }).catch(() => {});
      } else {
        import("@capacitor/splash-screen")
          .then(({ SplashScreen }) => {
            SplashScreen.hide({ fadeOutDuration: 0 }).catch(() => {});
          })
          .catch(() => {});
      }
    }

    // Touch getPersistedNativeSession for mobile state sync
    getPersistedNativeSession().catch(() => {});
  }, []);

  const handleSplashComplete = () => {
    setShowSplash(false);
    try {
      sessionStorage.setItem("srt_splash_shown", "true");
    } catch {}

    // If authenticatedRole was passed from server session, navigate smoothly to role dashboard
    if (authenticatedRole) {
      const role = authenticatedRole.toUpperCase();
      const target =
        role === "ADMIN"
          ? "/dashboard/admin"
          : role === "TEACHER"
          ? "/dashboard/teacher"
          : role === "PARENT"
          ? "/dashboard/parent"
          : role === "STAFF" || role === "NON_TEACHING_STAFF"
          ? "/staff/my-bus"
          : "/dashboard";
      router.replace(target);
    }
  };

  return (
    <>
      {showSplash && (
        <SplashScreen
          forceShow={true}
          onComplete={handleSplashComplete}
        />
      )}
      <ModernLoginForm
        schoolName={schoolName}
        schoolLogo={schoolLogo || "/logo/srt-logo.svg"}
        initialError={initialError}
        initialReason={initialReason}
      />
    </>
  );
}
