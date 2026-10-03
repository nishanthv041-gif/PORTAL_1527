import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import styles from "../../dashboard.module.css";
import LoginStatusClient from "./LoginStatusClient";

export default async function LoginStatusPage() {
  const session = await getServerSession(getAuthOptions());
  if (!session || session.user.role !== 'ADMIN') return null;

  // Delete records older than 7 days automatically
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  
  await prisma.loginAttempt.deleteMany({
    where: {
      timestamp: {
        lt: sevenDaysAgo,
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
        <p style={{ color: 'var(--text-secondary)' }}>
          Login records older than 7 days are automatically deleted.
        </p>
      </div>

      <LoginStatusClient records={loginAttempts} />
    </div>
  );
}
