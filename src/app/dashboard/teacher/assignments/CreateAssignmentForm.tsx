"use client";

import { useState } from "react";
import { createAssignment } from "@/backend/actions/dashboard/teacher/assignments/actions";

type ClassData = { id: string; name: string; section: string; };

export default function CreateAssignmentForm({ classes, teacherId }: { classes: ClassData[]; teacherId: string }) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    const formData = new FormData(e.currentTarget);
    formData.append("teacherId", teacherId);
    
    const result = await createAssignment(formData);
    
    if (result.success) {
      setMessage("Assignment created successfully!");
      (e.target as HTMLFormElement).reset();
    } else {
      setMessage("Failed: " + result.error);
    }
    setLoading(false);
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        <label style={{ fontSize: "0.875rem", fontWeight: 500 }}>Assignment Title</label>
        <input
          name="title"
          type="text"
          required
          placeholder="e.g. Chapter 4 Exercises"
          style={{ padding: "0.75rem", borderRadius: "6px", border: "1px solid var(--border)", backgroundColor: "var(--background)", color: "var(--foreground)" }}
        />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        <label style={{ fontSize: "0.875rem", fontWeight: 500 }}>Description</label>
        <textarea
          name="description"
          rows={3}
          placeholder="Optional description or instructions..."
          style={{ padding: "0.75rem", borderRadius: "6px", border: "1px solid var(--border)", backgroundColor: "var(--background)", color: "var(--foreground)", resize: "vertical" }}
        />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        <label style={{ fontSize: "0.875rem", fontWeight: 500 }}>Deadline</label>
        <input
          name="deadline"
          type="date"
          required
          style={{ padding: "0.75rem", borderRadius: "6px", border: "1px solid var(--border)", backgroundColor: "var(--background)", color: "var(--foreground)" }}
        />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        <label style={{ fontSize: "0.875rem", fontWeight: 500 }}>Class</label>
        <select
          name="classId"
          required
          style={{ padding: "0.75rem", borderRadius: "6px", border: "1px solid var(--border)", backgroundColor: "var(--background)", color: "var(--foreground)" }}
        >
          <option value="">Select a class...</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>{c.name} - {c.section}</option>
          ))}
        </select>
      </div>

      <button
        type="submit"
        disabled={loading}
        style={{
          padding: "0.75rem",
          backgroundColor: "var(--primary)", color: "var(--primary-fg)",
          border: "none",
          borderRadius: "6px",
          fontWeight: 500,
          cursor: loading ? "not-allowed" : "pointer",
          opacity: loading ? 0.7 : 1,
          marginTop: "0.5rem"
        }}
      >
        {loading ? "Creating..." : "Create Assignment"}
      </button>

      {message && (
        <span style={{ color: message.includes("success") ? "var(--success)" : "var(--danger)", fontSize: "0.875rem", textAlign: "center" }}>
          {message}
        </span>
      )}
    </form>
  );
}
