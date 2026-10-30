import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import styles from "../../dashboard.module.css";
import TeacherListClient from "./TeacherListClient";
import SettingsNavSwitcher from "@/frontend/components/admin/SettingsNavSwitcher";

export default async function AdminTeachersPage() {
  const session = await getServerSession(getAuthOptions());
  if (!session || session.user.role !== 'ADMIN') return null;

  const [teachers, allClasses, allSubjects] = await Promise.all([
    prisma.teacher.findMany({
      orderBy: { user: { name: 'asc' } },
      include: {
        user: true,
        classes: true,
        subjects: true,
        classTeacherOf: true
      }
    }),
    prisma.class.findMany({
      where: { isActive: true },
      orderBy: [{ name: 'asc' }, { section: 'asc' }]
    }),
    prisma.subject.findMany({
      where: { isActive: true },
      distinct: ['name'],
      orderBy: { name: 'asc' }
    })
  ]);

  return (
    <div className={styles.dashboard}>
      <h1 className={styles.title} style={{ margin: 0, marginBottom: '1.25rem' }}>Teacher Management</h1>

      {/* Switcher Option between Settings, Teacher Management, and Parent & Student */}
      <SettingsNavSwitcher />

      <TeacherListClient teachers={teachers} allClasses={allClasses} allSubjects={allSubjects} />
    </div>
  );
}
