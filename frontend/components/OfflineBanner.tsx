"use client";

import { useEffect, useState } from "react";
import { WifiOff, Wifi } from "lucide-react";

export default function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(false);
  const [justReconnected, setJustReconnected] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleOffline = () => {
      setIsOffline(true);
      setJustReconnected(false);
    };

    const handleOnline = () => {
      setIsOffline(false);
      setJustReconnected(true);
      const timer = setTimeout(() => {
        setJustReconnected(false);
      }, 3000);
      return () => clearTimeout(timer);
    };

    if (!navigator.onLine) {
      setIsOffline(true);
    }

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);

    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, []);

  if (!isOffline && !justReconnected) {
    return null;
  }

  return (
    <aside
      aria-label="Network status banner"
      role="status"
      style={{
        position: "fixed",
        top: "max(12px, env(safe-area-inset-top, 12px))",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 99999,
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "8px 16px",
        borderRadius: "9999px",
        fontSize: "13px",
        fontWeight: 600,
        boxShadow: "0 4px 16px rgba(0, 0, 0, 0.2)",
        transition: "all 0.3s ease",
        backgroundColor: isOffline ? "#ef4444" : "#10b981",
        color: "#ffffff",
      }}
    >
      {isOffline ? (
        <>
          <WifiOff size={16} />
          <span>You are offline. Showing cached portal data.</span>
        </>
      ) : (
        <>
          <Wifi size={16} />
          <span>Back online. Reconnected.</span>
        </>
      )}
    </aside>
  );
}
