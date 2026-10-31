"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RotateCcw, Home } from "lucide-react";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Dashboard error boundary caught:", error);
  }, [error]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "60vh",
        padding: "2rem 1rem",
        textAlign: "center",
      }}
    >
      <div
        style={{
          width: "64px",
          height: "64px",
          borderRadius: "50%",
          backgroundColor: "rgba(239, 68, 68, 0.12)",
          color: "#ef4444",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: "1.25rem",
        }}
      >
        <AlertTriangle size={32} />
      </div>

      <h2
        style={{
          fontSize: "1.5rem",
          fontWeight: 700,
          color: "var(--foreground, #f8fafc)",
          margin: "0 0 0.5rem 0",
        }}
      >
        Unable to Load Dashboard Content
      </h2>

      <p
        style={{
          fontSize: "0.95rem",
          color: "var(--text-secondary, #94a3b8)",
          maxWidth: "460px",
          lineHeight: 1.5,
          margin: "0 0 1.75rem 0",
        }}
      >
        A temporary server issue occurred while loading this page. Please try reloading, or return to your main dashboard.
      </p>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "1rem",
          flexWrap: "wrap",
          justifyContent: "center",
        }}
      >
        <button
          type="button"
          onClick={() => reset()}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.5rem",
            padding: "0.65rem 1.4rem",
            backgroundColor: "#3b82f6",
            color: "#ffffff",
            fontWeight: 600,
            borderRadius: "8px",
            border: "none",
            cursor: "pointer",
            fontSize: "0.9rem",
            boxShadow: "0 2px 8px rgba(59, 130, 246, 0.3)",
          }}
        >
          <RotateCcw size={16} />
          Reload
        </button>

        <Link
          href="/dashboard"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.5rem",
            padding: "0.65rem 1.4rem",
            backgroundColor: "rgba(255, 255, 255, 0.08)",
            color: "var(--foreground, #f8fafc)",
            fontWeight: 600,
            borderRadius: "8px",
            border: "1px solid var(--border, rgba(255, 255, 255, 0.15))",
            textDecoration: "none",
            fontSize: "0.9rem",
          }}
        >
          <Home size={16} />
          Dashboard
        </Link>
      </div>
    </div>
  );
}
