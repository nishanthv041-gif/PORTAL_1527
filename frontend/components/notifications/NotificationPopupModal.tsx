"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { 
  Bell, ChevronLeft, ChevronRight, ExternalLink, 
  Megaphone, MessageSquare, Award, BookOpen, Calendar, Info,
  FileText, Clock, Users, AlertCircle, BellOff, CheckCheck, Trash2
} from "lucide-react";
import styles from "./NotificationPopupModal.module.css";
import { 
  UnifiedNotification, 
  getUnifiedNotificationsAction, 
  markNotificationReadAction, 
  clearAllNotificationsAction, 
  deleteUnifiedNotificationAction,
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
          // Only auto-pop up for urgent school notices, announcements, or meetings (never routine 1-to-1 chat messages)
          const autoPopupItems = activeFresh.filter(n => n.category !== "MESSAGE");
          if (autoPopupItems.length > 0) {
            setNotifications(autoPopupItems);

            const isFreshLogin = sessionStorage.getItem(FRESH_LOGIN_KEY) === "true";
            const isDismissed = sessionStorage.getItem(DISMISSED_KEY) === "true";

            if (isFreshLogin) {
              sessionStorage.removeItem(FRESH_LOGIN_KEY);
              sessionStorage.removeItem(DISMISSED_KEY);
              setTimeout(() => {
                if (isMounted) {
                  setIsOpen(true);
                  markShownNotificationsAsSeen(autoPopupItems);
                }
              }, 350);
            } else if (!isDismissed) {
              setTimeout(() => {
                if (isMounted) {
                  setIsOpen(true);
                  markShownNotificationsAsSeen(autoPopupItems);
                }
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
    // Exclude routine 1-to-1 chat messages from auto-blocking popup dialog
    const autoPopupInitial = activeInitial.filter(n => n.category !== "MESSAGE");

    if (autoPopupInitial.length > 0) {
      if (isFreshLogin) {
        sessionStorage.removeItem(FRESH_LOGIN_KEY);
        sessionStorage.removeItem(DISMISSED_KEY);
        const timer = setTimeout(() => {
          if (isMounted) {
            setNotifications(autoPopupInitial);
            setIsOpen(true);
            markShownNotificationsAsSeen(autoPopupInitial);
          }
        }, 350);
        return () => clearTimeout(timer);
      } else if (!isDismissed) {
        const timer = setTimeout(() => {
          if (isMounted) {
            setNotifications(autoPopupInitial);
            setIsOpen(true);
            markShownNotificationsAsSeen(autoPopupInitial);
          }
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
    // When closed, ensure all seen notifications are marked as seen and stored in database
    markShownNotificationsAsSeen(notifications);
    setIsOpen(false);
    sessionStorage.setItem(DISMISSED_KEY, "true");
    router.refresh();
  };


  const handleDeleteCurrent = async () => {
    if (!current) return;
    if (!confirm("Are you sure you want to delete this notification?")) return;

    try {
      await deleteUnifiedNotificationAction(current.id);
    } catch {
      // silent
    }

    const updated = notifications.filter((_, idx) => idx !== currentIndex);
    setNotifications(updated);

    if (updated.length === 0) {
      setIsOpen(false);
      sessionStorage.setItem(DISMISSED_KEY, "true");
    } else if (currentIndex >= updated.length) {
      setCurrentIndex(Math.max(0, updated.length - 1));
    }

    router.refresh();
  };

  const handleOpen = async () => {
    if (!current) return;
    
    // Mark notifications as seen and store permanently in user notification page
    markShownNotificationsAsSeen(notifications);

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

        {/* Action Buttons: Open (Blue), Delete (Red/Trash), Close */}
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
            onClick={handleDeleteCurrent}
            className={styles.deleteBtn}
            title="Delete this notification"
          >
            <Trash2 size={15} />
            <span>Delete</span>
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
