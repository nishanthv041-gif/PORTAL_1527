"use client";

import { useState } from "react";
import { 
  Bell, Info, AlertTriangle, CheckCircle, XCircle, Clock, 
  Trash2, Plus, Send, X, Check, Megaphone, MessageSquare 
} from "lucide-react";
import { Notification, User } from "@prisma/client";
import { deleteNotification, toggleNotificationsEnabled } from "@/backend/api/actions/dashboard/admin/notifications/actions";
import { markNotificationReadAction } from "@/backend/api/actions/notifications/unifiedNotificationActions";
import { createCustomNotificationAction } from "@/backend/api/actions/dashboard/admin/notifications/createNotificationAction";
import ToggleNotifications from "@/frontend/components/ToggleNotifications";
import { useRouter } from "next/navigation";

type NotificationWithUser = Notification & { user: User };

export default function NotificationsClient({
  notifications,
  adminUserId,
  initialEnabled,
  classes = [],
  users = []
}: {
  notifications: NotificationWithUser[];
  adminUserId: string;
  initialEnabled: boolean;
  classes?: Array<{ id: string; name: string; section: string }>;
  users?: Array<{ id: string; name: string; role: string }>;
}) {
  const router = useRouter();
  const [showCreate, setShowCreate] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [targetType, setTargetType] = useState("ALL");
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<"ALL" | "UNREAD" | "READ">("ALL");

  const unreadCount = notifications.filter(n => !n.isRead).length;
  const readCount = notifications.filter(n => n.isRead).length;

  const filteredNotifications = notifications.filter(n => {
    if (filterStatus === "UNREAD") return !n.isRead;
    if (filterStatus === "READ") return n.isRead;
    return true;
  });

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "INFO": return <Info size={18} color="var(--primary)" />;
      case "WARNING": return <AlertTriangle size={18} color="var(--warning)" />;
      case "SUCCESS": return <CheckCircle size={18} color="var(--success)" />;
      case "ERROR": return <XCircle size={18} color="var(--danger)" />;
      case "ANNOUNCEMENT": return <Megaphone size={18} color="#8b5cf6" />;
      case "MESSAGE": return <MessageSquare size={18} color="#0284c7" />;
      default: return <Bell size={18} color="var(--primary)" />;
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm("Delete this notification?")) {
      const res = await deleteNotification(id);
      if (res.error) alert(res.error);
      else router.refresh();
    }
  };

  const handleMarkParticularRead = async (id: string) => {
    setMarkingId(id);
    const res = await markNotificationReadAction(`notif-${id}`);
    setMarkingId(null);
    if (res.error) {
      alert(res.error);
    } else {
      router.refresh();
    }
  };

  const handleCreateNotification = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    const formData = new FormData(e.currentTarget);
    const res = await createCustomNotificationAction(formData);
    setIsSubmitting(false);

    if (res.error) {
      alert(res.error);
    } else {
      alert(`✅ Notification created and sent to ${res.count || 1} recipient(s)!`);
      setShowCreate(false);
      router.refresh();
    }
  };

  return (
    <div>
      {/* Top Header Controls */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem", marginBottom: "1.5rem" }}>
        <div style={{ flex: 1, minWidth: "280px" }}>
          <ToggleNotifications 
            userId={adminUserId} 
            initialEnabled={initialEnabled} 
            toggleAction={toggleNotificationsEnabled} 
          />
        </div>

        {/* Create That Particular Notification Button */}
        <div>
          <button
            onClick={() => setShowCreate(true)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              padding: "0.6rem 1.25rem",
              background: "var(--primary)",
              color: "var(--primary-fg)",
              border: "none",
              borderRadius: "8px",
              cursor: "pointer",
              fontSize: "0.875rem",
              fontWeight: 600,
              boxShadow: "0 2px 8px rgba(99, 102, 241, 0.25)"
            }}
          >
            <Plus size={16} /> Create Notification
          </button>
        </div>
      </div>

      {/* Create That Particular Notification Modal */}
      {showCreate && (
        <div 
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.55)",
            backdropFilter: "blur(4px)",
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1rem"
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowCreate(false); }}
        >
          <div
            style={{
              background: "var(--card-bg, #ffffff)",
              borderRadius: "16px",
              border: "1px solid var(--border-color)",
              padding: "clamp(1rem, 2.5vw, 2rem)",
              maxWidth: "580px",
              width: "100%",
              boxShadow: "0 20px 40px rgba(0,0,0,0.2)",
              maxHeight: "90vh",
              overflowY: "auto"
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <Bell size={22} color="var(--primary)" />
                <h2 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 700 }}>Create Notification</h2>
              </div>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--text-secondary)" }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateNotification} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
              {/* Target Audience */}
              <div>
                <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.35rem" }}>
                  Recipient Audience *
                </label>
                <select
                  name="targetType"
                  value={targetType}
                  onChange={(e) => setTargetType(e.target.value)}
                  style={{ width: "100%", padding: "0.75rem", borderRadius: "8px", border: "1px solid var(--border-color)", background: "var(--input-bg, transparent)", color: "inherit" }}
                >
                  <option value="ALL">All Users (Everyone: Parents, Teachers, Staff)</option>
                  <option value="TEACHERS">All Teachers Only</option>
                  <option value="PARENTS">All Parents Only</option>
                  <option value="CLASS">Specific Class (Parents &amp; Teachers of Class)</option>
                  <option value="USER">Specific Individual User</option>
                </select>
              </div>

              {/* Conditional: Select Class */}
              {targetType === "CLASS" && (
                <div>
                  <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.35rem" }}>Select Class *</label>
                  <select
                    name="targetClassId"
                    required
                    style={{ width: "100%", padding: "0.75rem", borderRadius: "8px", border: "1px solid var(--border-color)", background: "var(--input-bg, transparent)", color: "inherit" }}
                  >
                    <option value="">-- Choose Class --</option>
                    {classes.map(c => (
                      <option key={c.id} value={c.id}>{c.name} - {c.section}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Conditional: Select Individual User */}
              {targetType === "USER" && (
                <div>
                  <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.35rem" }}>Select User *</label>
                  <select
                    name="targetUserId"
                    required
                    style={{ width: "100%", padding: "0.75rem", borderRadius: "8px", border: "1px solid var(--border-color)", background: "var(--input-bg, transparent)", color: "inherit" }}
                  >
                    <option value="">-- Choose User --</option>
                    {users.map(u => (
                      <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Notification Type */}
              <div>
                <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.35rem" }}>
                  Notification Type
                </label>
                <select
                  name="type"
                  defaultValue="INFO"
                  style={{ width: "100%", padding: "0.75rem", borderRadius: "8px", border: "1px solid var(--border-color)", background: "var(--input-bg, transparent)", color: "inherit" }}
                >
                  <option value="INFO">Information (Blue)</option>
                  <option value="WARNING">Important Notice / Warning (Amber)</option>
                  <option value="ANNOUNCEMENT">School Announcement (Purple)</option>
                  <option value="MESSAGE">Direct Intimation / Message (Teal)</option>
                  <option value="SUCCESS">Success / Achievement (Green)</option>
                  <option value="ERROR">Urgent Alert (Red)</option>
                </select>
              </div>

              {/* Title */}
              <div>
                <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.35rem" }}>
                  Notification Title *
                </label>
                <input
                  type="text"
                  name="title"
                  required
                  placeholder="e.g. Schedule Revision / Timetable Intimation"
                  style={{ width: "100%", padding: "0.75rem", borderRadius: "8px", border: "1px solid var(--border-color)", background: "var(--input-bg, transparent)", color: "inherit" }}
                />
              </div>

              {/* Content / Message */}
              <div>
                <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.35rem" }}>
                  Message Content *
                </label>
                <textarea
                  name="content"
                  required
                  rows={4}
                  placeholder="Type the full intimation message details here..."
                  style={{ width: "100%", padding: "0.75rem", borderRadius: "8px", border: "1px solid var(--border-color)", background: "var(--input-bg, transparent)", color: "inherit", resize: "vertical" }}
                />
              </div>

              {/* Optional Link */}
              <div>
                <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.35rem" }}>
                  Target Link (Optional)
                </label>
                <input
                  type="text"
                  name="link"
                  placeholder="e.g. /dashboard/admin/timetable or leave empty for default"
                  style={{ width: "100%", padding: "0.75rem", borderRadius: "8px", border: "1px solid var(--border-color)", background: "var(--input-bg, transparent)", color: "inherit" }}
                />
              </div>

              {/* Buttons */}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "0.5rem" }}>
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  style={{ padding: "0.65rem 1.25rem", borderRadius: "8px", border: "1px solid var(--border-color)", background: "transparent", color: "inherit", cursor: "pointer", fontWeight: 500 }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  style={{ display: "flex", alignItems: "center", gap: "0.4rem", padding: "0.65rem 1.5rem", borderRadius: "8px", border: "none", background: "var(--primary)", color: "var(--primary-fg)", cursor: isSubmitting ? "not-allowed" : "pointer", fontWeight: 600 }}
                >
                  <Send size={15} /> {isSubmitting ? "Sending..." : "Send Notification"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Notifications Filter Bar (All / Unread / Read History) */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1.5rem", overflowX: "auto", whiteSpace: "nowrap" }}>
        <button
          type="button"
          onClick={() => setFilterStatus("ALL")}
          style={{
            padding: "0.45rem 0.95rem",
            borderRadius: "8px",
            border: "1px solid var(--border-color)",
            backgroundColor: filterStatus === "ALL" ? "rgba(99, 102, 241, 0.15)" : "transparent",
            color: filterStatus === "ALL" ? "var(--primary)" : "var(--text-secondary)",
            fontSize: "0.8125rem",
            fontWeight: 700,
            cursor: "pointer"
          }}
        >
          All Notifications ({notifications.length})
        </button>
        <button
          type="button"
          onClick={() => setFilterStatus("UNREAD")}
          style={{
            padding: "0.45rem 0.95rem",
            borderRadius: "8px",
            border: "1px solid var(--border-color)",
            backgroundColor: filterStatus === "UNREAD" ? "rgba(99, 102, 241, 0.15)" : "transparent",
            color: filterStatus === "UNREAD" ? "var(--primary)" : "var(--text-secondary)",
            fontSize: "0.8125rem",
            fontWeight: 700,
            cursor: "pointer"
          }}
        >
          Unread ({unreadCount})
        </button>
        <button
          type="button"
          onClick={() => setFilterStatus("READ")}
          style={{
            padding: "0.45rem 0.95rem",
            borderRadius: "8px",
            border: "1px solid var(--border-color)",
            backgroundColor: filterStatus === "READ" ? "rgba(16, 185, 129, 0.15)" : "transparent",
            color: filterStatus === "READ" ? "#10b981" : "var(--text-secondary)",
            fontSize: "0.8125rem",
            fontWeight: 700,
            cursor: "pointer"
          }}
        >
          Read &amp; Saved ({readCount})
        </button>
      </div>

      {/* Notifications List (Managed Per Particular Notification) */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 340px), 1fr))", gap: "1.25rem", width: "100%", minWidth: 0 }}>
        {filteredNotifications.map(notif => (
          <div key={notif.id} style={{ background: "var(--card-bg)", borderRadius: "12px", border: `1px solid ${!notif.isRead ? "var(--primary)" : "var(--border-color)"}`, padding: "1.25rem", display: "flex", flexDirection: "column", gap: "1rem", minWidth: 0, width: "100%", boxSizing: "border-box" }}>
            
            <div style={{ display: "flex", gap: "0.85rem", alignItems: "flex-start", minWidth: 0 }}>
              <div style={{ padding: "0.5rem", background: "rgba(0,0,0,0.02)", borderRadius: "8px", flexShrink: 0 }}>
                {getTypeIcon(notif.type)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 600 }}>{notif.title}</h3>
                <p style={{ margin: "0.5rem 0 0 0", fontSize: "0.875rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                  {notif.content}
                </p>
              </div>
              <button
                onClick={() => handleDelete(notif.id)}
                style={{
                  background: "rgba(239, 68, 68, 0.08)",
                  border: "1px solid rgba(239, 68, 68, 0.2)",
                  cursor: "pointer",
                  color: "#ef4444",
                  padding: "0.35rem",
                  borderRadius: "6px",
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center"
                }}
                title="Delete this notification permanently"
              >
                <Trash2 size={16} />
              </button>
            </div>

            <div style={{ marginTop: "auto", paddingTop: "1rem", borderTop: "1px solid var(--border-color)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                <span style={{ fontWeight: 600, color: "var(--foreground)" }}>To: {notif.user.name}</span>
              </div>
              
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <span style={{ display: "flex", alignItems: "center", gap: "0.25rem", fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                  <Clock size={14} /> {new Date(notif.createdAt).toLocaleString()}
                </span>

                {/* Mark this particular notification as read */}
                {!notif.isRead ? (
                  <button
                    onClick={() => handleMarkParticularRead(notif.id)}
                    disabled={markingId === notif.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.25rem",
                      fontSize: "0.75rem",
                      fontWeight: 600,
                      padding: "0.25rem 0.55rem",
                      borderRadius: "6px",
                      border: "1px solid var(--primary)",
                      background: "rgba(99, 102, 241, 0.08)",
                      color: "var(--primary)",
                      cursor: "pointer"
                    }}
                    title="Mark this particular notification as read"
                  >
                    <Check size={12} /> {markingId === notif.id ? "Marking..." : "Mark Read"}
                  </button>
                ) : (
                  <span style={{ fontSize: "0.65rem", fontWeight: 600, textTransform: "uppercase", padding: "0.25rem 0.5rem", borderRadius: "12px", background: "var(--success-bg)", color: "var(--success)" }}>
                    Read &amp; Saved
                  </span>
                )}
              </div>
            </div>

          </div>
        ))}

        {!initialEnabled ? (
          <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: "4rem", color: "var(--text-secondary)", background: "var(--card-bg)", borderRadius: "12px", border: "1px solid var(--border-color)" }}>
            <Bell size={48} style={{ opacity: 0.2, margin: "0 auto 1rem" }} />
            <p>Notifications are currently paused.</p>
            <p style={{ fontSize: "0.875rem", opacity: 0.8 }}>Turn them back on to see your alerts and history.</p>
          </div>
        ) : filteredNotifications.length === 0 ? (
          <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: "4rem", color: "var(--text-secondary)", background: "var(--card-bg)", borderRadius: "12px", border: "1px solid var(--border-color)" }}>
            <Bell size={48} style={{ opacity: 0.2, margin: "0 auto 1rem" }} />
            <p>No notifications found in this view.</p>
            <p style={{ fontSize: "0.875rem", opacity: 0.8 }}>Notifications read in the pop-up or created here will appear in your saved history.</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
