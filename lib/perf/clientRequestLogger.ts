/**
 * Dev-only client fetch duplicate monitor.
 * Detects duplicate in-flight or back-to-back requests within 2 seconds.
 */

if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
  const requestHistory = new Map<string, number>();

  const originalFetch = window.fetch;
  window.fetch = async (...args) => {
    const url = typeof args[0] === "string" ? args[0] : args[0] instanceof Request ? args[0].url : "";
    
    // Only track internal API endpoints
    if (url.includes("/api/")) {
      const cleanUrl = url.split("?")[0];
      const now = performance.now();
      const lastTime = requestHistory.get(cleanUrl);

      if (lastTime && now - lastTime < 2000) {
        console.warn(
          `[PERF WARN] Duplicate request detected to: "${cleanUrl}" (${Math.round(now - lastTime)}ms since previous call)`
        );
      }
      requestHistory.set(cleanUrl, now);
    }

    return originalFetch(...args);
  };
}

export {};

