"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Capacitor } from "@capacitor/core";
import ModernLoginForm from "@/frontend/components/ModernLoginForm";
import { getPersistedNativeSession } from "@/frontend/lib/authPersistence";

interface HomeClientProps {
  schoolName?: string;
  schoolLogo?: string | null;
  initialError?: string | null;
  initialReason?: string | null;
}

export default function HomeClient({
  schoolName = "SRT UNIVERSAL SCHOOL",
  schoolLogo = "/logo/srt-logo.svg",
  initialError,
  initialReason,
}: HomeClientProps) {
  const router = useRouter();
  const [isRedirecting, setIsRedirecting] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      const persisted = localStorage.getItem("srt_native_auth_session");
      if (persisted) {
        const parsed = JSON.parse(persisted);
        return !!parsed?.role;
      }
    } catch {
      return false;
    }
    return false;
  });

  // Instant auto-redirect for logged in user on phone & instant native splash dismissal
  useEffect(() => {
    // 1. Immediately hide native splash screen if running inside Capacitor mobile app
    if (typeof window !== "undefined" && Capacitor.isNativePlatform()) {
      const winCap = (window as unknown as { Capacitor?: { Plugins?: { SplashScreen?: { hide: (opts?: { fadeOutDuration?: number }) => Promise<void> } } } })?.Capacitor;
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

    // 2. Check for persisted native session or active session for instant 0ms auto-entry to dashboard
    getPersistedNativeSession()
      .then((persisted) => {
        if (persisted?.role) {
          setIsRedirecting(true);
          const role = persisted.role.toUpperCase();
          const target =
            role === "STAFF" || role === "NON_TEACHING_STAFF"
              ? "/staff/my-bus"
              : `/dashboard/${role.toLowerCase()}`;
          router.replace(target);
        }
      })
      .catch(() => {});

    // 3. Fallback: Quick client session touch
    fetch("/api/auth/session", { cache: "no-store" })
      .then((res) => {
        if (res.ok) {
          return res.json();
        }
        return null;
      })
      .then((data) => {
        if (data?.user?.role) {
          setIsRedirecting(true);
          const role = data.user.role.toUpperCase();
          const target =
            role === "STAFF" || role === "NON_TEACHING_STAFF"
              ? "/staff/my-bus"
              : `/dashboard/${role.toLowerCase()}`;
          router.replace(target);
        }
      })
      .catch(() => {});
  }, [router]);

  if (isRedirecting) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-[#060a28]">
        <div className="w-8 h-8 border-2 border-[#f2b84b]/30 border-t-[#f2b84b] rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <ModernLoginForm
      schoolName={schoolName}
      schoolLogo={schoolLogo || "/logo/srt-logo.svg"}
      initialError={initialError}
      initialReason={initialReason}
    />
  );
}

