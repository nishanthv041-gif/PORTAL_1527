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
  // Home Page Animation: always displays without missing on open and on logout
  const [showSplash, setShowSplash] = useState(true);
  const [targetDashboard, setTargetDashboard] = useState<string | null>(null);

  // On native mobile app, immediately hide the native container splash so the rich 3D web animation is visible
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

    // Determine target dashboard if user already has an active session
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
      setTargetDashboard(target);
    } else {
      getPersistedNativeSession()
        .then((session) => {
          if (session?.role) {
            const role = session.role.toUpperCase();
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
            setTargetDashboard(target);
          }
        })
        .catch(() => {});
    }
  }, [authenticatedRole]);

  // When splash loading animation completes: go to dashboard if logged in, or reveal login form
  const handleSplashComplete = () => {
    setShowSplash(false);
    if (targetDashboard) {
      router.replace(targetDashboard);
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
