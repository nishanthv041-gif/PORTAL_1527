"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { 
  Bell, ChevronLeft, ChevronRight, ExternalLink, 
  Megaphone, MessageSquare, Award, BookOpen, Calendar, Info,
  FileText, Clock, Users, AlertCircle, BellOff, CheckCheck, Trash2
} from "lucide-react";
import styles from "./NotificationPopupModal.module.css";
import { UnifiedNotification, getUnifiedNotificationsAction, markNotificationReadAction, clearAllNotificationsAction } from "@/backend/api/actions/notifications/unifiedNotificationActions";

// Key used in localStorage — unique per portal so it doesn't clash with other apps
const CLEARED_KEY = "srt_portal_notif_cleared_v1";
const CLEARED_TIMESTAMP_KEY = "srt_portal_notif_cleared_time";
const DISMISSED_KEY = "srt_portal_popup_notif_dismissed";
const FRESH_LOGIN_KEY = "srt_portal_fresh_login";

export default function NotificationPopupModal({
  initialNotifications = [],
  notificationsEnabled = true,
}: {
  initialNotifications?: UnifiedNotification[];
  notificationsEnabled?: boolean;
}) {
  const router = useRouter();
  const [notifications, setNotifications] = useState<UnifiedNotification[]>(initialNotifications);
  const [isOpen, setIsOpen] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isClearing, setIsClearing] = useState(false);

  // Helper to filter out already-read or already-cleared notifications
  const filterActiveUnread = (items: UnifiedNotification[]) => {
    if (!items || items.length === 0) return [];
    const clearedTimeStr = typeof window !== "undefined" ? localStorage.getItem(CLEARED_TIMESTAMP_KEY) : null;
    const clearedTime = clearedTimeStr ? new Date(clearedTimeStr).getTime() : 0;
    return items.filter(n => !n.isRead && new Date(n.timestamp).getTime() > clearedTime);
  };

  // Sync if prop updates
  useEffect(() => {
    if (initialNotifications && initialNotifications.length > 0) {
      const activeUnread = filterActiveUnread(initialNotifications);
      setNotifications(activeUnread);
    }
  }, [initialNotifications]);

  // Automatic popup on portal login / entry & client-side hydration
  useEffect(() => {
    let isMounted = true;

    // If notifications are disabled by the user's preference, never auto-show
    if (!notificationsEnabled) return;

    // Only load fresh notifications from server if initialNotifications is not already provided
    if (!initialNotifications || initialNotifications.length === 0) {
      getUnifiedNotificationsAction({ unreadOnly: true })
        .then((fresh) => {
          if (!isMounted) return;
          const activeFresh = filterActiveUnread(fresh);
          if (activeFresh.length > 0) {
            setNotifications(activeFresh);

            const isFreshLogin = sessionStorage.getItem(FRESH_LOGIN_KEY) === "true";
            const isDismissed = sessionStorage.getItem(DISMISSED_KEY) === "true";

            // If user just logged in or hasn't dismissed yet, pop up automatically!
            if (isFreshLogin) {
              sessionStorage.removeItem(FRESH_LOGIN_KEY);
              sessionStorage.removeItem(DISMISSED_KEY);
              setTimeout(() => {
                if (isMounted) setIsOpen(true);
              }, 350);
            } else if (!isDismissed) {
              setTimeout(() => {
                if (isMounted) setIsOpen(true);
              }, 500);
            }
          }
        })
        .catch(() => {});
    }

    // Also check immediately if initialNotifications already present
    const isFreshLogin = sessionStorage.getItem(FRESH_LOGIN_KEY) === "true";
    const isDismissed = sessionStorage.getItem(DISMISSED_KEY) === "true";
    const activeInitial = filterActiveUnread(initialNotifications);

    if (activeInitial.length > 0) {
      if (isFreshLogin) {
        sessionStorage.removeItem(FRESH_LOGIN_KEY);
        sessionStorage.removeItem(DISMISSED_KEY);
        const timer = setTimeout(() => {
          if (isMounted) setIsOpen(true);
        }, 350);
        return () => clearTimeout(timer);
      } else if (!isDismissed) {
        const timer = setTimeout(() => {
          if (isMounted) setIsOpen(true);
        }, 500);
        return () => clearTimeout(timer);
      }
    }

    return () => {
      isMounted = false;
    };
  }, [initialNotifications, notificationsEnabled]);

  // Listen for manual open trigger from Topbar Bell button
  useEffect(() => {
    const handleManualOpen = () => {
      getUnifiedNotificationsAction()
        .then((fresh) => {
          if (fresh && fresh.length > 0) {
            setNotifications(fresh);
            setIsOpen(true);
          } else {
            alert("No notifications available right now.");
          }
        })
        .catch(() => {});
      sessionStorage.removeItem(DISMISSED_KEY);
    };

    window.addEventListener("open-notification-popup", handleManualOpen);
    return () => window.removeEventListener("open-notification-popup", handleManualOpen);
  }, []);

  if (!isOpen || !notifications || notifications.length === 0) {
    return null;
  }

  const current = notifications[currentIndex] || notifications[0];

  const handleClose = () => {
    setIsOpen(false);
    // Mark as dismissed for the current session so it doesn't pop up on every route change
    sessionStorage.setItem(DISMISSED_KEY, "true");
  };

  const handleOpen = async () => {
    if (!current) return;
    
    // Mark notification as read on the server
    if (current.id) {
      markNotificationReadAction(current.id).catch(() => {});
    }

    // Dismiss modal and navigate directly to target action
    setIsOpen(false);
    sessionStorage.setItem(DISMISSED_KEY, "true");

    if (current.link) {
      router.push(current.link);
    }
  };

  const handleNext = () => {
    if (currentIndex < notifications.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  /**
   * Clears ALL notifications permanently:
   * - Marks all as read on the server
   * - Sets localStorage flag so the popup never auto-shows again
   * - Closes the modal
   * User can still manually click the bell to open it.
   */
  const handleClearAll = async () => {
    setIsClearing(true);
    try {
      await clearAllNotificationsAction();
    } catch {
      // Silent fail — still clear locally
    } finally {
      setIsClearing(false);
    }

    // Permanently suppress auto-popup for this user on this device for currently cleared notifications
    localStorage.setItem(CLEARED_KEY, "true");
    localStorage.setItem(CLEARED_TIMESTAMP_KEY, new Date().toISOString());
    sessionStorage.setItem(DISMISSED_KEY, "true");

    // Clear local state and close
    setNotifications([]);
    setIsOpen(false);

    // Dispatch event to hide the red dot on the bell
    window.dispatchEvent(new CustomEvent("notifications-cleared"));

    // Refresh the page so notification counts update
    router.refresh();
  };

  // Icon for category
  const getCategoryIcon = (category: string) => {
    switch (category) {
      case "MEETING":
        return <Calendar size={13} />;
      case "INSTRUCTION":
        return <FileText size={13} />;
      case "ANNOUNCEMENT":
        return <Megaphone size={13} />;
      case "MESSAGE":
        return <MessageSquare size={13} />;
      case "REPORT_CARD":
        return <Award size={13} />;
      case "ASSIGNMENT":
        return <BookOpen size={13} />;
      case "ATTENDANCE":
        return <Clock size={13} />;
      default:
        return <Info size={13} />;
    }
  };

  return (
    <div className={styles.overlay} onClick={(e) => {
      if (e.target === e.currentTarget) handleClose();
    }}>
      <div className={styles.modalCard} role="dialog" aria-modal="true" aria-labelledby="notif-title">
        {/* Floating circular bell icon badge overlapping the card top */}
        <div className={styles.bellBadgeCircle}>
          <Bell size={34} className={styles.bellIcon} />
          {notifications.length > 0 && (
            <span className={styles.counterBadge}>
              {notifications.length > 9 ? "9+" : notifications.length}
            </span>
          )}
        </div>

        {/* Category Pill with designated coloration */}
        <div>
          <span 
            className={styles.categoryPill}
            style={{
              backgroundColor: current.badgeColors.bg,
              color: current.badgeColors.text,
              border: `1px solid ${current.badgeColors.border}`
            }}
          >
            {getCategoryIcon(current.category)}
            <span>{current.badgeLabel}</span>
          </span>
        </div>

        {/* Main Title */}
        <h2 id="notif-title" className={styles.mainTitle}>
          Notification
        </h2>

        {/* Specific Notification Title */}
        <h3 className={styles.subTitle}>
          {current.title}
        </h3>

        {/* Detailed Description */}
        <div className={styles.descriptionBox}>
          {current.description}
        </div>

        {/* Metadata: Timestamp & Sender / Target */}
        <div className={styles.metaInfoRow}>
          <span>{new Date(current.timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</span>
          {current.senderOrAuthor && (
            <>
              <span>•</span>
              <span>From: <strong>{current.senderOrAuthor}</strong></span>
            </>
          )}
          {current.priority === "HIGH" && (
            <>
              <span>•</span>
              <span style={{ color: "#ef4444", fontWeight: 700 }}>Priority Alert</span>
            </>
          )}
        </div>

        {/* Multi-Notification Pagination Controls */}
        {notifications.length > 1 && (
          <div className={styles.paginationRow}>
            <button
              type="button"
              onClick={handlePrev}
              disabled={currentIndex === 0}
              className={styles.navArrowBtn}
              title="Previous notification"
            >
              <ChevronLeft size={16} /> Prev
            </button>
            <span>
              {currentIndex + 1} of {notifications.length}
            </span>
            <button
              type="button"
              onClick={handleNext}
              disabled={currentIndex === notifications.length - 1}
              className={styles.navArrowBtn}
              title="Next notification"
            >
              Next <ChevronRight size={16} />
            </button>
          </div>
        )}

        {/* Action Buttons: Open (Blue), Close (Red) */}
        <div className={styles.actionButtonGroup}>
          <button
            type="button"
            onClick={handleOpen}
            className={styles.openBtn}
            title="Open and view full details"
          >
            <span>Open</span>
            <ExternalLink size={15} />
          </button>

          <button
            type="button"
            onClick={handleClose}
            className={styles.closeBtn}
            title="Close this notification"
          >
            <span>Close</span>
          </button>
        </div>

        {/* Clear All & Don't Show Again — secondary row */}
        <div className={styles.clearAllRow}>
          <button
            type="button"
            onClick={handleClearAll}
            disabled={isClearing}
            className={styles.clearAllBtn}
            title="Mark all notifications as read and stop auto-showing this popup"
          >
            {isClearing ? (
              <>
                <span className={styles.spinner} />
                <span>Clearing...</span>
              </>
            ) : (
              <>
                <CheckCheck size={14} />
                <span>Clear All &amp; Don&apos;t Show Again</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
