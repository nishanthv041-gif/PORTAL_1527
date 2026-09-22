"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, XCircle, AlertCircle, Clock, Edit2, Save, X } from "lucide-react";
import { adminUpdateAttendance } from "@/backend/api/actions/dashboard/admin/attendance/actions";

import { Class, Student, Attendance } from "@prisma/client";

export default function AttendanceClient({
  classes,
  students,
  attendances,
  initialClassId,
  initialDate,
}: {
  classes: Class[];
  students: Student[];
  attendances: Attendance[];
  initialClassId: string;
  initialDate: string;
}) {
  const router = useRouter();
  const [selectedClass, setSelectedClass] = useState(initialClassId);
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const [editStatus, setEditStatus] = useState("PRESENT");
  const [editRemarks, setEditRemarks] = useState("");

  const handleFilter = () => {
    const url = `/dashboard/admin/attendance?classId=${selectedClass}&date=${selectedDate}`;
    router.push(url);
  };

  const startEdit = (studentId: string, currentStatus: string, currentRemarks: string) => {
    setEditingId(studentId);
    setEditStatus(currentStatus);
    setEditRemarks(currentRemarks || "");
  };

  const saveEdit = async (studentId: string) => {
    const res = await adminUpdateAttendance(studentId, selectedDate, editStatus, editRemarks);
    if (res.error) {
      alert(res.error);
    } else {
      setEditingId(null);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'PRESENT': return <CheckCircle2 size={16} color="var(--success)" />;
      case 'ABSENT': return <XCircle size={16} color="var(--danger)" />;
      case 'LATE': return <Clock size={16} color="var(--warning)" />;
      case 'LEAVE': return <AlertCircle size={16} color="#6366f1" />;
      default: return null;
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '2rem', background: 'var(--card-bg)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
        <div style={{ flex: 1 }}>
          <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>Select Class</label>
          <select 
            value={selectedClass} 
            onChange={(e) => setSelectedClass(e.target.value)}
            style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent' }}
          >
            <option value="">-- Choose Class --</option>
            {classes.map(c => (
              <option key={c.id} value={c.id}>{c.name} - {c.section}</option>
            ))}
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>Date</label>
          <input 
            type="date" 
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent' }}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', height: '100%' }}>
          <button 
            onClick={handleFilter}
            style={{ padding: '0.75rem 1.5rem', backgroundColor: "var(--primary)", color: "var(--primary-fg)", border: 'none', borderRadius: '8px', fontWeight: 500, cursor: 'pointer', height: '42px' }}
          >
            Filter
          </button>
        </div>
      </div>

      {selectedClass && students.length > 0 ? (
        <div style={{ background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border-color)', textAlign: 'left', background: 'rgba(0,0,0,0.02)' }}>
                  <th style={{ padding: '1rem', color: 'var(--text-secondary)' }}>Roll No.</th>
                  <th style={{ padding: '1rem', color: 'var(--text-secondary)' }}>Student Name</th>
                  <th style={{ padding: '1rem', color: 'var(--text-secondary)' }}>Status</th>
                  <th style={{ padding: '1rem', color: 'var(--text-secondary)' }}>Remarks</th>
                  <th style={{ padding: '1rem', color: 'var(--text-secondary)', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {students.map(student => {
                  const att = attendances.find(a => a.studentId === student.id);
                  const isEditing = editingId === student.id;
                  
                  return (
                    <tr key={student.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '1rem' }}>{student.rollNumber}</td>
                      <td style={{ padding: '1rem', fontWeight: 500 }}>{student.firstName} {student.lastName}</td>
                      <td style={{ padding: '1rem' }}>
                        {isEditing ? (
                          <select 
                            value={editStatus}
                            onChange={(e) => setEditStatus(e.target.value)}
                            style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-color)' }}
                          >
                            <option value="PRESENT">Present</option>
                            <option value="ABSENT">Absent</option>
                            <option value="LATE">Late</option>
                            <option value="LEAVE">Leave</option>
                          </select>
                        ) : (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                            {getStatusIcon(att?.status || 'ABSENT')} 
                            {att ? att.status : 'NOT MARKED'}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '1rem' }}>
                        {isEditing ? (
                          <input 
                            type="text" 
                            value={editRemarks} 
                            onChange={(e) => setEditRemarks(e.target.value)}
                            style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-color)', width: '100%' }}
                            placeholder="Add remarks (optional)"
                          />
                        ) : (
                          <span style={{ color: att?.remarks?.includes('Admin') ? "var(--danger)" : 'inherit' }}>
                            {att?.remarks || '-'}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '1rem', textAlign: 'right' }}>
                        {isEditing ? (
                          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                            <button onClick={() => saveEdit(student.id)} style={{ padding: '0.5rem', background: "var(--success)", color: "var(--success-fg)", border: 'none', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                              <Save size={16} />
                            </button>
                            <button onClick={() => setEditingId(null)} style={{ padding: '0.5rem', background: "var(--danger)", color: "var(--danger-fg)", border: 'none', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                              <X size={16} />
                            </button>
                          </div>
                        ) : (
                          <button onClick={() => startEdit(student.id, att?.status || 'PRESENT', att?.remarks || '')} style={{ padding: '0.5rem', background: 'transparent', color: 'var(--primary)', border: '1px solid var(--primary)', borderRadius: '6px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                            <Edit2 size={14} /> Override
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : selectedClass ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
          <p>No students found in this class.</p>
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
          <p>Please select a class to view attendance.</p>
        </div>
      )}
    </div>
  );
}
