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
      if (res.ok) {
        setSentIds(new Set(sentIds).add(user.id));
      } else {
        alert("Failed to send invite.");
      }
    } catch (err) {
      console.error(err);
      alert("Error sending invite.");
    } finally {
      setSendingId(null);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2>Parent Email Management</h2>
        <button className={styles.primaryBtn}>
          <Plus size={16} style={{ display: "inline", marginRight: "4px" }} />
          Add Parent Email
        </button>
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
