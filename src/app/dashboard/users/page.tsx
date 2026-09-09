"use client";

import { useState, useEffect } from "react";
import styles from "./users.module.css";
import { Plus } from "lucide-react";

type User = {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  createdAt: string;
};

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    name: "", email: "", password: "", role: "TEACHER", phone: ""
  });

  const fetchUsersList = async () => {
    try {
      const res = await fetch("/api/users");
      const data = await res.json();
      setUsers(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    fetch("/api/users")
      .then((r) => r.json())
      .then((data) => { if (!cancelled) { setUsers(data); setLoading(false); } })
      .catch((err) => { console.error(err); if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      if (res.ok) {
        setIsModalOpen(false);
        setFormData({ name: "", email: "", password: "", role: "TEACHER", phone: "" });
        fetchUsersList();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const filteredUsers = users.filter((u) => {
    const matchesSearch = u.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          u.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = roleFilter === "ALL" || u.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const totalTeachers = users.filter((u) => u.role === "TEACHER").length;
  const totalParents = users.filter((u) => u.role === "PARENT").length;
  const activeUsers = users.filter((u) => u.status === "ACTIVE").length;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2>User Management</h2>
        <button className={styles.primaryBtn} onClick={() => setIsModalOpen(true)}>
          <Plus size={16} style={{ display: "inline", marginRight: "4px" }} />
          Add User
        </button>
      </div>

      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Total Users</span>
          <span className={styles.statValue}>{users.length}</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Active Users</span>
          <span className={styles.statValue}>{activeUsers}</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Teachers</span>
          <span className={styles.statValue}>{totalTeachers}</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Parents</span>
          <span className={styles.statValue}>{totalParents}</span>
        </div>
      </div>

      <div className={styles.controls}>
        <input
          type="text"
          placeholder="Search by name or email..."
          className={styles.searchInput}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <select 
          className={styles.selectInput}
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
        >
          <option value="ALL">All Roles</option>
          <option value="ADMIN">Admin</option>
          <option value="TEACHER">Teacher</option>
          <option value="PARENT">Parent</option>
        </select>
      </div>

      <div className={styles.tableContainer}>
        {loading ? (
          <div style={{ padding: "2rem", textAlign: "center" }}>Loading users...</div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>Name</th>
                <th className={styles.th}>Email</th>
                <th className={styles.th}>Role</th>
                <th className={styles.th}>Status</th>
                <th className={styles.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => (
                <tr key={user.id} className={styles.tr}>
                  <td className={styles.td}>{user.name}</td>
                  <td className={styles.td}>{user.email}</td>
                  <td className={styles.td}>
                    <span className={`${styles.roleBadge} ${styles[`role_${user.role}`]}`}>
                      {user.role}
                    </span>
                  </td>
                  <td className={styles.td}>
                    <span className={styles[`status_${user.status}`]}>{user.status}</span>
                  </td>
                  <td className={styles.td}>
                    <button className={styles.actionBtn}>Edit</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {isModalOpen && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <div className={styles.modalHeader}>
              <h3>Add New User</h3>
              <button className={styles.closeBtn} onClick={() => setIsModalOpen(false)}>&times;</button>
            </div>
            <form onSubmit={handleAddUser}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Full Name</label>
                <input required className={styles.formInput} value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Email</label>
                <input type="email" required className={styles.formInput} value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Password</label>
                <input type="password" required className={styles.formInput} value={formData.password} onChange={(e) => setFormData({...formData, password: e.target.value})} />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Role</label>
                <select className={styles.formInput} value={formData.role} onChange={(e) => setFormData({...formData, role: e.target.value})}>
                  <option value="TEACHER">Teacher</option>
                  <option value="PARENT">Parent</option>
                  <option value="ADMIN">Admin</option>
                </select>
              </div>
              
              <div className={styles.modalFooter}>
                <button type="button" className={styles.cancelBtn} onClick={() => setIsModalOpen(false)}>Cancel</button>
                <button type="submit" className={styles.primaryBtn}>Save User</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
