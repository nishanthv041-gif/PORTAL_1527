"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

export default function NavigationProgressBar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);

  // Complete progress on route change
  useEffect(() => {
    if (loading) {
      setProgress(100);
      const timer = setTimeout(() => {
        setLoading(false);
        setProgress(0);
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [pathname, searchParams]);

  // Intercept link clicks for 0ms immediate feedback
  useEffect(() => {
    const handleDocumentClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement)?.closest("a");
      if (!target || !target.href) return;

      const url = new URL(target.href, window.location.origin);
      const isInternal = url.origin === window.location.origin;
      const isAnchor = url.pathname === window.location.pathname && url.hash;
      const isModified = e.metaKey || e.ctrlKey || e.shiftKey || e.altKey;

      if (isInternal && !isAnchor && !isModified && target.target !== "_blank") {
        const isDifferentPath = url.pathname !== window.location.pathname || url.search !== window.location.search;
        if (isDifferentPath) {
          setLoading(true);
          setProgress(25);
          setTimeout(() => setProgress(65), 100);
          setTimeout(() => setProgress(85), 300);
        }
      }
    };

    document.addEventListener("click", handleDocumentClick, true);
    return () => document.removeEventListener("click", handleDocumentClick, true);
  }, []);

  if (!loading && progress === 0) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: `${progress}%`,
        height: "3px",
        background: "linear-gradient(90deg, #3b82f6 0%, #6366f1 50%, #ec4899 100%)",
        boxShadow: "0 0 10px rgba(99, 102, 241, 0.7)",
        transition: progress === 100 ? "width 0.15s ease-out, opacity 0.2s 0.1s" : "width 0.3s cubic-bezier(0.1, 0.9, 0.2, 1)",
        opacity: progress === 100 ? 0 : 1,
        zIndex: 99999,
        pointerEvents: "none"
      }}
    />
  );
}
