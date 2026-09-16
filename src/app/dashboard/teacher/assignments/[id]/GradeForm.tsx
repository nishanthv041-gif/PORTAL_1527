"use client";

import { useState } from "react";
import { gradeSubmission } from "@/backend/actions/dashboard/teacher/assignments/[id]/actions";

import { Submission, Student } from "@prisma/client";

type SubmissionWithRelations = Submission & {
  student: Student;
};

export default function GradeForm({ submission }: { submission: SubmissionWithRelations }) {
  const [remarks, setRemarks] = useState(submission.remarks || "");
  const [loading, setLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(submission.status !== "GRADED");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const result = await gradeSubmission(submission.id, remarks);
    
    if (result.success) {
      setIsEditing(false);
    } else {
      alert("Failed to save grade: " + result.error);
    }
    setLoading(false);
  };

  if (!isEditing) {
    return (
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        <span style={{ fontSize: '0.9rem' }}>{remarks || "No remarks"}</span>
        <button 
          onClick={() => setIsEditing(true)}
          style={{ padding: '2px 6px', fontSize: '0.75rem', borderRadius: '4px', border: '1px solid var(--border)', backgroundColor: 'transparent', cursor: 'pointer', color: 'var(--foreground)' }}
        >
          Edit
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
      <input
        type="text"
        value={remarks}
        onChange={(e) => setRemarks(e.target.value)}
        placeholder="Enter grade/remarks"
        required
        style={{ padding: "0.4rem", borderRadius: "4px", border: "1px solid var(--border)", backgroundColor: "var(--background)", color: "var(--foreground)", fontSize: '0.85rem' }}
      />
      <button
        type="submit"
        disabled={loading}
        style={{
          padding: "0.4rem 0.75rem",
          backgroundColor: "var(--primary)", color: "var(--primary-fg)",
          border: "none",
          borderRadius: "4px",
          fontWeight: 500,
          fontSize: '0.85rem',
          cursor: loading ? "not-allowed" : "pointer",
          opacity: loading ? 0.7 : 1,
        }}
      >
        {loading ? "..." : "Save"}
      </button>
      {submission.status === "GRADED" && (
        <button
          type="button"
          onClick={() => setIsEditing(false)}
          style={{ padding: '0.4rem 0.75rem', fontSize: '0.85rem', borderRadius: '4px', border: '1px solid var(--border)', backgroundColor: 'transparent', cursor: 'pointer', color: 'var(--foreground)' }}
        >
          Cancel
        </button>
      )}
    </form>
  );
}
