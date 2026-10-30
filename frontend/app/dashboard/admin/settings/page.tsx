import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import styles from "../../dashboard.module.css";
import SettingsClient from "./SettingsClient";
import SettingsNavSwitcher from "@/frontend/components/admin/SettingsNavSwitcher";

export default async function AdminSettingsPage() {
  const session = await getServerSession(getAuthOptions());
  if (!session || session.user.role !== 'ADMIN') return null;

  const settings = await prisma.systemSetting.findMany({
    orderBy: { category: 'asc' }
  });

  return (
    <div className={styles.dashboard}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.25rem' }}>
        <h1 className={styles.title} style={{ margin: 0 }}>System Settings</h1>
        <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '0.9rem' }}>
          Configure school details, staff credentials, and student &amp; parent accounts.
        </p>
      </div>

      {/* Switcher Option to navigate between Settings, Teacher Management, and Parent & Student */}
      <SettingsNavSwitcher />

      <SettingsClient initialSettings={settings} />
    </div>
  );
}
