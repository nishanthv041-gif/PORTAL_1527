"use client";

import { useState } from "react";
import { createExamRequest } from "./actions";
import { Subject, Class } from "@prisma/client";

export default function CreateExamForm({ 
  teacherId, 
  subjects 
}: { 
  teacherId: string, 
  subjects: (Subject & { class: Class })[] 
}) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    const formData = new FormData(e.currentTarget);
    formData.set("teacherId", teacherId);
    
    const result = await createExamRequest(formData);
    
    if (result.success) {
      setMessage("Exam request submitted successfully!");
      (e.target as HTMLFormElement).reset();
    } else {
      setMessage("Failed: " + result.error);
    }
    setLoading(false);
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        <label style={{ fontSize: "0.875rem", fontWeight: 500 }}>Subject & Class</label>
        <select
          name="subjectId"
          required
          style={{ padding: "0.75rem", borderRadius: "6px", border: "1px solid var(--border)", backgroundColor: "var(--background)", color: "var(--foreground)" }}
        >
          <option value="">Select subject...</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>{s.name} ({s.class.name} - {s.class.section})</option>
          ))}
        </select>
      </div>

      <div style={{ display: "flex", gap: "1rem" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", flex: 1 }}>
          <label style={{ fontSize: "0.875rem", fontWeight: 500 }}>Date</label>
          <input
            name="date"
            type="date"
            required
            style={{ padding: "0.75rem", borderRadius: "6px", border: "1px solid var(--border)", backgroundColor: "var(--background)", color: "var(--foreground)" }}
          />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", flex: 1 }}>
          <label style={{ fontSize: "0.875rem", fontWeight: 500 }}>Max Marks</label>
          <input
            name="maxMarks"
            type="number"
            required
            defaultValue="100"
            style={{ padding: "0.75rem", borderRadius: "6px", border: "1px solid var(--border)", backgroundColor: "var(--background)", color: "var(--foreground)" }}
          />
        </div>
      </div>

      <div style={{ display: "flex", gap: "1rem" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", flex: 1 }}>
          <label style={{ fontSize: "0.875rem", fontWeight: 500 }}>Start Time</label>
          <input
            name="startTime"
            type="time"
            required
            style={{ padding: "0.75rem", borderRadius: "6px", border: "1px solid var(--border)", backgroundColor: "var(--background)", color: "var(--foreground)" }}
          />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", flex: 1 }}>
          <label style={{ fontSize: "0.875rem", fontWeight: 500 }}>End Time</label>
          <input
            name="endTime"
            type="time"
            required
            style={{ padding: "0.75rem", borderRadius: "6px", border: "1px solid var(--border)", backgroundColor: "var(--background)", color: "var(--foreground)" }}
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={loading || subjects.length === 0}
        style={{
          padding: "0.75rem",
          backgroundColor: "var(--primary)", color: "var(--primary-fg)",
          border: "none",
          borderRadius: "6px",
          fontWeight: 500,
          cursor: (loading || subjects.length === 0) ? "not-allowed" : "pointer",
          opacity: (loading || subjects.length === 0) ? 0.7 : 1,
          marginTop: "0.5rem"
        }}
      >
        {loading ? "Submitting..." : "Submit Request"}
      </button>

      {subjects.length === 0 && (
        <span style={{ color: "var(--warning)", fontSize: "0.875rem", textAlign: "center" }}>
          You don&apos;t have any subjects assigned to you.
        </span>
      )}

      {message && (
        <span style={{ color: message.includes("success") ? "var(--success)" : "var(--danger)", fontSize: "0.875rem", textAlign: "center" }}>
          {message}
        </span>
      )}
    </form>
  );
}
