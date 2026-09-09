"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

export type Theme = "light" | "dark" | "system";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/** Apply theme to <html> element and update localStorage cache */
function applyTheme(theme: Theme) {
  let resolvedTheme = theme;
  if (theme === "system") {
    resolvedTheme = window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  document.documentElement.setAttribute("data-theme", resolvedTheme);
  try {
    localStorage.setItem("theme-cache", theme);
  } catch {
    // Private-browsing or quota exceeded — ignore
  }
}

interface ThemeProviderProps {
  children: React.ReactNode;
  /** Initial theme resolved server-side (from DB or cookie). Defaults to "system". */
  initialTheme?: string;
  /** Whether the user is authenticated. Unauthenticated users use localStorage only. */
  isAuthenticated?: boolean;
}

export function ThemeProvider({
  children,
  initialTheme = "system",
  isAuthenticated = false,
}: ThemeProviderProps) {
  const resolvedInitial: Theme =
    initialTheme === "dark" ? "dark" : initialTheme === "light" ? "light" : "system";

  const [theme, setThemeState] = useState<Theme>(resolvedInitial);

  // On mount and when system preference changes
  useEffect(() => {
    applyTheme(theme);

    if (theme === "system") {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      const handleChange = () => applyTheme("system");
      
      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    }
  }, [theme]);

  const setTheme = useCallback(
    (newTheme: Theme) => {
      setThemeState(newTheme);
      applyTheme(newTheme);

      if (isAuthenticated) {
        // Persist to backend — fire & forget, errors are non-critical
        fetch("/api/user/preferences", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ theme: newTheme }),
        }).catch((err) =>
          console.error("Failed to persist theme preference:", err)
        );
      }
    },
    [isAuthenticated]
  );

  const toggleTheme = useCallback(() => {
    setTheme(theme === "light" ? "dark" : theme === "dark" ? "system" : "light");
  }, [theme, setTheme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

/** Must be used inside <ThemeProvider>. */
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used inside <ThemeProvider>");
  }
  return ctx;
}
