import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import styles from "../../dashboard.module.css";
import LoginStatusClient from "./LoginStatusClient";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function LoginStatusPage() {
  const session = await getServerSession(getAuthOptions());
  if (!session || session.user.role !== 'ADMIN') return null;

  // Delete records older than 3 days automatically
  const threeDaysAgo = new Date();
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
  
  await prisma.loginAttempt.deleteMany({
    where: {
      timestamp: {
        lt: threeDaysAgo,
      },
    },
  });

  const loginAttempts = await prisma.loginAttempt.findMany({
    orderBy: { timestamp: 'desc' }
  });

  return (
    <div className={styles.dashboard}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <h1 className={styles.title} style={{ margin: 0 }}>Login Status</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
          Login records older than 3 days are automatically deleted.
        </p>
      </div>

      <LoginStatusClient records={loginAttempts} />
    </div>
  );
}
