import React from "react";

interface ResultsSkeletonProps {
  type?: "card" | "table" | "list";
  count?: number;
  className?: string;
}

export default function ResultsSkeleton({
  type = "card",
  count = 6,
  className = "",
}: ResultsSkeletonProps) {
  const items = Array.from({ length: count }, (_, i) => i);

  if (type === "table") {
    return (
      <div
        className={`table-responsive-container ${className}`}
        style={{ width: "100%", opacity: 0.7 }}
        aria-busy="true"
        aria-live="polite"
      >
        <div
          style={{
            background: "var(--card-bg, #ffffff)",
            border: "1px solid var(--border)",
            borderRadius: "12px",
            overflow: "hidden",
            width: "100%",
          }}
        >
          {items.map((idx) => (
            <div
              key={idx}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "1rem",
                padding: "1rem 1.25rem",
                borderBottom: "1px solid var(--border)",
              }}
            >
              <div
                style={{
                  width: "36px",
                  height: "36px",
                  borderRadius: "50%",
                  background: "var(--border)",
                  animation: "pulse 1.5s ease-in-out infinite",
                  flexShrink: 0,
                }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    height: "14px",
                    width: `${40 + (idx % 3) * 20}%`,
                    background: "var(--border)",
                    borderRadius: "4px",
                    marginBottom: "0.5rem",
                    animation: "pulse 1.5s ease-in-out infinite",
                  }}
                />
                <div
                  style={{
                    height: "10px",
                    width: `${30 + (idx % 2) * 25}%`,
                    background: "var(--border)",
                    borderRadius: "4px",
                    opacity: 0.6,
                    animation: "pulse 1.5s ease-in-out infinite",
                  }}
                />
              </div>
              <div
                style={{
                  width: "80px",
                  height: "24px",
                  borderRadius: "12px",
                  background: "var(--border)",
                  opacity: 0.5,
                  flexShrink: 0,
                }}
              />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (type === "list") {
    return (
      <div
        className={className}
        style={{ display: "flex", flexDirection: "column", gap: "0.75rem", width: "100%", opacity: 0.7 }}
        aria-busy="true"
        aria-live="polite"
      >
        {items.map((idx) => (
          <div
            key={idx}
            style={{
              background: "var(--card-bg, #ffffff)",
              border: "1px solid var(--border)",
              borderRadius: "10px",
              padding: "1rem",
              display: "flex",
              alignItems: "center",
              gap: "1rem",
            }}
          >
            <div
              style={{
                width: "40px",
                height: "40px",
                borderRadius: "8px",
                background: "var(--border)",
                animation: "pulse 1.5s ease-in-out infinite",
                flexShrink: 0,
              }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  height: "14px",
                  width: `${50 + (idx % 3) * 15}%`,
                  background: "var(--border)",
                  borderRadius: "4px",
                  marginBottom: "0.4rem",
                  animation: "pulse 1.5s ease-in-out infinite",
                }}
              />
              <div
                style={{
                  height: "10px",
                  width: "35%",
                  background: "var(--border)",
                  borderRadius: "4px",
                  opacity: 0.6,
                  animation: "pulse 1.5s ease-in-out infinite",
                }}
              />
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Default: Grid of Cards
  return (
    <div
      className={`cards-grid-autofit ${className}`}
      style={{ opacity: 0.7 }}
      aria-busy="true"
      aria-live="polite"
    >
      {items.map((idx) => (
        <div
          key={idx}
          style={{
            background: "var(--card-bg, #ffffff)",
            border: "1px solid var(--border)",
            borderRadius: "14px",
            padding: "1.25rem",
            display: "flex",
            flexDirection: "column",
            gap: "0.75rem",
            minHeight: "140px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <div
              style={{
                width: "44px",
                height: "44px",
                borderRadius: "12px",
                background: "var(--border)",
                animation: "pulse 1.5s ease-in-out infinite",
                flexShrink: 0,
              }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  height: "16px",
                  width: `${60 + (idx % 2) * 20}%`,
                  background: "var(--border)",
                  borderRadius: "4px",
                  marginBottom: "0.4rem",
                  animation: "pulse 1.5s ease-in-out infinite",
                }}
              />
              <div
                style={{
                  height: "12px",
                  width: "40%",
                  background: "var(--border)",
                  borderRadius: "4px",
                  opacity: 0.6,
                  animation: "pulse 1.5s ease-in-out infinite",
                }}
              />
            </div>
          </div>
          <div
            style={{
              height: "12px",
              width: "85%",
              background: "var(--border)",
              borderRadius: "4px",
              opacity: 0.5,
              marginTop: "auto",
              animation: "pulse 1.5s ease-in-out infinite",
            }}
          />
        </div>
      ))}
    </div>
  );
}

