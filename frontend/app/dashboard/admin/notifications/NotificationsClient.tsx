"use client";

import { useState } from "react";
import { 
  Bell, Info, AlertTriangle, CheckCircle, XCircle, Clock, 
  Trash2, Plus, Send, X, Check, Megaphone, MessageSquare,
  Smartphone, RotateCcw, AlertOctagon, Calendar, ExternalLink
} from "lucide-react";
import { Notification, User } from "@prisma/client";
import { deleteNotification, toggleNotificationsEnabled } from "@/backend/api/actions/dashboard/admin/notifications/actions";
import { markNotificationReadAction } from "@/backend/api/actions/notifications/unifiedNotificationActions";
import { 
  createCustomNotificationAction, 
  retryFailedDeliveriesAction 
} from "@/backend/api/actions/dashboard/admin/notifications/createNotificationAction";
import ToggleNotifications from "@/frontend/components/ToggleNotifications";
import { useRouter } from "next/navigation";
import { useConfirm } from "@/frontend/components/ui/ConfirmDialog";
import { getNotificationDisplayText } from "@/frontend/components/birthdays/birthdayCardUtils";

type NotificationWithUser = Notification & { user: User };

interface PendingNotification {
  title: string;
  content: string;
  targetType: string;
  targetRole?: string;
  targetClassId?: string;
  targetUserId?: string;
  type: string;
  category: string;
  priority: "NORMAL" | "URGENT";
  link: string;
  scheduleDateTime?: string;
  recipientDescription: string;
}

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
  const confirm = useConfirm();
  const [activeTab, setActiveTab] = useState<"HISTORY" | "PUSH_SETTINGS">("HISTORY");
  const [showCreate, setShowCreate] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  // Form State
  const [targetType, setTargetType] = useState("ALL");
  const [targetRole, setTargetRole] = useState("TEACHER");
  const [targetClassId, setTargetClassId] = useState("");
  const [targetUserId, setTargetUserId] = useState("");
  const [type, setType] = useState("ANNOUNCEMENT");
  const [category, setCategory] = useState("general");
  const [priority, setPriority] = useState<"NORMAL" | "URGENT">("NORMAL");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [link, setLink] = useState("/dashboard");
  const [scheduleDateTime, setScheduleDateTime] = useState("");

  const [pendingNotif, setPendingNotif] = useState<PendingNotification | null>(null);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<"ALL" | "UNREAD" | "READ">("ALL");

  const unreadCount = notifications.filter(n => !n.isRead).length;
  const readCount = notifications.filter(n => n.isRead).length;

  const filteredNotifications = notifications.filter(n => {
    if (filterStatus === "UNREAD") return !n.isRead;
    if (filterStatus === "READ") return n.isRead;
    return true;
  });

  const getTypeIcon = (t: string) => {
    switch (t) {
      case "INFO": return <Info size={18} color="var(--primary)" />;
      case "WARNING": return <AlertTriangle size={18} color="var(--warning)" />;
      case "SUCCESS": return <CheckCircle size={18} color="var(--success)" />;
      case "ERROR":
      case "ALERT": return <AlertOctagon size={18} color="#ef4444" />;
      case "ANNOUNCEMENT": return <Megaphone size={18} color="#8b5cf6" />;
      case "MESSAGE": return <MessageSquare size={18} color="#0284c7" />;
      default: return <Bell size={18} color="var(--primary)" />;
    }
  };

  const handleDelete = async (id: string) => {
    const ok = await confirm({
      title: "Delete Notification?",
      message: "Are you sure you want to delete this notification?",
      confirmText: "Delete",
      cancelText: "Cancel",
      variant: "danger"
    });
    if (!ok) return;

    const res = await deleteNotification(id);
    if (res.error) alert(res.error);
    else router.refresh();
  };

  const handleMarkParticularRead = async (id: string) => {
    setMarkingId(id);
    const res = await markNotificationReadAction(`notif-${id}`);
    setMarkingId(null);
    if (res.error) alert(res.error);
    else router.refresh();
  };

  const handleRetryFailed = async (notifId: string) => {
    setRetryingId(notifId);
    const res = await retryFailedDeliveriesAction(notifId);
    setRetryingId(null);
    if (res.error) {
      alert(res.error);
    } else {
      alert(`✅ Retried delivery: ${res.sent || 0} push notification(s) sent.`);
      router.refresh();
    }
  };

  // Step 1: Open Confirmation Screen
  const handlePreSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) {
      alert("Title and message content are required.");
      return;
    }

    let recipientDescription = "All Registered Users";
    if (targetType === "TEACHERS") recipientDescription = "All Active Teachers";
    else if (targetType === "PARENTS") recipientDescription = "All Active Parents";
    else if (targetType === "INACTIVE_24H") recipientDescription = "Users Inactive for > 24 Hours";
    else if (targetType === "ROLE") recipientDescription = `All Users with Role: ${targetRole}`;
    else if (targetType === "CLASS") {
      const cls = classes.find(c => c.id === targetClassId);
      recipientDescription = cls ? `Class ${cls.name} (${cls.section}) Parents & Teachers` : "Selected Class";
    } else if (targetType === "USER") {
      const usr = users.find(u => u.id === targetUserId);
      recipientDescription = usr ? `Individual: ${usr.name} (${usr.role})` : "Selected User";
    }

    setPendingNotif({
      title,
      content,
      targetType,
      targetRole,
      targetClassId,
      targetUserId,
      type,
      category,
      priority,
      link,
      scheduleDateTime,
      recipientDescription,
    });

    setShowCreate(false);
    setShowConfirm(true);
  };

  // Step 2: Confirm and Dispatch
  const handleFinalSubmit = async () => {
    if (!pendingNotif) return;
    setIsSubmitting(true);

    const formData = new FormData();
    formData.append("title", pendingNotif.title);
    formData.append("content", pendingNotif.content);
    formData.append("targetType", pendingNotif.targetType);
    if (pendingNotif.targetRole) formData.append("targetRole", pendingNotif.targetRole);
    if (pendingNotif.targetClassId) formData.append("targetClassId", pendingNotif.targetClassId);
    if (pendingNotif.targetUserId) formData.append("targetUserId", pendingNotif.targetUserId);
    formData.append("type", pendingNotif.type);
    formData.append("category", pendingNotif.category);
    formData.append("priority", pendingNotif.priority);
    formData.append("link", pendingNotif.link);
    if (pendingNotif.scheduleDateTime) formData.append("scheduleDateTime", pendingNotif.scheduleDateTime);

    const res = await createCustomNotificationAction(formData);
    setIsSubmitting(false);

    if (res.error) {
      alert(res.error);
    } else {
      alert(`✅ Success! Notification created for ${res.count || 1} recipient(s). Push notifications sent: ${res.pushSent || 0}`);
      setShowConfirm(false);
      setPendingNotif(null);
      // Reset form
      setTitle("");
      setContent("");
      setScheduleDateTime("");
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

        {/* Broadcast Notification Action */}
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <button
            onClick={() => setShowCreate(true)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              padding: "0.6rem 1.25rem",
              background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
              color: "#ffffff",
              border: "none",
              borderRadius: "8px",
              cursor: "pointer",
              fontSize: "0.875rem",
              fontWeight: 600,
              boxShadow: "0 2px 8px rgba(37, 99, 235, 0.35)"
            }}
          >
            <Plus size={16} /> Broadcast Notification
          </button>
        </div>
      </div>

      {/* MODAL 1: Create Notification Form */}
      {showCreate && (
        <div 
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.65)",
            backdropFilter: "blur(6px)",
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
              background: "var(--card-bg, #0f172a)",
              borderRadius: "18px",
              border: "1px solid var(--border-color)",
              padding: "clamp(1.2rem, 2.5vw, 2rem)",
              maxWidth: "620px",
              width: "100%",
              boxShadow: "0 20px 50px rgba(0,0,0,0.5)",
              maxHeight: "92vh",
              overflowY: "auto"
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                <Megaphone size={22} color="var(--primary)" />
                <h2 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 700 }}>Dispatch Notification</h2>
              </div>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--text-secondary)" }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handlePreSubmit} style={{ display: "flex", flexDirection: "column", gap: "1.1rem" }}>
              {/* Target Audience */}
              <div>
                <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.35rem" }}>
                  Target Audience *
                </label>
                <select
                  value={targetType}
                  onChange={(e) => setTargetType(e.target.value)}
                  style={{ width: "100%", padding: "0.75rem", borderRadius: "8px", border: "1px solid var(--border-color)", background: "var(--input-bg, transparent)", color: "inherit" }}
                >
                  <option value="ALL">All Registered Users (Broadcast to Everyone)</option>
                  <option value="ROLE">Selected Role (Teachers, Parents, Staff, Admin)</option>
                  <option value="TEACHERS">All Teachers Only</option>
                  <option value="PARENTS">All Parents Only</option>
                  <option value="INACTIVE_24H">Inactive Users (&gt; 24h Since Last Login)</option>
                  <option value="CLASS">Specific Class (Parents &amp; Teachers)</option>
                  <option value="USER">Individual Specific User</option>
                </select>
              </div>

              {/* Conditional: Select Role */}
              {targetType === "ROLE" && (
                <div>
                  <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.35rem" }}>Select Role *</label>
                  <select
                    value={targetRole}
                    onChange={(e) => setTargetRole(e.target.value)}
                    style={{ width: "100%", padding: "0.75rem", borderRadius: "8px", border: "1px solid var(--border-color)", background: "var(--input-bg, transparent)", color: "inherit" }}
                  >
                    <option value="TEACHER">Teachers</option>
                    <option value="PARENT">Parents</option>
                    <option value="STAFF">Staff / Bus In-Charge</option>
                    <option value="ADMIN">Administrators</option>
                  </select>
                </div>
              )}

              {/* Conditional: Select Class */}
              {targetType === "CLASS" && (
                <div>
                  <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.35rem" }}>Select Class *</label>
                  <select
                    value={targetClassId}
                    onChange={(e) => setTargetClassId(e.target.value)}
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
                    value={targetUserId}
                    onChange={(e) => setTargetUserId(e.target.value)}
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

              {/* Category & Priority Row */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.35rem" }}>Category</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    style={{ width: "100%", padding: "0.75rem", borderRadius: "8px", border: "1px solid var(--border-color)", background: "var(--input-bg, transparent)", color: "inherit" }}
                  >
                    <option value="general">General Announcements</option>
                    <option value="academic">Academic &amp; Marks Updates</option>
                    <option value="alerts">Important Emergency Alerts</option>
                    <option value="account">Account &amp; Security</option>
                    <option value="admin">Administrative Notices</option>
                    <option value="maintenance">System Maintenance</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.35rem" }}>Priority</label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as "NORMAL" | "URGENT")}
                    style={{ width: "100%", padding: "0.75rem", borderRadius: "8px", border: "1px solid var(--border-color)", background: "var(--input-bg, transparent)", color: "inherit" }}
                  >
                    <option value="NORMAL">Normal Priority</option>
                    <option value="URGENT">🚨 URGENT (Immediate Alert)</option>
                  </select>
                </div>
              </div>

              {/* Title */}
              <div>
                <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.35rem" }}>
                  Notification Title *
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  placeholder="e.g. Annual Sports Meet Notice or Exam Schedule Update"
                  style={{ width: "100%", padding: "0.75rem", borderRadius: "8px", border: "1px solid var(--border-color)", background: "var(--input-bg, transparent)", color: "inherit" }}
                />
              </div>

              {/* Message Content */}
              <div>
                <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.35rem" }}>
                  Message Content *
                </label>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  required
                  rows={4}
                  placeholder="Type the message to be displayed on device lock screens and dashboard notification centers..."
                  style={{ width: "100%", padding: "0.75rem", borderRadius: "8px", border: "1px solid var(--border-color)", background: "var(--input-bg, transparent)", color: "inherit", resize: "vertical" }}
                />
              </div>

              {/* Action URL & Schedule Row */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.35rem" }}>
                    Action Link (Click URL)
                  </label>
                  <input
                    type="text"
                    value={link}
                    onChange={(e) => setLink(e.target.value)}
                    placeholder="/dashboard or custom URL"
                    style={{ width: "100%", padding: "0.75rem", borderRadius: "8px", border: "1px solid var(--border-color)", background: "var(--input-bg, transparent)", color: "inherit" }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.35rem" }}>
                    Schedule (Optional)
                  </label>
                  <input
                    type="datetime-local"
                    value={scheduleDateTime}
                    onChange={(e) => setScheduleDateTime(e.target.value)}
                    style={{ width: "100%", padding: "0.75rem", borderRadius: "8px", border: "1px solid var(--border-color)", background: "var(--input-bg, transparent)", color: "inherit" }}
                  />
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "0.5rem" }}>
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  style={{ padding: "0.65rem 1.25rem", borderRadius: "8px", border: "1px solid var(--border-color)", background: "transparent", color: "inherit", cursor: "pointer" }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{ display: "flex", alignItems: "center", gap: "0.4rem", padding: "0.65rem 1.5rem", borderRadius: "8px", border: "none", background: "linear-gradient(135deg, #2563eb, #1d4ed8)", color: "#ffffff", cursor: "pointer", fontWeight: 600 }}
                >
                  Preview &amp; Confirm <Send size={14} />
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Confirmation Screen Before Dispatch */}
      {showConfirm && pendingNotif && (
        <div 
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.75)",
            backdropFilter: "blur(6px)",
            zIndex: 1001,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1rem"
          }}
        >
          <div
            style={{
              background: "var(--card-bg, #0f172a)",
              borderRadius: "18px",
              border: "1px solid rgba(255, 255, 255, 0.15)",
              padding: "24px",
              maxWidth: "520px",
              width: "100%",
              boxShadow: "0 25px 60px rgba(0,0,0,0.6)",
              display: "flex",
              flexDirection: "column",
              gap: "16px"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div style={{ width: "40px", height: "40px", borderRadius: "10px", background: "rgba(37, 99, 235, 0.15)", color: "#3b82f6", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Megaphone size={20} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700 }}>Confirm Notification Dispatch</h3>
                <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                  Review audience and details before broadcasting to devices
                </p>
              </div>
            </div>

            <div style={{ background: "rgba(255, 255, 255, 0.04)", borderRadius: "12px", padding: "14px", border: "1px solid var(--border-color)", display: "flex", flexDirection: "column", gap: "10px", fontSize: "0.85rem" }}>
              <div>
                <span style={{ color: "var(--text-secondary)" }}>Target Audience:</span>{" "}
                <strong>{pendingNotif.recipientDescription}</strong>
              </div>
              <div>
                <span style={{ color: "var(--text-secondary)" }}>Category &amp; Priority:</span>{" "}
                <span style={{ textTransform: "uppercase", fontWeight: 600 }}>{pendingNotif.category}</span>
                {pendingNotif.priority === "URGENT" && (
                  <span style={{ marginLeft: 8, background: "#ef4444", color: "#ffffff", padding: "2px 8px", borderRadius: "12px", fontSize: "0.72rem", fontWeight: 700 }}>
                    URGENT
                  </span>
                )}
              </div>
              <div>
                <span style={{ color: "var(--text-secondary)" }}>Title:</span>{" "}
                <strong>{pendingNotif.title}</strong>
              </div>
              <div>
                <span style={{ color: "var(--text-secondary)" }}>Message:</span>
                <p style={{ margin: "4px 0 0 0", fontStyle: "italic", color: "var(--foreground)" }}>
                  &ldquo;{pendingNotif.content}&rdquo;
                </p>
              </div>
              {pendingNotif.scheduleDateTime && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#f59e0b" }}>
                  <Calendar size={14} /> Scheduled for: {new Date(pendingNotif.scheduleDateTime).toLocaleString()}
                </div>
              )}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "8px" }}>
              <button
                type="button"
                onClick={() => { setShowConfirm(false); setShowCreate(true); }}
                style={{ padding: "10px 16px", borderRadius: "10px", border: "1px solid var(--border-color)", background: "transparent", color: "inherit", cursor: "pointer", fontSize: "0.85rem" }}
              >
                Back &amp; Edit
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleFinalSubmit}
                style={{
                  padding: "10px 20px",
                  borderRadius: "10px",
                  border: "none",
                  background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
                  color: "#ffffff",
                  cursor: isSubmitting ? "not-allowed" : "pointer",
                  fontWeight: 600,
                  fontSize: "0.88rem",
                  boxShadow: "0 4px 14px rgba(37, 99, 235, 0.4)"
                }}
              >
                {isSubmitting ? "Broadcasting..." : "Confirm & Send"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filter Tabs */}
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

      {/* Notifications Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 340px), 1fr))", gap: "1.25rem", width: "100%", minWidth: 0 }}>
        {filteredNotifications.map(notif => (
          <div key={notif.id} style={{ background: "var(--card-bg)", borderRadius: "14px", border: `1px solid ${!notif.isRead ? "var(--primary)" : "var(--border-color)"}`, padding: "1.25rem", display: "flex", flexDirection: "column", gap: "1rem", minWidth: 0, width: "100%", boxSizing: "border-box" }}>
            
            <div style={{ display: "flex", gap: "0.85rem", alignItems: "flex-start", minWidth: 0 }}>
              <div style={{ padding: "0.5rem", background: "rgba(0,0,0,0.03)", borderRadius: "8px", flexShrink: 0 }}>
                {getTypeIcon(notif.type)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 600 }}>{notif.title}</h3>
                  {notif.priority === "URGENT" && (
                    <span style={{ background: "#ef4444", color: "#ffffff", padding: "1px 6px", borderRadius: "10px", fontSize: "0.65rem", fontWeight: 700 }}>
                      URGENT
                    </span>
                  )}
                  {notif.category && (
                    <span style={{ background: "rgba(99, 102, 241, 0.12)", color: "var(--primary)", padding: "1px 6px", borderRadius: "10px", fontSize: "0.65rem", fontWeight: 600 }}>
                      {notif.category}
                    </span>
                  )}
                </div>
                <p style={{ margin: "0.5rem 0 0 0", fontSize: "0.875rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                  {getNotificationDisplayText(notif.content)}
                </p>
                {notif.link && notif.link !== "/dashboard" && (
                  <a
                    href={notif.link}
                    style={{ display: "inline-flex", alignItems: "center", gap: 4, marginTop: 6, fontSize: "0.75rem", color: "#60a5fa", textDecoration: "none" }}
                  >
                    Target Link <ExternalLink size={11} />
                  </a>
                )}
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
                  flexShrink: 0
                }}
                title="Delete notification"
              >
                <Trash2 size={16} />
              </button>
            </div>

            <div style={{ marginTop: "auto", paddingTop: "0.85rem", borderTop: "1px solid var(--border-color)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                <span style={{ fontWeight: 600, color: "var(--foreground)" }}>To: {notif.user.name}</span>
              </div>
              
              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                <button
                  type="button"
                  onClick={() => handleRetryFailed(notif.id)}
                  disabled={retryingId === notif.id}
                  style={{
                    background: "transparent",
                    border: "1px solid var(--border-color)",
                    color: "var(--text-secondary)",
                    padding: "3px 8px",
                    borderRadius: "6px",
                    cursor: "pointer",
                    fontSize: "0.7rem",
                    display: "flex",
                    alignItems: "center",
                    gap: 3
                  }}
                  title="Retry failed push deliveries"
                >
                  <RotateCcw size={11} /> {retryingId === notif.id ? "Retrying..." : "Retry Push"}
                </button>

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
            <p style={{ fontSize: "0.875rem", opacity: 0.8 }}>Notifications created or received will appear in your saved history.</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
