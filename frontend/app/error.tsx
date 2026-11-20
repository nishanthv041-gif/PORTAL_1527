"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log unexpected errors for monitoring
    console.error("[GlobalError Boundary]", error);
  }, [error]);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1.5rem",
        background: "var(--background, #0f172a)",
        color: "var(--foreground, #f8fafc)",
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "460px",
          background: "var(--card-bg, #1e293b)",
          border: "1px solid var(--border-color, #334155)",
          borderRadius: "16px",
          padding: "2rem",
          textAlign: "center",
          boxShadow: "0 20px 40px rgba(0, 0, 0, 0.4)",
        }}
      >
        <div
          style={{
            width: "56px",
            height: "56px",
            margin: "0 auto 1.25rem auto",
            borderRadius: "50%",
            background: "rgba(239, 68, 68, 0.15)",
            border: "1px solid rgba(239, 68, 68, 0.3)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#ef4444",
          }}
        >
          <AlertTriangle size={28} />
        </div>

        <h2 style={{ fontSize: "1.25rem", fontWeight: 700, margin: "0 0 0.5rem 0" }}>
          Something went wrong
        </h2>

        <p
          style={{
            color: "var(--text-secondary, #94a3b8)",
            fontSize: "0.88rem",
            lineHeight: 1.5,
            margin: "0 0 1.5rem 0",
            wordBreak: "break-word",
          }}
        >
          {error?.message || "An unexpected issue occurred while rendering this page."}
        </p>

        <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center" }}>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              flex: 1,
              padding: "0.75rem 1rem",
              borderRadius: "10px",
              background: "var(--primary, #3b82f6)",
              color: "#ffffff",
              border: "none",
              fontWeight: 600,
              fontSize: "0.9rem",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.5rem",
            }}
          >
            <RefreshCw size={16} />
            Try again
          </button>

          <Link
            href="/dashboard"
            prefetch={true}
            style={{
              flex: 1,
              padding: "0.75rem 1rem",
              borderRadius: "10px",
              background: "rgba(255, 255, 255, 0.08)",
              color: "inherit",
              border: "1px solid var(--border-color, #334155)",
              fontWeight: 600,
              fontSize: "0.9rem",
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.5rem",
            }}
          >
            <Home size={16} />
            Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
