import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import styles from "../../dashboard.module.css";
import ExamsClient from "./ExamsClient";

export default async function AdminExamsPage() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'ADMIN') return null;

  const [exams, examRequests] = await Promise.all([
    prisma.exam.findMany({
      include: {
        class: {
          include: {
            students: { where: { isActive: true } },
            subjects: true
          }
        },
        marks: true
      },
      orderBy: { date: 'desc' }
    }),
    prisma.examRequest.findMany({
      where: { status: 'PENDING' },
      include: {
        class: true,
        subject: true,
        teacher: { include: { user: true } }
      },
      orderBy: { createdAt: 'asc' }
    })
  ]);

  return (
    <div className={styles.dashboard}>
      <h1 className={styles.title} style={{ margin: 0, marginBottom: '1rem' }}>Exams & Marks</h1>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>Manage school-wide exams, track marks entry status, and publish results.</p>
      
      <ExamsClient exams={exams} examRequests={examRequests} />
    </div>
  );
}
