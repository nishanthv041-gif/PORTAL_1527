"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { 
  Bell, ChevronLeft, ChevronRight, ExternalLink, 
  Megaphone, MessageSquare, Award, BookOpen, Calendar, Info,
  FileText, Clock, Users, AlertCircle, BellOff, CheckCheck, Bus, X
} from "lucide-react";
import { CakeIcon as Cake } from "@/frontend/components/birthdays/BirthdayIcons";
import BirthdayWishCard from "@/frontend/components/birthdays/BirthdayWishCard";
import { parseBirthdayCardPayload, getNotificationDisplayText } from "@/frontend/components/birthdays/birthdayCardUtils";
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
  const seenIdRef = useRef<Set<string>>(new Set());
  const cachedRecentRef = useRef<UnifiedNotification[]>(initialNotifications || []);

  // Initialize seen IDs from localStorage on client
  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem(SEEN_POPUP_IDS_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) {
            parsed.forEach((id: string) => seenIdRef.current.add(id));
          }
        }
      } catch {}
    }
  }, []);

  // Helper to filter out already-read, already-cleared, or already-seen-in-popup notifications
  const filterActiveUnread = (items: UnifiedNotification[]) => {
    if (!items || items.length === 0) return [];
    const clearedTimeStr = typeof window !== "undefined" ? localStorage.getItem(CLEARED_TIMESTAMP_KEY) : null;
    const clearedTime = clearedTimeStr ? new Date(clearedTimeStr).getTime() : 0;

    let localSeen = new Set<string>(seenIdRef.current);
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem(SEEN_POPUP_IDS_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) {
            parsed.forEach((id: string) => {
              localSeen.add(id);
              seenIdRef.current.add(id);
            });
          }
        }
        const sessionStored = sessionStorage.getItem("srt_portal_session_seen_ids");
        if (sessionStored) {
          const parsed = JSON.parse(sessionStored);
          if (Array.isArray(parsed)) {
            parsed.forEach((id: string) => {
              localSeen.add(id);
              seenIdRef.current.add(id);
            });
          }
        }
      } catch {}
    }

    return items.filter(
      n => {
        if (n.isRead) return false;
        if (localSeen.has(n.id)) return false;
        // Deduplicate by signature to guard against identical duplicate rows
        const sig = `${n.category}-${(n.title || "").trim().toLowerCase()}`;
        if (localSeen.has(sig)) return false;
        return new Date(n.timestamp).getTime() > clearedTime;
      }
    );
  };

  // Helper to mark a list of notifications as seen:
  // 1. Locally via localStorage & sessionStorage so it never shows in popup again
  // 2. In database so it remains safely stored and accessible on the user's notification page
  const markShownNotificationsAsSeen = (items: UnifiedNotification[]) => {
    if (!items || items.length === 0) return;
    const ids = items.map(n => n.id);

    ids.forEach(id => seenIdRef.current.add(id));
    items.forEach(n => {
      const sig = `${n.category}-${(n.title || "").trim().toLowerCase()}`;
      seenIdRef.current.add(sig);
    });

    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem(SEEN_POPUP_IDS_KEY);
        const existingArr: string[] = stored ? JSON.parse(stored) : [];
        const sigs = items.map(n => `${n.category}-${(n.title || "").trim().toLowerCase()}`);
        const updated = new Set([...existingArr, ...ids, ...sigs]);
        localStorage.setItem(SEEN_POPUP_IDS_KEY, JSON.stringify(Array.from(updated)));

        const sessionStored = sessionStorage.getItem("srt_portal_session_seen_ids");
        const existingSessionArr: string[] = sessionStored ? JSON.parse(sessionStored) : [];
        const sessionUpdated = new Set([...existingSessionArr, ...ids, ...sigs]);
        sessionStorage.setItem("srt_portal_session_seen_ids", JSON.stringify(Array.from(sessionUpdated)));
      } catch {}
    }

    markNotificationsAsSeenInPopupAction(ids).catch(() => {});
  };

  // Sync if initialNotifications prop updates (fast initial SSR paint)
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
          // Only show notifications that have NEVER been seen or popped up before
          const newUnseenItems = activeFresh.filter(
            n => !seenIdRef.current.has(n.id) && n.category !== "MESSAGE"
          );

          if (newUnseenItems.length > 0) {
            newUnseenItems.forEach(n => seenIdRef.current.add(n.id));
            setNotifications(newUnseenItems);
            setCurrentIndex(0);
            setIsOpen(true);
            markShownNotificationsAsSeen(newUnseenItems);
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

    // Relaxed 60s background poll, paused when document is hidden
    const interval = setInterval(() => {
      if (!document.hidden) {
        checkFreshNotifications();
      }
    }, 60000);

    const handleVisibility = () => {
      if (!document.hidden) {
        checkFreshNotifications();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      isMounted = false;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [initialNotifications, notificationsEnabled]);

  // Preload recent history for instant 0ms manual open via bell button
  useEffect(() => {
    getUnifiedNotificationsAction({ unreadOnly: false })
      .then((fresh) => {
        if (fresh && fresh.length > 0) {
          cachedRecentRef.current = fresh;
        }
      })
      .catch(() => {});
  }, []);

  // Listen for manual open trigger from Topbar Bell button
  useEffect(() => {
    const handleManualOpen = () => {
      // 1. If we already have notifications loaded in state, open immediately in 0ms!
      if (notifications && notifications.length > 0) {
        setCurrentIndex(0);
        setIsOpen(true);
        return;
      }

      // 2. If we have preloaded cached notifications, open immediately in 0ms!
      if (cachedRecentRef.current && cachedRecentRef.current.length > 0) {
        setNotifications(cachedRecentRef.current.slice(0, 8));
        setCurrentIndex(0);
        setIsOpen(true);
        return;
      }

      // 3. Fallback: Fetch recent notifications so user can review them immediately
      getUnifiedNotificationsAction({ unreadOnly: false })
        .then((fresh) => {
          if (fresh && fresh.length > 0) {
            cachedRecentRef.current = fresh;
            setNotifications(fresh.slice(0, 8));
            setCurrentIndex(0);
            setIsOpen(true);
          } else {
            const path = typeof window !== "undefined" ? window.location.pathname : "";
            const target = path.includes("/parent")
              ? "/dashboard/parent/notifications"
              : path.includes("/teacher")
              ? "/dashboard/teacher/notifications"
              : "/dashboard/admin/notifications";
            router.push(target);
          }
        })
        .catch(() => {});
    };

    window.addEventListener("open-notification-popup", handleManualOpen);
    return () => window.removeEventListener("open-notification-popup", handleManualOpen);
  }, [notifications, router]);

  const handleClose = () => {
    // When closed, ensure all seen notifications are marked as seen and stored in database
    markShownNotificationsAsSeen(notifications);
    setIsOpen(false);
  };

  // Lock background body scroll when modal is open
  useEffect(() => {
    if (!isOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen]);

  // Handle Escape key to close modal
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, notifications]);

  if (!isOpen || !notifications || notifications.length === 0) {
    return null;
  }

  const current = notifications[currentIndex] || notifications[0];

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
      case "BIRTHDAY":
        return <Cake size={13} />;
      default:
        return <Info size={13} />;
    }
  };

  const birthdayCard = current ? parseBirthdayCardPayload(current.description) : null;

  return (
    <div className={styles.overlay} onClick={(e) => {
      if (e.target === e.currentTarget) handleClose();
    }}>
      <div
        className={`${styles.modalCard} ${birthdayCard ? styles.modalCardWide : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="notif-title"
      >
        {/* Top-right touch-friendly close (X) button: always in viewport */}
        <button
          type="button"
          onClick={handleClose}
          className={styles.topRightCloseBtn}
          aria-label="Close dialog"
          title="Close dialog"
        >
          <X size={20} />
        </button>

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
          {current.category === "BIRTHDAY" ? "Happy Birthday Celebration" : "Notification"}
        </h2>

        {/* Specific Notification Title */}
        <h3 className={styles.subTitle}>
          {current.title}
        </h3>

        {/* Detailed Description or Designed Birthday Card */}
        {birthdayCard ? (
          <div className={styles.birthdayCardWrapper}>
            <BirthdayWishCard
              recipientName={birthdayCard.recipientName}
              classNameLabel={birthdayCard.classNameLabel}
              deityName={birthdayCard.deityName || "Amman"}
              cardLine1={birthdayCard.cardLine1}
              cardLine2={birthdayCard.cardLine2}
              senderName={birthdayCard.senderName || "PRANAV.J"}
              senderDesignation={birthdayCard.senderDesignation || "Correspondent"}
              schoolName={birthdayCard.schoolName || "SRT SCHOOL"}
              schoolLogo={birthdayCard.schoolLogo || "/logo/srt-logo.svg"}
              schoolTagline={birthdayCard.schoolTagline || "UNIVERSAL SCHOOL"}
              ammanPhotoUrl={birthdayCard.ammanPhotoUrl || "/assets/birthday/amman.jpg"}
              signatureUrl={birthdayCard.signatureUrl || null}
            />
          </div>
        ) : (
          <div className={styles.descriptionBox}>
            {getNotificationDisplayText(current.description)}
          </div>
        )}

        {/* Metadata: Timestamp & Sender / Target */}
        <div className={styles.metaInfoRow}>
          <span>{new Date(current.timestamp).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", month: "short", day: "numeric", year: "numeric" })}</span>
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
