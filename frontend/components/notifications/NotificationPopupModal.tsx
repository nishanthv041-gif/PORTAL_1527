"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { 
  Bell, ChevronLeft, ChevronRight, ExternalLink, 
  Megaphone, MessageSquare, Award, BookOpen, Calendar, Info,
  FileText, Clock, Users, AlertCircle, BellOff, CheckCheck, Bus
} from "lucide-react";
import styles from "./NotificationPopupModal.module.css";
import { 
  UnifiedNotification, 
  getUnifiedNotificationsAction, 
  markNotificationReadAction, 
  clearAllNotificationsAction, 
  markNotificationsAsSeenInPopupAction
} from "@/backend/api/actions/notifications/unifiedNotificationActions";

// Key used in localStorage — unique per portal so it doesn't clash with other apps
const CLEARED_KEY = "srt_portal_notif_cleared_v1";
const CLEARED_TIMESTAMP_KEY = "srt_portal_notif_cleared_time";
const DISMISSED_KEY = "srt_portal_popup_notif_dismissed";
const FRESH_LOGIN_KEY = "srt_portal_fresh_login";
const SEEN_POPUP_IDS_KEY = "srt_portal_seen_popup_ids";

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

  // Helper to filter out already-read, already-cleared, or already-seen-in-popup notifications
  const filterActiveUnread = (items: UnifiedNotification[]) => {
    if (!items || items.length === 0) return [];
    const clearedTimeStr = typeof window !== "undefined" ? localStorage.getItem(CLEARED_TIMESTAMP_KEY) : null;
    const clearedTime = clearedTimeStr ? new Date(clearedTimeStr).getTime() : 0;

    let seenIds = new Set<string>();
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem(SEEN_POPUP_IDS_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) seenIds = new Set(parsed);
        }
      } catch {}
    }

    return items.filter(n => !n.isRead && !seenIds.has(n.id) && new Date(n.timestamp).getTime() > clearedTime);
  };

  // Helper to mark a list of notifications as seen:
  // 1. Locally via localStorage so it never shows in popup again
  // 2. In database so it remains safely stored and accessible on the user's notification page
  const markShownNotificationsAsSeen = (items: UnifiedNotification[]) => {
    if (!items || items.length === 0) return;
    const ids = items.map(n => n.id);

    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem(SEEN_POPUP_IDS_KEY);
        const existingArr: string[] = stored ? JSON.parse(stored) : [];
        const updated = new Set([...existingArr, ...ids]);
        localStorage.setItem(SEEN_POPUP_IDS_KEY, JSON.stringify(Array.from(updated)));
      } catch {}
    }

    markNotificationsAsSeenInPopupAction(ids).catch(() => {});
  };

  // Sync if prop updates
  useEffect(() => {
    if (initialNotifications && initialNotifications.length > 0) {
      const activeUnread = filterActiveUnread(initialNotifications);
      const autoPopupItems = activeUnread.filter(n => n.category !== "MESSAGE");
      if (autoPopupItems.length > 0) {
        setNotifications(autoPopupItems);
        // Fast popup: Open immediately within 80ms on page load
        const timer = setTimeout(() => {
          setIsOpen(true);
          markShownNotificationsAsSeen(autoPopupItems);
        }, 80);
        return () => clearTimeout(timer);
      }
    }
  }, [initialNotifications]);

  // Periodic active polling: checks every 5 seconds for newly created notifications (e.g. teacher assigns homework)
  useEffect(() => {
    if (!notificationsEnabled) return;

    let isMounted = true;

    const checkFreshNotifications = () => {
      getUnifiedNotificationsAction({ unreadOnly: true })
        .then((fresh) => {
          if (!isMounted || !fresh || fresh.length === 0) return;
          const activeFresh = filterActiveUnread(fresh);
          const autoPopupItems = activeFresh.filter(n => n.category !== "MESSAGE");

          if (autoPopupItems.length > 0) {
            setNotifications((prev) => {
              const prevIds = new Set(prev.map(p => p.id));
              const hasNew = autoPopupItems.some(item => !prevIds.has(item.id));
              if (hasNew || prev.length === 0) {
                setIsOpen(true);
                markShownNotificationsAsSeen(autoPopupItems);
                return autoPopupItems;
              }
              return prev;
            });
          }
        })
        .catch(() => {});
    };

    // Initial immediate check if initialNotifications was empty
    if (!initialNotifications || initialNotifications.length === 0) {
      const initTimer = setTimeout(checkFreshNotifications, 100);
      return () => {
        isMounted = false;
        clearTimeout(initTimer);
      };
    }

    // Interval poll every 5 seconds for fast real-time popup
    const interval = setInterval(checkFreshNotifications, 5000);

    return () => {
      isMounted = false;
      clearInterval(interval);
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
    // When closed, ensure all seen notifications are marked as seen and stored in database
    markShownNotificationsAsSeen(notifications);
    setIsOpen(false);
    router.refresh();
  };

  const handleOpen = async () => {
    if (!current) return;
    
    // Mark notifications as seen and store permanently in user notification page
    markShownNotificationsAsSeen(notifications);

    // Dismiss modal and navigate directly to target action
    setIsOpen(false);

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
      case "BUS":
        return <Bus size={13} />;
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

        {/* Action Buttons: Open (Blue), Close */}
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
            title="Close this notification and save in notifications page"
          >
            <span>Close</span>
          </button>
        </div>
      </div>
    </div>
  );
}
