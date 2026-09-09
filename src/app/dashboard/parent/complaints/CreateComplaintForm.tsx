"use client";

import { useState } from "react";
import { submitComplaintAction } from "./actions";

export default function CreateComplaintForm({ studentId, teacherId }: { studentId: string, teacherId: string }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{ text: string, type: "success" | "error" } | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    setMessage(null);

    const formData = new FormData(e.currentTarget);
    formData.append("studentId", studentId);
    formData.append("teacherId", teacherId);
    
    const result = await submitComplaintAction(formData);

    if (result.success) {
      setMessage({ text: "Complaint submitted successfully!", type: "success" });
      (e.target as HTMLFormElement).reset();
    } else {
      setMessage({ text: result.error || "Failed to submit complaint", type: "error" });
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
        <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>Subject / Title *</label>
        <input required name="title" type="text" placeholder="Brief summary of the issue" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'transparent' }} />
      </div>

      <div>
        <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>Description *</label>
        <textarea required name="description" rows={5} placeholder="Provide detailed information about the complaint..." style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'transparent' }} />
      </div>

      <button 
        type="submit" 
        disabled={isSubmitting}
        style={{ padding: '0.75rem', backgroundColor: "var(--primary)", color: "var(--primary-fg)", border: 'none', borderRadius: '8px', fontWeight: 500, cursor: isSubmitting ? 'not-allowed' : 'pointer' }}
      >
        {isSubmitting ? "Submitting..." : "Submit Complaint"}
      </button>
    </form>
  );
}
