import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import styles from "../../dashboard.module.css";
import ProgramsClient from "./ProgramsClient";

export default async function AdminProgramsPage() {
  const session = await getServerSession(getAuthOptions());
  if (!session || session.user.role !== 'ADMIN') return null;

  const [programs, classes] = await Promise.all([
    prisma.calendarEvent.findMany({
      where: { type: 'PROGRAM' },
      orderBy: { date: 'desc' }
    }),
    prisma.class.findMany({
      where: { isActive: true },
      orderBy: [{ name: 'asc' }, { section: 'asc' }]
    })
  ]);

  return (
    <div className={styles.dashboard}>
      <h1 className={styles.title} style={{ margin: 0, marginBottom: '1rem' }}>School Programs</h1>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>Manage school events, programs, and functions.</p>

      <ProgramsClient programs={programs} classes={classes} />
    </div>
  );
}
