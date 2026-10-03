"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Download, Eye, CheckCircle2, XCircle } from "lucide-react";
import Link from "next/link";

import { Student, Class, ParentStudent, Parent, User, Attendance } from "@prisma/client";

import { MoreVertical, Trash2 } from "lucide-react";
import { activateStudent, deactivateStudent, deleteStudent } from "@/backend/api/actions/dashboard/admin/students/actions";

type StudentWithRelations = Student & {
  class: Class | null;
  parents: (ParentStudent & { parent: Parent & { user: User } })[];
  attendances: Attendance[];
};

export default function StudentListClient({ students, classes }: { students: StudentWithRelations[], classes: Class[] }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [batchFilter, setBatchFilter] = useState("");
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const router = useRouter();

  const filteredStudents = students.filter((student) => {
    const fullName = `${student.firstName} ${student.lastName}`.toLowerCase();
    const parentName = student.parents[0]?.parent.user.name.toLowerCase() || "";
    
    const matchesSearch = fullName.includes(searchTerm.toLowerCase()) || 
                          student.rollNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          parentName.includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter ? (statusFilter === "ACTIVE" ? student.isActive : !student.isActive) : true;
    const matchesClass = classFilter ? student.classId === classFilter : true;
    const matchesBatch = batchFilter ? student.batch === batchFilter : true;
    
    return matchesSearch && matchesStatus && matchesClass && matchesBatch;
  });

  const uniqueBatches = Array.from(new Set(students.map(s => s.batch).filter(Boolean)));

  return (
    <div style={{ marginTop: '2rem', background: 'var(--card-bg)', borderRadius: '12px', padding: '1.5rem', border: '1px solid var(--border-color)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ position: 'relative', width: '100%', maxWidth: '300px' }}>
          <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} />
          <input 
            type="text" 
            placeholder="Search name, roll number, parent..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ width: '100%', padding: '0.75rem 1rem 0.75rem 2.5rem', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'transparent', color: 'inherit' }}
          />
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <select 
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value)}
            style={{ padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'transparent', color: 'inherit' }}
          >
            <option value="">All Classes</option>
            {classes.map(c => (
              <option key={c.id} value={c.id}>{c.name} - {c.section}</option>
            ))}
          </select>
          <select 
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'transparent', color: 'inherit' }}
          >
            <option value="">All Statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </select>
          <select 
            value={batchFilter}
            onChange={(e) => setBatchFilter(e.target.value)}
            style={{ padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'transparent', color: 'inherit' }}
          >
            <option value="">All Batches</option>
            {uniqueBatches.map(b => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border-color)", backgroundColor: 'rgba(0,0,0,0.02)' }}>
              <th style={{ padding: "1rem", fontWeight: 600, fontSize: '0.875rem' }}>Roll No.</th>
              <th style={{ padding: "1rem", fontWeight: 600, fontSize: '0.875rem' }}>Name</th>
              <th style={{ padding: "1rem", fontWeight: 600, fontSize: '0.875rem' }}>Class</th>
              <th style={{ padding: "1rem", fontWeight: 600, fontSize: '0.875rem' }}>Batch</th>
              <th style={{ padding: "1rem", fontWeight: 600, fontSize: '0.875rem' }}>Parent</th>
              <th style={{ padding: "1rem", fontWeight: 600, fontSize: '0.875rem' }}>Attendance</th>
              <th style={{ padding: "1rem", fontWeight: 600, fontSize: '0.875rem' }}>Status</th>
              <th style={{ padding: "1rem", fontWeight: 600, fontSize: '0.875rem', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredStudents.map((student) => {
              const parent = student.parents[0]?.parent;
              const totalDays = student.attendances.length;
              const presentDays = student.attendances.filter((a) => a.status === 'PRESENT').length;
              const attPercent = totalDays > 0 ? Math.round((presentDays / totalDays) * 100) : 0;

              return (
                <tr key={student.id} style={{ borderBottom: "1px solid var(--border-color)" }}>
                  <td style={{ padding: "1rem", fontSize: '0.875rem' }}>{student.rollNumber}</td>
                  <td style={{ padding: "1rem", fontSize: '0.875rem', fontWeight: 500 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <div style={{ width: 32, height: 32, borderRadius: '50%', backgroundColor: 'rgba(99, 102, 241, 0.1)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 600 }}>
                        {student.firstName.charAt(0).toUpperCase()}
                      </div>
                      {student.firstName} {student.lastName}
                    </div>
                  </td>
                  <td style={{ padding: "1rem", fontSize: '0.875rem' }}>
                    {student.class ? `${student.class.name} - ${student.class.section}` : 'N/A'}
                  </td>
                  <td style={{ padding: "1rem", fontSize: '0.875rem' }}>
                    {student.batch || 'N/A'}
                  </td>
                  <td style={{ padding: "1rem", fontSize: '0.875rem' }}>
                    <div style={{ opacity: 0.8 }}>{parent?.user.name || '-'}</div>
                    <div style={{ opacity: 0.6, fontSize: '0.75rem' }}>{parent?.phone || ''}</div>
                  </td>
                  <td style={{ padding: "1rem", fontSize: '0.875rem' }}>
                    <span style={{ color: attPercent >= 75 ? "var(--success)" : attPercent >= 60 ? "var(--warning)" : "var(--danger)", fontWeight: 500 }}>
                      {attPercent}%
                    </span>
                  </td>
                  <td style={{ padding: "1rem" }}>
                    {student.isActive ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', color: "var(--success)", fontSize: '0.875rem', background: 'var(--success-bg)', padding: '0.25rem 0.5rem', borderRadius: '999px' }}>
                        <CheckCircle2 size={14} /> Active
                      </span>
                    ) : (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', color: "var(--danger)", fontSize: '0.875rem', background: 'var(--danger-bg)', padding: '0.25rem 0.5rem', borderRadius: '999px' }}>
                        <XCircle size={14} /> Inactive
                      </span>
                    )}
                  </td>
                  <td style={{ padding: "1rem", textAlign: 'right', position: 'relative' }}>
                    <button 
                      onClick={() => setOpenMenuId(openMenuId === student.id ? null : student.id)}
                      style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '0.25rem' }}
                    >
                      <MoreVertical size={20} color="var(--text-secondary)" />
                    </button>
                    {openMenuId === student.id && (
                      <div style={{ 
                        position: 'absolute', right: '100%', top: '50%', transform: 'translateY(-50%)', 
                        background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '8px', 
                        boxShadow: '0 4px 6px rgba(0,0,0,0.1)', zIndex: 10, minWidth: '150px',
                        display: 'flex', flexDirection: 'column', padding: '0.5rem', textAlign: 'left'
                      }}>
                        <Link href={`/dashboard/admin/students/${student.id}`} style={{ padding: '0.5rem', textDecoration: 'none', color: 'inherit', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.5rem', borderRadius: '4px' }}>
                          <Eye size={16} /> View Details
                        </Link>
                        <a href={`/api/pdf/student/${student.id}`} target="_blank" rel="noopener noreferrer" style={{ padding: '0.5rem', textDecoration: 'none', color: 'inherit', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.5rem', borderRadius: '4px' }}>
                          <Download size={16} /> Download PDF
                        </a>
                        {student.isActive ? (
                          <button 
                            onClick={async () => {
                              if (confirm("Are you sure you want to deactivate this student?")) {
                                const res = await deactivateStudent(student.id);
                                if (res?.error) alert(res.error);
                                else router.refresh();
                                setOpenMenuId(null);
                              }
                            }}
                            style={{ padding: '0.5rem', textDecoration: 'none', color: 'var(--warning)', background: 'transparent', border: 'none', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.5rem', borderRadius: '4px', cursor: 'pointer', textAlign: 'left' }}
                          >
                            <XCircle size={16} /> Deactivate
                          </button>
                        ) : (
                          <button 
                            onClick={async () => {
                              if (confirm("Are you sure you want to activate this student?")) {
                                const res = await activateStudent(student.id);
                                if (res?.error) alert(res.error);
                                else router.refresh();
                                setOpenMenuId(null);
                              }
                            }}
                            style={{ padding: '0.5rem', textDecoration: 'none', color: 'var(--success)', background: 'transparent', border: 'none', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.5rem', borderRadius: '4px', cursor: 'pointer', textAlign: 'left' }}
                          >
                            <CheckCircle2 size={16} /> Activate
                          </button>
                        )}
                        <button 
                          onClick={async () => {
                            if (confirm("WARNING: This will permanently delete this student and cannot be undone. Are you sure?")) {
                              const res = await deleteStudent(student.id);
                              if (res?.error) alert(res.error);
                              else router.refresh();
                              setOpenMenuId(null);
                            }
                          }}
                          style={{ padding: '0.5rem', textDecoration: 'none', color: 'var(--danger)', background: 'transparent', border: 'none', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.5rem', borderRadius: '4px', cursor: 'pointer', textAlign: 'left' }}
                        >
                          <Trash2 size={16} /> Delete
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        
        {filteredStudents.length === 0 && (
          <p style={{ textAlign: 'center', opacity: 0.7, padding: '2rem' }}>No students found.</p>
        )}
      </div>
    </div>
  );
}
