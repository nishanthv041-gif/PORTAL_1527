"use client";

import { useState } from "react";
import { recordAchievementAction } from "@/backend/api/actions/dashboard/teacher/achievements/actions";

export default function CreateAchievementForm({ students }: { students: { id: string, name: string, rollNo: string, className: string }[] }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{ text: string, type: "success" | "error" } | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    setMessage(null);

    const formData = new FormData(e.currentTarget);
    
    const result = await recordAchievementAction(formData);

    if (result.success) {
      setMessage({ text: "Achievement recorded successfully! Pending admin verification.", type: "success" });
      (e.target as HTMLFormElement).reset();
    } else {
      setMessage({ text: result.error || "Failed to record achievement", type: "error" });
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
        <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>Achievement Title *</label>
        <input required name="title" type="text" placeholder="e.g. 1st Place Science Fair" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'transparent' }} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        <div>
          <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>Category *</label>
          <select required name="category" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'transparent' }}>
            <option value="ACADEMIC">Academic</option>
            <option value="SPORTS">Sports</option>
            <option value="ARTS">Arts</option>
            <option value="EXTRACURRICULAR">Extracurricular</option>
            <option value="BEHAVIOR">Behavior/Character</option>
            <option value="OTHER">Other</option>
          </select>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>Date *</label>
          <input required name="date" type="date" defaultValue={new Date().toISOString().split('T')[0]} style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'transparent' }} />
        </div>
      </div>

      <div>
        <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>Description (Optional)</label>
        <textarea name="description" rows={3} placeholder="Provide details about the achievement..." style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'transparent' }} />
      </div>

      <button 
        type="submit" 
        disabled={isSubmitting}
        style={{ padding: '0.75rem', backgroundColor: "var(--primary)", color: "var(--primary-fg)", border: 'none', borderRadius: '8px', fontWeight: 500, cursor: isSubmitting ? 'not-allowed' : 'pointer' }}
      >
        {isSubmitting ? "Recording..." : "Record Achievement"}
      </button>
    </form>
  );
}
