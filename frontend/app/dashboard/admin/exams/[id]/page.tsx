import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import Link from "next/link";
import styles from "../../../dashboard.module.css";
import { ArrowLeft } from "lucide-react";
import MarksForm from "./MarksForm";

export default async function AdminExamDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerSession(getAuthOptions());
  if (!session) return null;

  const exam = await prisma.exam.findUnique({
    where: { id: id },
    include: {
      class: {
        include: {
          students: {
            orderBy: { firstName: 'asc' }
          },
          subjects: true
        }
      },
      marks: true
    }
  });

  if (!exam) return <p>Exam not found.</p>;

  return (
    <div className={styles.dashboard}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
        <Link href="/dashboard/admin/exams" style={{ color: 'var(--foreground)', opacity: 0.7 }}>
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className={styles.title} style={{ margin: 0 }}>
            {exam.name}
          </h1>
          <p style={{ margin: 0, opacity: 0.7, fontSize: '0.875rem' }}>
            Class: {exam.class.name} - {exam.class.section} | Date: {new Date(exam.date).toLocaleDateString()}
          </p>
        </div>
      </div>

      <div className={styles.chartCard}>
        <h3 className={styles.chartHeader}>Enter Marks</h3>
        <MarksForm exam={exam} classData={exam.class} />
      </div>
    </div>
  );
}
