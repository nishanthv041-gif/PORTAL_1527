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

  // Instant Launch Engine: On mount, hide native container splash immediately (<50ms) and route authenticated sessions
  useEffect(() => {
    // 1. Immediately dismiss native splash container on Android / iOS
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

    // 2. If authenticatedRole was passed from server session, navigate smoothly to role dashboard
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
      return;
    }

    // 3. Touch getPersistedNativeSession for instant direct dashboard entry if session exists
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
          router.replace(target);
        }
      })
      .catch(() => {});
  }, [authenticatedRole, router]);

  // Zero-delay direct render: users see the login page fully and immediately across Mobile, PC, iOS, and Mac
  return (
    <ModernLoginForm
      schoolName={schoolName}
      schoolLogo={schoolLogo || "/logo/srt-logo.svg"}
      initialError={initialError}
      initialReason={initialReason}
    />
  );
}
