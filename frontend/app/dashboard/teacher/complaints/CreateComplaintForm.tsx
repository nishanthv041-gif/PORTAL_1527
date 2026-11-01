"use client";

import { useState } from "react";
import { raiseComplaintAction } from "@/backend/api/actions/dashboard/teacher/complaints/actions";
import { SingleSelect } from "@/frontend/components/ui/form";

export default function CreateComplaintForm({ teacherId, students }: { teacherId: string, students: { id: string, name: string, rollNo: string, className: string }[] }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{ text: string, type: "success" | "error" } | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("BEHAVIOR");
  const [selectedSeverity, setSelectedSeverity] = useState("MEDIUM");

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    setMessage(null);

    const formData = new FormData(e.currentTarget);
    formData.append("teacherId", teacherId);

    const result = await raiseComplaintAction(formData);

    if (result.success) {
      setMessage({ text: "Complaint raised successfully!", type: "success" });
      (e.target as HTMLFormElement).reset();
      setSelectedStudentId("");
      setSelectedCategory("BEHAVIOR");
      setSelectedSeverity("MEDIUM");
    } else {
      setMessage({ text: result.error || "Failed to raise complaint", type: "error" });
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
        <SingleSelect
          name="studentId"
          label="Select Student"
          required={true}
          value={selectedStudentId}
          onChange={setSelectedStudentId}
          options={students.map((s) => ({
            value: s.id,
            label: s.name,
            subLabel: `Roll: ${s.rollNo}`,
            badge: s.className,
          }))}
          placeholder="-- Choose a student --"
          searchable={true}
        />
      </div>

      <div>
        <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>Title / Subject *</label>
        <input required name="title" type="text" placeholder="e.g. Repeated disruptive behavior" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'transparent' }} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: '1rem' }}>
        <div>
          <SingleSelect
            name="category"
            label="Category"
            required={true}
            value={selectedCategory}
            onChange={setSelectedCategory}
            options={[
              { value: "BEHAVIOR", label: "Behavior" },
              { value: "ACADEMIC", label: "Academic" },
              { value: "ATTENDANCE", label: "Attendance" },
              { value: "OTHER", label: "Other" },
            ]}
            searchable={false}
          />
        </div>
        <div>
          <SingleSelect
            name="severity"
            label="Severity"
            required={true}
            value={selectedSeverity}
            onChange={setSelectedSeverity}
            options={[
              { value: "LOW", label: "Low" },
              { value: "MEDIUM", label: "Medium" },
              { value: "HIGH", label: "High" },
            ]}
            searchable={false}
          />
        </div>
      </div>

      <div>
        <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>Description *</label>
        <textarea required name="description" rows={4} placeholder="Describe the issue in detail..." style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'transparent' }} />
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        style={{ padding: '0.75rem', backgroundColor: "var(--primary)", color: "var(--primary-fg)", border: 'none', borderRadius: '8px', fontWeight: 500, cursor: isSubmitting ? 'not-allowed' : 'pointer' }}
      >
        {isSubmitting ? "Submitting..." : "Raise Complaint"}
      </button>
    </form>
  );
}
