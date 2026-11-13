"use client";

import { useState, useTransition, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bell, CheckCheck, Trash2, ArrowLeft, ExternalLink,
  BookOpen, FileText, MessageSquare, Megaphone, Calendar,
  CheckCircle2, Clock, Filter, AlertCircle, ShieldAlert,
  Bus, Users, AlertTriangle, X
} from "lucide-react";
import { CakeIcon as Cake } from "@/frontend/components/birthdays/BirthdayIcons";
import BirthdayWishCard from "@/frontend/components/birthdays/BirthdayWishCard";
import { parseBirthdayCardPayload, getNotificationDisplayText } from "@/frontend/components/birthdays/birthdayCardUtils";

export interface PortalNotificationItem {
  id: string;
  title: string;
  content: string;
  type: string;
  category?: string | null;
  link?: string | null;
  isRead: boolean;
  createdAt: Date | string;
}

function formatRelativeTime(dateInput: Date | string): string {
  const d = new Date(dateInput);
  const now = new Date();
  const diffSec = Math.floor((now.getTime() - d.getTime()) / 1000);

  if (diffSec < 60) return "Just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 604800) return `${Math.floor(diffSec / 86400)}d ago`;

  return d.toLocaleDateString("en-IN", {
    month: "short",
    day: "numeric",
    year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}

function getTypeBadge(type: string, category?: string | null, title?: string, content?: string) {
  const normalized = (type || category || "").toUpperCase();
  const isBirthday =
    normalized.includes("BIRTHDAY") ||
    (title && title.toLowerCase().includes("birthday")) ||
    (content && content.startsWith("CARD_PAYLOAD:::"));

  if (isBirthday) {
    return {
      label: "Birthday Wish 🎂",
      icon: <Cake size={15} />,
      bg: "rgba(245, 158, 11, 0.16)",
      color: "#b45309",
      border: "rgba(245, 158, 11, 0.35)",
    };
  }

  switch (normalized) {
    case "REPORT_CARD":
    case "EXAM":
      return {
        label: "Report Card",
        icon: <FileText size={15} />,
        bg: "rgba(59, 130, 246, 0.12)",
        color: "#2563eb",
        border: "rgba(59, 130, 246, 0.25)",
      };
    case "HOMEWORK":
    case "ASSIGNMENT":
      return {
        label: "Homework",
        icon: <BookOpen size={15} />,
        bg: "rgba(168, 85, 247, 0.12)",
        color: "#9333ea",
        border: "rgba(168, 85, 247, 0.25)",
      };
    case "MESSAGE":
    case "CHAT":
      return {
        label: "Message",
        icon: <MessageSquare size={15} />,
        bg: "rgba(16, 185, 129, 0.12)",
        color: "#059669",
        border: "rgba(16, 185, 129, 0.25)",
      };
    case "ANNOUNCEMENT":
    case "INSTRUCTION":
    case "NOTICE":
      return {
        label: "Notice",
        icon: <Megaphone size={15} />,
        bg: "rgba(245, 158, 11, 0.12)",
        color: "#d97706",
        border: "rgba(245, 158, 11, 0.25)",
      };
    case "MEETING":
      return {
        label: "Meeting",
        icon: <Users size={15} />,
        bg: "rgba(99, 102, 241, 0.12)",
        color: "#4f46e5",
        border: "rgba(99, 102, 241, 0.25)",
      };
    case "BUS":
    case "BUS_MESSAGE":
    case "TRANSPORT":
      return {
        label: "Bus Alert",
        icon: <Bus size={15} />,
        bg: "rgba(234, 179, 8, 0.14)",
        color: "#b45309",
        border: "rgba(234, 179, 8, 0.3)",
      };
    case "ATTENDANCE":
      return {
        label: "Attendance",
        icon: <Calendar size={15} />,
        bg: "rgba(239, 68, 68, 0.12)",
        color: "#dc2626",
        border: "rgba(239, 68, 68, 0.25)",
      };
    case "COMPLAINT":
      return {
        label: "Notice",
        icon: <AlertTriangle size={15} />,
        bg: "rgba(244, 63, 94, 0.12)",
        color: "#e11d48",
        border: "rgba(244, 63, 94, 0.25)",
      };
    default:
      return {
        label: "General",
        icon: <Bell size={15} />,
        bg: "rgba(100, 116, 139, 0.12)",
        color: "#475569",
        border: "rgba(100, 116, 139, 0.25)",
      };
  }
}

export default function NotificationsCenterClient({
  initialNotifications,
  userRole = "USER",
}: {
  initialNotifications: PortalNotificationItem[];
  userRole?: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [notifications, setNotifications] = useState<PortalNotificationItem[]>(initialNotifications);
  const [activeFilter, setActiveFilter] = useState<string>("ALL");
  const [isMarkingAll, setIsMarkingAll] = useState(false);
  const [selectedBirthdayNotification, setSelectedBirthdayNotification] = useState<PortalNotificationItem | null>(null);

  // Deduplicate identical notifications (e.g. repeated messages created in the same minute)
  const deduplicatedNotifications = useMemo(() => {
    const seen = new Set<string>();
    return notifications.filter((n) => {
      const typeClean = (n.type || n.category || "").toUpperCase();
      const titleClean = (n.title || "").trim().toLowerCase();
      const contentClean = (n.content || "").trim().toLowerCase();
      const minute = Math.floor(new Date(n.createdAt).getTime() / (60 * 1000));
      const sig = `${typeClean}:::${titleClean}:::${contentClean}:::${minute}`;
      if (seen.has(sig)) return false;
      seen.add(sig);
      return true;
    });
  }, [notifications]);

  const unreadCount = useMemo(() => {
    return deduplicatedNotifications.filter((n) => !n.isRead).length;
  }, [deduplicatedNotifications]);

  const filteredNotifications = useMemo(() => {
    const base = deduplicatedNotifications;
    if (activeFilter === "ALL") return base;
    if (activeFilter === "UNREAD") return base.filter((n) => !n.isRead);
    if (activeFilter === "ANNOUNCEMENT") {
      return base.filter((n) => {
        const t = (n.type || n.category || "").toUpperCase();
        return t === "ANNOUNCEMENT" || t === "INSTRUCTION" || t === "NOTICE";
      });
    }
    if (activeFilter === "MEETING") {
      return base.filter((n) => {
        const t = (n.type || n.category || "").toUpperCase();
        return t === "MEETING";
      });
    }
    if (activeFilter === "MESSAGE") {
      return base.filter((n) => {
        const t = (n.type || n.category || "").toUpperCase();
        return t === "MESSAGE" || t === "CHAT";
      });
    }
    if (activeFilter === "REPORT_CARD") {
      return base.filter((n) => {
        const t = (n.type || n.category || "").toUpperCase();
        return t === "REPORT_CARD" || t === "EXAM";
      });
    }
    if (activeFilter === "BUS") {
      return base.filter((n) => {
        const t = (n.type || n.category || "").toUpperCase();
        return t === "BUS" || t === "BUS_MESSAGE" || t === "TRANSPORT";
      });
    }
    if (activeFilter === "HOMEWORK") {
      return base.filter((n) => {
        const t = (n.type || n.category || "").toUpperCase();
        return t === "HOMEWORK" || t === "ASSIGNMENT";
      });
    }
    if (activeFilter === "ATTENDANCE") {
      return base.filter((n) => {
        const t = (n.type || n.category || "").toUpperCase();
        return t === "ATTENDANCE";
      });
    }
    if (activeFilter === "OTHER") {
      const known = new Set([
        "ANNOUNCEMENT", "INSTRUCTION", "NOTICE",
        "MEETING", "MESSAGE", "CHAT",
        "REPORT_CARD", "EXAM",
        "BUS", "BUS_MESSAGE", "TRANSPORT",
        "HOMEWORK", "ASSIGNMENT", "ATTENDANCE"
      ]);
      return base.filter((n) => {
        const t = (n.type || n.category || "").toUpperCase();
        return !known.has(t);
      });
    }
    return base;
  }, [deduplicatedNotifications, activeFilter]);

  // Instant 0ms Optimistic Click & Navigate / Open Birthday Card
  const handleNotificationClick = async (notif: PortalNotificationItem) => {
    if (!notif.isRead) {
      // 0ms optimistic UI update
      setNotifications((prev) =>
        prev.map((n) => (n.id === notif.id ? { ...n, isRead: true } : n))
      );
      // Background server update
      fetch("/api/notifications/mark-read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationId: notif.id }),
      }).catch(() => {});
    }

    const isBirthday =
      (notif.type || notif.category || "").toUpperCase().includes("BIRTHDAY") ||
      (notif.title && notif.title.toLowerCase().includes("birthday")) ||
      (notif.content && notif.content.startsWith("CARD_PAYLOAD:::"));

    if (isBirthday) {
      setSelectedBirthdayNotification(notif);
      return;
    }

    if (notif.link) {
      router.push(notif.link);
    }
  };

  // 0ms Optimistic Mark All As Read
  const handleMarkAllRead = async () => {
    if (unreadCount === 0 || isMarkingAll) return;
    setIsMarkingAll(true);

    const prevList = [...notifications];
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));

    try {
      await fetch("/api/notifications/mark-read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markAll: true }),
      });
      startTransition(() => {
        router.refresh();
      });
    } catch {
      // Rollback on network failure
      setNotifications(prevList);
    } finally {
      setIsMarkingAll(false);
    }
  };

  // 0ms Optimistic Clear Read Notifications
  const handleClearRead = () => {
    setNotifications((prev) => prev.filter((n) => !n.isRead));
  };

  const dashboardHomeLink =
    userRole === "ADMIN"
      ? "/dashboard/admin"
      : userRole === "TEACHER"
      ? "/dashboard/teacher"
      : userRole === "PARENT"
      ? "/dashboard/parent"
      : "/dashboard";

  return (
    <div style={{ maxWidth: "860px", margin: "0 auto", padding: "1.25rem 1rem 3rem" }}>
      {/* Top Header Bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "1.25rem",
          flexWrap: "wrap",
          gap: "0.75rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <Link
            href={dashboardHomeLink}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "38px",
              height: "38px",
              borderRadius: "10px",
              background: "var(--card-bg, #ffffff)",
              border: "1px solid var(--border-color, #e2e8f0)",
              color: "var(--text-primary, #0f172a)",
              textDecoration: "none",
              boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
            }}
            title="Back to Dashboard"
          >
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 style={{ fontSize: "1.35rem", fontWeight: 800, margin: 0, color: "var(--text-primary, #0f172a)" }}>
              Notifications
            </h1>
            <p style={{ margin: 0, fontSize: "0.82rem", color: "var(--text-secondary, #64748b)" }}>
              All school alerts, report cards, homework, and messages
            </p>
          </div>
        </div>

        {/* Global Action Buttons */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <button
            type="button"
            onClick={handleMarkAllRead}
            disabled={unreadCount === 0 || isMarkingAll}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.4rem",
              padding: "0.55rem 0.9rem",
              borderRadius: "8px",
              fontSize: "0.82rem",
              fontWeight: 600,
              background: "var(--card-bg, #ffffff)",
              border: "1px solid var(--border-color, #cbd5e1)",
              color: unreadCount > 0 ? "var(--primary, #2563eb)" : "var(--text-secondary, #94a3b8)",
              cursor: unreadCount > 0 ? "pointer" : "default",
              opacity: unreadCount > 0 ? 1 : 0.6,
              transition: "all 0.15s ease",
            }}
          >
            <CheckCheck size={16} />
            <span>Mark all read</span>
          </button>

          {notifications.some((n) => n.isRead) && (
            <button
              type="button"
              onClick={handleClearRead}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.4rem",
                padding: "0.55rem 0.9rem",
                borderRadius: "8px",
                fontSize: "0.82rem",
                fontWeight: 600,
                background: "var(--card-bg, #ffffff)",
                border: "1px solid var(--border-color, #cbd5e1)",
                color: "var(--text-secondary, #64748b)",
                cursor: "pointer",
              }}
              title="Hide read notifications from list"
            >
              <Trash2 size={15} />
              <span>Clear read</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter Tabs */}
      <div
        style={{
          display: "flex",
          gap: "0.5rem",
          overflowX: "auto",
          paddingBottom: "0.5rem",
          marginBottom: "1rem",
          borderBottom: "1px solid var(--border-color, #e2e8f0)",
        }}
      >
        {[
          { key: "ALL", label: "All" },
          { key: "UNREAD", label: `Unread (${unreadCount})` },
          { key: "ANNOUNCEMENT", label: "Announcements" },
          { key: "MEETING", label: "Meetings" },
          { key: "MESSAGE", label: "Messages" },
          { key: "REPORT_CARD", label: "Report Cards" },
          { key: "BUS", label: "Bus Alerts" },
          { key: "HOMEWORK", label: "Homework" },
          { key: "ATTENDANCE", label: "Attendance" },
          { key: "OTHER", label: "Others" },
        ].map((tab) => {
          const isActive = activeFilter === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveFilter(tab.key)}
              style={{
                padding: "0.45rem 0.9rem",
                borderRadius: "9999px",
                fontSize: "0.82rem",
                fontWeight: 600,
                whiteSpace: "nowrap",
                cursor: "pointer",
                border: isActive ? "1px solid var(--primary, #2563eb)" : "1px solid transparent",
                background: isActive ? "var(--primary, #2563eb)" : "rgba(100, 116, 139, 0.08)",
                color: isActive ? "#ffffff" : "var(--text-secondary, #475569)",
                transition: "all 0.15s ease",
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Notifications List */}
      {filteredNotifications.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: "3.5rem 1.5rem",
            background: "var(--card-bg, #ffffff)",
            borderRadius: "14px",
            border: "1px dashed var(--border-color, #cbd5e1)",
            color: "var(--text-secondary, #64748b)",
          }}
        >
          <Bell size={44} style={{ opacity: 0.25, margin: "0 auto 0.75rem" }} />
          <h3 style={{ margin: "0 0 0.35rem", fontSize: "1.05rem", fontWeight: 700, color: "var(--text-primary, #0f172a)" }}>
            No notifications
          </h3>
          <p style={{ margin: 0, fontSize: "0.85rem" }}>
            {activeFilter === "UNREAD"
              ? "You have caught up with all your notifications!"
              : "You do not have any notifications in this section."}
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {filteredNotifications.map((notif) => {
            const badge = getTypeBadge(notif.type, notif.category, notif.title, notif.content);
            const isUnread = !notif.isRead;

            return (
              <div
                key={notif.id}
                onClick={() => handleNotificationClick(notif)}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "0.875rem",
                  padding: "1rem 1.15rem",
                  background: isUnread
                    ? "var(--notif-unread-bg, rgba(37, 99, 235, 0.04))"
                    : "var(--card-bg, #ffffff)",
                  border: isUnread
                    ? "1px solid rgba(37, 99, 235, 0.3)"
                    : "1px solid var(--border-color, #e2e8f0)",
                  borderRadius: "12px",
                  cursor: notif.link ? "pointer" : "default",
                  boxShadow: isUnread ? "0 2px 8px rgba(37, 99, 235, 0.06)" : "0 1px 3px rgba(0,0,0,0.03)",
                  position: "relative",
                  transition: "transform 0.15s ease, box-shadow 0.15s ease",
                }}
              >
                {/* Category Icon Badge */}
                <div
                  style={{
                    width: "36px",
                    height: "36px",
                    borderRadius: "10px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: badge.bg,
                    color: badge.color,
                    border: `1px solid ${badge.border}`,
                    flexShrink: 0,
                    marginTop: "2px",
                  }}
                >
                  {badge.icon}
                </div>

                {/* Content Area */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "0.5rem",
                      marginBottom: "0.25rem",
                      flexWrap: "wrap",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <span
                        style={{
                          fontSize: "0.72rem",
                          fontWeight: 700,
                          textTransform: "uppercase",
                          letterSpacing: "0.04em",
                          color: badge.color,
                          background: badge.bg,
                          padding: "0.1rem 0.45rem",
                          borderRadius: "4px",
                        }}
                      >
                        {badge.label}
                      </span>
                      <h4
                        style={{
                          margin: 0,
                          fontSize: "0.95rem",
                          fontWeight: isUnread ? 700 : 600,
                          color: "var(--text-primary, #0f172a)",
                        }}
                      >
                        {notif.title}
                      </h4>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                      <span
                        style={{
                          fontSize: "0.75rem",
                          color: "var(--text-secondary, #94a3b8)",
                          display: "flex",
                          alignItems: "center",
                          gap: "0.2rem",
                        }}
                      >
                        <Clock size={12} />
                        {formatRelativeTime(notif.createdAt)}
                      </span>
                      {isUnread && (
                        <span
                          style={{
                            width: "8px",
                            height: "8px",
                            borderRadius: "50%",
                            background: "var(--primary, #2563eb)",
                            display: "inline-block",
                          }}
                        />
                      )}
                    </div>
                  </div>

                  <p
                    style={{
                      margin: 0,
                      fontSize: "0.875rem",
                      lineHeight: 1.45,
                      color: "var(--text-secondary, #475569)",
                      wordBreak: "break-word",
                    }}
                  >
                    {getNotificationDisplayText(notif.content)}
                  </p>

                  {notif.link && (
                    <div
                      style={{
                        marginTop: "0.5rem",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.25rem",
                        fontSize: "0.78rem",
                        fontWeight: 600,
                        color: "var(--primary, #2563eb)",
                      }}
                    >
                      <span>View details</span>
                      <ExternalLink size={12} />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Birthday Card Pop-up Modal when clicking a Birthday Notification in Notification Center */}
      {selectedBirthdayNotification && (() => {
        const payload = parseBirthdayCardPayload(selectedBirthdayNotification.content);
        return (
          <div
            style={{
              position: "fixed",
              inset: 0,
              backgroundColor: "rgba(15, 23, 42, 0.75)",
              backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
              zIndex: 99999,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "max(3.5rem, calc(env(safe-area-inset-top) + 2.5rem)) 1rem max(1.5rem, env(safe-area-inset-bottom)) 1rem",
              overflowY: "auto",
              boxSizing: "border-box",
            }}
            onClick={(e) => {
              if (e.target === e.currentTarget) setSelectedBirthdayNotification(null);
            }}
          >
            <div
              style={{
                position: "relative",
                background: "var(--card-bg, #ffffff)",
                border: "1px solid var(--border-color, rgba(226, 232, 240, 0.85))",
                borderRadius: "28px",
                width: "92vw",
                maxWidth: "780px",
                maxHeight: "calc(100dvh - 5.5rem)",
                overflowY: "auto",
                padding: "2.75rem 1.25rem 1.5rem 1.25rem",
                boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.3)",
                textAlign: "center",
                boxSizing: "border-box",
                margin: "auto",
              }}
              role="dialog"
              aria-modal="true"
            >
              <button
                type="button"
                onClick={() => setSelectedBirthdayNotification(null)}
                style={{
                  position: "absolute",
                  top: "0.75rem",
                  right: "0.75rem",
                  width: "44px",
                  height: "44px",
                  borderRadius: "50%",
                  background: "rgba(0, 0, 0, 0.05)",
                  border: "1px solid rgba(226, 232, 240, 0.8)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  zIndex: 30,
                  color: "#64748b",
                }}
                aria-label="Close"
              >
                <X size={20} />
              </button>

              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.4rem",
                  padding: "0.3rem 0.8rem",
                  borderRadius: "999px",
                  background: "rgba(245, 158, 11, 0.16)",
                  color: "#b45309",
                  fontSize: "0.82rem",
                  fontWeight: 700,
                  marginBottom: "0.75rem",
                }}
              >
                <Cake size={16} />
                <span>BIRTHDAY WISH 🎂</span>
              </div>

              <h2 style={{ margin: "0 0 0.5rem", fontSize: "1.35rem", fontWeight: 800, color: "#0f172a" }}>
                Happy Birthday Celebration
              </h2>
              <p style={{ margin: "0 0 1.25rem", fontSize: "0.95rem", color: "#64748b" }}>
                {selectedBirthdayNotification.title}
              </p>

              {payload ? (
                <div style={{ margin: "0 auto 1.5rem" }}>
                  <BirthdayWishCard
                    recipientName={payload.recipientName}
                    classNameLabel={payload.classNameLabel}
                    deityName={payload.deityName || "Amman"}
                    cardLine1={payload.cardLine1}
                    cardLine2={payload.cardLine2}
                    senderName={payload.senderName || "PRANAV.J"}
                    senderDesignation={payload.senderDesignation || "Correspondent"}
                    schoolName={payload.schoolName || "SRT SCHOOL"}
                    schoolLogo={payload.schoolLogo || "/logo/srt-logo.svg"}
                    schoolTagline={payload.schoolTagline || "UNIVERSAL SCHOOL"}
                    ammanPhotoUrl={payload.ammanPhotoUrl || "/assets/birthday/amman.jpg"}
                    signatureUrl={payload.signatureUrl || null}
                  />
                </div>
              ) : (
                <div style={{ padding: "1.5rem", background: "rgba(245, 158, 11, 0.08)", borderRadius: "14px", margin: "0 auto 1.5rem" }}>
                  {getNotificationDisplayText(selectedBirthdayNotification.content)}
                </div>
              )}

              <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center" }}>
                {selectedBirthdayNotification.link && (
                  <button
                    type="button"
                    onClick={() => {
                      const link = selectedBirthdayNotification.link;
                      setSelectedBirthdayNotification(null);
                      if (link) router.push(link);
                    }}
                    style={{
                      padding: "0.75rem 1.5rem",
                      borderRadius: "12px",
                      background: "var(--primary, #2563eb)",
                      color: "#ffffff",
                      border: "none",
                      fontWeight: 700,
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.4rem",
                    }}
                  >
                    <span>Open</span>
                    <ExternalLink size={16} />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedBirthdayNotification(null)}
                  style={{
                    padding: "0.75rem 1.5rem",
                    borderRadius: "12px",
                    background: "rgba(239, 68, 68, 0.9)",
                    color: "#ffffff",
                    border: "none",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
