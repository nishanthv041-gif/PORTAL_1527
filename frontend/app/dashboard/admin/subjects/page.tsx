import { getServerSession } from "next-auth/next";
import { authOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import styles from "../../dashboard.module.css";
import SubjectListClient from "./SubjectListClient";

export default async function AdminSubjectsPage() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'ADMIN') return null;

  // Fetch all subjects with their class, teacher, and marks
  const [subjects, classes, teachers] = await Promise.all([
    prisma.subject.findMany({
      where: { isActive: true },
      include: {
        class: {
          include: { students: true }
        },
        teacher: {
          include: { user: true }
        },
        marks: true
      }
    }),
    prisma.class.findMany({
      where: { isActive: true },
      orderBy: [{ name: 'asc' }, { section: 'asc' }]
    }),
    prisma.teacher.findMany({
      where: { isActive: true },
      include: { user: true },
      orderBy: { user: { name: 'asc' } }
    })
  ]);

  return (
    <div className={styles.dashboard}>
      <h1 className={styles.title} style={{ margin: 0, marginBottom: '1rem' }}>Subjects</h1>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>Overview of all subjects across all classes.</p>

      <SubjectListClient subjects={subjects} classes={classes} teachers={teachers} />
    </div>
  );
}
