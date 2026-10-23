"use client";

import { useState, useEffect } from "react";
import styles from "../users/users.module.css";
import { Plus, Mail, CheckCircle, Loader2 } from "lucide-react";
import { User, Parent } from "@prisma/client";

type UserWithParent = User & { parent: Parent | null };

export default function ParentEmailsPage() {
  const [users, setUsers] = useState<UserWithParent[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const res = await fetch("/api/users");
        const data = await res.json();
        // Filter only parents
        setUsers(data.filter((u: UserWithParent) => u.role === "PARENT"));
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchUsers();
  }, []);

  const handleSendInvite = async (user: UserWithParent) => {
    setSendingId(user.id);
    try {
      const res = await fetch("/api/emails/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user.email, role: user.role, name: user.name }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok) {
        setSentIds(new Set(sentIds).add(user.id));
        alert(data?.message || `Invitation email sent successfully to ${user.email}!`);
      } else {
        alert(data?.error || "Failed to send invite.");
      }
    } catch (err: any) {
      console.error(err);
      alert(`Error sending invite: ${err?.message || "Please check connection"}`);
    } finally {
      setSendingId(null);
    }
  };

  const [isSendingAll, setIsSendingAll] = useState(false);

  const handleSendAllInvites = async () => {
    if (!confirm(`Are you sure you want to send portal invitation emails to all ${users.length} registered parents?`)) {
      return;
    }
    setIsSendingAll(true);
    let successCount = 0;
    const newSentIds = new Set(sentIds);

    for (const u of users) {
      try {
        const res = await fetch("/api/emails/invite", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: u.email, role: u.role, name: u.name }),
        });
        if (res.ok) {
          successCount++;
          newSentIds.add(u.id);
        }
      } catch (e) {
        console.error(e);
      }
    }

    setSentIds(newSentIds);
    setIsSendingAll(false);
    alert(`Successfully sent invitations to ${successCount} out of ${users.length} parents!`);
  };

  return (
    <div className={styles.container}>
      <div className={styles.header} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
        <div>
          <h2 style={{ margin: '0 0 0.25rem 0' }}>Parent Email Management</h2>
          <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
            Total Registered Parents: <strong style={{ color: 'var(--primary)', fontSize: '1rem' }}>{users.length}</strong>
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button 
            onClick={handleSendAllInvites}
            disabled={isSendingAll || users.length === 0}
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '0.5rem', 
              background: 'var(--primary)', 
              color: 'var(--primary-fg)', 
              border: 'none', 
              padding: '0.65rem 1.25rem', 
              borderRadius: '8px', 
              fontWeight: 600,
              fontSize: '0.875rem',
              cursor: (isSendingAll || users.length === 0) ? 'not-allowed' : 'pointer',
              opacity: (isSendingAll || users.length === 0) ? 0.7 : 1,
              boxShadow: '0 2px 8px rgba(79, 70, 229, 0.2)'
            }}
          >
            {isSendingAll ? <Loader2 size={16} className={styles.spinner} /> : <Mail size={16} />}
            <span>{isSendingAll ? "Sending All..." : `Send Invites to All (${users.length})`}</span>
          </button>
        </div>
      </div>

      <div className={styles.tableContainer}>
        {loading ? (
          <div style={{ padding: "2rem", textAlign: "center" }}>Loading...</div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>Parent Name</th>
                <th className={styles.th}>Email Address</th>
                <th className={styles.th}>Phone</th>
                <th className={styles.th}>Account Status</th>
                <th className={styles.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className={styles.tr}>
                  <td className={styles.td}>{user.name}</td>
                  <td className={styles.td}>{user.email}</td>
                  <td className={styles.td}>{user.parent?.phone || "N/A"}</td>
                  <td className={styles.td}>
                    <span className={styles[`status_${user.status}`]}>{user.status}</span>
                  </td>
                  <td className={styles.td} style={{ display: 'flex', gap: '0.5rem' }}>
                    <button 
                      className={styles.actionBtn}
                      onClick={() => handleSendInvite(user)}
                      disabled={sendingId === user.id || sentIds.has(user.id)}
                      style={{ opacity: sendingId === user.id ? 0.7 : 1 }}
                    >
                      {sendingId === user.id ? (
                        <>
                          <Loader2 size={14} className={styles.spinner} style={{ display: "inline", marginRight: "4px" }} />
                          Sending...
                        </>
                      ) : sentIds.has(user.id) ? (
                        <>
                          <CheckCircle size={14} style={{ display: "inline", marginRight: "4px", color: "var(--success)" }} />
                          Sent
                        </>
                      ) : (
                        <>
                          <Mail size={14} style={{ display: "inline", marginRight: "4px" }}/>
                          Send Invite
                        </>
                      )}
                    </button>
                    <button className={styles.actionBtn}>Edit</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
