"use client";

import { useEffect } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import Link from "next/link";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Global Application Error:", error);
  }, [error]);

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "#0f172a",
      color: "#ffffff",
      padding: "1.5rem",
      fontFamily: "system-ui, -apple-system, sans-serif"
    }}>
      <div style={{
        maxWidth: "480px",
        width: "100%",
        padding: "2rem",
        borderRadius: "18px",
        background: "rgba(255, 255, 255, 0.05)",
        border: "1px solid rgba(255, 255, 255, 0.12)",
        textAlign: "center",
        boxShadow: "0 20px 40px rgba(0,0,0,0.4)"
      }}>
        <div style={{
          width: "52px",
          height: "52px",
          borderRadius: "14px",
          background: "rgba(239, 68, 68, 0.15)",
          color: "#ef4444",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          margin: "0 auto 1.25rem"
        }}>
          <AlertCircle size={28} />
        </div>

        <h2 style={{ fontSize: "1.3rem", fontWeight: 800, margin: "0 0 0.5rem 0" }}>
          School Portal Recovery
        </h2>

        <p style={{ fontSize: "0.88rem", opacity: 0.8, margin: "0 0 1.5rem 0", lineHeight: 1.5 }}>
          {error?.message || "An unexpected error occurred while loading this page. Please try reloading."}
        </p>

        <div style={{ display: "flex", justifyContent: "center", gap: "0.75rem", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.4rem",
              padding: "0.65rem 1.35rem",
              borderRadius: "10px",
              border: "none",
              background: "#6366f1",
              color: "#ffffff",
              fontWeight: 700,
              fontSize: "0.88rem",
              cursor: "pointer"
            }}
          >
            <RefreshCw size={15} />
            <span>Reload &amp; Try Again</span>
          </button>

          <Link
            href="/dashboard"
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "0.65rem 1.35rem",
              borderRadius: "10px",
              border: "1px solid rgba(255, 255, 255, 0.2)",
              color: "#ffffff",
              fontWeight: 700,
              fontSize: "0.88rem",
              textDecoration: "none"
            }}
          >
            Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
