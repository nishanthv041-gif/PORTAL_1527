"use client";

import styles from "./Topbar.module.css";
import { usePathname } from "next/navigation";
import ThemeToggle from "./ThemeToggle";
import { Bell } from "lucide-react";
import { useEffect, useState, useCallback } from "react";

// Matches the key used in NotificationPopupModal
const CLEARED_KEY = "srt_portal_notif_cleared_v1";

export default function Topbar({
  user,
}: {
  user: { name?: string | null; role?: string | null };
}) {
  const pathname = usePathname();
  const [showRedDot, setShowRedDot] = useState(false);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [hasBusAlert, setHasBusAlert] = useState<boolean>(false);
  const [retryDelay, setRetryDelay] = useState<number>(20000);

  // Smart Function to poll unread count & bus alerts
  const checkNotifications = useCallback(async () => {
    // Pause polling when browser tab is hidden to save mobile battery and network
    if (typeof document !== "undefined" && document.hidden) return;

    try {
      const res = await fetch("/api/notifications/unread-count", {
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setUnreadCount(data.unreadCount || 0);
          setHasBusAlert(!!data.hasBusAlert);
          const isClearedForever = localStorage.getItem(CLEARED_KEY) === "true";
          setShowRedDot(!isClearedForever && (data.unreadCount > 0 || data.hasBusAlert));
          setRetryDelay(20000); // Reset backoff on success
        }
      } else {
        // Backoff on server errors
        setRetryDelay((prev) => Math.min(prev * 1.5, 60000));
      }
    } catch {
      // Quietly backoff on network failures
      setRetryDelay((prev) => Math.min(prev * 1.5, 60000));
    }
  }, []);

  // Smart polling lifecycle: window focus, tab visibility, and interval
  useEffect(() => {
    checkNotifications();

    const interval = setInterval(() => {
      checkNotifications();
    }, retryDelay);

    // Immediate refetch when user switches back to the tab
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        checkNotifications();
      }
    };

    const handleWindowFocus = () => {
      checkNotifications();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleWindowFocus);

    // Listen for notification-cleared event
    const handleCleared = () => {
      setShowRedDot(false);
      setUnreadCount(0);
      setHasBusAlert(false);
    };

    window.addEventListener("notifications-cleared", handleCleared);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleWindowFocus);
      window.removeEventListener("notifications-cleared", handleCleared);
    };
  }, [checkNotifications, retryDelay]);

  return (
    <header className={styles.topbar}>
      <div className={styles.leftSection}></div>
      <div className={styles.userInfo}>
        <button
          type="button"
          onClick={() => {
            window.dispatchEvent(new CustomEvent("open-notification-popup"));
          }}
          title={hasBusAlert ? "Urgent Bus Transit Alert! View Notifications" : "View Notifications"}
          aria-label="View Notifications"
          style={{
            background: hasBusAlert ? "rgba(239, 68, 68, 0.15)" : "var(--card-bg, #ffffff)",
            border: hasBusAlert ? "1.5px solid #ef4444" : "1px solid var(--border-color)",
            borderRadius: "50%",
            width: "38px",
            height: "38px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            color: hasBusAlert ? "#ef4444" : "#f59e0b",
            position: "relative",
            marginRight: "0.35rem",
            transition: "all 0.2s ease",
            boxShadow: hasBusAlert ? "0 0 10px rgba(239, 68, 68, 0.4)" : "0 2px 6px rgba(0,0,0,0.04)",
            flexShrink: 0,
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.transform = "scale(1.06)";
            e.currentTarget.style.borderColor = hasBusAlert ? "#ef4444" : "var(--primary)";
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.transform = "scale(1)";
            e.currentTarget.style.borderColor = hasBusAlert ? "#ef4444" : "var(--border-color)";
          }}
        >
          <Bell size={18} />
          {showRedDot && (
            <span
              style={{
                position: "absolute",
                top: "-2px",
                right: "-2px",
                minWidth: unreadCount > 0 ? "16px" : "8px",
                height: unreadCount > 0 ? "16px" : "8px",
                padding: unreadCount > 0 ? "0 4px" : "0",
                borderRadius: "10px",
                backgroundColor: hasBusAlert ? "#ef4444" : "#f59e0b",
                color: "#ffffff",
                fontSize: "0.68rem",
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                border: "1.5px solid var(--card-bg, #ffffff)",
                boxShadow: hasBusAlert ? "0 0 6px #ef4444" : "none",
              }}
            >
              {unreadCount > 0 ? (unreadCount > 9 ? "9+" : unreadCount) : ""}
            </span>
          )}
        </button>

        <ThemeToggle style={{ marginRight: "0.25rem" }} />
        <div className={styles.userDetails}>
          <span className={styles.userName}>{user?.name}</span>
          <span className={styles.userRole}>{user?.role}</span>
        </div>
        <div className={styles.avatar}>{user?.name?.charAt(0) || "U"}</div>
      </div>
    </header>
  );
}
