"use client";

import { useState } from "react";
import { saveBulkAttendance } from "@/backend/api/actions/dashboard/teacher/attendance/actions";

type ClassData = {
  id: string;
  name: string;
  section: string;
  students: { id: string; firstName: string; lastName: string; rollNumber: string }[];
};

export default function AttendanceForm({ myClass }: { myClass: ClassData }) {
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [attendance, setAttendance] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const handleStatusChange = (studentId: string, status: string) => {
    setAttendance((prev) => ({ ...prev, [studentId]: status }));
  };

  const handleMarkAll = (status: string) => {
    if (!myClass) return;
    const newAttendance: Record<string, string> = {};
    myClass.students.forEach((s) => {
      newAttendance[s.id] = status;
    });
    setAttendance(newAttendance);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!myClass) return;

    setLoading(true);
    setMessage("");

    const data = myClass.students.map((s) => ({
      studentId: s.id,
      classId: myClass.id,
      date,
      status: attendance[s.id] || "PRESENT", // Default to present if not marked
    }));

    const result = await saveBulkAttendance(data);
    
    if (result.success) {
      setMessage("Attendance saved successfully!");
    } else {
      setMessage("Failed to save attendance: " + result.error);
    }
    setLoading(false);
  };

  if (!myClass) return null;

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: 'flex-end' }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <label style={{ fontSize: "0.875rem", fontWeight: 500 }}>Class</label>
          <div style={{ padding: "0.5rem", borderRadius: "6px", border: "1px solid var(--border)", backgroundColor: "var(--background)", color: "var(--foreground)", minWidth: '150px' }}>
            {myClass.name} - {myClass.section}
          </div>
        </div>
        
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <label style={{ fontSize: "0.875rem", fontWeight: 500 }}>Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setMessage("");
            }}
            style={{ padding: "0.5rem", borderRadius: "6px", border: "1px solid var(--border)", backgroundColor: "var(--background)", color: "var(--foreground)" }}
          />
        </div>
      </div>

      <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
        <span style={{ fontSize: "0.875rem", fontWeight: 500 }}>Quick Mark:</span>
        <button type="button" onClick={() => handleMarkAll("PRESENT")} style={{ padding: "0.25rem 0.75rem", fontSize: "0.875rem", borderRadius: "4px", border: "1px solid #10b981", backgroundColor: "var(--success-bg)", color: "var(--success)", cursor: "pointer" }}>All Present</button>
        <button type="button" onClick={() => handleMarkAll("ABSENT")} style={{ padding: "0.25rem 0.75rem", fontSize: "0.875rem", borderRadius: "4px", border: "1px solid #ef4444", backgroundColor: "var(--danger-bg)", color: "var(--danger)", cursor: "pointer" }}>All Absent</button>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              <th style={{ padding: "0.75rem", fontWeight: 600 }}>Roll No</th>
              <th style={{ padding: "0.75rem", fontWeight: 600 }}>Student Name</th>
              <th style={{ padding: "0.75rem", fontWeight: 600 }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {myClass.students.map((student) => (
              <tr key={student.id} style={{ borderBottom: "1px solid var(--border)" }}>
                <td style={{ padding: "0.75rem" }}>{student.rollNumber}</td>
                <td style={{ padding: "0.75rem", fontWeight: 500 }}>{student.firstName} {student.lastName}</td>
                <td style={{ padding: "0.75rem" }}>
                  <select
                    value={attendance[student.id] || "PRESENT"}
                    onChange={(e) => handleStatusChange(student.id, e.target.value)}
                    style={{ 
                      padding: "0.25rem 0.5rem", 
                      borderRadius: "4px", 
                      border: "1px solid var(--border)",
                      backgroundColor: "var(--background)",
                      color: attendance[student.id] === "ABSENT" ? "var(--danger)" : attendance[student.id] === "LATE" ? "var(--warning)" : "var(--success)"
                    }}
                  >
                    <option value="PRESENT">Present</option>
                    <option value="ABSENT">Absent</option>
                    <option value="LATE">Late</option>
                    <option value="LEAVE">Leave</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        
        {myClass.students.length === 0 && (
          <p style={{ padding: "1rem", textAlign: "center" }}>No students found in this class.</p>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
        <button
          type="submit"
          disabled={loading || myClass.students.length === 0}
          style={{
            padding: "0.75rem 1.5rem",
            backgroundColor: "var(--primary)", color: "var(--primary-fg)",
            border: "none",
            borderRadius: "6px",
            fontWeight: 500,
            cursor: loading || myClass.students.length === 0 ? "not-allowed" : "pointer",
            opacity: loading || myClass.students.length === 0 ? 0.7 : 1
          }}
        >
          {loading ? "Saving..." : "Save Attendance"}
        </button>
        {message && (
          <span style={{ color: message.includes("success") ? "var(--success)" : "var(--danger)", fontSize: "0.875rem" }}>
            {message}
          </span>
        )}
      </div>
    </form>
  );
}
