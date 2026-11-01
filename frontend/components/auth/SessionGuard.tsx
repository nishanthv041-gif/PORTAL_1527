"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  STATUS_POLL_SECONDS,
  ACTIVITY_UPDATE_INTERVAL_MIN,
  REVOCATION_MESSAGES,
} from "@/frontend/lib/session-config";
import SrtLogo from "@/frontend/components/ui/SrtLogo";
import { AlertCircle, LogOut } from "lucide-react";

const BROADCAST_CHANNEL_NAME = "srt_portal_session_channel";
const STORAGE_REVOKE_KEY = "srt_portal_session_revoked";

export default function SessionGuard() {
  const pathname = usePathname();
  const router = useRouter();

  const [revokedInfo, setRevokedInfo] = useState<{
    reason: string;
    message: string;
  } | null>(null);

  const lastActivityPingRef = useRef<number>(Date.now());
  const isRevokedRef = useRef<boolean>(false);
  const isHandlingRevokeRef = useRef<boolean>(false);

  // Check if current route is a public route
  const isPublicRoute =
    !pathname ||
    pathname === "/" ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/");

  const handleSessionRevocation = useCallback(
    async (reason: string, customMessage?: string) => {
      if (isHandlingRevokeRef.current) return;
      isHandlingRevokeRef.current = true;
      isRevokedRef.current = true;

      const message =
        customMessage ||
        REVOCATION_MESSAGES[reason] ||
        REVOCATION_MESSAGES.LOGIN_ELSEWHERE;

      setRevokedInfo({ reason, message });

      // Notify other tabs immediately via BroadcastChannel
      try {
        if (typeof BroadcastChannel !== "undefined") {
          const bc = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
          bc.postMessage({ type: "SESSION_REVOKED", reason, message });
          bc.close();
        }
      } catch (e) {
        // BroadcastChannel fallback
      }

      // Notify other tabs via localStorage event fallback
      try {
        localStorage.setItem(
          STORAGE_REVOKE_KEY,
          JSON.stringify({ timestamp: Date.now(), reason, message })
        );
      } catch (e) {
        // LocalStorage fallback
      }

      // Perform local NextAuth signout
      try {
        await signOut({ redirect: false });
      } catch (e) {
        // signOut fallback
      }

      // Auto-navigate after a short moment if user doesn't click
      setTimeout(() => {
        const queryParam = encodeURIComponent(reason);
        router.replace(`/login?reason=${queryParam}`);
      }, 3500);
    },
    [router]
  );

  // Cross-tab synchronization
  useEffect(() => {
    let bc: BroadcastChannel | null = null;
    try {
      if (typeof BroadcastChannel !== "undefined") {
        bc = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
        bc.onmessage = (event) => {
          if (event.data?.type === "SESSION_REVOKED" && !isRevokedRef.current) {
            handleSessionRevocation(event.data.reason, event.data.message);
          }
        };
      }
    } catch (e) {
      // Ignore
    }

    const handleStorageEvent = (event: StorageEvent) => {
      if (event.key === STORAGE_REVOKE_KEY && event.newValue && !isRevokedRef.current) {
        try {
          const parsed = JSON.parse(event.newValue);
          if (parsed?.reason) {
            handleSessionRevocation(parsed.reason, parsed.message);
          }
        } catch (e) {
          // Ignore
        }
      }
    };

    window.addEventListener("storage", handleStorageEvent);

    return () => {
      if (bc) {
        try {
          bc.close();
        } catch {}
      }
      window.removeEventListener("storage", handleStorageEvent);
    };
  }, [handleSessionRevocation]);

  // Periodic and Event-Driven Session Status Polling
  const checkStatus = useCallback(async () => {
    if (isPublicRoute || isRevokedRef.current) return;

    try {
      const res = await fetch("/api/auth/session-status", {
        method: "GET",
        headers: { "Cache-Control": "no-cache" },
        cache: "no-store",
      });

      if (res.status === 401) {
        const data = await res.json().catch(() => ({}));
        const reason = data.reason || "other-device";
        const message = data.message || REVOCATION_MESSAGES.LOGIN_ELSEWHERE;
        handleSessionRevocation(reason, message);
      }
    } catch (err) {
      // Network hiccup: don't immediately revoke on temporary offline
    }
  }, [isPublicRoute, handleSessionRevocation]);

  // Activity Ping (Throttled to ACTIVITY_UPDATE_INTERVAL_MIN minutes)
  const sendActivityPing = useCallback(async () => {
    if (isPublicRoute || isRevokedRef.current) return;
    const now = Date.now();
    const intervalMs = ACTIVITY_UPDATE_INTERVAL_MIN * 60 * 1000;

    if (now - lastActivityPingRef.current < intervalMs) {
      return; // Skip throttled ping
    }

    lastActivityPingRef.current = now;

    try {
      const res = await fetch("/api/auth/session-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
      });

      if (res.status === 401) {
        const data = await res.json().catch(() => ({}));
        const reason = data.reason || "timeout";
        const message = data.message || REVOCATION_MESSAGES.IDLE_TIMEOUT;
        handleSessionRevocation(reason, message);
      }
    } catch (err) {
      // Ignore background ping errors
    }
  }, [isPublicRoute, handleSessionRevocation]);

  // Wire User Activity Listeners (click, keydown, touchstart, scroll)
  useEffect(() => {
    if (isPublicRoute) return;

    const onUserInteraction = () => {
      const now = Date.now();
      const intervalMs = ACTIVITY_UPDATE_INTERVAL_MIN * 60 * 1000;
      if (now - lastActivityPingRef.current >= intervalMs) {
        sendActivityPing();
      }
    };

    window.addEventListener("click", onUserInteraction, { passive: true });
    window.addEventListener("keydown", onUserInteraction, { passive: true });
    window.addEventListener("touchstart", onUserInteraction, { passive: true });
    window.addEventListener("scroll", onUserInteraction, { passive: true });

    // Focus & Visibility Checks
    const onFocus = () => {
      checkStatus();
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        checkStatus();
      }
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);

    // Periodic Polling
    const pollIntervalMs = STATUS_POLL_SECONDS * 1000;
    const pollTimer = setInterval(checkStatus, pollIntervalMs);

    return () => {
      window.removeEventListener("click", onUserInteraction);
      window.removeEventListener("keydown", onUserInteraction);
      window.removeEventListener("touchstart", onUserInteraction);
      window.removeEventListener("scroll", onUserInteraction);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      clearInterval(pollTimer);
    };
  }, [isPublicRoute, checkStatus, sendActivityPing]);

  if (!revokedInfo) {
    return null;
  }

  // Modal alert when logged out
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="session-revoked-title"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 999999,
        backgroundColor: "rgba(11, 19, 41, 0.85)",
        backdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
        animation: "fadeIn 0.2s ease-out",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "460px",
          backgroundColor: "var(--card-bg, #ffffff)",
          borderRadius: "16px",
          border: "1px solid var(--border-color, #e2e8f0)",
          boxShadow: "0 20px 40px rgba(0, 0, 0, 0.3)",
          padding: "2rem",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
          color: "var(--foreground, #0f172a)",
          boxSizing: "border-box",
        }}
      >
        <div style={{ marginBottom: "1rem" }}>
          <SrtLogo size={56} />
        </div>

        <div
          style={{
            width: "48px",
            height: "48px",
            borderRadius: "50%",
            backgroundColor: "rgba(239, 68, 68, 0.1)",
            color: "#ef4444",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: "1rem",
          }}
        >
          <AlertCircle size={28} />
        </div>

        <h2
          id="session-revoked-title"
          style={{
            margin: "0 0 0.5rem 0",
            fontSize: "1.25rem",
            fontWeight: 800,
            letterSpacing: "-0.01em",
          }}
        >
          Session Terminated
        </h2>

        <p
          style={{
            margin: "0 0 1.5rem 0",
            fontSize: "0.925rem",
            lineHeight: 1.5,
            color: "var(--text-secondary, #64748b)",
          }}
        >
          {revokedInfo.message}
        </p>

        <button
          type="button"
          onClick={() => {
            const queryParam = encodeURIComponent(revokedInfo.reason);
            window.location.href = `/login?reason=${queryParam}`;
          }}
          style={{
            width: "100%",
            padding: "0.75rem 1.5rem",
            borderRadius: "10px",
            border: "none",
            backgroundColor: "var(--primary, #3b82f6)",
            color: "#ffffff",
            fontWeight: 700,
            fontSize: "0.95rem",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "0.5rem",
            boxShadow: "0 4px 12px rgba(59, 130, 246, 0.3)",
            transition: "all 0.15s ease",
          }}
        >
          <LogOut size={18} />
          Proceed to Login
        </button>
      </div>
    </div>
  );
}

