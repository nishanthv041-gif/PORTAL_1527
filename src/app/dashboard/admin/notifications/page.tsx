import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import styles from "../../dashboard.module.css";
import NotificationsClient from "./NotificationsClient";

export default async function AdminNotificationsPage() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'ADMIN') return null;

  const adminUser = await prisma.user.findUnique({ where: { email: session.user.email! } });

  const isEnabled = adminUser?.notificationsEnabled ?? true;

  const notifications = isEnabled ? await prisma.notification.findMany({
    where: {
      userId: adminUser?.id
    },
    include: {
      user: true
    },
    orderBy: { createdAt: 'desc' }
  }) : [];

  return (
    <div className={styles.dashboard}>
      <h1 className={styles.title} style={{ margin: 0, marginBottom: '1rem' }}>Notifications</h1>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>Your personal notifications and alerts.</p>

      <NotificationsClient notifications={notifications} adminUserId={adminUser?.id ?? ''} initialEnabled={isEnabled} />
    </div>
  );
}
