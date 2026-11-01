"use client";

import React, { memo } from "react";
import Link from "next/link";
import SrtLogo from "@/frontend/components/ui/SrtLogo";
import { SCHOOL_NAME, SCHOOL_TAGLINE } from "@/frontend/lib/constants";

export interface FooterProps {
  className?: string;
  style?: React.CSSProperties;
}

export const Footer = memo(function Footer({ className = "", style }: FooterProps) {
  const currentYear = new Date().getFullYear();

  return (
    <footer
      className={className}
      style={{
        width: "100%",
        maxWidth: "100%",
        backgroundColor: "var(--card-bg, #ffffff)",
        borderTop: "1px solid var(--border-color, #e2e8f0)",
        padding: "clamp(1.5rem, 3vw, 2.5rem) 1rem clamp(1rem, 2vw, 1.5rem)",
        marginTop: "auto",
        boxSizing: "border-box",
        ...style,
      }}
    >
      <div
        style={{
          maxWidth: "1200px",
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          gap: "1.25rem",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "1rem",
          }}
        >
          {/* Logo & School Name */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <SrtLogo size={36} />
            <div>
              <div
                style={{
                  fontSize: "0.95rem",
                  fontWeight: 700,
                  color: "var(--foreground, #0f172a)",
                  letterSpacing: "0.02em",
                }}
              >
                {SCHOOL_NAME}
              </div>
              <div
                style={{
                  fontSize: "0.75rem",
                  color: "var(--text-secondary, #64748b)",
                  letterSpacing: "0.01em",
                }}
              >
                {SCHOOL_TAGLINE}
              </div>
            </div>
          </div>

          {/* Quick Links */}
          <nav
            style={{
              display: "flex",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "1.25rem",
              fontSize: "0.85rem",
              color: "var(--text-secondary, #64748b)",
            }}
          >
            <Link
              href="/dashboard/admin/settings"
              style={{
                color: "inherit",
                transition: "color 0.15s ease",
              }}
              onMouseOver={(e) => (e.currentTarget.style.color = "var(--primary, #3b82f6)")}
              onMouseOut={(e) => (e.currentTarget.style.color = "inherit")}
            >
              Settings
            </Link>
            <span style={{ opacity: 0.3 }}>•</span>
            <span style={{ fontSize: "0.8rem", color: "var(--text-muted, #94a3b8)" }}>
              Official Academic Portal
            </span>
          </nav>
        </div>

        {/* Divider */}
        <div
          style={{
            height: "1px",
            backgroundColor: "var(--border-color, #e2e8f0)",
            width: "100%",
          }}
        />

        {/* Copyright */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "0.75rem",
            fontSize: "0.8rem",
            color: "var(--text-secondary, #64748b)",
          }}
        >
          <div>
            © {currentYear} {SCHOOL_NAME}. All rights reserved.
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-muted, #94a3b8)" }}>
            Secured Student &amp; Staff Information System
          </div>
        </div>
      </div>
    </footer>
  );
});

Footer.displayName = "Footer";

export default Footer;

