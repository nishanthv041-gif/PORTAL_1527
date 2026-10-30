"use client";

import { useState, useMemo, useEffect } from "react";
import { Search, Eye, CheckCircle2, XCircle, MoreVertical, Trash2, Download } from "lucide-react";
import Link from "next/link";
import { deactivateParent, activateParent, deleteParent } from "@/backend/api/actions/dashboard/admin/parents/actions";
import { Parent, User, ParentStudent, Student, Class } from "@prisma/client";
import { useConfirm } from "@/frontend/components/ui/ConfirmDialog";

type ParentWithRelations = Parent & {
  user: User;
  children: (ParentStudent & { student: Student & { class: Class | null } })[];
};

export default function ParentListClient({ 
  parents, 
  classes,
  totalStudentsCount
}: { 
  parents: ParentWithRelations[]; 
  classes: Class[];
  totalStudentsCount?: number;
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [studentCountFilter, setStudentCountFilter] = useState("");
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 25;
  const confirm = useConfirm();

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

  // Compute total student count across all parents or DB
  const totalStudents = totalStudentsCount !== undefined 
    ? totalStudentsCount 
    : new Set(parents.flatMap(p => p.children.map(c => c.studentId))).size;

  const filteredParents = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    return parents.filter((parent) => {
      const fullName = parent.user.name.toLowerCase();
      
      const matchesSearch = !term || fullName.includes(term) || 
                            parent.user.email.toLowerCase().includes(term) ||
                            (parent.phone || "").includes(term);
      const matchesStatus = statusFilter ? (statusFilter === "ACTIVE" ? parent.isActive : !parent.isActive) : true;
      const matchesClass = classFilter ? parent.children.some(c => c.student.classId === classFilter) : true;
      
      let matchesStudentCount = true;
      if (studentCountFilter === "has_students") {
        matchesStudentCount = parent.children.length > 0;
      } else if (studentCountFilter === "no_students") {
        matchesStudentCount = parent.children.length === 0;
      } else if (studentCountFilter === "multiple") {
        matchesStudentCount = parent.children.length > 1;
      }
      
      return matchesSearch && matchesStatus && matchesClass && matchesStudentCount;
    }).sort((a, b) => a.user.name.trim().localeCompare(b.user.name.trim()));
  }, [parents, searchTerm, statusFilter, classFilter, studentCountFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredParents.length / pageSize));
  const startIndex = (currentPage - 1) * pageSize;
  const paginatedParents = filteredParents.slice(startIndex, startIndex + pageSize);


  return (
    <div style={{ marginTop: '2rem', background: 'var(--card-bg)', borderRadius: '12px', padding: '1.5rem', border: '1px solid var(--border-color)', width: '100%', maxWidth: '100%', minWidth: 0, boxSizing: 'border-box' }}>
      {/* Parent Count & Metrics Bar */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', 
        gap: '1.25rem', 
        marginBottom: '1.5rem',
        padding: '1.25rem',
        background: 'rgba(0,0,0,0.02)',
        borderRadius: '10px',
        border: '1px solid var(--border-color)'
      }}>
        <div>
          <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600 }}>Total Parents</span>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary)' }}>{parents.length}</div>
        </div>
        <div>
          <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600 }}>Active Parents</span>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--success)' }}>
            {parents.filter(p => p.isActive && p.user.status === 'ACTIVE').length}
          </div>
        </div>
        <div>
          <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600 }}>Total Student Count</span>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--primary)' }}>
            {totalStudents}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ position: 'relative', width: '100%', maxWidth: '300px' }}>
          <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} />
          <input 
            type="text" 
            placeholder="Search name, email, phone..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ width: '100%', padding: '0.75rem 1rem 0.75rem 2.5rem', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'transparent', color: 'inherit' }}
          />
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
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
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value)}
            style={{ padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'transparent', color: 'inherit' }}
          >
            <option value="">All Classes</option>
            {classes?.map(c => (
              <option key={c.id} value={c.id}>{c.name} - {c.section}</option>
            ))}
          </select>
          <select 
            value={studentCountFilter}
            onChange={(e) => setStudentCountFilter(e.target.value)}
            style={{ padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'transparent', color: 'inherit' }}
          >
            <option value="">All Student Counts</option>
            <option value="has_students">With Students (1+)</option>
            <option value="no_students">No Students (0)</option>
            <option value="multiple">Multiple (2+)</option>
          </select>
        </div>
      </div>

      <div style={{ overflowX: 'auto', width: '100%', maxWidth: '100%', minWidth: 0, WebkitOverflowScrolling: 'touch' }}>
        <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", minWidth: "800px" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border-color)", backgroundColor: 'rgba(0,0,0,0.02)' }}>
              <th style={{ padding: "1rem", fontWeight: 600, fontSize: '0.875rem' }}>Name</th>
              <th style={{ padding: "1rem", fontWeight: 600, fontSize: '0.875rem' }}>Email & Google SSO</th>
              <th style={{ padding: "1rem", fontWeight: 600, fontSize: '0.875rem' }}>Phone</th>
              <th style={{ padding: "1rem", fontWeight: 600, fontSize: '0.875rem' }}>Student Count</th>
              <th style={{ padding: "1rem", fontWeight: 600, fontSize: '0.875rem' }}>Linked Students</th>
              <th style={{ padding: "1rem", fontWeight: 600, fontSize: '0.875rem' }}>Status</th>
              <th style={{ padding: "1rem", fontWeight: 600, fontSize: '0.875rem', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {paginatedParents.map((parent) => {
              const studentsList = parent.children.map((c) => 
                `${c.student.firstName} (${c.student.rollNumber}) - ${c.student.class ? `${c.student.class.name}-${c.student.class.section}` : 'N/A'}`
              ).join(", ");

              return (
                <tr key={parent.id} style={{ borderBottom: "1px solid var(--border-color)" }}>
                  <td style={{ padding: "1rem", fontSize: '0.875rem', fontWeight: 500 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <div style={{ width: 32, height: 32, borderRadius: '50%', backgroundColor: 'var(--success-bg)', color: "var(--success)", display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 600 }}>
                        {parent.user.name.charAt(0).toUpperCase()}
                      </div>
                      {parent.user.name}
                    </div>
                  </td>
                  <td style={{ padding: "1rem", fontSize: '0.875rem' }}>
                    <div style={{ opacity: 0.8 }}>{parent.user.email}</div>
                    {parent.user.googleEmail && (
                      <div style={{ opacity: 0.6, fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        {parent.user.googleEmailVerified ? <CheckCircle2 size={12} color="var(--success)"/> : <XCircle size={12} color="var(--danger)"/>}
                        {parent.user.googleEmail}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: "1rem", fontSize: '0.875rem' }}>
                    {parent.phone || '-'}
                  </td>
                  <td style={{ padding: "1rem", fontSize: '0.875rem' }}>
                    <span style={{ 
                      display: 'inline-flex', 
                      alignItems: 'center', 
                      justifyContent: 'center',
                      minWidth: '28px',
                      height: '24px',
                      padding: '0 0.5rem',
                      borderRadius: '12px',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      background: parent.children.length > 0 ? 'rgba(59, 130, 246, 0.12)' : 'rgba(0,0,0,0.05)',
                      color: parent.children.length > 0 ? 'var(--primary)' : 'var(--text-secondary)'
                    }}>
                      {parent.children.length}
                    </span>
                  </td>
                  <td style={{ padding: "1rem", fontSize: '0.875rem' }}>
                    {studentsList || '-'}
                  </td>
                  <td style={{ padding: "1rem" }}>
                    {parent.isActive ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', color: "var(--success)", fontSize: '0.875rem', background: 'var(--success-bg)', padding: '0.25rem 0.5rem', borderRadius: '999px' }}>
                        <CheckCircle2 size={14} /> Active
                      </span>
                    ) : (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', color: "var(--danger)", fontSize: '0.875rem', background: 'var(--danger-bg)', padding: '0.25rem 0.5rem', borderRadius: '999px' }}>
                        <XCircle size={14} /> Inactive
                      </span>
                    )}
                  </td>
                  <td data-action-menu-container={parent.id} style={{ padding: "1rem", textAlign: 'right', position: 'relative' }}>
                    <button 
                      onClick={() => setOpenMenuId(openMenuId === parent.id ? null : parent.id)}
                      aria-label="Actions"
                      title="Actions"
                      style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '0.25rem' }}
                    >
                      <MoreVertical size={20} color="var(--text-secondary)" />
                    </button>
                    {openMenuId === parent.id && (
                      <div style={{ 
                        position: 'absolute', right: '100%', top: '50%', transform: 'translateY(-50%)', 
                        background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '8px', 
                        boxShadow: '0 4px 6px rgba(0,0,0,0.1)', zIndex: 10, minWidth: '150px',
                        display: 'flex', flexDirection: 'column', padding: '0.5rem', textAlign: 'left'
                      }}>
                        <Link 
                          href={`/dashboard/admin/parents/${parent.id}`} 
                          onClick={() => setOpenMenuId(null)}
                          style={{ padding: '0.5rem', textDecoration: 'none', color: 'inherit', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.5rem', borderRadius: '4px' }}
                        >
                          <Eye size={16} /> View Details
                        </Link>
                        <a 
                          href={`/api/pdf/parent/${parent.id}`} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          onClick={() => setOpenMenuId(null)}
                          style={{ padding: '0.5rem', textDecoration: 'none', color: 'inherit', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.5rem', borderRadius: '4px' }}
                        >
                          <Download size={16} /> Download PDF
                        </a>
                        {parent.isActive ? (
                          <button 
                            onClick={async () => {
                              const ok = await confirm({
                                title: `Deactivate Parent Account?`,
                                message: `Are you sure you want to deactivate ${parent.user.name}'s account? Their linked student records will NOT be deleted.`,
                                confirmText: "Deactivate",
                                cancelText: "Cancel",
                                variant: "warning"
                              });
                              if (!ok) return;

                              await deactivateParent(parent.id);
                              setOpenMenuId(null);
                            }}
                            style={{ padding: '0.5rem', textDecoration: 'none', color: 'var(--warning)', background: 'transparent', border: 'none', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.5rem', borderRadius: '4px', cursor: 'pointer', textAlign: 'left' }}
                          >
                            <XCircle size={16} /> Deactivate
                          </button>
                        ) : (
                          <button 
                            onClick={async () => {
                              const ok = await confirm({
                                title: `Activate Parent Account?`,
                                message: `Are you sure you want to activate ${parent.user.name}'s account?`,
                                confirmText: "Activate",
                                cancelText: "Cancel",
                                variant: "primary"
                              });
                              if (!ok) return;

                              await activateParent(parent.id);
                              setOpenMenuId(null);
                            }}
                            style={{ padding: '0.5rem', textDecoration: 'none', color: 'var(--success)', background: 'transparent', border: 'none', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.5rem', borderRadius: '4px', cursor: 'pointer', textAlign: 'left' }}
                          >
                            <CheckCircle2 size={16} /> Activate
                          </button>
                        )}
                        <button 
                          onClick={async () => {
                            const ok = await confirm({
                              title: `Delete Parent "${parent.user.name}"?`,
                              message: "WARNING: This will permanently delete this parent account and cannot be undone. Are you sure?",
                              confirmText: "Delete Parent",
                              cancelText: "Cancel",
                              variant: "danger"
                            });
                            if (!ok) return;

                            const res = await deleteParent(parent.id);
                            if (res?.error) alert(res.error);
                            setOpenMenuId(null);
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
        
        {filteredParents.length === 0 && (
          <p style={{ textAlign: 'center', opacity: 0.7, padding: '2rem' }}>No parents found.</p>
        )}

        {filteredParents.length > pageSize && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', borderTop: '1px solid var(--border-color)', flexWrap: 'wrap', gap: '0.5rem', fontSize: '0.875rem' }}>
            <span style={{ color: 'var(--text-secondary)' }}>
              Showing {startIndex + 1} to {Math.min(startIndex + pageSize, filteredParents.length)} of {filteredParents.length} parents
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
