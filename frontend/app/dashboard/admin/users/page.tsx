import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { isSuperAdmin } from "@/backend/lib/auth/superAdmin";
import { prisma } from "@/backend/db/prisma";
import styles from "../../dashboard.module.css";
import UserListClient from "./UserListClient";

export default async function AdminUsersPage() {
  const session = await getServerSession(getAuthOptions());
  if (!session || session.user.role !== 'ADMIN') return null;

  const isCurrentUserSuperAdmin = isSuperAdmin(session.user.email);

  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      teacher: true,
      parent: true,
      sessions: {
        where: { revokedAt: null, expiresAt: { gt: new Date() } },
        select: { id: true, deviceInfo: true, ipAddress: true, lastActiveAt: true, createdAt: true },
        orderBy: { lastActiveAt: "desc" },
      },
    }
  });

  return (
    <div className={styles.dashboard}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 className={styles.title} style={{ margin: 0 }}>User Management</h1>
          {isCurrentUserSuperAdmin && (
            <p style={{ color: 'var(--success)', fontSize: '0.85rem', margin: '0.25rem 0 0', fontWeight: 600 }}>
              ★ Super Admin Mode Active ({session.user.email}) — You have full authorization to add, manage, and remove Admin accounts.
            </p>
          )}
        </div>
        <p style={{ color: 'var(--text-secondary)' }}>To create new users, please use the &quot;Create New Roles&quot; section in the sidebar.</p>
      </div>

      <UserListClient users={users} isCurrentUserSuperAdmin={isCurrentUserSuperAdmin} />
    </div>
  );
}
