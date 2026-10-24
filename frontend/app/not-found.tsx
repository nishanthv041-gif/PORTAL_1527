import type { Metadata } from "next";
import Link from "next/link";
import { GraduationCap, ArrowLeft, Home } from "lucide-react";

export const metadata: Metadata = {
  title: "404 - Page Not Found | School Portal",
  robots: {
    index: false,
    follow: false,
  },
};

export default function NotFound() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "var(--background, #f8fafc)",
        color: "var(--foreground, #0f172a)",
        padding: "1.5rem",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <div
        style={{
          maxWidth: "480px",
          width: "100%",
          textAlign: "center",
          background: "var(--card, #ffffff)",
          border: "1px solid var(--border, #e2e8f0)",
          borderRadius: "16px",
          padding: "2.5rem 1.5rem",
          boxShadow: "0 10px 25px rgba(0, 0, 0, 0.05)",
        }}
      >
        <div
          style={{
            width: "60px",
            height: "60px",
            borderRadius: "14px",
            background: "#0f172a",
            color: "#ffffff",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: "1.5rem",
          }}
        >
          <GraduationCap size={32} />
        </div>

        <h1
          style={{
            fontSize: "2rem",
            fontWeight: 800,
            marginBottom: "0.5rem",
            letterSpacing: "-0.02em",
          }}
        >
          404 — Page Not Found
        </h1>

        <p
          style={{
            fontSize: "0.95rem",
            color: "var(--muted-foreground, #64748b)",
            lineHeight: 1.5,
            marginBottom: "2rem",
          }}
        >
          The page or portal route you are looking for does not exist or has been moved.
        </p>

        <div
          style={{
            display: "flex",
            gap: "0.75rem",
            justifyContent: "center",
            flexWrap: "wrap",
          }}
        >
          <Link
            href="/"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.5rem",
              background: "#0f172a",
              color: "#ffffff",
              padding: "0.75rem 1.25rem",
              borderRadius: "10px",
              fontWeight: 600,
              fontSize: "0.9rem",
              textDecoration: "none",
            }}
          >
            <Home size={16} />
            Go to School Portal
          </Link>
        </div>
      </div>
    </div>
  );
}
