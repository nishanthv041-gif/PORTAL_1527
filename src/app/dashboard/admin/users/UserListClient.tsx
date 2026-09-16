"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Shield, CheckCircle2, XCircle } from "lucide-react";
import Link from "next/link";
import { deactivateUser, activateAllUsers, deleteUser } from "@/backend/actions/dashboard/admin/users/actions";
import { User, Teacher, Parent } from "@prisma/client";

import { MoreVertical, Eye, Trash2 } from "lucide-react";

type UserWithRelations = User & {
  teacher: Teacher | null;
  parent: Parent | null;
};

export default function UserListClient({ users }: { users: UserWithRelations[] }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [isActivating, setIsActivating] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const router = useRouter();

  const filteredUsers = users.filter((user) => {
    const matchesSearch = user.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (user.teacher?.phone || user.parent?.phone || "").includes(searchTerm);
    const matchesRole = roleFilter ? user.role === roleFilter : true;
    const matchesStatus = statusFilter ? user.status === statusFilter : true;
    
    return matchesSearch && matchesRole && matchesStatus;
  });

  const handleDeactivate = async (id: string) => {
    if (confirm("Are you sure you want to deactivate this user? Their records will be preserved.")) {
      await deactivateUser(id);
      setOpenMenuId(null);
      router.refresh();
    }
  };

  const handleActivateAll = async () => {
    if (confirm("Are you sure you want to activate all inactive users?")) {
      setIsActivating(true);
      await activateAllUsers();
      setIsActivating(false);
      router.refresh();
    }
  };

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
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            style={{ padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'transparent', color: 'inherit' }}
          >
            <option value="">All Roles</option>
            <option value="ADMIN">Admin</option>
            <option value="TEACHER">Teacher</option>
            <option value="PARENT">Parent</option>
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
          <button 
            onClick={handleActivateAll}
            disabled={isActivating}
            style={{ padding: '0.75rem 1.5rem', backgroundColor: "var(--success)", color: "var(--success-fg)", border: 'none', borderRadius: '8px', fontWeight: 500, cursor: 'pointer' }}
          >
            {isActivating ? "Activating..." : "Activate All"}
          </button>
        </div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border-color)", backgroundColor: 'rgba(0,0,0,0.02)' }}>
              <th style={{ padding: "1rem", fontWeight: 600, fontSize: '0.875rem' }}>Name</th>
              <th style={{ padding: "1rem", fontWeight: 600, fontSize: '0.875rem' }}>Email / Phone</th>
              <th style={{ padding: "1rem", fontWeight: 600, fontSize: '0.875rem' }}>Role</th>
              <th style={{ padding: "1rem", fontWeight: 600, fontSize: '0.875rem' }}>Status</th>
              <th style={{ padding: "1rem", fontWeight: 600, fontSize: '0.875rem' }}>Created At</th>
              <th style={{ padding: "1rem", fontWeight: 600, fontSize: '0.875rem', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map((user) => (
              <tr key={user.id} style={{ borderBottom: "1px solid var(--border-color)" }}>
                <td style={{ padding: "1rem", fontSize: '0.875rem', fontWeight: 500 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', backgroundColor: 'rgba(99, 102, 241, 0.1)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 600 }}>
                      {user.name.charAt(0).toUpperCase()}
                    </div>
                    {user.name}
                  </div>
                </td>
                <td style={{ padding: "1rem", fontSize: '0.875rem' }}>
                  <div style={{ opacity: 0.8 }}>{user.email}</div>
                  <div style={{ opacity: 0.6, fontSize: '0.75rem' }}>{user.teacher?.phone || user.parent?.phone || "No phone"}</div>
                </td>
                <td style={{ padding: "1rem" }}>
                  <span style={{ 
                    fontSize: '0.75rem', 
                    padding: '4px 8px', 
                    borderRadius: '12px', 
                    backgroundColor: user.role === 'ADMIN' ? 'var(--danger-bg)' : user.role === 'TEACHER' ? 'var(--primary-bg)' : 'var(--success-bg)', 
                    color: user.role === 'ADMIN' ? "var(--danger)" : user.role === 'TEACHER' ? "var(--primary)" : "var(--success)",
                    fontWeight: 500,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}>
                    {user.role === 'ADMIN' && <Shield size={12} />}
                    {user.role}
                  </span>
                </td>
                <td style={{ padding: "1rem" }}>
                  {user.status === 'ACTIVE' ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', color: "var(--success)", fontSize: '0.875rem', background: 'var(--success-bg)', padding: '0.25rem 0.5rem', borderRadius: '999px' }}>
                      <CheckCircle2 size={14} /> Active
                    </span>
                  ) : (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', color: "var(--danger)", fontSize: '0.875rem', background: 'var(--danger-bg)', padding: '0.25rem 0.5rem', borderRadius: '999px' }}>
                      <XCircle size={14} /> Inactive
                    </span>
                  )}
                </td>
                <td style={{ padding: "1rem", fontSize: '0.875rem', opacity: 0.8 }}>
                  {new Date(user.createdAt).toLocaleDateString()}
                </td>
                <td style={{ padding: "1rem", textAlign: 'right', position: 'relative' }}>
                  <button 
                    onClick={() => setOpenMenuId(openMenuId === user.id ? null : user.id)}
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '0.25rem' }}
                  >
                    <MoreVertical size={20} color="var(--text-secondary)" />
                  </button>
                  {openMenuId === user.id && (
                    <div style={{ 
                      position: 'absolute', right: '100%', top: '50%', transform: 'translateY(-50%)', 
                      background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '8px', 
                      boxShadow: '0 4px 6px rgba(0,0,0,0.1)', zIndex: 10, minWidth: '150px',
                      display: 'flex', flexDirection: 'column', padding: '0.5rem', textAlign: 'left'
                    }}>
                      {user.role === 'TEACHER' && user.teacher && (
                        <Link href={`/dashboard/admin/teachers?id=${user.teacher.id}`} style={{ padding: '0.5rem', textDecoration: 'none', color: 'inherit', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.5rem', borderRadius: '4px' }}>
                          <Eye size={16} /> View Details
                        </Link>
                      )}
                      {user.role === 'PARENT' && user.parent && (
                        <Link href={`/dashboard/admin/parents?id=${user.parent.id}`} style={{ padding: '0.5rem', textDecoration: 'none', color: 'inherit', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.5rem', borderRadius: '4px' }}>
                          <Eye size={16} /> View Details
                        </Link>
                      )}
                      {user.status === 'ACTIVE' && user.role !== 'ADMIN' && (
                        <button 
                          onClick={() => handleDeactivate(user.id)}
                          style={{ padding: '0.5rem', textDecoration: 'none', color: 'var(--warning)', background: 'transparent', border: 'none', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.5rem', borderRadius: '4px', cursor: 'pointer', textAlign: 'left' }}
                        >
                          <XCircle size={16} /> Deactivate
                        </button>
                      )}
                      {user.role !== 'ADMIN' && (
                        <button 
                          onClick={async () => {
                            if (confirm("WARNING: This will permanently delete this account and cannot be undone. Are you sure?")) {
                              const res = await deleteUser(user.id);
                              if (res?.error) alert(res.error);
                              else router.refresh();
                              setOpenMenuId(null);
                            }
                          }}
                          style={{ padding: '0.5rem', textDecoration: 'none', color: 'var(--danger)', background: 'transparent', border: 'none', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.5rem', borderRadius: '4px', cursor: 'pointer', textAlign: 'left' }}
                        >
                          <Trash2 size={16} /> Delete
                        </button>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        
        {filteredUsers.length === 0 && (
          <p style={{ textAlign: 'center', opacity: 0.7, padding: '2rem' }}>No users found matching your filters.</p>
        )}
      </div>
    </div>
  );
}
