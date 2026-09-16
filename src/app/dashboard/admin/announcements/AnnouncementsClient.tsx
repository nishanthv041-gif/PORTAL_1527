"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Megaphone, Clock, Trash2, Users, BookOpen, GraduationCap, Link as LinkIcon, AlertCircle, Edit2 } from "lucide-react";
import { createAnnouncementAction, deleteAnnouncementAction } from "@/backend/actions/dashboard/admin/announcements/actions";
import { Announcement, Class } from "@prisma/client";

export default function AnnouncementsClient({ announcements, classes }: { announcements: Announcement[], classes: Class[] }) {
  const [activeTab, setActiveTab] = useState<"TEACHER" | "PARENT">("TEACHER");
  const [showCreate, setShowCreate] = useState(false);
  const [targetType, setTargetType] = useState("ALL");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingAnnouncement, setEditingAnnouncement] = useState<Announcement | null>(null);
  const router = useRouter();

  const handleEditClick = (announcement: Announcement) => {
    setEditingId(announcement.id);
    setEditingAnnouncement(announcement);
    setTargetType(announcement.targetType);
    setShowCreate(true);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    const formData = new FormData(e.currentTarget);
    
    // Automatically set targetType based on tab if not explicitly set
    if (activeTab === "TEACHER" && formData.get("targetType") === "ALL") {
      formData.set("targetType", "TEACHERS");
    } else if (activeTab === "PARENT" && formData.get("targetType") === "ALL") {
      formData.set("targetType", "PARENTS");
    }

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
        alert(errorData.error || "Failed to update announcement");
      } else {
        setShowCreate(false);
        setEditingId(null);
        setEditingAnnouncement(null);
        e.currentTarget.reset();
        setTargetType("ALL");
        router.refresh();
      }
    } else {
      const res = await createAnnouncementAction(formData);
      setIsSubmitting(false);
      if (res.error) {
        alert(res.error);
      } else {
        setShowCreate(false);
        e.currentTarget.reset();
        setTargetType("ALL");
      }
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to delete this announcement?")) {
      const res = await deleteAnnouncementAction(id);
      if (res.error) alert(res.error);
    }
  };

  const getTargetIcon = (type: string) => {
    switch (type) {
      case 'CLASS': return <BookOpen size={16} />;
      case 'PARENTS': return <Users size={16} />;
      case 'TEACHERS': return <GraduationCap size={16} />;
      default: return <Megaphone size={16} />;
    }
  };

  const getTargetLabel = (type: string, targetId: string | null) => {
    if (type === 'CLASS' && targetId) {
      const cls = classes.find(c => c.id === targetId);
      return cls ? `Class: ${cls.name}-${cls.section}` : 'Specific Class';
    }
    return type === 'TEACHERS' ? 'All Teachers' : type === 'PARENTS' ? 'All Parents' : 'School Wide';
  };

  const filteredAnnouncements = announcements.filter(a => {
    if (activeTab === "TEACHER") {
      return a.targetType === "TEACHERS" || a.targetType === "ALL";
    } else {
      return a.targetType === "PARENTS" || a.targetType === "CLASS" || a.targetType === "ALL";
    }
  });

  return (
    <div>
      <div style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid var(--border-color)', marginBottom: '2rem' }}>
        <button
          onClick={() => { setActiveTab("TEACHER"); setShowCreate(false); }}
          style={{
            padding: '0.75rem 1.5rem',
            background: 'transparent',
            border: 'none',
            borderBottom: activeTab === "TEACHER" ? '2px solid var(--primary)' : '2px solid transparent',
            color: activeTab === "TEACHER" ? 'var(--primary)' : 'var(--text-secondary)',
            fontWeight: 600,
            cursor: 'pointer'
          }}
        >
          Teacher Announcements
        </button>
        <button
          onClick={() => { setActiveTab("PARENT"); setShowCreate(false); }}
          style={{
            padding: '0.75rem 1.5rem',
            background: 'transparent',
            border: 'none',
            borderBottom: activeTab === "PARENT" ? '2px solid var(--primary)' : '2px solid transparent',
            color: activeTab === "PARENT" ? 'var(--primary)' : 'var(--text-secondary)',
            fontWeight: 600,
            cursor: 'pointer'
          }}
        >
          Parent Announcements
        </button>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '2rem' }}>
        <button 
          onClick={() => {
            setShowCreate(!showCreate);
            if (showCreate) {
              setEditingId(null);
              setEditingAnnouncement(null);
              setTargetType("ALL");
            }
          }}
          style={{ padding: '0.75rem 1.5rem', backgroundColor: "var(--primary)", color: "var(--primary-fg)", border: 'none', borderRadius: '8px', fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
        >
          {showCreate ? "Cancel" : <><Plus size={18} /> New {activeTab === "TEACHER" ? "Teacher" : "Parent"} Announcement</>}
        </button>
      </div>

      {showCreate && (
        <div style={{ background: 'var(--card-bg)', borderRadius: '12px', padding: '2rem', border: '1px solid var(--border-color)', marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1.5rem' }}>
            {editingId ? "Edit" : "Create"} {activeTab === "TEACHER" ? "Teacher" : "Parent"} Announcement
          </h2>
          <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1.5rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>Title *</label>
              <input required name="title" defaultValue={editingAnnouncement?.title || ""} type="text" placeholder="Announcement subject..." style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent' }} />
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1.5rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>Target Audience *</label>
                <select 
                  required 
                  name="targetType" 
                  value={targetType}
                  onChange={(e) => setTargetType(e.target.value)}
                  style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent' }}
                >
                  {activeTab === "TEACHER" ? (
                    <>
                      <option value="TEACHERS">All Teachers</option>
                      <option value="ALL">Entire School (Teachers & Parents)</option>
                    </>
                  ) : (
                    <>
                      <option value="PARENTS">All Parents</option>
                      <option value="CLASS">Specific Class</option>
                      <option value="ALL">Entire School (Teachers & Parents)</option>
                    </>
                  )}
                </select>
              </div>
              
                {targetType === "CLASS" && (
                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>Select Class *</label>
                  <select required name="targetId" defaultValue={editingAnnouncement?.targetId || ""} style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent' }}>
                    <option value="">-- Choose Class --</option>
                    {classes.map(c => (
                      <option key={c.id} value={c.id}>{c.name} - {c.section}</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>Priority</label>
                <select name="priority" defaultValue={editingAnnouncement?.priority || "NORMAL"} style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent' }}>
                  <option value="LOW">Low</option>
                  <option value="NORMAL">Normal</option>
                  <option value="HIGH">High</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>Expiry Date (Optional)</label>
                <input name="expiryDate" defaultValue={editingAnnouncement?.expiryDate ? new Date(editingAnnouncement.expiryDate).toISOString().split('T')[0] : ""} type="date" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--foreground)' }} />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>Message Content *</label>
              <textarea required name="content" defaultValue={editingAnnouncement?.content || ""} rows={5} placeholder="Write your announcement here..." style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent', resize: 'vertical' }} />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>Attachment URL (Optional)</label>
              <input name="fileUrl" type="url" defaultValue={editingAnnouncement?.fileUrl || ""} placeholder="https://..." style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent' }} />
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
              <button disabled={isSubmitting} type="submit" style={{ padding: '0.75rem 2rem', backgroundColor: "var(--success)", color: "var(--success-fg)", border: 'none', borderRadius: '8px', fontWeight: 500, cursor: isSubmitting ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Megaphone size={18} /> {isSubmitting ? (editingId ? "Updating..." : "Publishing...") : (editingId ? "Update Announcement" : "Publish Announcement")}
              </button>
            </div>
          </form>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {filteredAnnouncements.map(announcement => {
          const isExpired = announcement.expiryDate && new Date(announcement.expiryDate) < new Date();
          return (
            <div key={announcement.id} style={{ background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', padding: '1.5rem', opacity: isExpired ? 0.6 : 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {announcement.title}
                  </h3>
                  {announcement.priority === 'HIGH' && (
                    <span style={{ fontSize: '0.65rem', fontWeight: 700, background: "var(--danger)", color: "var(--danger-fg)", padding: '0.2rem 0.5rem', borderRadius: '12px', textTransform: 'uppercase' }}>High Priority</span>
                  )}
                  {isExpired && (
                    <span style={{ fontSize: '0.65rem', fontWeight: 700, background: "var(--text-secondary)", color: "var(--primary-fg)", padding: '0.2rem 0.5rem', borderRadius: '12px', textTransform: 'uppercase' }}>Expired</span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', fontWeight: 600, color: 'var(--primary)', background: 'var(--primary-bg)', padding: '0.25rem 0.75rem', borderRadius: '12px' }}>
                    {getTargetIcon(announcement.targetType)}
                    {getTargetLabel(announcement.targetType, announcement.targetId)}
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <button onClick={() => {
                      handleEditClick(announcement);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }} style={{ background: 'transparent', border: 'none', color: "inherit", opacity: 0.7, cursor: 'pointer', padding: 0 }}>
                      <Edit2 size={16} />
                    </button>
                    <button onClick={() => handleDelete(announcement.id)} style={{ background: 'transparent', border: 'none', color: "var(--danger)", cursor: 'pointer', padding: 0 }}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
              
              <p style={{ margin: '0 0 1.5rem 0', fontSize: '0.875rem', lineHeight: 1.6, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>
                {announcement.content}
              </p>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto', borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    <Clock size={14} /> Published on {new Date(announcement.createdAt).toLocaleString()}
                  </div>
                  {announcement.expiryDate && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', color: isExpired ? "var(--danger)" : 'var(--text-secondary)' }}>
                      <AlertCircle size={14} /> Expires: {new Date(announcement.expiryDate).toLocaleDateString()}
                    </div>
                  )}
                </div>
                
                {announcement.fileUrl && (
                  <a href={announcement.fileUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', fontWeight: 600, color: 'var(--primary)', textDecoration: 'none' }}>
                    <LinkIcon size={14} /> View Attachment
                  </a>
                )}
              </div>
            </div>
          );
        })}
        {filteredAnnouncements.length === 0 && (
          <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-secondary)', background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
            <Megaphone size={48} style={{ opacity: 0.2, margin: '0 auto 1rem', color: 'var(--primary)' }} />
            <p>No {activeTab === "TEACHER" ? "teacher" : "parent"} announcements found.</p>
          </div>
        )}
      </div>
    </div>
  );
}
