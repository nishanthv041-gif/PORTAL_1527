"use client";

import { useState } from "react";
import { Edit2, Loader2 } from "lucide-react";
import { editClassAction } from "@/backend/api/actions/dashboard/admin/classes/actions";
import { Modal } from "@/frontend/components/ui";
import { Class, Teacher, User } from "@prisma/client";

const CLASS_OPTIONS = Array.from({ length: 10 }, (_, i) => `Class ${i + 1}`);
const SECTION_OPTIONS = ["A", "B", "C", "D"];

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

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        style={{
          padding: '0.45rem 0.85rem',
          background: "var(--border-color)",
          color: 'var(--foreground)',
          borderRadius: '6px',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '0.4rem',
          fontWeight: 600,
          fontSize: '0.8125rem'
        }}
      >
        <Edit2 size={14} /> Edit Class
      </button>

      <Modal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title={`Edit ${classData.name} - ${classData.section}`}
        icon={<Edit2 size={18} color="var(--primary)" />}
        size="form"
        footer={
          <>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              disabled={isSubmitting}
              style={{
                padding: '0.55rem 1rem',
                background: "transparent",
                color: 'var(--foreground)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                fontWeight: 600,
                fontSize: '0.875rem',
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              form="edit-class-form"
              disabled={isSubmitting}
              style={{
                padding: '0.55rem 1.25rem',
                background: "var(--primary)",
                color: "var(--primary-fg)",
                border: 'none',
                borderRadius: '8px',
                fontWeight: 700,
                fontSize: '0.875rem',
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem'
              }}
            >
              {isSubmitting && <Loader2 size={15} className="animate-spin" />}
              {isSubmitting ? "Saving..." : "Save Changes"}
            </button>
          </>
        }
      >
        {error && (
          <div style={{ background: 'var(--danger-bg)', color: "var(--danger)", padding: '0.75rem', borderRadius: '8px', marginBottom: '1rem', border: '1px solid var(--danger)', fontSize: '0.8125rem' }}>
            {error}
          </div>
        )}

        <form id="edit-class-form" onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.25rem' }}>Class Name</label>
            <select name="name" defaultValue={classData.name} style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--card-bg)', color: 'var(--foreground)', fontSize: '0.875rem' }}>
              {CLASS_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.25rem' }}>Section</label>
            <select name="section" defaultValue={classData.section} style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--card-bg)', color: 'var(--foreground)', fontSize: '0.875rem' }}>
              {SECTION_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.25rem' }}>Max Strength</label>
            <input name="maxStrength" type="number" defaultValue={classData.maxStrength || 40} style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--foreground)', fontSize: '0.875rem' }} />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.25rem' }}>Class Teacher</label>
            <select name="teacherId" defaultValue={classData.teacherId || ""} style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--card-bg)', color: 'var(--foreground)', fontSize: '0.875rem' }}>
              <option value="">None</option>
              {teachers.map(t => <option key={t.id} value={t.id}>{t.user.name}</option>)}
            </select>
          </div>
        </form>
      </Modal>
    </>
  );
}
