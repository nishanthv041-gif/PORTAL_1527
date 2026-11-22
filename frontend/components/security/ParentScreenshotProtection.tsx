"use client";

import { useEffect, useState, useCallback } from "react";
import { ShieldAlert } from "lucide-react";

export default function ParentScreenshotProtection() {
  const [showWarning, setShowWarning] = useState(false);
  const [isWindowBlurred, setIsWindowBlurred] = useState(false);

  // Trigger warning banner helper
  const triggerSecurityNotice = useCallback(() => {
    setShowWarning(true);
    const timer = setTimeout(() => setShowWarning(false), 3500);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // 1. Android Native App Hardware Screenshot Restriction (FLAG_SECURE) with retries
    const tryEnableNativeSecure = () => {
      try {
        const win = window as unknown as {
          AndroidSecureScreen?: {
            setSecureMode: (enabled: boolean) => void;
          };
        };
        if (win.AndroidSecureScreen && typeof win.AndroidSecureScreen.setSecureMode === "function") {
          win.AndroidSecureScreen.setSecureMode(true);
          return true;
        }
      } catch (err) {
        console.debug("[ParentSecurity] AndroidSecureScreen activation note:", err);
      }
      return false;
    };

    if (!tryEnableNativeSecure()) {
      const retryTimer = setInterval(() => {
        if (tryEnableNativeSecure()) {
          clearInterval(retryTimer);
        }
      }, 250);
      setTimeout(() => clearInterval(retryTimer), 4000);
    }

    // 2. Add marker class to body for print / selection / callout suppression
    document.body.classList.add("parent-portal-secure");

    // 3. Multi-Touch Gesture Detection (Android 3-Finger Screenshot Gesture)
    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches && e.touches.length >= 3) {
        setIsWindowBlurred(true);
        triggerSecurityNotice();
      }
    };

    // 4. Keyboard Shortcuts Interception (PrintScreen, Snipping Tool, Print to PDF)
    const handleKeyDown = (e: KeyboardEvent) => {
      // PrintScreen key
      if (e.key === "PrintScreen") {
        e.preventDefault();
        try {
          if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
            navigator.clipboard.writeText("");
          }
        } catch {}
        setIsWindowBlurred(true);
        triggerSecurityNotice();
        return;
      }

      // Windows Snipping Tool (Win + Shift + S) or Mac Screenshot (Cmd + Shift + 4)
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === "S" || e.key === "s")) {
        e.preventDefault();
        setIsWindowBlurred(true);
        triggerSecurityNotice();
        return;
      }

      // Print Dialog (Ctrl + P / Cmd + P)
      if ((e.ctrlKey || e.metaKey) && (e.key === "P" || e.key === "p")) {
        e.preventDefault();
        triggerSecurityNotice();
        return;
      }
    };

    // 5. Disable Right-Click Context Menu in Parent Portal
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      triggerSecurityNotice();
    };

    // 6. Focus / Blur Privacy Shield (Activates when screen capture overlays or hardware buttons are pressed)
    const handleBlur = () => {
      setIsWindowBlurred(true);
    };

    const handleFocus = () => {
      setIsWindowBlurred(false);
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        setIsWindowBlurred(true);
      } else {
        setIsWindowBlurred(false);
      }
    };

    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("contextmenu", handleContextMenu, true);
    window.addEventListener("blur", handleBlur);
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      // Restore normal screen capture when leaving the Parent Portal
      try {
        const win = window as unknown as {
          AndroidSecureScreen?: {
            setSecureMode: (enabled: boolean) => void;
          };
        };
        if (win.AndroidSecureScreen && typeof win.AndroidSecureScreen.setSecureMode === "function") {
          win.AndroidSecureScreen.setSecureMode(false);
        }
      } catch {}

      document.body.classList.remove("parent-portal-secure");
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("contextmenu", handleContextMenu, true);
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [triggerSecurityNotice]);

  return (
    <>
      {/* Background Watermark Layer for Screenshot & Photography Protection */}
      <div
        aria-hidden="true"
        className="parent-watermark-overlay"
      />

      {/* Privacy Shield when window loses focus during screenshot snipping or gestures */}
      {isWindowBlurred && (
        <div
          aria-hidden="true"
          onClick={() => setIsWindowBlurred(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 99998,
            backgroundColor: "rgba(6, 10, 40, 0.96)",
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            color: "#ffffff",
            padding: "1.5rem",
            textAlign: "center",
            cursor: "pointer",
          }}
        >
          <div
            style={{
              width: "60px",
              height: "60px",
              borderRadius: "50%",
              backgroundColor: "rgba(242, 184, 75, 0.15)",
              border: "1px solid rgba(242, 184, 75, 0.35)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: "1rem",
              color: "#f2b84b",
            }}
          >
            <ShieldAlert size={30} />
          </div>
          <h3 style={{ fontSize: "1.2rem", fontWeight: 700, margin: "0 0 0.5rem" }}>
            Parent Portal • Security Protected
          </h3>
          <p style={{ fontSize: "0.88rem", color: "rgba(255, 255, 255, 0.75)", margin: "0 0 1rem", maxWidth: "340px", lineHeight: 1.5 }}>
            Screenshots are restricted to protect student privacy and academic records.
          </p>
          <span style={{ fontSize: "0.78rem", color: "#f2b84b", fontWeight: 600, padding: "0.4rem 0.8rem", borderRadius: "8px", background: "rgba(242, 184, 75, 0.1)" }}>
            Tap anywhere to resume viewing
          </span>
        </div>
      )}

      {/* Security Toast Warning */}
      {showWarning && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: "fixed",
            bottom: "max(1.5rem, calc(env(safe-area-inset-bottom) + 1rem))",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 99999,
            backgroundColor: "#060a28",
            border: "1px solid rgba(242, 184, 75, 0.5)",
            borderRadius: "12px",
            padding: "0.75rem 1.25rem",
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            color: "#ffffff",
            boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 0 15px rgba(242, 184, 75, 0.2)",
            fontSize: "0.85rem",
            fontWeight: 600,
            maxWidth: "90vw",
            animation: "parentSecFade 0.25s ease-out",
          }}
        >
          <ShieldAlert size={20} color="#f2b84b" style={{ flexShrink: 0 }} />
          <span>Screenshots are restricted in the Parent Portal for student privacy.</span>
        </div>
      )}

      <style jsx global>{`
        body.parent-portal-secure {
          -webkit-user-select: none !important;
          user-select: none !important;
          -webkit-touch-callout: none !important;
        }
        .parent-watermark-overlay {
          position: fixed;
          inset: 0;
          pointer-events: none;
          z-index: 0;
          opacity: 0.035;
          background-image: repeating-linear-gradient(
            -45deg,
            rgba(255, 255, 255, 0.15) 0,
            rgba(255, 255, 255, 0.15) 1px,
            transparent 0,
            transparent 60px
          );
        }
        @media print {
          body.parent-portal-secure {
            display: none !important;
            visibility: hidden !important;
          }
        }
        @keyframes parentSecFade {
          from {
            opacity: 0;
            transform: translate(-50%, 10px);
          }
          to {
            opacity: 1;
            transform: translate(-50%, 0);
          }
        }
      `}</style>
    </>
  );
}
