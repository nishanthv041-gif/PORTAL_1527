"use client";

import React, { useState, useEffect, useSyncExternalStore } from "react";
import { useRouter, usePathname } from "next/navigation";
import { SplashScreen } from "@/frontend/components/ui";
import ModernLoginForm from "@/frontend/components/ModernLoginForm";

interface HomeClientProps {
  schoolName?: string;
  schoolLogo?: string | null;
  initialError?: string | null;
}

const SESSION_KEY = "srt_splash_shown";

function subscribe() {
  return () => {};
}

function getClientSnapshot(): boolean {
  try {
    return sessionStorage.getItem(SESSION_KEY) === "true";
  } catch {
    return false;
  }
}

function getServerSnapshot(): boolean {
  // Server always returns false so splash renders during SSR, preventing flash of content
  return false;
}

export default function HomeClient({
  schoolName = "SRT UNIVERSAL SCHOOL",
  schoolLogo = "/logo/srt-logo.svg",
  initialError,
}: HomeClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const isSplashDone = useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);
  const [dismissed, setDismissed] = useState(false);

  const shouldShowSplash = !isSplashDone && !dismissed;

  // If splash was already seen in this session and user is on '/', smoothly redirect to '/login'
  useEffect(() => {
    if (isSplashDone && pathname === "/") {
      router.replace("/login");
    }
  }, [isSplashDone, pathname, router]);

  return (
    <>
      {shouldShowSplash && (
        <SplashScreen
          onComplete={() => {
            setDismissed(true);
            if (pathname !== "/login") {
              router.replace("/login", { scroll: false });
            }
          }}
          redirectTo="/login"
        />
      )}
      <ModernLoginForm
        schoolName={schoolName}
        schoolLogo={schoolLogo || "/logo/srt-logo.svg"}
        initialError={initialError}
      />
    </>
  );
}

