import React from "react";

export default function RootLoading() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100dvh",
        padding: "1.5rem",
        boxSizing: "border-box",
        backgroundColor: "var(--background, #0f172a)",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "460px",
          display: "flex",
          flexDirection: "column",
          gap: "1.25rem",
          alignItems: "center",
        }}
      >
        {/* Crest Skeleton */}
        <div
          style={{
            width: "64px",
            height: "64px",
            borderRadius: "50%",
            background: "linear-gradient(90deg, rgba(59, 130, 246, 0.1) 25%, rgba(59, 130, 246, 0.25) 50%, rgba(59, 130, 246, 0.1) 75%)",
            backgroundSize: "200% 100%",
            animation: "skeletonShimmer 1.2s infinite ease-in-out",
          }}
        />

        {/* Title Bar Skeleton */}
        <div
          style={{
            width: "220px",
            height: "24px",
            borderRadius: "8px",
            background: "linear-gradient(90deg, rgba(255, 255, 255, 0.05) 25%, rgba(255, 255, 255, 0.12) 50%, rgba(255, 255, 255, 0.05) 75%)",
            backgroundSize: "200% 100%",
            animation: "skeletonShimmer 1.2s infinite ease-in-out",
          }}
        />

        {/* Card Shell Skeleton */}
        <div
          style={{
            width: "100%",
            height: "260px",
            borderRadius: "18px",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            background: "linear-gradient(90deg, rgba(30, 41, 59, 0.4) 25%, rgba(30, 41, 59, 0.7) 50%, rgba(30, 41, 59, 0.4) 75%)",
            backgroundSize: "200% 100%",
            animation: "skeletonShimmer 1.2s infinite ease-in-out",
          }}
        />
      </div>

      <style>{`
        @keyframes skeletonShimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  );
}
