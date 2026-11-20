"use client";

import React from "react";
import ModernLoginForm from "@/frontend/components/ModernLoginForm";

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
  // Ultra-fast zero-delay portal opening: on mobile (iOS/Android) and PC, directly opens straight to the landing / login page with 0ms delay
  return (
    <ModernLoginForm
      schoolName={schoolName}
      schoolLogo={schoolLogo || "/logo/srt-logo.svg"}
      initialError={initialError}
      initialReason={initialReason}
    />
  );
}

