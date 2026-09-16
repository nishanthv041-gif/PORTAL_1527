"use client";

import { useState } from "react";
import { Plus, ShieldAlert, Calendar, User, FileText, Trash2, ShieldCheck, Shield } from "lucide-react";
import { createDisciplineRecordAction, deleteDisciplineRecordAction } from "@/backend/actions/dashboard/admin/discipline/actions";
import { DisciplineRecord, Student, Class } from "@prisma/client";

type StudentWithClass = Student & { class: Class | null };
type DisciplineRecordWithRelations = DisciplineRecord & { student: StudentWithClass };

export default function DisciplineClient({ records, students }: { records: DisciplineRecordWithRelations[], students: StudentWithClass[] }) {
  const [showCreate, setShowCreate] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    const formData = new FormData(e.currentTarget);
    const res = await createDisciplineRecordAction(formData);
    setIsSubmitting(false);
    if (res.error) {
      alert(res.error);
    } else {
      setShowCreate(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to delete this record?")) {
      const res = await deleteDisciplineRecordAction(id);
      if (res.error) alert(res.error);
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity.toUpperCase()) {
      case 'HIGH': return <ShieldAlert size={16} color="var(--danger)" />;
      case 'MEDIUM': return <Shield size={16} color="var(--warning)" />;
      case 'LOW': return <ShieldCheck size={16} color="var(--success)" />;
      default: return <Shield size={16} />;
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '2rem' }}>
        <button 
          onClick={() => setShowCreate(!showCreate)}
          style={{ padding: '0.75rem 1.5rem', backgroundColor: "var(--primary)", color: "var(--primary-fg)", border: 'none', borderRadius: '8px', fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
        >
          {showCreate ? "Cancel" : <><Plus size={18} /> Add Record</>}
        </button>
      </div>

      {showCreate && (
        <div style={{ background: 'var(--card-bg)', borderRadius: '12px', padding: '2rem', border: '1px solid var(--border-color)', marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1.5rem' }}>File Discipline Record</h2>
          <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>Student *</label>
              <select required name="studentId" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent' }}>
                <option value="">Select Student</option>
                {students.map(s => (
                  <option key={s.id} value={s.id}>{s.firstName} {s.lastName} ({s.class?.name}-{s.class?.section})</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>Date of Incident *</label>
              <input required name="date" type="date" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent' }} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>Incident Title *</label>
              <input required name="incident" type="text" placeholder="e.g., Late to class, Disruptive behavior" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent' }} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>Detailed Description *</label>
              <textarea required name="description" rows={3} style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent', resize: 'vertical' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>Severity *</label>
              <select required name="severity" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent' }}>
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="SEVERE">Severe</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>Status *</label>
              <select required name="status" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent' }}>
                <option value="OPEN">Open / Pending Action</option>
                <option value="RESOLVED">Resolved / Closed</option>
              </select>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>Action Taken *</label>
              <input required name="actionTaken" type="text" placeholder="e.g., Verbal warning, Meeting with parents" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent' }} />
            </div>
            <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
              <button disabled={isSubmitting} type="submit" style={{ padding: '0.75rem 2rem', backgroundColor: "var(--danger)", color: "var(--danger-fg)", border: 'none', borderRadius: '8px', fontWeight: 500, cursor: isSubmitting ? 'not-allowed' : 'pointer' }}>
                {isSubmitting ? "Saving..." : "Save Record"}
              </button>
            </div>
          </form>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '1.5rem' }}>
        {records.map(record => (
          <div key={record.id} style={{ background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border-color)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '1.5rem', flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                    {getSeverityIcon(record.severity)}
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                      {record.severity} Severity
                    </span>
                  </div>
                  <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600 }}>{record.incident}</h3>
                </div>
                <button onClick={() => handleDelete(record.id)} style={{ background: 'transparent', border: 'none', color: "var(--danger)", cursor: 'pointer', padding: '0.25rem' }}>
                  <Trash2 size={16} />
                </button>
              </div>
              
              <div style={{ padding: '1rem', background: 'rgba(0,0,0,0.02)', borderRadius: '8px', marginBottom: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>
                  <User size={14} color="var(--primary)" /> {record.student.firstName} {record.student.lastName}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginLeft: '1.25rem' }}>
                  Class: {record.student.class?.name}-{record.student.class?.section}
                </div>
              </div>

              <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', margin: '0 0 1rem 0', lineHeight: 1.5 }}>
                {record.description}
              </p>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: "var(--warning)", fontSize: '0.875rem', fontWeight: 500 }}>
                <FileText size={16} /> {record.actionTaken}
              </div>
            </div>

            <div style={{ padding: '1rem 1.5rem', background: 'rgba(0,0,0,0.02)', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                <Calendar size={14} /> {new Date(record.date).toLocaleDateString()}
              </div>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, padding: '0.25rem 0.5rem', borderRadius: '12px', background: record.status === 'RESOLVED' ? 'var(--success-bg)' : 'var(--danger-bg)', color: record.status === 'RESOLVED' ? "var(--success)" : "var(--danger)" }}>
                {record.status}
              </span>
            </div>
          </div>
        ))}
        {records.length === 0 && (
          <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '4rem', color: 'var(--text-secondary)', background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
            <ShieldCheck size={48} style={{ opacity: 0.2, margin: '0 auto 1rem', color: "var(--success)" }} />
            <p>No discipline records found. Excellent!</p>
          </div>
        )}
      </div>
    </div>
  );
}
