"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Download, Eye, CheckCircle2, XCircle, Trash2 } from "lucide-react";
import Link from "next/link";
import { deactivateTeacher, assignClassTeacher, deleteTeacher } from "@/backend/api/actions/dashboard/admin/teachers/actions";
import { Teacher, User, Class, Subject } from "@prisma/client";
import { MoreVertical } from "lucide-react";

type TeacherWithRelations = Teacher & {
  user: User;
  classes: Class[];
  subjects: Subject[];
  classTeacherOf?: Class | null;
};

export default function TeacherListClient({ teachers, allClasses, allSubjects }: { teachers: TeacherWithRelations[], allClasses: Class[], allSubjects: Subject[] }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("");
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const router = useRouter();

  const filteredTeachers = teachers.filter((teacher) => {
    const fullName = teacher.user.name.toLowerCase();
    
    const matchesSearch = fullName.includes(searchTerm.toLowerCase()) || 
                          teacher.user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (teacher.phone || "").includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter ? (statusFilter === "ACTIVE" ? teacher.isActive : !teacher.isActive) : true;
    
    // Check if teacher teaches the selected subject name
    const matchesSubject = subjectFilter ? teacher.subjects.some(s => s.name === subjectFilter) : true;

    return matchesSearch && matchesStatus && matchesSubject;
  });

  const handleDeactivate = async (id: string) => {
    if (confirm("Are you sure you want to deactivate this teacher?")) {
      await deactivateTeacher(id);
      setOpenMenuId(null);
      router.refresh();
    }
  };

  const handleAssignClassTeacher = async (teacherId: string, classId: string) => {
    const res = await assignClassTeacher(teacherId, classId);
    if (res.error) {
      alert(res.error);
    }
  };

  return (
    <div style={{ marginTop: '2rem', background: 'var(--card-bg)', borderRadius: '12px', padding: '1.5rem', border: '1px solid var(--border-color)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ position: 'relative', width: '100%', maxWidth: '300px' }}>
          <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} />
          <input 
            type="text" 
            placeholder="Search name, phone..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ width: '100%', padding: '0.75rem 1rem 0.75rem 2.5rem', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'transparent', color: 'inherit' }}
          />
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <select 
            value={subjectFilter}
            onChange={(e) => setSubjectFilter(e.target.value)}
            style={{ padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'transparent', color: 'inherit' }}
          >
            <option value="">All Subjects</option>
            {allSubjects.map(s => (
              <option key={s.id} value={s.name}>{s.name}</option>
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
        </div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border-color)", backgroundColor: 'rgba(0,0,0,0.02)' }}>
              <th style={{ padding: "1rem", fontWeight: 600, fontSize: '0.875rem' }}>Name</th>
              <th style={{ padding: "1rem", fontWeight: 600, fontSize: '0.875rem' }}>Email & Google SSO</th>
              <th style={{ padding: "1rem", fontWeight: 600, fontSize: '0.875rem' }}>Phone</th>
              <th style={{ padding: "1rem", fontWeight: 600, fontSize: '0.875rem' }}>Subjects</th>
              <th style={{ padding: "1rem", fontWeight: 600, fontSize: '0.875rem' }}>Classes</th>
              <th style={{ padding: "1rem", fontWeight: 600, fontSize: '0.875rem' }}>Status</th>
              <th style={{ padding: "1rem", fontWeight: 600, fontSize: '0.875rem', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredTeachers.map((teacher) => {
              const subjectNames = Array.from(new Set(teacher.subjects.map((s) => s.name))).join(", ");
              const classNames = teacher.classes.map((c) => `${c.name}-${c.section}`).join(", ");
              const classTeacherRole = teacher.classTeacherOf ? `${teacher.classTeacherOf.name}-${teacher.classTeacherOf.section}` : null;

              return (
                <tr key={teacher.id} style={{ borderBottom: "1px solid var(--border-color)" }}>
                  <td style={{ padding: "1rem", fontSize: '0.875rem', fontWeight: 500 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <div style={{ width: 32, height: 32, borderRadius: '50%', backgroundColor: 'var(--primary-bg)', color: "var(--primary)", display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 600 }}>
                        {teacher.user.name.charAt(0).toUpperCase()}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span>{teacher.user.name}</span>
                        {classTeacherRole && (
                          <span style={{ fontSize: '0.75rem', color: 'var(--primary)', fontWeight: 600 }}>
                            Class Teacher: {classTeacherRole}
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: "1rem", fontSize: '0.875rem' }}>
                    <div style={{ opacity: 0.8 }}>{teacher.user.email}</div>
                    {teacher.user.googleEmail && (
                      <div style={{ opacity: 0.6, fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        {teacher.user.googleEmailVerified ? <CheckCircle2 size={12} color="var(--success)"/> : <XCircle size={12} color="var(--danger)"/>}
                        {teacher.user.googleEmail}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: "1rem", fontSize: '0.875rem' }}>
                    {teacher.phone || '-'}
                  </td>
                  <td style={{ padding: "1rem", fontSize: '0.875rem' }}>
                    {subjectNames || '-'}
                  </td>
                  <td style={{ padding: "1rem", fontSize: '0.875rem' }}>
                    {classNames || '-'}
                  </td>
                  <td style={{ padding: "1rem" }}>
                    {teacher.isActive ? (
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
                      onClick={() => setOpenMenuId(openMenuId === teacher.id ? null : teacher.id)}
                      style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '0.25rem' }}
                    >
                      <MoreVertical size={20} color="var(--text-secondary)" />
                    </button>
                    {openMenuId === teacher.id && (
                      <div style={{ 
                        position: 'absolute', right: '100%', top: '50%', transform: 'translateY(-50%)', 
                        background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '8px', 
                        boxShadow: '0 4px 6px rgba(0,0,0,0.1)', zIndex: 10, minWidth: '150px',
                        display: 'flex', flexDirection: 'column', padding: '0.5rem', textAlign: 'left'
                      }}>
                        <Link href={`/dashboard/admin/teachers/${teacher.id}`} style={{ padding: '0.5rem', textDecoration: 'none', color: 'inherit', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.5rem', borderRadius: '4px' }}>
                          <Eye size={16} /> View Details
                        </Link>
                        <a href={`/api/pdf/teacher/${teacher.id}`} target="_blank" rel="noopener noreferrer" style={{ padding: '0.5rem', textDecoration: 'none', color: 'inherit', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.5rem', borderRadius: '4px' }}>
                          <Download size={16} /> Download PDF
                        </a>
                        <div style={{ padding: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.25rem', borderTop: '1px solid var(--border-color)', marginTop: '0.25rem', paddingTop: '0.25rem' }}>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Set Class Teacher:</span>
                          <select 
                            onChange={(e) => handleAssignClassTeacher(teacher.id, e.target.value)}
                            value={teacher.classTeacherOf?.id || ""}
                            style={{ padding: '0.25rem', fontSize: '0.875rem', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'transparent' }}
                          >
                            <option value="">None</option>
                            {allClasses.map(c => (
                              <option key={c.id} value={c.id}>{c.name}-{c.section}</option>
                            ))}
                          </select>
                        </div>
                        {teacher.isActive && (
                          <button onClick={() => handleDeactivate(teacher.id)} style={{ padding: '0.5rem', textDecoration: 'none', color: 'var(--warning)', background: 'transparent', border: 'none', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.5rem', borderRadius: '4px', cursor: 'pointer', textAlign: 'left' }}>
                            <XCircle size={16} /> Deactivate
                          </button>
                        )}
                        <button 
                          onClick={async () => {
                            if (confirm("WARNING: This will permanently delete this teacher and cannot be undone. Are you sure?")) {
                              const res = await deleteTeacher(teacher.id);
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
        
        {filteredTeachers.length === 0 && (
          <p style={{ textAlign: 'center', opacity: 0.7, padding: '2rem' }}>No teachers found.</p>
        )}
      </div>
    </div>
  );
}
