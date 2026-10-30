import React from "react";

interface SpinnerProps {
  size?: "sm" | "md" | "lg";
  className?: string;
  color?: string;
}

export default function Spinner({
  size = "md",
  className = "",
  color = "currentColor",
}: SpinnerProps) {
  const pixelSize = size === "sm" ? 16 : size === "lg" ? 36 : 24;

  return (
    <svg
      className={className}
      width={pixelSize}
      height={pixelSize}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{
        animation: "spinSlow 0.85s linear infinite",
        flexShrink: 0,
        display: "inline-block",
      }}
      aria-label="Loading..."
      role="status"
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke={color}
        strokeWidth="3"
        strokeOpacity="0.2"
      />
      <path
        d="M12 2a10 10 0 0 1 10 10"
        stroke={color}
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

