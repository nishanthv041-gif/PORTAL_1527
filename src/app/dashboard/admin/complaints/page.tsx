import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import styles from "../../dashboard.module.css";
import ComplaintsClient from "./ComplaintsClient";

export default async function AdminComplaintsPage() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'ADMIN') return null;

  const complaints = await prisma.complaint.findMany({
    include: {
      teacher: { include: { user: true } },
      student: { include: { class: true, parents: { include: { parent: true } } } }
    },
    orderBy: { date: 'desc' }
  });

  return (
    <div className={styles.dashboard}>
      <h1 className={styles.title} style={{ margin: 0, marginBottom: '1rem' }}>Complaints & Feedback</h1>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>Review complaints from parents or students and track resolution status.</p>

      <ComplaintsClient complaints={complaints} />
    </div>
  );
}
