"use client";

import { useState } from "react";
import { CheckCircle, XCircle, Clock, Calendar, User, AlertTriangle } from "lucide-react";
import { acceptLeaveRequest, rejectLeaveRequest } from "@/backend/api/actions/dashboard/teacher/leaves/actions";

interface StudentLeave {
  id: string;
  startDate: Date | string;
  endDate: Date | string;
  reason: string;
  status: string;
  student: {
    id: string;
    firstName: string;
    lastName: string;
    rollNumber: string;
    classId: string | null;
  };
}

export default function TeacherLeavesClient({ initialLeaves }: { initialLeaves: StudentLeave[] }) {
  const [leaves, setLeaves] = useState<StudentLeave[]>(initialLeaves);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const handleAccept = async (id: string, studentName: string) => {
    if (!confirm(`Accept and approve leave request for ${studentName}? This will automatically mark their attendance as "LEAVE" for all dates in this period.`)) {
      return;
    }

    setProcessingId(id);
    setMessage(null);

    const res = await acceptLeaveRequest(id);
    setProcessingId(null);

    if (res.success) {
      setLeaves((prev) =>
        prev.map((l) => (l.id === id ? { ...l, status: "APPROVED" } : l))
      );
      setMessage({
        text: `Leave request for ${studentName} accepted successfully! Attendance automatically marked as LEAVE.`,
        type: "success",
      });
    } else {
      setMessage({ text: res.error || "Failed to accept leave request.", type: "error" });
    }
  };

  const handleReject = async (id: string, studentName: string) => {
    if (!confirm(`Decline / reject leave request for ${studentName}?`)) {
      return;
    }

    setProcessingId(id);
    setMessage(null);

    const res = await rejectLeaveRequest(id);
    setProcessingId(null);

    if (res.success) {
      setLeaves((prev) =>
        prev.map((l) => (l.id === id ? { ...l, status: "REJECTED" } : l))
      );
      setMessage({
        text: `Leave request for ${studentName} declined.`,
        type: "success",
      });
    } else {
      setMessage({ text: res.error || "Failed to decline leave request.", type: "error" });
    }
  };

  const pendingLeaves = leaves.filter((l) => l.status === "PENDING");
  const pastLeaves = leaves.filter((l) => l.status !== "PENDING");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2rem", width: "100%" }}>
      {message && (
        <div
          style={{
            padding: "1rem",
            borderRadius: "8px",
            background: message.type === "success" ? "var(--success-bg)" : "var(--danger-bg)",
            color: message.type === "success" ? "var(--success)" : "var(--danger)",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            fontWeight: 500,
          }}
        >
          {message.type === "success" ? <CheckCircle size={18} /> : <AlertTriangle size={18} />}
          {message.text}
        </div>
      )}

      {/* Pending Leave Requests */}
      <div style={{ background: "var(--card-bg)", borderRadius: "12px", border: "1px solid var(--border-color)", padding: "1.5rem" }}>
        <h3 style={{ margin: 0, marginBottom: "1rem", fontSize: "1.2rem", fontWeight: 600, display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <Clock size={20} color="var(--warning)" /> Pending Leave Requests ({pendingLeaves.length})
        </h3>

        {pendingLeaves.length === 0 ? (
          <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: "0.9rem" }}>
            No pending leave applications from your students.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {pendingLeaves.map((leave) => {
              const start = new Date(leave.startDate).toLocaleDateString();
              const end = new Date(leave.endDate).toLocaleDateString();
              const isSingleDay = start === end;
              const studentName = `${leave.student.firstName} ${leave.student.lastName}`;

              return (
                <div
                  key={leave.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: "1rem",
                    padding: "1rem",
                    borderRadius: "8px",
                    border: "1px solid var(--border-color)",
                    background: "var(--background)",
                  }}
                >
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <User size={16} color="var(--primary)" />
                      <span style={{ fontWeight: 600, fontSize: "1rem" }}>
                        {studentName} (Roll: {leave.student.rollNumber})
                      </span>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                      <Calendar size={14} />
                      <span>{isSingleDay ? `Date: ${start}` : `Period: ${start} to ${end}`}</span>
                    </div>

                    <div style={{ fontSize: "0.9rem", marginTop: "0.25rem" }}>
                      <strong>Reason:</strong> {leave.reason}
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                    <button
                      onClick={() => handleAccept(leave.id, studentName)}
                      disabled={processingId === leave.id}
                      style={{
                        padding: "0.5rem 1rem",
                        backgroundColor: "var(--success)",
                        color: "var(--success-fg)",
                        border: "none",
                        borderRadius: "6px",
                        fontWeight: 600,
                        fontSize: "0.875rem",
                        cursor: processingId === leave.id ? "not-allowed" : "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.35rem",
                      }}
                    >
                      <CheckCircle size={16} /> Accept Leave
                    </button>
                    <button
                      onClick={() => handleReject(leave.id, studentName)}
                      disabled={processingId === leave.id}
                      style={{
                        padding: "0.5rem 1rem",
                        backgroundColor: "var(--danger-bg)",
                        color: "var(--danger)",
                        border: "1px solid var(--danger)",
                        borderRadius: "6px",
                        fontWeight: 600,
                        fontSize: "0.875rem",
                        cursor: processingId === leave.id ? "not-allowed" : "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.35rem",
                      }}
                    >
                      <XCircle size={16} /> Decline
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Past / Processed Leaves */}
      <div style={{ background: "var(--card-bg)", borderRadius: "12px", border: "1px solid var(--border-color)", padding: "1.5rem" }}>
        <h3 style={{ margin: 0, marginBottom: "1rem", fontSize: "1.2rem", fontWeight: 600 }}>
          Leave History ({pastLeaves.length})
        </h3>

        {pastLeaves.length === 0 ? (
          <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: "0.9rem" }}>No past leave records.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {pastLeaves.map((leave) => {
              const start = new Date(leave.startDate).toLocaleDateString();
              const end = new Date(leave.endDate).toLocaleDateString();
              const isSingleDay = start === end;
              const isApproved = leave.status === "APPROVED";

              return (
                <div
                  key={leave.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: "0.75rem",
                    padding: "0.85rem 1rem",
                    borderRadius: "8px",
                    border: "1px solid var(--border-color)",
                    background: "rgba(0,0,0,0.01)",
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: "0.95rem" }}>
                      {leave.student.firstName} {leave.student.lastName} (Roll: {leave.student.rollNumber})
                    </div>
                    <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                      {isSingleDay ? start : `${start} - ${end}`} • {leave.reason}
                    </div>
                  </div>

                  <span
                    style={{
                      padding: "4px 10px",
                      borderRadius: "12px",
                      fontSize: "0.75rem",
                      fontWeight: 600,
                      backgroundColor: isApproved ? "var(--success-bg)" : "var(--danger-bg)",
                      color: isApproved ? "var(--success)" : "var(--danger)",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.25rem",
                    }}
                  >
                    {isApproved ? <CheckCircle size={14} /> : <XCircle size={14} />}
                    {leave.status}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
