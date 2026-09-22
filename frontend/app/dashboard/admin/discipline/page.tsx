import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import styles from "../../dashboard.module.css";
import DisciplineClient from "./DisciplineClient";

export default async function AdminDisciplinePage() {
  const session = await getServerSession(getAuthOptions());
  if (!session || session.user.role !== 'ADMIN') return null;

  const records = await prisma.disciplineRecord.findMany({
    include: {
      student: { include: { class: true } }
    },
    orderBy: { date: 'desc' }
  });

  const students = await prisma.student.findMany({
    where: { isActive: true },
    include: { class: true },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }]
  });

  return (
    <div className={styles.dashboard}>
      <h1 className={styles.title} style={{ margin: 0, marginBottom: '1rem' }}>Discipline Records</h1>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>Manage disciplinary incidents and actions taken against students.</p>

      <DisciplineClient records={records} students={students} />
    </div>
  );
}
