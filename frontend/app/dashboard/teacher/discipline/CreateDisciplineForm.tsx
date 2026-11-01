"use client";

import { useState } from "react";
import { logDisciplineAction } from "@/backend/api/actions/dashboard/teacher/discipline/actions";
import { SingleSelect } from "@/frontend/components/ui/form";

export default function CreateDisciplineForm({ students }: { students: { id: string, name: string, rollNo: string, className: string }[] }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{ text: string, type: "success" | "error" } | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [selectedSeverity, setSelectedSeverity] = useState("MEDIUM");

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    setMessage(null);

    const formData = new FormData(e.currentTarget);
    
    const result = await logDisciplineAction(formData);

    if (result.success) {
      setMessage({ text: "Discipline issue logged successfully!", type: "success" });
      (e.target as HTMLFormElement).reset();
      setSelectedStudentId("");
      setSelectedSeverity("MEDIUM");
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
        <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>Incident Title *</label>
        <input required name="incident" type="text" placeholder="e.g. Using phone in class" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'transparent' }} />
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
