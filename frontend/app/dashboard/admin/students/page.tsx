import { getServerSession } from "next-auth/next";
import { authOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import styles from "../../dashboard.module.css";
import StudentListClient from "./StudentListClient";

export default async function AdminStudentsPage() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'ADMIN') return null;

  const students = await prisma.student.findMany({
    orderBy: { firstName: 'asc' },
    include: {
      class: true,
      parents: { include: { parent: { include: { user: true } } } },
      attendances: true
    }
  });

  const classes = await prisma.class.findMany({
    orderBy: [{ name: 'asc' }, { section: 'asc' }]
  });

  return (
    <div className={styles.dashboard}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <h1 className={styles.title} style={{ margin: 0 }}>Students</h1>
        <p style={{ color: 'var(--text-secondary)' }}>To create new students, please use the &quot;Create New Roles&quot; section in the sidebar.</p>
      </div>

      <StudentListClient students={students} classes={classes} />
    </div>
  );
}
