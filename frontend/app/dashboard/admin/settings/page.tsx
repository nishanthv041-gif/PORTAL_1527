import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import styles from "../../dashboard.module.css";
import SettingsClient from "./SettingsClient";

export default async function AdminSettingsPage() {
  const session = await getServerSession(getAuthOptions());
  if (!session || session.user.role !== 'ADMIN') return null;

  const settings = await prisma.systemSetting.findMany({
    orderBy: { category: 'asc' }
  });

  return (
    <div className={styles.dashboard}>
      <h1 className={styles.title} style={{ margin: 0, marginBottom: '1rem' }}>System Settings</h1>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>Configure global school preferences and system variables.</p>

      <SettingsClient initialSettings={settings} />
    </div>
  );
}
