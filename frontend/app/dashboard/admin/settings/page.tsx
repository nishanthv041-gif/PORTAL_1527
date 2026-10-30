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
      <h1 className={styles.title} style={{ margin: 0, marginBottom: '1.25rem' }}>System Settings</h1>

      {/* Switcher Option to navigate between Settings, Teacher Management, and Parent & Student */}
      <SettingsNavSwitcher />

      <SettingsClient initialSettings={settings} />
    </div>
  );
}
