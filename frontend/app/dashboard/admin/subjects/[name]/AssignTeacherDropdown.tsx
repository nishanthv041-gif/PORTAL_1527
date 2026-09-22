"use client";

import { assignSubjectTeacher } from "@/backend/api/actions/dashboard/admin/subjects/actions";

export default function AssignTeacherDropdown({ 
  subjectId, 
  currentTeacherId, 
  teachers 
}: { 
  subjectId: string, 
  currentTeacherId: string | null, 
  teachers: { id: string, name: string }[] 
}) {
  return (
    <select
      value={currentTeacherId || ""}
      onChange={async (e) => {
        const val = e.target.value;
        const res = await assignSubjectTeacher(subjectId, val);
        if (res.error) {
          alert(res.error);
        }
      }}
      style={{
        padding: '0.25rem 0.5rem',
        borderRadius: '6px',
        border: '1px solid var(--border-color)',
        background: 'var(--card-bg)',
        fontSize: '0.75rem',
        color: 'var(--text-secondary)'
      }}
    >
      <option value="">No Teacher</option>
      {teachers.map(t => (
        <option key={t.id} value={t.id}>{t.name}</option>
      ))}
    </select>
  );
}
