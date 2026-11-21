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
        gap: "1.25rem",
      }}
    >
      <div
        style={{
          width: "50px",
          height: "50px",
          borderRadius: "50%",
          border: "4px solid rgba(242, 184, 75, 0.2)",
          borderTopColor: "#f2b84b",
          animation: "rootSpin 0.8s linear infinite",
        }}
      />
      <div style={{ textAlign: "center" }}>
        <h3 style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--text-primary)", marginBottom: "0.25rem" }}>
          SRT Universal School
        </h3>
        <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
          Connecting to portal...
        </p>
      </div>
      <style>{`
        @keyframes rootSpin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
