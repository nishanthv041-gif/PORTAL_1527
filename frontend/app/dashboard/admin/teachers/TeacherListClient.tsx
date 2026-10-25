"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Search, Download, Eye, CheckCircle2, XCircle, Trash2, FileSpreadsheet } from "lucide-react";
import Link from "next/link";
import BulkUpload from "../create-roles/BulkUpload";
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
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("");
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 25;
  const router = useRouter();

  // Close action menu when clicking outside anywhere on the page or pressing Escape
  useEffect(() => {
    if (!openMenuId) return;

    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('[data-action-menu-container]')) {
        return;
      }
      setOpenMenuId(null);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpenMenuId(null);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [openMenuId]);

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

  const totalPages = Math.max(1, Math.ceil(filteredTeachers.length / pageSize));
  const startIndex = (currentPage - 1) * pageSize;
  const paginatedTeachers = filteredTeachers.slice(startIndex, startIndex + pageSize);

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
    <div style={{ marginTop: '2rem', background: 'var(--card-bg)', borderRadius: '12px', padding: '1.5rem', border: '1px solid var(--border-color)', width: '100%', maxWidth: '100%', minWidth: 0, boxSizing: 'border-box' }}>
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
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            type="button"
            onClick={() => setShowBulkUpload(!showBulkUpload)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.5rem",
              padding: "0.75rem 1rem",
              borderRadius: "8px",
              border: "1px solid var(--primary, #6366f1)",
              backgroundColor: showBulkUpload ? "var(--primary, #6366f1)" : "rgba(99, 102, 241, 0.08)",
              color: showBulkUpload ? "#ffffff" : "var(--primary, #6366f1)",
              fontWeight: 600,
              fontSize: "0.875rem",
              cursor: "pointer",
              transition: "all 0.2s ease"
            }}
          >
            <FileSpreadsheet size={18} />
            {showBulkUpload ? "Hide Bulk Import" : "Bulk Import Teachers"}
          </button>
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

      {showBulkUpload && (
        <div style={{ marginBottom: "2rem" }}>
          <BulkUpload type="teacher" classes={allClasses} />
        </div>
      )}

      <div style={{ overflowX: 'auto', width: '100%', maxWidth: '100%', minWidth: 0, WebkitOverflowScrolling: 'touch' }}>
        <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", minWidth: "750px" }}>
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
            {paginatedTeachers.map((teacher) => {
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
                  <td data-action-menu-container={teacher.id} style={{ padding: "1rem", textAlign: 'right', position: 'relative' }}>
                    <button 
                      onClick={() => setOpenMenuId(openMenuId === teacher.id ? null : teacher.id)}
                      aria-label="Actions"
                      title="Actions"
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
                        <Link 
                          href={`/dashboard/admin/teachers/${teacher.id}`} 
                          onClick={() => setOpenMenuId(null)}
                          style={{ padding: '0.5rem', textDecoration: 'none', color: 'inherit', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.5rem', borderRadius: '4px' }}
                        >
                          <Eye size={16} /> View Details
                        </Link>
                        <a 
                          href={`/api/pdf/teacher/${teacher.id}`} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          onClick={() => setOpenMenuId(null)}
                          style={{ padding: '0.5rem', textDecoration: 'none', color: 'inherit', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.5rem', borderRadius: '4px' }}
                        >
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

        {filteredTeachers.length > pageSize && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', borderTop: '1px solid var(--border-color)', flexWrap: 'wrap', gap: '0.5rem', fontSize: '0.875rem' }}>
            <span style={{ color: 'var(--text-secondary)' }}>
              Showing {startIndex + 1} to {Math.min(startIndex + pageSize, filteredTeachers.length)} of {filteredTeachers.length} teachers
            </span>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                style={{
                  padding: '0.4rem 0.8rem',
                  borderRadius: '6px',
                  border: '1px solid var(--border-color)',
                  background: 'transparent',
                  color: 'inherit',
                  cursor: currentPage <= 1 ? 'not-allowed' : 'pointer',
                  opacity: currentPage <= 1 ? 0.4 : 1
                }}
              >
                Previous
              </button>
              <span style={{ padding: '0.4rem 0.7rem', fontWeight: 600 }}>
                Page {currentPage} of {totalPages}
              </span>
              <button
                type="button"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                style={{
                  padding: '0.4rem 0.8rem',
                  borderRadius: '6px',
                  border: '1px solid var(--border-color)',
                  background: 'transparent',
                  color: 'inherit',
                  cursor: currentPage >= totalPages ? 'not-allowed' : 'pointer',
                  opacity: currentPage >= totalPages ? 0.4 : 1
                }}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
