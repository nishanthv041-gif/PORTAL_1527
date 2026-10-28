"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { GraduationCap } from "lucide-react";

interface SchoolPortalLoadingAnimationProps {
  schoolName?: string;
  schoolLogo?: string | null;
}

function LoaderInner({ schoolName = "SRT School Management Portal", schoolLogo }: SchoolPortalLoadingAnimationProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [isLoading, setIsLoading] = useState(false);
  const [isFadingOut, setIsFadingOut] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const isInitialMount = useRef(true);

  const startLoader = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setIsFadingOut(false);
    setIsLoading(true);

    // Safety timeout: automatically dismiss after 2.4s so it NEVER traps the user
    timerRef.current = setTimeout(() => {
      finishLoader();
    }, 2400);
  };

  const finishLoader = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setIsFadingOut(true);
    timerRef.current = setTimeout(() => {
      setIsLoading(false);
      setIsFadingOut(false);
    }, 320);
  };

  // Route change completion
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    finishLoader();
  }, [pathname, searchParams]);

  // Intercept navigation link clicks for genuine page transitions
  useEffect(() => {
    const handleDocumentClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement)?.closest("a");
      if (!target || !target.href) return;

      if (
        target.hasAttribute("download") ||
        target.target === "_blank" ||
        target.rel?.includes("external")
      ) {
        return;
      }

      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

      try {
        const url = new URL(target.href, window.location.origin);
        if (url.origin !== window.location.origin) return;
        if (url.pathname === window.location.pathname && url.search === window.location.search) return;

        startLoader();
      } catch { }
    };

    const handlePopState = () => {
      startLoader();
    };

    document.addEventListener("click", handleDocumentClick, true);
    window.addEventListener("popstate", handlePopState);

    return () => {
      document.removeEventListener("click", handleDocumentClick, true);
      window.removeEventListener("popstate", handlePopState);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  if (!isLoading) return null;

  return (
    <div
      aria-live="polite"
      aria-busy="true"
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(15, 23, 42, 0.75)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        zIndex: 999998,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        pointerEvents: "none",
        opacity: isFadingOut ? 0 : 1,
        transition: "opacity 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "1rem",
          background: "rgba(30, 41, 59, 0.95)",
          border: "1px solid rgba(99, 102, 241, 0.3)",
          boxShadow: "0 20px 40px rgba(0, 0, 0, 0.4), 0 0 30px rgba(99, 102, 241, 0.2)",
          padding: "1.75rem 2.5rem",
          borderRadius: "20px",
          maxWidth: "90vw",
          textAlign: "center",
          transform: isFadingOut ? "scale(0.96)" : "scale(1)",
          transition: "transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        {/* Animated School Crest / Logo */}
        <div
          style={{
            position: "relative",
            width: "68px",
            height: "68px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "50%",
            background: "linear-gradient(135deg, rgba(59, 130, 246, 0.2), rgba(99, 102, 241, 0.3))",
            border: "2px solid rgba(99, 102, 241, 0.5)",
            boxShadow: "0 0 20px rgba(99, 102, 241, 0.35)",
          }}
        >
          {schoolLogo ? (
            <img
              src={schoolLogo}
              alt="School Logo"
              style={{
                width: "44px",
                height: "44px",
                objectFit: "contain",
                borderRadius: "50%",
              }}
            />
          ) : (
            <GraduationCap size={32} color="#60a5fa" />
          )}

          {/* Gentle Pulsing Orbit Ring */}
          <div
            style={{
              position: "absolute",
              inset: "-6px",
              borderRadius: "50%",
              border: "2px dashed rgba(96, 165, 250, 0.6)",
              animation: "spinSlow 6s linear infinite",
            }}
          />
        </div>

        {/* Portal Name & Tagline */}
        <div>
          <div
            style={{
              fontSize: "1.05rem",
              fontWeight: 800,
              color: "#f8fafc",
              letterSpacing: "0.02em",
              marginBottom: "0.2rem",
            }}
          >
            {schoolName}
          </div>
          <div
            style={{
              fontSize: "0.78rem",
              fontWeight: 600,
              color: "#94a3b8",
              letterSpacing: "0.05em",
              textTransform: "uppercase",
            }}
          >
            Official Portal
          </div>
        </div>

        {/* School Loading Progress Indicator */}
        <div
          style={{
            width: "140px",
            height: "4px",
            background: "rgba(255, 255, 255, 0.1)",
            borderRadius: "4px",
            overflow: "hidden",
            position: "relative",
            marginTop: "0.25rem",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              width: "50%",
              background: "linear-gradient(90deg, #3b82f6, #818cf8)",
              borderRadius: "4px",
              animation: "indeterminateProgress 1.4s ease-in-out infinite",
            }}
          />
        </div>
      </div>
    </div>
  );
}

export default function SchoolPortalLoadingAnimation({
  schoolName,
  schoolLogo,
}: SchoolPortalLoadingAnimationProps) {
  return (
    <Suspense fallback={null}>
      <LoaderInner schoolName={schoolName} schoolLogo={schoolLogo} />
    </Suspense>
  );
}
