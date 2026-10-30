import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import styles from "../../dashboard.module.css";
import TeacherListClient from "./TeacherListClient";

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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 className={styles.title} style={{ margin: 0 }}>Teacher Management</h1>
          <p style={{ color: 'var(--text-secondary)', margin: '0.25rem 0 0 0', fontSize: '0.9rem' }}>
            Manage teacher profiles, subject & class assignments, Google login credentials, and classroom access.
          </p>
        </div>
      </div>

      <TeacherListClient teachers={teachers} allClasses={allClasses} allSubjects={allSubjects} />
    </div>
  );
}
