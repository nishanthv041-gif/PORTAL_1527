"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { User, Clock, AlertCircle, Edit2, Trash2 } from "lucide-react";
import { raiseComplaintAction } from "./actions";

type ComplaintWithStudent = {
  id: string;
  title: string;
  description: string;
  category: string;
  severity: string;
  status: string;
  date: Date;
  studentId: string;
  remarks: string | null;
  student: {
    firstName: string;
    lastName: string;
  };
};

export default function TeacherComplaintsClient({
  complaints,
  teacherId,
  students,
}: {
  complaints: ComplaintWithStudent[];
  teacherId: string;
  students: { id: string; name: string; rollNo: string; className: string }[];
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingComplaint, setEditingComplaint] = useState<ComplaintWithStudent | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const router = useRouter();

  const handleEditClick = (complaint: ComplaintWithStudent) => {
    setEditingId(complaint.id);
    setEditingComplaint(complaint);
    setMessage(null);
  };

  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to delete this complaint?")) {
      const res = await fetch(`/api/complaints/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const errorData = await res.json();
        alert(errorData.error || "Failed to delete complaint");
      } else {
        router.refresh();
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    setMessage(null);

    const formData = new FormData(e.currentTarget);
    formData.append("teacherId", teacherId);

    if (editingId) {
      const res = await fetch(`/api/complaints/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: formData.get("title"),
          description: formData.get("description"),
          category: formData.get("category"),
          severity: formData.get("severity"),
          studentId: formData.get("studentId"),
        }),
      });
      setIsSubmitting(false);
      if (!res.ok) {
        const errorData = await res.json();
        setMessage({ text: errorData.error || "Failed to update complaint", type: "error" });
      } else {
        setMessage({ text: "Complaint updated successfully!", type: "success" });
        setEditingId(null);
        setEditingComplaint(null);
        e.currentTarget.reset();
        router.refresh();
      }
    } else {
      const result = await raiseComplaintAction(formData);
      setIsSubmitting(false);
      if (result.success) {
        setMessage({ text: "Complaint raised successfully!", type: "success" });
        e.currentTarget.reset();
      } else {
        setMessage({ text: result.error || "Failed to raise complaint", type: "error" });
      }
    }
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "2rem" }} className="chartsContainer">
      <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem", background: "var(--card-bg)", padding: "1.5rem", borderRadius: "12px", border: "1px solid var(--border)" }}>
        <h3 style={{ fontSize: "1.25rem", fontWeight: 600, margin: 0 }}>My Raised Complaints</h3>
        
        {complaints.map((complaint) => (
          <div key={complaint.id} style={{ display: "flex", flexDirection: "column", padding: "1.25rem", border: "1px solid var(--border)", borderRadius: "8px", backgroundColor: "var(--background)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.75rem" }}>
              <h4 style={{ margin: 0, color: "var(--primary)", fontSize: "1.1rem" }}>{complaint.title}</h4>
              <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
                <span
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    padding: "0.25rem 0.5rem",
                    borderRadius: "12px",
                    backgroundColor: complaint.status === "OPEN" ? "var(--danger-bg)" : complaint.status === "UNDER_REVIEW" ? "var(--warning-bg)" : "var(--success-bg)",
                    color: complaint.status === "OPEN" ? "var(--danger)" : complaint.status === "UNDER_REVIEW" ? "var(--warning)" : "var(--success)",
                  }}
                >
                  {complaint.status.replace("_", " ")}
                </span>
                {complaint.status === "OPEN" && (
                  <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                    <button onClick={() => {
                      handleEditClick(complaint);
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }} style={{ background: "transparent", border: "none", color: "inherit", opacity: 0.7, cursor: "pointer", padding: 0 }}>
                      <Edit2 size={16} />
                    </button>
                    <button onClick={() => handleDelete(complaint.id)} style={{ background: "transparent", border: "none", color: "var(--danger)", cursor: "pointer", padding: 0 }}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: "flex", gap: "1rem", fontSize: "0.875rem", color: "var(--text-secondary)", marginBottom: "1rem" }}>
              <span style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                <User size={14} /> Student: {complaint.student.firstName} {complaint.student.lastName}
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                <Clock size={14} /> {new Date(complaint.date).toLocaleDateString()}
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: "0.25rem", color: complaint.severity === "HIGH" ? "var(--danger)" : complaint.severity === "MEDIUM" ? "var(--warning)" : "inherit" }}>
                <AlertCircle size={14} /> Severity: {complaint.severity}
              </span>
            </div>

            <p style={{ margin: "0 0 1rem 0", fontSize: "0.95rem", lineHeight: 1.5, color: "var(--foreground)" }}>
              {complaint.description}
            </p>

            {complaint.remarks && (
              <div style={{ padding: "0.75rem", backgroundColor: "var(--success-bg)", borderLeft: "3px solid var(--success)", borderRadius: "4px", fontSize: "0.875rem" }}>
                <strong>Admin Remarks:</strong> {complaint.remarks}
              </div>
            )}
          </div>
        ))}
        {complaints.length === 0 && (
          <p style={{ textAlign: "center", padding: "2rem", opacity: 0.7 }}>No complaints raised.</p>
        )}
      </div>

      <div style={{ background: "var(--card-bg)", padding: "1.5rem", borderRadius: "12px", border: "1px solid var(--border)" }}>
        <h3 style={{ fontSize: "1.25rem", fontWeight: 600, margin: "0 0 1.5rem 0" }}>
          {editingId ? "Edit Complaint" : "Raise a New Complaint"}
        </h3>
        {editingId && (
          <button
            onClick={() => {
              setEditingId(null);
              setEditingComplaint(null);
              setMessage(null);
            }}
            style={{ marginBottom: "1rem", background: "transparent", border: "none", color: "var(--primary)", cursor: "pointer", fontWeight: 500, fontSize: "0.875rem" }}
          >
            ← Cancel Edit & Raise New
          </button>
        )}
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {message && (
            <div style={{ padding: "0.75rem", borderRadius: "8px", background: message.type === "success" ? "var(--success-bg)" : "var(--danger-bg)", color: message.type === "success" ? "var(--success)" : "var(--danger)" }}>
              {message.text}
            </div>
          )}

          <div>
            <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 500, marginBottom: "0.25rem" }}>Select Student *</label>
            <select required name="studentId" defaultValue={editingComplaint?.studentId || ""} style={{ width: "100%", padding: "0.75rem", borderRadius: "8px", border: "1px solid var(--border)", background: "transparent" }}>
              <option value="">-- Choose a student --</option>
              {students.map(s => (
                <option key={s.id} value={s.id}>{s.name} ({s.rollNo}) - {s.className}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 500, marginBottom: "0.25rem" }}>Title / Subject *</label>
            <input required name="title" defaultValue={editingComplaint?.title || ""} type="text" placeholder="e.g. Repeated disruptive behavior" style={{ width: "100%", padding: "0.75rem", borderRadius: "8px", border: "1px solid var(--border)", background: "transparent" }} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            <div>
              <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 500, marginBottom: "0.25rem" }}>Category *</label>
              <select required name="category" defaultValue={editingComplaint?.category || "BEHAVIOR"} style={{ width: "100%", padding: "0.75rem", borderRadius: "8px", border: "1px solid var(--border)", background: "transparent" }}>
                <option value="BEHAVIOR">Behavior</option>
                <option value="ACADEMIC">Academic</option>
                <option value="ATTENDANCE">Attendance</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
            <div>
              <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 500, marginBottom: "0.25rem" }}>Severity *</label>
              <select required name="severity" defaultValue={editingComplaint?.severity || "LOW"} style={{ width: "100%", padding: "0.75rem", borderRadius: "8px", border: "1px solid var(--border)", background: "transparent" }}>
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
              </select>
            </div>
          </div>

          <div>
            <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 500, marginBottom: "0.25rem" }}>Description *</label>
            <textarea required name="description" defaultValue={editingComplaint?.description || ""} rows={4} placeholder="Describe the issue in detail..." style={{ width: "100%", padding: "0.75rem", borderRadius: "8px", border: "1px solid var(--border)", background: "transparent" }} />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            style={{ padding: "0.75rem", backgroundColor: "var(--primary)", color: "var(--primary-fg)", border: "none", borderRadius: "8px", fontWeight: 500, cursor: isSubmitting ? "not-allowed" : "pointer" }}
          >
            {isSubmitting ? (editingId ? "Updating..." : "Submitting...") : (editingId ? "Update Complaint" : "Raise Complaint")}
          </button>
        </form>
      </div>
    </div>
  );
}
