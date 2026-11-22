"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Capacitor } from "@capacitor/core";
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

  // Optimistic Local Session Check (Instant Dashboard Routing < 300ms)
  useEffect(() => {
    // 1. Immediately dismiss native Android/Capacitor container splash
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

    // 2. Optimistic local session check
    try {
      const localRole =
        authenticatedRole?.toUpperCase() ||
        (localStorage.getItem("user-role") || "").toUpperCase() ||
        (document.cookie.match(/user-role=([^;]+)/) || [])[1]?.toUpperCase() ||
        "";

      const hasLocalToken =
        localStorage.getItem("token") ||
        localStorage.getItem("auth-token") ||
        document.cookie.includes("next-auth.session-token") ||
        document.cookie.includes("__Secure-next-auth.session-token");

      if (localRole || hasLocalToken) {
        const target =
          localRole === "ADMIN"
            ? "/dashboard/admin"
            : localRole === "TEACHER"
            ? "/dashboard/teacher"
            : localRole === "PARENT"
            ? "/dashboard/parent"
            : localRole === "STAFF" || localRole === "NON_TEACHING_STAFF"
            ? "/staff/my-bus"
            : "/dashboard";
        router.replace(target);
        return;
      }
    } catch {}

    // Silent background sync
    getPersistedNativeSession().catch(() => {});
  }, [authenticatedRole, router]);

  if (authenticatedRole) {
    return null;
  }

  // Render Login page immediately with zero artificial delay
  return (
    <ModernLoginForm
      schoolName={schoolName}
      schoolLogo={schoolLogo || "/logo/srt-logo.svg"}
      initialError={initialError}
      initialReason={initialReason}
    />
  );
}
