"use client";

import { useState } from "react";
import { logDisciplineAction } from "@/backend/api/actions/dashboard/teacher/discipline/actions";

export default function CreateDisciplineForm({ students }: { students: { id: string, name: string, rollNo: string, className: string }[] }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{ text: string, type: "success" | "error" } | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    setMessage(null);

    const formData = new FormData(e.currentTarget);
    
    const result = await logDisciplineAction(formData);

    if (result.success) {
      setMessage({ text: "Discipline issue logged successfully!", type: "success" });
      (e.target as HTMLFormElement).reset();
    } else {
      setMessage({ text: result.error || "Failed to log issue", type: "error" });
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
        <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>Select Student *</label>
        <select required name="studentId" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'transparent' }}>
          <option value="">-- Choose a student --</option>
          {students.map(s => (
            <option key={s.id} value={s.id}>{s.name} ({s.rollNo}) - {s.className}</option>
          ))}
        </select>
      </div>

      <div>
        <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>Incident Title *</label>
        <input required name="incident" type="text" placeholder="e.g. Using phone in class" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'transparent' }} />
      </div>

      <div>
        <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>Severity *</label>
        <select required name="severity" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'transparent' }}>
          <option value="LOW">Low</option>
          <option value="MEDIUM">Medium</option>
          <option value="HIGH">High</option>
        </select>
      </div>

      <div>
        <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>Description *</label>
        <textarea required name="description" rows={3} placeholder="Describe the incident..." style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'transparent' }} />
      </div>

      <div>
        <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>Action Taken *</label>
        <textarea required name="actionTaken" rows={2} placeholder="e.g. Warning issued, parents informed" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'transparent' }} />
      </div>

      <button 
        type="submit" 
        disabled={isSubmitting}
        style={{ padding: '0.75rem', backgroundColor: "var(--primary)", color: "var(--primary-fg)", border: 'none', borderRadius: '8px', fontWeight: 500, cursor: isSubmitting ? 'not-allowed' : 'pointer' }}
      >
        {isSubmitting ? "Logging..." : "Log Incident"}
      </button>
    </form>
  );
}
