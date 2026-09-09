"use client";

import { useState } from "react";
import { applyLeaveAction } from "./actions";

export default function ApplyLeaveForm({ studentId }: { studentId: string }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{ text: string, type: "success" | "error" } | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    setMessage(null);

    const formData = new FormData(e.currentTarget);
    formData.append("studentId", studentId);
    
    const result = await applyLeaveAction(formData);

    if (result.success) {
      setMessage({ text: "Leave request submitted successfully!", type: "success" });
      (e.target as HTMLFormElement).reset();
    } else {
      setMessage({ text: result.error || "Failed to submit request", type: "error" });
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

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        <div>
          <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>Start Date *</label>
          <input required name="startDate" type="date" min={new Date().toISOString().split('T')[0]} style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'transparent' }} />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>End Date *</label>
          <input required name="endDate" type="date" min={new Date().toISOString().split('T')[0]} style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'transparent' }} />
        </div>
      </div>

      <div>
        <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>Reason for Leave *</label>
        <textarea required name="reason" rows={3} placeholder="Provide details for the absence..." style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'transparent' }} />
      </div>

      <button 
        type="submit" 
        disabled={isSubmitting}
        style={{ padding: '0.75rem', backgroundColor: "var(--primary)", color: "var(--primary-fg)", border: 'none', borderRadius: '8px', fontWeight: 500, cursor: isSubmitting ? 'not-allowed' : 'pointer' }}
      >
        {isSubmitting ? "Submitting..." : "Submit Leave Request"}
      </button>
    </form>
  );
}
