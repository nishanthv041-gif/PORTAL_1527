import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import Link from "next/link";
import styles from "../../dashboard.module.css";
import { BookOpen, Calendar as CalendarIcon } from "lucide-react";
import CreateExamForm from "./CreateExamForm";
import { getSystemSetting } from "@/backend/api/actions/dashboard/admin/settings/actions";

export default async function TeacherExamsPage() {
  const session = await getServerSession(getAuthOptions());
  if (!session) return null;

  const canManage = await getSystemSetting("TEACHER_MANAGE_MARKS", "true");
  if (canManage === "false") {
    return (
      <div className={styles.dashboard}>
        <h1 className={styles.title}>Exams</h1>
        <p style={{ color: "var(--danger)" }}>Exam and marks management has been disabled by the administrator.</p>
      </div>
    );
  }

  const teacher = await prisma.teacher.findUnique({
    where: { userId: session.user.id },
    include: {
      classes: true,
      subjects: { include: { class: true } }
    }
  });

  if (!teacher) return null;

  const exams = await prisma.exam.findMany({
    where: {
      classId: { in: teacher.classes.map(c => c.id) }
    },
    include: {
      class: true,
      _count: {
        select: { marks: true }
      }
    },
    orderBy: {
      date: 'desc'
    }
  });

  const examRequests = await prisma.examRequest.findMany({
    where: { teacherId: teacher.id },
    include: { class: true, subject: true },
    orderBy: { createdAt: 'desc' }
  });

  return (
    <div className={styles.dashboard}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 className={styles.title}>Exams</h1>
      </div>

      <div className={styles.chartsContainer}>
        <div className={styles.chartCard}>
          <h3 className={styles.chartHeader}>My Exams</h3>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {exams.map((exam) => (
              <Link href={`/dashboard/teacher/exams/${exam.id}`} key={exam.id} style={{ textDecoration: 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem', border: '1px solid var(--border)', borderRadius: '8px', backgroundColor: 'var(--background)', transition: 'border-color 0.2s' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ width: 40, height: 40, borderRadius: '8px', backgroundColor: 'rgba(99, 102, 241, 0.1)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <BookOpen size={20} />
                    </div>
                    <div>
                      <h4 style={{ margin: 0, color: 'var(--foreground)' }}>{exam.name}</h4>
                      <p style={{ margin: 0, fontSize: '0.85rem', opacity: 0.7, color: 'var(--foreground)' }}>
                        {exam.class.name} - {exam.class.section}
                      </p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.25rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', opacity: 0.8, color: 'var(--foreground)' }}>
                      <CalendarIcon size={14} />
                      {new Date(exam.date).toLocaleDateString()}
                    </div>
                    <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '12px', backgroundColor: exam._count.marks > 0 ? 'var(--success-bg)' : 'var(--warning-bg)', color: exam._count.marks > 0 ? "var(--success)" : "var(--warning)" }}>
                      {exam._count.marks > 0 ? 'Marks Entered' : 'Pending Marks'}
                    </span>
                  </div>
                </div>
              </Link>
            ))}

            {exams.length === 0 && (
              <p style={{ textAlign: 'center', padding: '2rem', opacity: 0.7 }}>No exams scheduled yet.</p>
            )}
          </div>
        </div>

        <div className={styles.chartCard} style={{ gridColumn: 'span 2' }}>
          <h3 className={styles.chartHeader}>My Exam Requests</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {examRequests.map((req) => (
              <div key={req.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem', border: '1px solid var(--border)', borderRadius: '8px', backgroundColor: 'var(--background)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <div>
                    <h4 style={{ margin: 0 }}>{req.subject.name} Exam</h4>
                    <p style={{ margin: 0, fontSize: '0.85rem', opacity: 0.7 }}>
                      {req.class.name} - {req.class.section} | {new Date(req.date).toLocaleDateString()} ({req.startTime} - {req.endTime})
                    </p>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.25rem' }}>
                  <span style={{ fontSize: '0.75rem', padding: '4px 8px', borderRadius: '12px', backgroundColor: req.status === 'APPROVED' ? 'var(--success-bg)' : req.status === 'DECLINED' ? 'var(--danger-bg)' : 'var(--warning-bg)', color: req.status === 'APPROVED' ? "var(--success)" : req.status === 'DECLINED' ? "var(--danger)" : "var(--warning)", fontWeight: 500 }}>
                    {req.status}
                  </span>
                  {req.declineReason && (
                    <span style={{ fontSize: '0.75rem', color: "var(--danger)" }}>{req.declineReason}</span>
                  )}
                </div>
              </div>
            ))}
            {examRequests.length === 0 && (
              <p style={{ textAlign: 'center', padding: '1rem', opacity: 0.7 }}>No exam requests submitted.</p>
            )}
          </div>
        </div>

        <div className={styles.chartCard}>
          <h3 className={styles.chartHeader}>Request New Exam</h3>
          <CreateExamForm teacherId={teacher.id} subjects={teacher.subjects} />
        </div>
      </div>
    </div>
  );
}
