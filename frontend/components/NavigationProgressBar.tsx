"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";

function ProgressBarInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  
  const [isVisible, setIsVisible] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isFadingOut, setIsFadingOut] = useState(false);

  const trickleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const safetyTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const cleanupTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isNavigatingRef = useRef(false);

  const clearAllTimers = () => {
    if (trickleTimerRef.current) {
      clearInterval(trickleTimerRef.current);
      trickleTimerRef.current = null;
    }
    if (safetyTimeoutRef.current) {
      clearTimeout(safetyTimeoutRef.current);
      safetyTimeoutRef.current = null;
    }
    if (cleanupTimeoutRef.current) {
      clearTimeout(cleanupTimeoutRef.current);
      cleanupTimeoutRef.current = null;
    }
  };

  const startProgress = () => {
    clearAllTimers();
    isNavigatingRef.current = true;
    setIsFadingOut(false);
    setIsVisible(true);
    setProgress(18);

    // Trickle progress up to 90%
    trickleTimerRef.current = setInterval(() => {
      setProgress((prev) => {
        if (prev < 40) return prev + 12;
        if (prev < 70) return prev + 6;
        if (prev < 85) return prev + 3;
        if (prev < 90) return prev + 1;
        return prev;
      });
    }, 200);

    // Safety timeout: automatically finish after 3.5 seconds if navigation stalled or aborted
    safetyTimeoutRef.current = setTimeout(() => {
      completeProgress();
    }, 3500);
  };

  const completeProgress = () => {
    clearAllTimers();
    if (!isNavigatingRef.current) return;
    isNavigatingRef.current = false;

    // Jump to 100%
    setProgress(100);

    // Fade out after reaching 100%
    cleanupTimeoutRef.current = setTimeout(() => {
      setIsFadingOut(true);
      cleanupTimeoutRef.current = setTimeout(() => {
        setIsVisible(false);
        setProgress(0);
        setIsFadingOut(false);
      }, 300);
    }, 200);
  };

  // Complete progress whenever route or query params change
  useEffect(() => {
    if (isNavigatingRef.current) {
      completeProgress();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, searchParams]);

  // Intercept clicks on links for immediate progress feedback
  useEffect(() => {
    const handleDocumentClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement)?.closest("a");
      if (!target || !target.href) return;

      // Ignore downloads, mailto, tel, or target=_blank
      if (
        target.hasAttribute("download") ||
        target.target === "_blank" ||
        target.rel?.includes("external")
      ) {
        return;
      }

      // Ignore modifier clicks (cmd/ctrl/shift/alt click opens in new tab)
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

      try {
        const url = new URL(target.href, window.location.origin);
        if (url.origin !== window.location.origin) return;
        if (url.protocol !== "http:" && url.protocol !== "https:") return;

        // Ignore hash anchor links on same page
        const isSamePageAnchor =
          url.pathname === window.location.pathname &&
          url.search === window.location.search &&
          url.hash !== "";
        if (isSamePageAnchor) return;

        // Only start if navigation targets a different path or query
        const isDifferentRoute =
          url.pathname !== window.location.pathname ||
          url.search !== window.location.search;

        if (isDifferentRoute) {
          startProgress();
        }
      } catch {
        // Invalid URL, do nothing
      }
    };

    const handlePopState = () => {
      startProgress();
    };

    document.addEventListener("click", handleDocumentClick, true);
    window.addEventListener("popstate", handlePopState);

    return () => {
      document.removeEventListener("click", handleDocumentClick, true);
      window.removeEventListener("popstate", handlePopState);
      clearAllTimers();
    };
  }, []);

  if (!isVisible) return null;

  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: `${progress}%`,
        height: "3px",
        background: "linear-gradient(90deg, #3b82f6 0%, #6366f1 50%, #ec4899 100%)",
        boxShadow: "0 0 10px rgba(99, 102, 241, 0.8), 0 0 5px rgba(236, 72, 153, 0.6)",
        transition: progress === 100
          ? "width 0.2s ease-out, opacity 0.3s ease-in"
          : "width 0.25s cubic-bezier(0.1, 0.9, 0.2, 1)",
        opacity: isFadingOut ? 0 : 1,
        zIndex: 999999,
        pointerEvents: "none",
      }}
    >
      {/* Leading glow head */}
      <div
        style={{
          position: "absolute",
          right: 0,
          top: "-2px",
          width: "80px",
          height: "7px",
          background: "radial-gradient(ellipse at center, rgba(236,72,153,0.9) 0%, rgba(99,102,241,0.5) 50%, transparent 100%)",
          transform: "translateX(40%)",
          filter: "blur(1px)",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}

export default function NavigationProgressBar() {
  return (
    <Suspense fallback={null}>
      <ProgressBarInner />
    </Suspense>
  );
}
