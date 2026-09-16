"use client";

import { useState } from "react";
import { Edit2, X } from "lucide-react";
import { editClassAction } from "@/backend/actions/dashboard/admin/classes/actions";

const CLASS_OPTIONS = Array.from({ length: 10 }, (_, i) => `Class ${i + 1}`);
const SECTION_OPTIONS = ["A", "B", "C", "D"];

import { Class, Teacher, User } from "@prisma/client";

export default function EditClassModal({ 
  classData, 
  teachers 
}: { 
  classData: Class & { teacher?: (Teacher & { user: User }) | null }; 
  teachers: (Teacher & { user: User })[];
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const formData = new FormData(e.currentTarget);
    formData.set("id", classData.id);

    const result = await editClassAction(formData);

    setIsSubmitting(false);

    if (result.error) {
      setError(result.error);
    } else {
      setIsOpen(false);
    }
  };

  if (!isOpen) {
    return (
      <button 
        onClick={() => setIsOpen(true)}
        style={{ padding: '0.5rem 1rem', background: "var(--border-color)", color: 'var(--foreground)', borderRadius: '6px', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 500 }}
      >
        <Edit2 size={16} /> Edit Class
      </button>
    );
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div style={{ background: 'var(--card-bg)', width: '100%', maxWidth: '500px', borderRadius: '12px', padding: '1.5rem', position: 'relative' }}>
        <button 
          onClick={() => setIsOpen(false)}
          style={{ position: 'absolute', right: '1.5rem', top: '1.5rem', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
        >
          <X size={20} />
        </button>

        <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1.5rem' }}>Edit Class</h2>

        {error && (
          <div style={{ background: 'var(--danger-bg)', color: "var(--danger)", padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem', border: '1px solid var(--danger)' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>Class Name</label>
            <select name="name" defaultValue={classData.name} style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--card-bg)' }}>
              {CLASS_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>Section</label>
            <select name="section" defaultValue={classData.section} style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--card-bg)' }}>
              {SECTION_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>Max Strength</label>
            <input name="maxStrength" type="number" defaultValue={classData.maxStrength || 40} style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent' }} />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>Class Teacher</label>
            <select name="teacherId" defaultValue={classData.teacherId || ""} style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--card-bg)' }}>
              <option value="">None</option>
              {teachers.map(t => <option key={t.id} value={t.id}>{t.user.name}</option>)}
            </select>
          </div>

          <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
            <button 
              type="button" 
              onClick={() => setIsOpen(false)}
              style={{ flex: 1, padding: '0.75rem', background: "var(--border-color)", color: 'var(--foreground)', border: 'none', borderRadius: '8px', fontWeight: 500, cursor: 'pointer' }}
            >
              Cancel
            </button>
            <button 
              type="submit" 
              disabled={isSubmitting}
              style={{ flex: 1, padding: '0.75rem', background: "var(--primary)", color: "var(--primary-fg)", border: 'none', borderRadius: '8px', fontWeight: 500, cursor: isSubmitting ? 'not-allowed' : 'pointer' }}
            >
              {isSubmitting ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
