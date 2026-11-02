import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import Link from "next/link";
import styles from "../../../dashboard.module.css";
import { ArrowLeft } from "lucide-react";
import MarksForm from "./MarksForm";

export default async function TeacherExamDetailsPage({ params }: { params: Promise<{ id: string }> }) {
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
      <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 className={styles.title} style={{ margin: 0 }}>
            {exam.name}
          </h1>
          <p style={{ margin: 0, opacity: 0.7, fontSize: '0.875rem' }}>
            Class: {exam.class.name} - {exam.class.section} | Date: {new Date(exam.date).toLocaleDateString()}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
          <Link
            href={`/dashboard/teacher/exams/${exam.id}/review`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.45rem',
              padding: '0.55rem 1.1rem',
              borderRadius: '8px',
              background: '#3b82f6',
              color: '#ffffff',
              textDecoration: 'none',
              fontSize: '0.85rem',
              fontWeight: 600,
              boxShadow: '0 2px 8px rgba(59, 130, 246, 0.3)',
            }}
          >
            <span>Consolidated Marks Review (Class Teacher)</span>
          </Link>
        </div>
      </div>

      <div className={styles.chartCard}>
        <h3 className={styles.chartHeader}>Enter Marks</h3>
        <MarksForm exam={exam} classData={exam.class} />
      </div>
    </div>
  );
}
