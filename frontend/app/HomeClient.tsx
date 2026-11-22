"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Capacitor } from "@capacitor/core";
import { SplashScreen } from "@/frontend/components/ui";
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
  // Check if splash has already been shown in this session or on mobile
  const [showSplash, setShowSplash] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      if (Capacitor.isNativePlatform()) return false;
      return sessionStorage.getItem("srt_splash_shown") !== "true";
    } catch {
      return false;
    }
  });

  // On native mobile app or when authenticated, immediately hide native splash and skip delay
  useEffect(() => {
    if (typeof window !== "undefined") {
      if (Capacitor.isNativePlatform()) {
        setShowSplash(false);
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

      // If user is authenticated, redirect immediately without waiting
      if (authenticatedRole) {
        setShowSplash(false);
        const role = authenticatedRole.toUpperCase();
        const target =
          role === "STAFF" || role === "NON_TEACHING_STAFF"
            ? "/staff/my-bus"
            : `/dashboard/${role.toLowerCase()}`;
        router.replace(target);
      }
    }

    // Touch getPersistedNativeSession for mobile state sync
    getPersistedNativeSession().catch(() => {});
  }, [authenticatedRole, router]);

  const handleSplashComplete = () => {
    setShowSplash(false);
    try {
      sessionStorage.setItem("srt_splash_shown", "true");
    } catch {}

    // If user is already authenticated, transition smoothly to their dashboard
    if (authenticatedRole) {
      const role = authenticatedRole.toUpperCase();
      const target =
        role === "STAFF" || role === "NON_TEACHING_STAFF"
          ? "/staff/my-bus"
          : `/dashboard/${role.toLowerCase()}`;
      router.replace(target);
    }
  };

  return (
    <>
      {showSplash && (
        <SplashScreen
          forceShow={false}
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
