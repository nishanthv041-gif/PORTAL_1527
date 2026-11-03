"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Search, Shield, CheckCircle2, XCircle, Laptop, Smartphone, LogOut } from "lucide-react";
import Link from "next/link";
import { deactivateUser, activateUser, activateAllUsers, deleteUser, forceLogoutUser } from "@/backend/api/actions/dashboard/admin/users/actions";
import { User, Teacher, Parent } from "@prisma/client";
import { useConfirm } from "@/frontend/components/ui/ConfirmDialog";
import { SearchBar, ResultsContainer, Modal } from "@/frontend/components/ui";

import { MoreVertical, Eye, Trash2 } from "lucide-react";

type SessionSummary = {
  id: string;
  deviceInfo: string | null;
  ipAddress: string | null;
  lastActiveAt: Date;
  createdAt: Date;
};

type UserWithRelations = User & {
  teacher: Teacher | null;
  parent: Parent | null;
  sessions?: SessionSummary[];
};

export default function UserListClient({
  users,
  isCurrentUserSuperAdmin = false,
}: {
  users: (UserWithRelations & { expiresAt: Date | null })[];
  isCurrentUserSuperAdmin?: boolean;
}) {
  const [userList, setUserList] = useState(users);
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [isActivating, setIsActivating] = useState(false);
  const [isPendingSearch, setIsPendingSearch] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [selectedUserForSessions, setSelectedUserForSessions] = useState<(UserWithRelations & { expiresAt: Date | null }) | null>(null);
  const router = useRouter();
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

  // Keep userList in sync when props refresh
  useEffect(() => {
    setUserList(users);
  }, [users]);

  const filteredUsers = userList.filter((user) => {
    const matchesSearch = user.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (user.teacher?.phone || user.parent?.phone || "").includes(searchTerm);
    const matchesRole = roleFilter ? user.role === roleFilter : true;
    const matchesStatus = statusFilter ? user.status === statusFilter : true;
    
    return matchesSearch && matchesRole && matchesStatus;
  }).sort((a, b) => a.name.trim().localeCompare(b.name.trim()));

  const handleDeactivate = async (id: string) => {
    const ok = await confirm({
      title: "Deactivate User?",
      message: "Are you sure you want to deactivate this user? Their records will be preserved.",
      confirmText: "Deactivate",
      cancelText: "Cancel",
      variant: "warning"
    });
    if (!ok) return;

    await deactivateUser(id);
    setOpenMenuId(null);
    router.refresh();
  };

  const handleActivateAll = async () => {
    const ok = await confirm({
      title: "Activate All Inactive Users?",
      message: "Are you sure you want to activate all inactive users across all roles?",
      confirmText: "Activate All",
      cancelText: "Cancel",
      variant: "primary"
    });
    if (!ok) return;

    setIsActivating(true);
    await activateAllUsers();
    setIsActivating(false);
    router.refresh();
  };

  return (
    <div style={{ marginTop: '2rem', background: 'var(--card-bg)', borderRadius: '12px', padding: '1.5rem', border: '1px solid var(--border-color)', width: '100%', maxWidth: '100%', minWidth: 0, boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ width: '100%', maxWidth: '320px', minWidth: '220px' }}>
          <SearchBar
            placeholder="Search name, email, phone..."
            value={searchTerm}
            onChange={(val) => setSearchTerm(val)}
            onPendingChange={(pending) => setIsPendingSearch(pending)}
            style={{ maxWidth: '100%' }}
          />
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
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


      <ResultsContainer
        isPending={isPendingSearch}
        isEmpty={filteredUsers.length === 0}
        emptyTitle="No users found"
        emptyMessage="No accounts matched your search terms or role filters."
        onReset={() => {
          setSearchTerm("");
          setRoleFilter("");
          setStatusFilter("");
        }}
        resetLabel="Reset Filters"
      >
      <div style={{ overflowX: 'auto', width: '100%', maxWidth: '100%', minWidth: 0, WebkitOverflowScrolling: 'touch' }}>
        <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", minWidth: "750px" }}>
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
                  {(() => {
                    const isSuper = user.role === 'ADMIN' && (user.email === 'jpranav116@gmail.com' || user.email === 'nishanthv041@gmail.com');
                    if (isSuper) {
                      return (
                        <span style={{ 
                          fontSize: '0.75rem', 
                          padding: '4px 8px', 
                          borderRadius: '12px', 
                          backgroundColor: 'rgba(234, 179, 8, 0.15)', 
                          color: '#eab308', 
                          fontWeight: 700,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          border: '1px solid rgba(234, 179, 8, 0.35)'
                        }}>
                          <Shield size={12} />
                          SUPER ADMIN
                        </span>
                      );
                    }
                    return (
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
                    );
                  })()}
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
                  {user.expiresAt && new Date(user.expiresAt) > new Date() && (
                    <div style={{ marginTop: '4px', fontSize: '0.75rem', color: 'var(--warning)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Shield size={10} /> Deletes {new Date(user.expiresAt).toLocaleDateString()}
                    </div>
                  )}
                </td>
                <td style={{ padding: "1rem", fontSize: '0.875rem', opacity: 0.8 }}>
                  {new Date(user.createdAt).toLocaleDateString()}
                </td>
                <td data-action-menu-container={user.id} style={{ padding: "1rem", textAlign: 'right', position: 'relative' }}>
                  <button 
                    onClick={() => setOpenMenuId(openMenuId === user.id ? null : user.id)}
                    aria-label="Actions"
                    title="Actions"
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
                        <Link 
                          href={`/dashboard/admin/teachers?id=${user.teacher.id}`} 
                          prefetch={false}
                          onClick={() => setOpenMenuId(null)}
                          style={{ padding: '0.5rem', textDecoration: 'none', color: 'inherit', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.5rem', borderRadius: '4px' }}
                        >
                          <Eye size={16} /> View Details
                        </Link>
                      )}
                      {user.role === 'PARENT' && user.parent && (
                        <Link 
                          href={`/dashboard/admin/parents?id=${user.parent.id}`} 
                          prefetch={false}
                          onClick={() => setOpenMenuId(null)}
                          style={{ padding: '0.5rem', textDecoration: 'none', color: 'inherit', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.5rem', borderRadius: '4px' }}
                        >
                          <Eye size={16} /> View Details
                        </Link>
                      )}
                      {user.status === 'ACTIVE' && user.role !== 'ADMIN' && (
                        <button 
                          onClick={() => {
                            setOpenMenuId(null);
                            handleDeactivate(user.id);
                          }}
                          style={{ padding: '0.5rem', textDecoration: 'none', color: 'var(--warning)', background: 'transparent', border: 'none', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.5rem', borderRadius: '4px', cursor: 'pointer', textAlign: 'left' }}
                        >
                          <XCircle size={16} /> Deactivate
                        </button>
                      )}
                      {user.status === 'INACTIVE' && user.role !== 'ADMIN' && (
                        <button 
                          onClick={async () => {
                            await activateUser(user.id);
                            setOpenMenuId(null);
                            router.refresh();
                          }}
                          style={{ padding: '0.5rem', textDecoration: 'none', color: 'var(--success)', background: 'transparent', border: 'none', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.5rem', borderRadius: '4px', cursor: 'pointer', textAlign: 'left' }}
                        >
                          <CheckCircle2 size={16} /> Activate
                        </button>
                      )}
                      {user.role !== 'ADMIN' && (
                        <button
                          type="button"
                          onClick={() => {
                            setOpenMenuId(null);
                            setSelectedUserForSessions(user);
                          }}
                          style={{ padding: '0.5rem', textDecoration: 'none', color: 'var(--primary)', background: 'transparent', border: 'none', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.5rem', borderRadius: '4px', cursor: 'pointer', textAlign: 'left' }}
                        >
                          <Laptop size={16} /> Active Sessions ({user.sessions?.length || 0})
                        </button>
                      )}
                      {user.role !== 'ADMIN' && (
                        <button
                          type="button"
                          onClick={async () => {
                            const ok = await confirm({
                              title: `Force Logout "${user.name}"?`,
                              message: `Are you sure you want to revoke all active sessions for "${user.name}"? They will be logged out immediately across all devices.`,
                              confirmText: "Force Logout",
                              cancelText: "Cancel",
                              variant: "danger"
                            });
                            if (!ok) return;

                            setOpenMenuId(null);
                            const res = await forceLogoutUser(user.id);
                            if (res.success) {
                              router.refresh();
                            } else {
                              alert(res.error || "Failed to force logout user.");
                            }
                          }}
                          style={{ padding: '0.5rem', textDecoration: 'none', color: 'var(--danger)', background: 'transparent', border: 'none', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.5rem', borderRadius: '4px', cursor: 'pointer', textAlign: 'left' }}
                        >
                          <LogOut size={16} /> Force Logout All Devices
                        </button>
                      )}
                      {user.role !== 'ADMIN' && (
                        <button 
                          onClick={async () => {
                            const ok = await confirm({
                              title: `Schedule 84h Deletion for ${user.name}?`,
                              message: "Are you sure you want to schedule this user for deletion in 84 hours? Access will expire automatically.",
                              confirmText: "Schedule Deletion",
                              cancelText: "Cancel",
                              variant: "warning"
                            });
                            if (!ok) return;

                            const { setUserExpiry } = await import('@/backend/api/actions/dashboard/admin/users/actions');
                            await setUserExpiry(user.id, 84);
                            setOpenMenuId(null);
                            router.refresh();
                          }}
                          style={{ padding: '0.5rem', textDecoration: 'none', color: 'var(--warning)', background: 'transparent', border: 'none', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.5rem', borderRadius: '4px', cursor: 'pointer', textAlign: 'left' }}
                        >
                          <Shield size={16} /> Delete in 84 hrs
                        </button>
                      )}
                      {/* Delete Action: Super Admins can never be deleted; other admins can only be deleted by Super Admins */}
                      {(() => {
                        const isThisUserSuperAdmin = user.role === 'ADMIN' && (user.email === 'jpranav116@gmail.com' || user.email === 'nishanthv041@gmail.com');
                        if (isThisUserSuperAdmin) return null;

                        const canDelete = user.role !== 'ADMIN' || isCurrentUserSuperAdmin;
                        if (!canDelete) return null;

                        return (
                          <button 
                            onClick={async () => {
                              const isTargetAdmin = user.role === 'ADMIN';
                              const ok = await confirm({
                                title: `Delete ${isTargetAdmin ? 'Admin' : 'User'} "${user.name}"?`,
                                message: `WARNING: This will permanently delete ${isTargetAdmin ? 'Admin account' : 'user'} "${user.name}" (${user.email}). All access and active sessions will be revoked.`,
                                confirmText: `Delete ${isTargetAdmin ? 'Admin' : 'User'}`,
                                cancelText: "Cancel",
                                variant: "danger"
                              });
                              if (!ok) return;

                              setOpenMenuId(null);
                              const previousUsers = [...userList];
                              // 0ms optimistic removal
                              setUserList(prev => prev.filter(u => u.id !== user.id));

                              const res = await deleteUser(user.id);
                              if (res?.error) {
                                alert(res.error);
                                setUserList(previousUsers); // Rollback if error
                              } else {
                                router.refresh();
                              }
                            }}
                            style={{ padding: '0.5rem', textDecoration: 'none', color: 'var(--danger)', background: 'transparent', border: 'none', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.5rem', borderRadius: '4px', cursor: 'pointer', textAlign: 'left' }}
                          >
                            <Trash2 size={16} /> Delete {user.role === 'ADMIN' ? 'Admin' : ''}
                          </button>
                        );
                      })()}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        
      </div>
      </ResultsContainer>

      {/* Active Sessions Modal */}
      {selectedUserForSessions && (
        <Modal
          isOpen={!!selectedUserForSessions}
          onClose={() => setSelectedUserForSessions(null)}
          title={`Active Sessions: ${selectedUserForSessions.name}`}
          size="md"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
              Logged-in devices for <strong>{selectedUserForSessions.email}</strong> ({selectedUserForSessions.role}).
            </p>

            {(!selectedUserForSessions.sessions || selectedUserForSessions.sessions.length === 0) ? (
              <div style={{ padding: '2rem', textAlign: 'center', background: 'var(--card)', borderRadius: '10px', border: '1px dashed var(--border-color)', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                No active device sessions currently registered.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {selectedUserForSessions.sessions.map((sess, idx) => (
                  <div
                    key={sess.id}
                    style={{
                      padding: '0.85rem 1rem',
                      borderRadius: '10px',
                      background: 'var(--card)',
                      border: '1px solid var(--border-color)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '0.75rem',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <div
                        style={{
                          width: '36px',
                          height: '36px',
                          borderRadius: '8px',
                          background: 'rgba(59, 130, 246, 0.1)',
                          color: 'var(--primary)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Laptop size={18} />
                      </div>
                      <div>
                        <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--foreground)' }}>
                          Session #{idx + 1}: {sess.deviceInfo || 'Standard Browser'}
                        </div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                          IP: {sess.ipAddress || 'unknown'} • Last active: {new Date(sess.lastActiveAt).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
              <button
                type="button"
                onClick={async () => {
                  const targetUser = selectedUserForSessions;
                  const ok = await confirm({
                    title: `Force Logout "${targetUser.name}"?`,
                    message: `This will immediately revoke all sessions on all devices for this account.`,
                    confirmText: "Force Logout",
                    cancelText: "Cancel",
                    variant: "danger",
                  });
                  if (!ok) return;

                  const res = await forceLogoutUser(targetUser.id);
                  if (res.success) {
                    setSelectedUserForSessions(null);
                    router.refresh();
                  } else {
                    alert(res.error || "Failed to force logout user.");
                  }
                }}
                style={{
                  padding: '0.65rem 1.25rem',
                  borderRadius: '8px',
                  border: 'none',
                  background: 'rgba(239, 68, 68, 0.1)',
                  color: '#ef4444',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                }}
              >
                <LogOut size={16} /> Force Logout All Devices
              </button>

              <button
                type="button"
                onClick={() => setSelectedUserForSessions(null)}
                style={{
                  padding: '0.65rem 1.25rem',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color)',
                  background: 'transparent',
                  color: 'var(--foreground)',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                }}
              >
                Close
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
