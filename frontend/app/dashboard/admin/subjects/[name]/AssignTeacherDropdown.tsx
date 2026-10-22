"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { assignSubjectTeacher } from "@/backend/api/actions/dashboard/admin/subjects/actions";
import { UserCheck, Check, Loader2 } from "lucide-react";

export default function AssignTeacherDropdown({ 
  subjectId, 
  currentTeacherId, 
  teachers 
}: { 
  subjectId: string; 
  currentTeacherId: string | null; 
  teachers: { id: string; name: string }[]; 
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState(currentTeacherId || "");
  const [isPending, startTransition] = useTransition();
  const [justSaved, setJustSaved] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setSelectedId(val);

    startTransition(async () => {
      const res = await assignSubjectTeacher(subjectId, val);
      if (res.error) {
        alert(res.error);
        setSelectedId(currentTeacherId || "");
      } else {
        setJustSaved(true);
        setTimeout(() => setJustSaved(false), 2000);
        router.refresh();
      }
    });
  };

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', position: 'relative' }}>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <select
          value={selectedId}
          disabled={isPending}
          onChange={handleChange}
          title="Assign teaching staff for this class"
          style={{
            padding: '0.45rem 2rem 0.45rem 0.75rem',
            borderRadius: '8px',
            border: justSaved ? '1.5px solid var(--success)' : '1px solid var(--border-color)',
            background: 'var(--card-bg)',
            fontSize: '0.825rem',
            fontWeight: 500,
            color: selectedId ? 'var(--foreground)' : 'var(--text-secondary)',
            cursor: isPending ? 'wait' : 'pointer',
            maxWidth: '100%',
            minWidth: '160px',
            transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
            appearance: 'none',
            WebkitAppearance: 'none'
          }}
        >
          <option value="">No Teacher Assigned</option>
          {teachers.map(t => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
        
        {/* Custom Caret / Status Indicator */}
        <div style={{ position: 'absolute', right: '10px', pointerEvents: 'none', display: 'flex', alignItems: 'center' }}>
          {isPending ? (
            <Loader2 size={13} className="animate-spin text-primary" />
          ) : justSaved ? (
            <Check size={13} color="var(--success)" strokeWidth={3} />
          ) : (
            <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>▼</span>
          )}
        </div>
      </div>
    </div>
  );
}
