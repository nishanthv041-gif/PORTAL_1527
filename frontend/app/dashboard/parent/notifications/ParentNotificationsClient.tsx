"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Bell, CheckCircle, Clock, Trash2, ExternalLink } from "lucide-react";
import MarkReadButton from "./MarkReadButton";
import ToggleNotifications from "@/frontend/components/ToggleNotifications";
import {
  toggleNotificationsEnabled,
  deleteNotificationAction,
  deleteAllParentNotificationsAction,
} from "@/backend/api/actions/dashboard/parent/notifications/actions";
import { getNotificationDisplayText } from "@/frontend/components/birthdays/birthdayCardUtils";
import { useConfirm } from "@/frontend/components/ui/ConfirmDialog";
import styles from "../../dashboard.module.css";

interface NotificationItem {
  id: string;
  title: string;
  content: string;
  type: string;
  category: string | null;
  link: string | null;
  isRead: boolean;
  createdAt: Date;
}

export default function ParentNotificationsClient({
  initialNotifications,
  userId,
  initialEnabled,
}: {
  initialNotifications: NotificationItem[];
  userId: string;
  initialEnabled: boolean;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [, startTransition] = useTransition();
  const [notifications, setNotifications] = useState<NotificationItem[]>(initialNotifications);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isClearingAll, setIsClearingAll] = useState(false);

  useEffect(() => {
    setNotifications(initialNotifications);
  }, [initialNotifications]);

  // 0ms Optimistic Delete Individual Notification
  const handleDeleteOne = async (id: string) => {
    const previousList = [...notifications];
    // Immediate optimistic removal (< 10ms visual update)
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    setDeletingId(id);

    try {
      const res = await deleteNotificationAction(id);
      setDeletingId(null);
      if (res?.error) {
        setNotifications(previousList);
        alert(res.error);
      } else {
        startTransition(() => {
          router.refresh();
        });
      }
    } catch (err: any) {
      setDeletingId(null);
      setNotifications(previousList);
      alert(err?.message || "Failed to delete notification.");
    }
  };

  // 0ms Optimistic Clear All Notifications
  const handleClearAll = async () => {
    const ok = await confirm({
      title: "Clear All Notifications?",
      message: "Are you sure you want to delete all notifications? This cannot be undone.",
      confirmText: "Clear All",
      cancelText: "Cancel",
      variant: "danger",
    });
    if (!ok) return;

    const previousList = [...notifications];
    // Immediate optimistic clearance
    setNotifications([]);
    setIsClearingAll(true);

    try {
      const res = await deleteAllParentNotificationsAction(userId);
      setIsClearingAll(false);
      if (res?.error) {
        setNotifications(previousList);
        alert(res.error);
      } else {
        startTransition(() => {
          router.refresh();
        });
      }
    } catch (err: any) {
      setIsClearingAll(false);
      setNotifications(previousList);
      alert(err?.message || "Failed to clear notifications.");
    }
  };

  return (
    <div className={styles.dashboard}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1.5rem",
          flexWrap: "wrap",
          gap: "0.75rem",
        }}
      >
        <h1 className={styles.title} style={{ margin: 0 }}>
          Notifications
        </h1>
        {notifications.length > 0 && (
          <button
            type="button"
            onClick={handleClearAll}
            disabled={isClearingAll}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.4rem",
              padding: "0.5rem 0.85rem",
              borderRadius: "8px",
              fontSize: "0.82rem",
              fontWeight: 600,
              background: "rgba(239, 68, 68, 0.08)",
              border: "1px solid rgba(239, 68, 68, 0.25)",
              color: "#ef4444",
              cursor: isClearingAll ? "not-allowed" : "pointer",
              opacity: isClearingAll ? 0.5 : 1,
              transition: "opacity 0.15s ease",
            }}
            title="Delete all notifications"
          >
            <Trash2 size={15} />
            <span>{isClearingAll ? "Clearing..." : "Clear all"}</span>
          </button>
        )}
      </div>

      <ToggleNotifications
        userId={userId}
        initialEnabled={initialEnabled}
        toggleAction={toggleNotificationsEnabled}
      />

      {!initialEnabled ? (
        <div
          style={{
            textAlign: "center",
            padding: "4rem",
            color: "var(--text-secondary)",
            background: "var(--card-bg)",
            border: "1px solid var(--border-color)",
            borderRadius: "12px",
          }}
        >
          <Bell size={48} style={{ opacity: 0.2, margin: "0 auto 1rem" }} />
          <p>Notifications are currently paused.</p>
          <p style={{ fontSize: "0.875rem", opacity: 0.8 }}>
            Turn them back on to see your alerts and history.
          </p>
        </div>
      ) : (
        <div
          className={styles.chartCard}
          style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
        >
          {notifications.map((notification) => (
            <div
              key={notification.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "1.25rem",
                border: "1px solid var(--border)",
                borderRadius: "8px",
                backgroundColor: notification.isRead
                  ? "var(--background)"
                  : "rgba(99, 102, 241, 0.05)",
                borderLeft: notification.isRead
                  ? "1px solid var(--border)"
                  : "4px solid var(--primary)",
              }}
            >
              <div style={{ flex: 1 }}>
                <h4
                  style={{
                    margin: "0 0 0.5rem 0",
                    color: "var(--foreground)",
                    fontSize: "1.05rem",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                  }}
                >
                  <Bell
                    size={16}
                    color={
                      notification.isRead
                        ? "var(--text-secondary)"
                        : "var(--primary)"
                    }
                  />
                  {notification.title}
                </h4>
                <p
                  style={{
                    margin: "0 0 0.5rem 0",
                    fontSize: "0.9rem",
                    color: "var(--text-secondary)",
                  }}
                >
                  {getNotificationDisplayText(notification.content)}
                </p>
                {notification.link && (
                  <div style={{ marginBottom: "0.5rem" }}>
                    <Link
                      href={notification.link}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.3rem",
                        fontSize: "0.82rem",
                        fontWeight: 600,
                        color: "var(--primary, #2563eb)",
                        textDecoration: "none",
                      }}
                    >
                      <span>View details</span>
                      <ExternalLink size={13} />
                    </Link>
                  </div>
                )}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    fontSize: "0.75rem",
                    opacity: 0.7,
                  }}
                >
                  <Clock size={12} /> {new Date(notification.createdAt).toLocaleString()}
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                {!notification.isRead && (
                  <MarkReadButton notificationId={notification.id} />
                )}
                {notification.isRead && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.25rem",
                      fontSize: "0.75rem",
                      color: "var(--success)",
                      background: "var(--success-bg)",
                      padding: "4px 8px",
                      borderRadius: "12px",
                    }}
                  >
                    <CheckCircle size={14} /> Read
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => handleDeleteOne(notification.id)}
                  disabled={deletingId === notification.id}
                  style={{
                    background: "rgba(239, 68, 68, 0.08)",
                    border: "1px solid rgba(239, 68, 68, 0.2)",
                    borderRadius: "6px",
                    color: "#ef4444",
                    cursor: deletingId === notification.id ? "not-allowed" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    padding: "0.4rem",
                    opacity: deletingId === notification.id ? 0.4 : 1,
                    transition: "opacity 0.15s ease",
                  }}
                  title="Delete notification"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}

          {notifications.length === 0 && (
            <div
              style={{
                textAlign: "center",
                padding: "4rem",
                color: "var(--text-secondary)",
                border: "1px dashed var(--border)",
                borderRadius: "12px",
              }}
            >
              <Bell size={48} style={{ opacity: 0.2, margin: "0 auto 1rem" }} />
              <p>You have no notifications.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
