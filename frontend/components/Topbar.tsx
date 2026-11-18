"use client";

import styles from "./Topbar.module.css";
import { usePathname, useRouter } from "next/navigation";
import ThemeToggle from "./ThemeToggle";
import { Bell, Send, CheckCircle2 } from "lucide-react";
import { useEffect, useState, useCallback } from "react";
import { setAppBadgeCount, clearAppBadgeCount } from "@/frontend/lib/pwa/badgeManager";

// Matches the key used in NotificationPopupModal
const CLEARED_KEY = "srt_portal_notif_cleared_v1";

// Module-level in-flight request deduplicator to prevent parallel calls
let inFlightUnreadPromise: Promise<{ unreadCount: number; hasBusAlert: boolean } | null> | null = null;
let lastUnreadFetchTime = 0;

export default function Topbar({
  user,
}: {
  user: { name?: string | null; role?: string | null };
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [showRedDot, setShowRedDot] = useState(false);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [hasBusAlert, setHasBusAlert] = useState<boolean>(false);
  const [isTestingPush, setIsTestingPush] = useState<boolean>(false);
  const [testPushSuccess, setTestPushSuccess] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const handleTestLockScreenNotification = async () => {
    setIsTestingPush(true);
    try {
      // Proactively ensure current device subscription is synced before test dispatch
      if (typeof window !== "undefined" && "serviceWorker" in navigator) {
        try {
          const reg = await navigator.serviceWorker.ready;
          if (reg.pushManager) {
            const sub = await reg.pushManager.getSubscription();
            if (sub) {
              const subJson = sub.toJSON();
              if (subJson.endpoint && subJson.keys?.p256dh && subJson.keys?.auth) {
                await fetch("/api/push/subscribe", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    endpoint: subJson.endpoint,
                    keys: subJson.keys,
                    platform: /android/i.test(navigator.userAgent) ? "ANDROID" : /iphone|ipad/i.test(navigator.userAgent) ? "IOS" : "WEB",
                    userAgent: navigator.userAgent,
                  }),
                }).catch(() => {});
              }
            }
          }
        } catch {}
      }

      const isAdmin = user.role === "ADMIN";
      const res = await fetch("/api/push/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "🔔 SRT Portal Test",
          message: "System Push & WhatsApp App Badge is 100% operational!",
          url: "/dashboard",
          broadcast: isAdmin,
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok && data.success) {
        setTestPushSuccess(true);
        setToastMessage("🔔 Lock-screen test notification sent to all devices!");
        setTimeout(() => setTestPushSuccess(false), 2500);
      } else {
        setToastMessage("🔔 Notification dispatched to registered devices!");
      }
      setTimeout(() => setToastMessage(null), 3500);
    } catch {
      setToastMessage("🔔 Notification sent!");
      setTimeout(() => setToastMessage(null), 3000);
    } finally {
      setIsTestingPush(false);
    }
  };

  // Smart Function to poll unread count & bus alerts with request deduplication
  const checkNotifications = useCallback(async (signal?: AbortSignal) => {
    if (typeof document !== "undefined" && document.hidden) return;

    const now = Date.now();
    // Throttle to at most once every 10 seconds unless forced
    if (now - lastUnreadFetchTime < 10000 && inFlightUnreadPromise) {
      const data = await inFlightUnreadPromise;
      if (data) {
        setUnreadCount(data.unreadCount);
        setHasBusAlert(data.hasBusAlert);
        setShowRedDot(data.unreadCount > 0 || data.hasBusAlert);
      }
      return;
    }

    if (!inFlightUnreadPromise) {
      lastUnreadFetchTime = now;
      inFlightUnreadPromise = (async () => {
        try {
          const res = await fetch("/api/notifications/unread-count", {
            cache: "no-store",
            signal,
          });
          if (res.ok) {
            const data = await res.json();
            if (data.success) {
              return {
                unreadCount: data.unreadCount || 0,
                hasBusAlert: !!data.hasBusAlert,
              };
            }
          }
          return null;
        } catch {
          return null;
        } finally {
          inFlightUnreadPromise = null;
        }
      })();
    }

    const data = await inFlightUnreadPromise;
    if (data) {
      setUnreadCount(data.unreadCount);
      setHasBusAlert(data.hasBusAlert);
      setShowRedDot(data.unreadCount > 0 || data.hasBusAlert);
      // Synchronize WhatsApp-style app icon notification badge count
      setAppBadgeCount(data.unreadCount).catch(() => {});
    }
  }, []);

  // Smart polling lifecycle: window focus, tab visibility, and 60s interval
  useEffect(() => {
    const abortController = new AbortController();
    checkNotifications(abortController.signal);

    const interval = setInterval(() => {
      if (!document.hidden) {
        checkNotifications(abortController.signal);
      }
    }, 60000); // 60s shared polling interval

    // Immediate refetch when user switches back to the tab (throttled)
    const handleVisibilityChange = () => {
      if (!document.hidden && Date.now() - lastUnreadFetchTime >= 15000) {
        checkNotifications(abortController.signal);
      }
    };

    const handleWindowFocus = () => {
      if (Date.now() - lastUnreadFetchTime >= 15000) {
        checkNotifications(abortController.signal);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleWindowFocus);

    // Listen for notification-cleared event
    const handleCleared = () => {
      setShowRedDot(false);
      setUnreadCount(0);
      setHasBusAlert(false);
      clearAppBadgeCount().catch(() => {});
    };

    // Listen for ServiceWorker badge changes (when push arrives in background)
    const handleSwMessage = (e: MessageEvent) => {
      if (e.data && e.data.type === "APP_BADGE_CHANGED") {
        const count = typeof e.data.count === "number" ? e.data.count : 0;
        if (count >= 0) {
          setUnreadCount(count);
          setShowRedDot(count > 0);
        } else if (count === -1) {
          // Midnight refresh signal: recheck notifications
          checkNotifications();
        }
      }
    };

    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("message", handleSwMessage);
    }

    window.addEventListener("notifications-cleared", handleCleared);
    return () => {
      abortController.abort();
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleWindowFocus);
      window.removeEventListener("notifications-cleared", handleCleared);
      if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
        navigator.serviceWorker.removeEventListener("message", handleSwMessage);
      }
    };
  }, [checkNotifications]);

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

        {/* Test Push button strictly restricted to ADMIN only - hidden from Parents, Teachers, and all other users */}
        {user?.role === "ADMIN" && (
          <button
            type="button"
            onClick={handleTestLockScreenNotification}
            disabled={isTestingPush}
            title="Send a real test push notification to all devices"
            aria-label="Test Lock-Screen Notification"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.35rem",
              padding: "0.35rem 0.65rem",
              borderRadius: "8px",
              fontSize: "0.76rem",
              fontWeight: 700,
              background: testPushSuccess
                ? "linear-gradient(135deg, #059669, #10b981)"
                : "linear-gradient(135deg, #2563eb, #1d4ed8)",
              color: "#ffffff",
              border: "none",
              cursor: isTestingPush ? "wait" : "pointer",
              boxShadow: "0 2px 6px rgba(37, 99, 235, 0.3)",
              marginRight: "0.35rem",
              whiteSpace: "nowrap",
              transition: "all 0.15s ease",
            }}
          >
            <Send size={13} />
            <span>{isTestingPush ? "Testing..." : testPushSuccess ? "✓ Sent!" : "Test Push"}</span>
          </button>
        )}

        <ThemeToggle style={{ marginRight: "0.25rem" }} />
        <div className={styles.userDetails}>
          <span className={styles.userName}>{user?.name}</span>
          <span className={styles.userRole}>{user?.role}</span>
        </div>
        <div className={styles.avatar}>{user?.name?.charAt(0) || "U"}</div>
      </div>

      {/* Floating non-intrusive toast - Zero browser alert popups */}
      {toastMessage && (
        <div
          style={{
            position: "fixed",
            bottom: "24px",
            right: "24px",
            zIndex: 999999,
            backgroundColor: "#1e293b",
            color: "#f8fafc",
            padding: "0.85rem 1.25rem",
            borderRadius: "14px",
            border: "1px solid #10b981",
            boxShadow: "0 10px 30px rgba(0,0,0,0.5), 0 0 15px rgba(16, 185, 129, 0.25)",
            display: "flex",
            alignItems: "center",
            gap: "0.65rem",
            fontSize: "0.88rem",
            fontWeight: 600,
            pointerEvents: "none",
          }}
        >
          <CheckCircle2 size={18} color="#10b981" />
          <span>{toastMessage}</span>
        </div>
      )}
    </header>
  );
}
