"use client";

import { useState } from "react";
import { createTeacherAnnouncementAction } from "./actions";

export default function CreateAnnouncementForm({ classes }: { classes: { id: string, name: string, section: string }[] }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{ text: string, type: "success" | "error" } | null>(null);
  const [targetType, setTargetType] = useState("CLASS");

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    setMessage(null);

    const formData = new FormData(e.currentTarget);
    const result = await createTeacherAnnouncementAction(formData);

    if (result.success) {
      setMessage({ text: "Announcement posted successfully!", type: "success" });
      (e.target as HTMLFormElement).reset();
    } else {
      setMessage({ text: result.error || "Failed to post announcement", type: "error" });
    }
    
    setIsSubmitting(false);
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {message && (
        <div style={{ padding: '0.75rem', borderRadius: '8px', background: message.type === 'success' ? 'var(--success-bg)' : 'var(--danger-bg)', color: message.type === 'success' ? "var(--success)" : "var(--danger)" }}>
          {message.text}
        </div>
      )}

      <div>
        <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>Announcement Title *</label>
        <input required name="title" type="text" placeholder="e.g. Field Trip Tomorrow" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'transparent' }} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        <div>
          <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>Target Audience *</label>
          <select 
            required 
            name="targetType" 
            value={targetType}
            onChange={(e) => setTargetType(e.target.value)}
            style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'transparent' }}
          >
            <option value="CLASS">Specific Class</option>
            <option value="PARENTS">All Parents (My Classes)</option>
          </select>
        </div>

        {targetType === "CLASS" && (
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>Select Class *</label>
            <select required name="targetId" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'transparent' }}>
              <option value="">-- Choose a class --</option>
              {classes.map(c => (
                <option key={c.id} value={c.id}>{c.name} - {c.section}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div>
        <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>Priority *</label>
        <select required name="priority" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'transparent' }}>
          <option value="NORMAL">Normal</option>
          <option value="HIGH">High</option>
        </select>
      </div>

      <div>
        <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>Content *</label>
        <textarea required name="content" rows={4} placeholder="Write your announcement here..." style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'transparent' }} />
      </div>

      <button 
        type="submit" 
        disabled={isSubmitting}
        style={{ padding: '0.75rem', backgroundColor: "var(--primary)", color: "var(--primary-fg)", border: 'none', borderRadius: '8px', fontWeight: 500, cursor: isSubmitting ? 'not-allowed' : 'pointer' }}
      >
        {isSubmitting ? "Posting..." : "Post Announcement"}
      </button>
    </form>
  );
}
