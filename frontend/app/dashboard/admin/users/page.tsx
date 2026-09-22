import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import styles from "../../dashboard.module.css";
import UserListClient from "./UserListClient";

export default async function AdminUsersPage() {
  const session = await getServerSession(getAuthOptions());
  if (!session || session.user.role !== 'ADMIN') return null;

  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      teacher: true,
      parent: true
    }
  });

  return (
    <div className={styles.dashboard}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <h1 className={styles.title} style={{ margin: 0 }}>User Management</h1>
        <p style={{ color: 'var(--text-secondary)' }}>To create new users, please use the &quot;Create New Roles&quot; section in the sidebar.</p>
      </div>

      <UserListClient users={users} />
    </div>
  );
}
