"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { 
  Bell, ChevronLeft, ChevronRight, ExternalLink, 
  Megaphone, MessageSquare, Award, BookOpen, Calendar, Info
} from "lucide-react";
import styles from "./NotificationPopupModal.module.css";
import { UnifiedNotification, markNotificationReadAction } from "@/backend/api/actions/notifications/unifiedNotificationActions";

export default function NotificationPopupModal({
  initialNotifications = []
}: {
  initialNotifications?: UnifiedNotification[];
}) {
  const router = useRouter();
  const [notifications, setNotifications] = useState<UnifiedNotification[]>(initialNotifications);
  const [isOpen, setIsOpen] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);

  // Sync if prop updates
  useEffect(() => {
    setNotifications(initialNotifications);
  }, [initialNotifications]);

  // Automatic popup on portal login / entry
  useEffect(() => {
    // Check if dismissed in the current browser session
    const hasSeen = sessionStorage.getItem("srt_portal_popup_notif_dismissed");
    
    // Auto-display if not dismissed yet and there are notifications
    if (!hasSeen && initialNotifications && initialNotifications.length > 0) {
      // Delay slightly for smooth entrance animation after page paint
      const timer = setTimeout(() => {
        setIsOpen(true);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [initialNotifications]);

  // Listen for manual open trigger from Topbar Bell button
  useEffect(() => {
    const handleManualOpen = () => {
      setIsOpen(true);
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
    sessionStorage.setItem("srt_portal_popup_notif_dismissed", "true");
  };

  const handleOpen = async () => {
    if (!current) return;
    
    // Mark notification as read on the server
    if (current.id) {
      markNotificationReadAction(current.id).catch(() => {});
    }

    // Dismiss modal and navigate directly to target action
    setIsOpen(false);
    sessionStorage.setItem("srt_portal_popup_notif_dismissed", "true");

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

  // Icon for category
  const getCategoryIcon = (category: string) => {
    switch (category) {
      case "ANNOUNCEMENT":
        return <Megaphone size={13} />;
      case "MESSAGE":
        return <MessageSquare size={13} />;
      case "REPORT_CARD":
        return <Award size={13} />;
      case "ASSIGNMENT":
        return <BookOpen size={13} />;
      case "ATTENDANCE":
        return <Calendar size={13} />;
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

        {/* Action Buttons exactly matching the user mockup (Blue Open, Red Close) */}
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
      </div>
    </div>
  );
}
