"use client";

import { useState } from "react";
import { Search, Eye, CheckCircle2, XCircle, MoreVertical, Trash2, Download } from "lucide-react";
import Link from "next/link";
import { deactivateParent, activateParent, deleteParent } from "@/backend/actions/dashboard/admin/parents/actions";
import { Parent, User, ParentStudent, Student, Class } from "@prisma/client";

type ParentWithRelations = Parent & {
  user: User;
  children: (ParentStudent & { student: Student & { class: Class | null } })[];
};

export default function ParentListClient({ parents, classes }: { parents: ParentWithRelations[], classes: Class[] }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const filteredParents = parents.filter((parent) => {
    const fullName = parent.user.name.toLowerCase();
    
    const matchesSearch = fullName.includes(searchTerm.toLowerCase()) || 
                          parent.user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (parent.phone || "").includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter ? (statusFilter === "ACTIVE" ? parent.isActive : !parent.isActive) : true;
    const matchesClass = classFilter ? parent.children.some(c => c.student.classId === classFilter) : true;
    
    return matchesSearch && matchesStatus && matchesClass;
  });


  return (
    <div style={{ marginTop: '2rem', background: 'var(--card-bg)', borderRadius: '12px', padding: '1.5rem', border: '1px solid var(--border-color)' }}>
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
        </div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border-color)", backgroundColor: 'rgba(0,0,0,0.02)' }}>
              <th style={{ padding: "1rem", fontWeight: 600, fontSize: '0.875rem' }}>Name</th>
              <th style={{ padding: "1rem", fontWeight: 600, fontSize: '0.875rem' }}>Email & Google SSO</th>
              <th style={{ padding: "1rem", fontWeight: 600, fontSize: '0.875rem' }}>Phone</th>
              <th style={{ padding: "1rem", fontWeight: 600, fontSize: '0.875rem' }}>Linked Students</th>
              <th style={{ padding: "1rem", fontWeight: 600, fontSize: '0.875rem' }}>Status</th>
              <th style={{ padding: "1rem", fontWeight: 600, fontSize: '0.875rem', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredParents.map((parent) => {
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
                  <td style={{ padding: "1rem", textAlign: 'right', position: 'relative' }}>
                    <button 
                      onClick={() => setOpenMenuId(openMenuId === parent.id ? null : parent.id)}
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
                        <Link href={`/dashboard/admin/parents/${parent.id}`} style={{ padding: '0.5rem', textDecoration: 'none', color: 'inherit', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.5rem', borderRadius: '4px' }}>
                          <Eye size={16} /> View Details
                        </Link>
                        <a href={`/api/pdf/parent/${parent.id}`} target="_blank" rel="noopener noreferrer" style={{ padding: '0.5rem', textDecoration: 'none', color: 'inherit', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.5rem', borderRadius: '4px' }}>
                          <Download size={16} /> Download PDF
                        </a>
                        {parent.isActive ? (
                          <button 
                            onClick={async () => {
                              if (confirm("Are you sure you want to deactivate this parent? Their linked student records will NOT be deleted.")) {
                                await deactivateParent(parent.id);
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
                              if (confirm("Are you sure you want to activate this parent?")) {
                                await activateParent(parent.id);
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
                            if (confirm("WARNING: This will permanently delete this parent and cannot be undone. Are you sure?")) {
                              const res = await deleteParent(parent.id);
                              if (res?.error) alert(res.error);
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
        
        {filteredParents.length === 0 && (
          <p style={{ textAlign: 'center', opacity: 0.7, padding: '2rem' }}>No parents found.</p>
        )}
      </div>
    </div>
  );
}
