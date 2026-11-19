import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import Link from "next/link";
import { Activity } from "lucide-react";
import styles from "../../dashboard.module.css";
import NotificationsClient from "./NotificationsClient";

export default async function AdminNotificationsPage() {
  const session = await getServerSession(getAuthOptions());
  if (!session || session.user.role !== 'ADMIN') return null;

  const adminUser = await prisma.user.findUnique({ where: { email: session.user.email! } });

  const isEnabled = adminUser?.notificationsEnabled ?? true;

  const notifications = isEnabled ? await prisma.notification.findMany({
    where: {
      userId: adminUser?.id
    },
    take: 20,
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' }
  }) : [];

  const [classes, activeUsers] = await Promise.all([
    prisma.class.findMany({ where: { isActive: true }, select: { id: true, name: true, section: true }, orderBy: { name: 'asc' } }),
    prisma.user.findMany({ where: { status: 'ACTIVE' }, select: { id: true, name: true, role: true }, orderBy: { name: 'asc' }, take: 100 })
  ]);

  return (
    <div className={styles.dashboard}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <h1 className={styles.title} style={{ margin: 0 }}>Notifications</h1>
        <Link
          href="/dashboard/admin/notifications/diagnostics"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.4rem',
            padding: '0.5rem 1rem',
            borderRadius: '0.5rem',
            background: '#4f46e5',
            color: '#fff',
            textDecoration: 'none',
            fontSize: '0.875rem',
            fontWeight: 500,
          }}
        >
          <Activity className="w-4 h-4" />
          Push Diagnostics & Delivery Trace
        </Link>
      </div>

      <NotificationsClient 
        notifications={notifications as any} 
        adminUserId={adminUser?.id ?? ''} 
        initialEnabled={isEnabled}
        classes={classes}
        users={activeUsers}
      />
    </div>
  );
}
