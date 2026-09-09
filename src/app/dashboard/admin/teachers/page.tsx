import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import styles from "../../dashboard.module.css";
import TeacherListClient from "./TeacherListClient";

export default async function AdminTeachersPage() {
  const session = await getServerSession(authOptions);
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
        <h1 className={styles.title} style={{ margin: 0 }}>Teachers</h1>
        <p style={{ color: 'var(--text-secondary)' }}>To create new teachers, please use the &quot;Create New Roles&quot; section in the sidebar.</p>
      </div>

      <TeacherListClient teachers={teachers} allClasses={allClasses} allSubjects={allSubjects} />
    </div>
  );
}
