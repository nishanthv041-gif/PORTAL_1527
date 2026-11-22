"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";

export default function GlobalAppMount() {
  useEffect(() => {
    // 1. Immediately dismiss native splash screen on app mount (<50ms)
    if (typeof window !== "undefined" && Capacitor.isNativePlatform()) {
      const winCap = (window as unknown as {
        Capacitor?: {
          Plugins?: {
            SplashScreen?: {
              hide: (opts?: { fadeOutDuration?: number }) => Promise<void>;
            };
            StatusBar?: {
              setBackgroundColor: (opts: { color: string }) => Promise<void>;
              setStyle: (opts: { style: string }) => Promise<void>;
            };
          };
        };
      })?.Capacitor;

      if (winCap?.Plugins?.SplashScreen?.hide) {
        winCap.Plugins.SplashScreen.hide({ fadeOutDuration: 0 }).catch(() => {});
      } else {
        import("@capacitor/splash-screen")
          .then(({ SplashScreen }) => {
            SplashScreen.hide({ fadeOutDuration: 0 }).catch(() => {});
          })
          .catch(() => {});
      }
    }

    // 2. Synchronize Status Bar and theme-color meta tag with active theme (Light/Dark/System)
    const syncThemeColors = () => {
      if (typeof window === "undefined") return;

      const currentTheme = document.documentElement.getAttribute("data-theme");
      let isDark = false;
      if (currentTheme === "dark") {
        isDark = true;
      } else if (currentTheme === "light") {
        isDark = false;
      } else {
        isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      }

      const color = isDark ? "#0f172a" : "#ffffff";

      // Update HTML theme-color meta tags for mobile browser tab / address bar
      const metaThemeColor = document.querySelector('meta[name="theme-color"]');
      if (metaThemeColor) {
        metaThemeColor.setAttribute("content", color);
      }
      const metaMsNav = document.querySelector('meta[name="msapplication-navbutton-color"]');
      if (metaMsNav) {
        metaMsNav.setAttribute("content", color);
      }

      // Update Capacitor Android/iOS native status bar if in container
      if (Capacitor.isNativePlatform()) {
        import("@capacitor/status-bar")
          .then(({ StatusBar, Style }) => {
            StatusBar.setBackgroundColor({ color }).catch(() => {});
            StatusBar.setStyle({ style: isDark ? Style.Dark : Style.Light }).catch(() => {});
          })
          .catch(() => {});
      }
    };

    syncThemeColors();

    // Listen for theme attribute mutations on <html>
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === "attributes" && m.attributeName === "data-theme") {
          syncThemeColors();
        }
      }
    });

    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    // Listen for system color-scheme changes
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleMediaChange = () => syncThemeColors();
    mediaQuery.addEventListener("change", handleMediaChange);

    return () => {
      observer.disconnect();
      mediaQuery.removeEventListener("change", handleMediaChange);
    };
  }, []);

  return null;
}
