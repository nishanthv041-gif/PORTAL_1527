import React from "react";
import ResultsSkeleton from "./ResultsSkeleton";

interface DashboardSectionSkeletonProps {
  title?: string;
  variant?: "cards" | "table" | "list";
  count?: number;
}

export default function DashboardSectionSkeleton({
  title,
  variant = "cards",
  count = 6,
}: DashboardSectionSkeletonProps) {
  return (
    <div
      style={{
        padding: "1rem 0",
        width: "100%",
        maxWidth: "100%",
        boxSizing: "border-box",
        animation: "dashboardFadeIn 0.15s ease-out",
      }}
      aria-busy="true"
      aria-live="polite"
    >
      {/* Top Header Placeholder */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "1rem",
          marginBottom: "1.5rem",
        }}
      >
        <div>
          <div
            style={{
              height: "28px",
              width: title ? "220px" : "180px",
              borderRadius: "8px",
              background: "linear-gradient(90deg, var(--card-bg, #1e293b) 25%, rgba(99, 102, 241, 0.15) 50%, var(--card-bg, #1e293b) 75%)",
              backgroundSize: "200% 100%",
              animation: "skeletonShimmer 1.4s infinite ease-in-out",
            }}
          />
          <div
            style={{
              height: "14px",
              width: "120px",
              borderRadius: "4px",
              marginTop: "0.5rem",
              background: "var(--border, rgba(255, 255, 255, 0.08))",
              opacity: 0.6,
            }}
          />
        </div>

        {/* Action Button / Filter Placeholder */}
        <div
          style={{
            height: "38px",
            width: "140px",
            borderRadius: "10px",
            background: "var(--border, rgba(255, 255, 255, 0.08))",
            opacity: 0.5,
          }}
        />
      </div>

      {/* Quick Summary Pill Bar */}
      <div
        style={{
          display: "flex",
          gap: "0.75rem",
          marginBottom: "1.5rem",
          overflowX: "hidden",
        }}
      >
        {[80, 100, 90].map((w, idx) => (
          <div
            key={idx}
            style={{
              height: "32px",
              width: `${w}px`,
              borderRadius: "20px",
              background: "var(--border, rgba(255, 255, 255, 0.06))",
              opacity: 0.7,
            }}
          />
        ))}
      </div>

      {/* Main Body Skeleton */}
      <ResultsSkeleton type={variant === "cards" ? "card" : variant} count={count} />

      <style>{`
        @keyframes skeletonShimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        @keyframes dashboardFadeIn {
          from { opacity: 0.6; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

