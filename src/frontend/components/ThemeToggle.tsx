"use client";

import { Sun, Moon, Monitor } from "lucide-react";
import { useTheme } from "./ThemeProvider";

interface ThemeToggleProps {
  /** Size of the icon in pixels (default 18) */
  size?: number;
  /** Additional inline styles for the button wrapper */
  style?: React.CSSProperties;
  /** Extra CSS class names */
  className?: string;
}

export default function ThemeToggle({
  size = 18,
  style,
  className,
}: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={`Switch theme (current: ${theme})`}
      title={`Switch theme (current: ${theme})`}
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 38,
        height: 38,
        borderRadius: "50%",
        border: "1px solid var(--border-color, var(--border))",
        background: "var(--card-bg, var(--card))",
        color: "var(--foreground)",
        cursor: "pointer",
        transition:
          "background-color 0.2s ease, border-color 0.2s ease, transform 0.15s ease",
        flexShrink: 0,
        ...style,
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.transform = "scale(1.1)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)";
      }}
    >
      {theme === "light" ? (
        <Sun size={size} strokeWidth={2} color="#fbbf24" aria-hidden="true" />
      ) : theme === "dark" ? (
        <Moon size={size} strokeWidth={2} aria-hidden="true" />
      ) : (
        <Monitor size={size} strokeWidth={2} aria-hidden="true" />
      )}
    </button>
  );
}
