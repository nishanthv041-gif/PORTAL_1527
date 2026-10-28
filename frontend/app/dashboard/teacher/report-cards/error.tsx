"use client";

import { useEffect } from "react";
import { AlertCircle, RefreshCw, ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function TeacherReportCardsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Teacher Report Cards error boundary:", error);
  }, [error]);

  return (
    <div style={{
      maxWidth: "580px",
      margin: "3rem auto",
      padding: "2rem",
      background: "var(--card-bg, #ffffff)",
      border: "1.5px solid var(--border-color, #e2e8f0)",
      borderRadius: "20px",
      textAlign: "center",
      boxShadow: "0 10px 30px rgba(0,0,0,0.06)"
    }}>
      <div style={{
        width: "56px",
        height: "56px",
        borderRadius: "16px",
        background: "rgba(239, 68, 68, 0.1)",
        color: "#ef4444",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        margin: "0 auto 1.25rem"
      }}>
        <AlertCircle size={28} />
      </div>

      <h2 style={{ margin: "0 0 0.5rem 0", fontSize: "1.3rem", fontWeight: 800, color: "var(--foreground)" }}>
        Report Cards Console
      </h2>

      <p style={{ margin: "0 0 1.5rem 0", fontSize: "0.9rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
        {error?.message || "An unexpected error occurred while preparing academic report cards. Please retry."}
      </p>

      <div style={{ display: "flex", justifyContent: "center", gap: "0.85rem", flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => reset()}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.5rem",
            padding: "0.65rem 1.35rem",
            borderRadius: "10px",
            border: "none",
            background: "var(--primary, #6366f1)",
            color: "#ffffff",
            fontWeight: 700,
            fontSize: "0.88rem",
            cursor: "pointer"
          }}
        >
          <RefreshCw size={15} />
          <span>Reload &amp; Retry</span>
        </button>

        <Link
          href="/dashboard/teacher"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.5rem",
            padding: "0.65rem 1.35rem",
            borderRadius: "10px",
            border: "1px solid var(--border-color)",
            background: "transparent",
            color: "var(--foreground)",
            fontWeight: 700,
            fontSize: "0.88rem",
            textDecoration: "none"
          }}
        >
          <ArrowLeft size={15} />
          <span>Back to Dashboard</span>
        </Link>
      </div>
    </div>
  );
}
