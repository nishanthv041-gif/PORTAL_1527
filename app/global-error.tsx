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
    console.error("[Root GlobalError]", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1.5rem",
          background: "#0f172a",
          color: "#f8fafc",
          fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: "460px",
            background: "#1e293b",
            border: "1px solid #334155",
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
            Application Error
          </h2>

          <p
            style={{
              color: "#94a3b8",
              fontSize: "0.88rem",
              lineHeight: 1.5,
              margin: "0 0 1.5rem 0",
              wordBreak: "break-word",
            }}
          >
            {error?.message || "An unexpected error occurred. Please try again."}
          </p>

          <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center" }}>
            <button
              type="button"
              onClick={() => reset()}
              style={{
                flex: 1,
                padding: "0.75rem 1rem",
                borderRadius: "10px",
                background: "#3b82f6",
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
              href="/"
              style={{
                flex: 1,
                padding: "0.75rem 1rem",
                borderRadius: "10px",
                background: "rgba(255, 255, 255, 0.08)",
                color: "#ffffff",
                border: "1px solid #334155",
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
              Home
            </Link>
          </div>
        </div>
      </body>
    </html>
  );
}
