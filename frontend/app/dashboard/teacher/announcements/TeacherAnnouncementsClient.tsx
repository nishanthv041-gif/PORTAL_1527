"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Megaphone, Clock, AlertCircle, Link as LinkIcon, Edit2, Trash2, BookOpen, Users, GraduationCap } from "lucide-react";
import { Announcement, Class } from "@prisma/client";
import { createTeacherAnnouncementAction } from "@/backend/api/actions/dashboard/teacher/announcements/actions";

export default function TeacherAnnouncementsClient({
  announcements,
  classes,
  currentUserId,
}: {
  announcements: Announcement[];
  classes: Class[];
  currentUserId: string;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingAnnouncement, setEditingAnnouncement] = useState<Announcement | null>(null);
  const [targetType, setTargetType] = useState("CLASS");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const router = useRouter();

  const handleEditClick = (announcement: Announcement) => {
    setEditingId(announcement.id);
    setEditingAnnouncement(announcement);
    setTargetType(announcement.targetType);
    setMessage(null);
  };

  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to delete this announcement?")) {
      const res = await fetch(`/api/announcements/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const errorData = await res.json();
        alert(errorData.error || "Failed to delete announcement");
      } else {
        router.refresh();
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    setMessage(null);

    const formData = new FormData(e.currentTarget);

    if (editingId) {
      const res = await fetch(`/api/announcements/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: formData.get("title"),
          content: formData.get("content"),
          targetType: formData.get("targetType"),
          targetId: formData.get("targetId"),
          priority: formData.get("priority"),
          expiryDate: formData.get("expiryDate") || null,
        }),
      });
      setIsSubmitting(false);
      if (!res.ok) {
        const errorData = await res.json();
        setMessage({ text: errorData.error || "Failed to update announcement", type: "error" });
      } else {
        setMessage({ text: "Announcement updated successfully!", type: "success" });
        setEditingId(null);
        setEditingAnnouncement(null);
        e.currentTarget.reset();
        setTargetType("CLASS");
        router.refresh();
      }
    } else {
      const result = await createTeacherAnnouncementAction(formData);
      setIsSubmitting(false);
      if (result.success) {
        setMessage({ text: "Announcement posted successfully!", type: "success" });
        e.currentTarget.reset();
        setTargetType("CLASS");
      } else {
        setMessage({ text: result.error || "Failed to post announcement", type: "error" });
      }
    }
  };

  const getTargetIcon = (type: string) => {
    switch (type) {
      case "CLASS": return <BookOpen size={16} />;
      case "PARENTS": return <Users size={16} />;
      case "TEACHERS": return <GraduationCap size={16} />;
      default: return <Megaphone size={16} />;
    }
  };

  const getTargetLabel = (type: string, targetId: string | null) => {
    if (type === "CLASS" && targetId) {
      const cls = classes.find(c => c.id === targetId);
      return cls ? `Class: ${cls.name}-${cls.section}` : "Specific Class";
    }
    return type === "TEACHERS" ? "All Teachers" : type === "PARENTS" ? "All Parents" : "School Wide";
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "2rem" }} className="chartsContainer">
      <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem", background: "var(--card-bg)", padding: "1.5rem", borderRadius: "12px", border: "1px solid var(--border-color)" }}>
        <h3 style={{ fontSize: "1.25rem", fontWeight: 600, margin: 0 }}>School Announcements</h3>
        
        {announcements.map((announcement) => {
          const isExpired = announcement.expiryDate && new Date(announcement.expiryDate) < new Date();
          if (isExpired && announcement.authorId !== currentUserId) return null; // Hide expired unless they are the author

          return (
            <div key={announcement.id} style={{ background: "var(--background)", borderRadius: "12px", border: "1px solid var(--border-color)", display: "flex", flexDirection: "column", padding: "1.5rem", opacity: isExpired ? 0.6 : 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                  <h3 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 600, display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    {announcement.title}
                  </h3>
                  {announcement.priority === "HIGH" && (
                    <span style={{ fontSize: "0.65rem", fontWeight: 700, background: "var(--danger)", color: "var(--danger-fg)", padding: "0.2rem 0.5rem", borderRadius: "12px", textTransform: "uppercase" }}>High Priority</span>
                  )}
                  {isExpired && (
                    <span style={{ fontSize: "0.65rem", fontWeight: 700, background: "var(--text-secondary)", color: "var(--primary-fg)", padding: "0.2rem 0.5rem", borderRadius: "12px", textTransform: "uppercase" }}>Expired</span>
                  )}
                </div>
                <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.25rem", fontSize: "0.75rem", fontWeight: 600, color: "var(--primary)", background: "var(--primary-bg)", padding: "0.25rem 0.75rem", borderRadius: "12px" }}>
                    {getTargetIcon(announcement.targetType)}
                    {getTargetLabel(announcement.targetType, announcement.targetId)}
                  </div>
                  {announcement.authorId === currentUserId && (
                    <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                      <button onClick={() => {
                        handleEditClick(announcement);
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }} style={{ background: "transparent", border: "none", color: "inherit", opacity: 0.7, cursor: "pointer", padding: 0 }}>
                        <Edit2 size={16} />
                      </button>
                      <button onClick={() => handleDelete(announcement.id)} style={{ background: "transparent", border: "none", color: "var(--danger)", cursor: "pointer", padding: 0 }}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <p style={{ margin: "0 0 1.5rem 0", fontSize: "0.875rem", lineHeight: 1.6, color: "var(--text-secondary)", whiteSpace: "pre-wrap" }}>
                {announcement.content}
              </p>

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "auto", borderTop: "1px solid var(--border-color)", paddingTop: "1rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                    <Clock size={14} /> Published on {new Date(announcement.createdAt).toLocaleString()}
                  </div>
                  {announcement.expiryDate && (
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                      <AlertCircle size={14} /> Expires: {new Date(announcement.expiryDate).toLocaleDateString()}
                    </div>
                  )}
                </div>
                {announcement.fileUrl && (
                  <a href={announcement.fileUrl} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.75rem", fontWeight: 600, color: "var(--primary)", textDecoration: "none" }}>
                    <LinkIcon size={14} /> View Attachment
                  </a>
                )}
              </div>
            </div>
          );
        })}
        {announcements.length === 0 && (
          <div style={{ textAlign: "center", padding: "4rem", color: "var(--text-secondary)", background: "var(--background)", borderRadius: "12px", border: "1px solid var(--border-color)" }}>
            <Megaphone size={48} style={{ opacity: 0.2, margin: "0 auto 1rem", color: "var(--primary)" }} />
            <p>No active announcements found.</p>
          </div>
        )}
      </div>

      <div style={{ background: "var(--card-bg)", padding: "1.5rem", borderRadius: "12px", border: "1px solid var(--border-color)" }}>
        <h3 style={{ fontSize: "1.25rem", fontWeight: 600, margin: "0 0 1.5rem 0" }}>
          {editingId ? "Edit Announcement" : "Post an Announcement"}
        </h3>
        {editingId && (
          <button
            onClick={() => {
              setEditingId(null);
              setEditingAnnouncement(null);
              setTargetType("CLASS");
              setMessage(null);
            }}
            style={{ marginBottom: "1rem", background: "transparent", border: "none", color: "var(--primary)", cursor: "pointer", fontWeight: 500, fontSize: "0.875rem" }}
          >
            ← Cancel Edit & Create New
          </button>
        )}
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {message && (
            <div style={{ padding: "0.75rem", borderRadius: "8px", background: message.type === "success" ? "rgba(16, 185, 129, 0.1)" : "var(--danger-bg)", color: message.type === "success" ? "var(--success)" : "var(--danger)" }}>
              {message.text}
            </div>
          )}

          <div>
            <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 500, marginBottom: "0.25rem" }}>Announcement Title *</label>
            <input required name="title" defaultValue={editingAnnouncement?.title || ""} type="text" placeholder="e.g. Field Trip Tomorrow" style={{ width: "100%", padding: "0.75rem", borderRadius: "8px", border: "1px solid var(--border-color)", background: "transparent" }} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            <div>
              <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 500, marginBottom: "0.25rem" }}>Target Audience *</label>
              <select
                required
                name="targetType"
                value={targetType}
                onChange={(e) => setTargetType(e.target.value)}
                style={{ width: "100%", padding: "0.75rem", borderRadius: "8px", border: "1px solid var(--border-color)", background: "transparent" }}
              >
                <option value="CLASS">Specific Class</option>
                <option value="PARENTS">All Parents (My Classes)</option>
              </select>
            </div>

            {targetType === "CLASS" && (
              <div>
                <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 500, marginBottom: "0.25rem" }}>Select Class *</label>
                <select required name="targetId" defaultValue={editingAnnouncement?.targetId || ""} style={{ width: "100%", padding: "0.75rem", borderRadius: "8px", border: "1px solid var(--border-color)", background: "transparent" }}>
                  <option value="">-- Choose a class --</option>
                  {classes.map(c => (
                    <option key={c.id} value={c.id}>{c.name} - {c.section}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div>
            <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 500, marginBottom: "0.25rem" }}>Priority *</label>
            <select required name="priority" defaultValue={editingAnnouncement?.priority || "NORMAL"} style={{ width: "100%", padding: "0.75rem", borderRadius: "8px", border: "1px solid var(--border-color)", background: "transparent" }}>
              <option value="NORMAL">Normal</option>
              <option value="HIGH">High</option>
            </select>
          </div>
          
          <div>
            <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 500, marginBottom: "0.25rem" }}>Expiry Date (Optional)</label>
            <input name="expiryDate" defaultValue={editingAnnouncement?.expiryDate ? new Date(editingAnnouncement.expiryDate).toISOString().split("T")[0] : ""} type="date" style={{ width: "100%", padding: "0.75rem", borderRadius: "8px", border: "1px solid var(--border-color)", background: "transparent", color: "var(--foreground)" }} />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 500, marginBottom: "0.25rem" }}>Content *</label>
            <textarea required name="content" defaultValue={editingAnnouncement?.content || ""} rows={4} placeholder="Write your announcement here..." style={{ width: "100%", padding: "0.75rem", borderRadius: "8px", border: "1px solid var(--border-color)", background: "transparent" }} />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            style={{ padding: "0.75rem", backgroundColor: "var(--primary)", color: "var(--primary-fg)", border: "none", borderRadius: "8px", fontWeight: 500, cursor: isSubmitting ? "not-allowed" : "pointer" }}
          >
            {isSubmitting ? (editingId ? "Updating..." : "Posting...") : (editingId ? "Update Announcement" : "Post Announcement")}
          </button>
        </form>
      </div>
    </div>
  );
}
