"use client";

import React from "react";
import Spinner from "./Spinner";
import { SearchX, AlertCircle, RefreshCw } from "lucide-react";

export interface ResultsContainerProps {
  isPending?: boolean;
  isEmpty?: boolean;
  emptyTitle?: string;
  emptyMessage?: string;
  onReset?: () => void;
  resetLabel?: string;
  error?: string | null;
  onRetry?: () => void;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export default function ResultsContainer({
  isPending = false,
  isEmpty = false,
  emptyTitle = "No Results Found",
  emptyMessage = "No records matched your search or active filters. Try adjusting your query.",
  onReset,
  resetLabel = "Clear Search",
  error,
  onRetry,
  children,
  className = "",
  style,
}: ResultsContainerProps) {
  return (
    <div
      className={className}
      style={{
        position: "relative",
        width: "100%",
        minWidth: 0,
        boxSizing: "border-box",
        ...style,
      }}
      aria-busy={isPending}
    >
      {/* 1. Partial-Refresh Overlay Spinner (Dims previous results without flickering) */}
      {isPending && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 10,
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            paddingTop: "4rem",
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.75rem",
              background: "var(--card-bg, #1e293b)",
              color: "var(--foreground, #f8fafc)",
              padding: "0.65rem 1.25rem",
              borderRadius: "30px",
              boxShadow: "0 8px 30px rgba(0, 0, 0, 0.25)",
              border: "1px solid var(--border)",
              fontSize: "0.875rem",
              fontWeight: 600,
              backdropFilter: "blur(4px)",
              pointerEvents: "auto",
            }}
          >
            <Spinner size="sm" color="var(--primary)" />
            <span>Updating results...</span>
          </div>
        </div>
      )}

      {/* 2. Error State */}
      {error && !isPending && (
        <div
          style={{
            padding: "2.5rem 1.5rem",
            textAlign: "center",
            background: "var(--card-bg, #ffffff)",
            border: "1px solid var(--danger)",
            borderRadius: "14px",
            margin: "1rem 0",
          }}
        >
          <div
            style={{
              width: "48px",
              height: "48px",
              borderRadius: "50%",
              background: "var(--danger-bg, rgba(239, 68, 68, 0.1))",
              color: "var(--danger)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 1rem auto",
            }}
          >
            <AlertCircle size={26} />
          </div>
          <h3 style={{ fontSize: "1.1rem", fontWeight: 700, margin: "0 0 0.5rem 0", color: "var(--foreground)" }}>
            Unable to load results
          </h3>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", margin: "0 0 1.25rem 0", maxWidth: "460px", marginLeft: "auto", marginRight: "auto" }}>
            {error}
          </p>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.55rem 1.25rem",
                borderRadius: "8px",
                background: "var(--primary)",
                color: "#ffffff",
                border: "none",
                fontWeight: 600,
                fontSize: "0.875rem",
                cursor: "pointer",
              }}
            >
              <RefreshCw size={16} />
              <span>Try Again</span>
            </button>
          )}
        </div>
      )}

      {/* 3. Empty State */}
      {isEmpty && !error && !isPending && (
        <div
          style={{
            padding: "3.5rem 1.5rem",
            textAlign: "center",
            background: "var(--card-bg, #ffffff)",
            border: "1px dashed var(--border)",
            borderRadius: "14px",
            margin: "1rem 0",
          }}
        >
          <div
            style={{
              width: "56px",
              height: "56px",
              borderRadius: "50%",
              background: "rgba(99, 102, 241, 0.08)",
              color: "var(--primary)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 1.25rem auto",
            }}
          >
            <SearchX size={28} />
          </div>
          <h3 style={{ fontSize: "1.15rem", fontWeight: 700, margin: "0 0 0.5rem 0", color: "var(--foreground)" }}>
            {emptyTitle}
          </h3>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", margin: "0 0 1.25rem 0", maxWidth: "420px", marginLeft: "auto", marginRight: "auto" }}>
            {emptyMessage}
          </p>
          {onReset && (
            <button
              type="button"
              onClick={onReset}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.5rem 1.25rem",
                borderRadius: "8px",
                background: "var(--input-bg)",
                border: "1px solid var(--border)",
                color: "var(--foreground)",
                fontWeight: 600,
                fontSize: "0.875rem",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              <span>{resetLabel}</span>
            </button>
          )}
        </div>
      )}

      {/* 4. Active Results Content (Dimmed smoothly during transitions) */}
      <div
        style={{
          opacity: isPending ? 0.45 : 1,
          transition: "opacity 0.2s ease",
          pointerEvents: isPending ? "none" : "auto",
          width: "100%",
          minWidth: 0,
        }}
      >
        {(!isEmpty || isPending) && !error && children}
      </div>
    </div>
  );
}

