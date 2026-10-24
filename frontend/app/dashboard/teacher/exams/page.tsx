import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import Link from "next/link";
import styles from "./TeacherExams.module.css";
import { BookOpen, Calendar as CalendarIcon, Clock, CheckCircle2, AlertCircle, FileText } from "lucide-react";
import CreateExamForm from "./CreateExamForm";
import { getSystemSetting } from "@/backend/api/actions/dashboard/admin/settings/actions";

export default async function TeacherExamsPage() {
  const session = await getServerSession(getAuthOptions());
  if (!session) return null;

  const canManage = await getSystemSetting("TEACHER_MANAGE_MARKS", "true");
  if (canManage === "false") {
    return (
      <div className={styles.container}>
        <h1 className={styles.title}>Exams &amp; Marks</h1>
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
    <div className={styles.container}>
      <div className={styles.headerRow}>
        <div>
          <h1 className={styles.title}>Exams &amp; Marks Management</h1>
          <p style={{ color: "var(--text-secondary)", margin: "0.25rem 0 0 0", fontSize: "0.9rem" }}>
            Schedule class exams, manage submitted requests, and track grade entry.
          </p>
        </div>
      </div>

      <div className={styles.examsGrid}>
        {/* Left Column: Scheduled Exams & Exam Requests */}
        <div className={styles.mainColumn}>
          {/* 1. Scheduled Class Exams */}
          <div className={styles.card}>
            <h3 className={styles.cardHeader}>
              <BookOpen size={20} className="text-primary" />
              <span>My Exams ({exams.length})</span>
            </h3>
            
            <div className={styles.examList}>
              {exams.map((exam) => (
                <Link href={`/dashboard/teacher/exams/${exam.id}`} key={exam.id} className={styles.examItem}>
                  <div className={styles.examLeft}>
                    <div className={styles.examIconBox}>
                      <BookOpen size={20} />
                    </div>
                    <div className={styles.examMeta}>
                      <h4 className={styles.examTitle}>{exam.name}</h4>
                      <p className={styles.examSubText}>
                        Class {exam.class.name} - Section {exam.class.section}
                      </p>
                    </div>
                  </div>
                  <div className={styles.examRight}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                      <CalendarIcon size={14} />
                      <span>{new Date(exam.date).toLocaleDateString()}</span>
                    </div>
                    <span 
                      className={styles.statusBadge}
                      style={{ 
                        backgroundColor: exam._count.marks > 0 ? 'var(--success-bg)' : 'var(--warning-bg)', 
                        color: exam._count.marks > 0 ? "var(--success)" : "var(--warning)" 
                      }}
                    >
                      {exam._count.marks > 0 ? <CheckCircle2 size={12} /> : <Clock size={12} />}
                      {exam._count.marks > 0 ? 'Marks Entered' : 'Pending Marks'}
                    </span>
                  </div>
                </Link>
              ))}

              {exams.length === 0 && (
                <p style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--text-secondary)', margin: 0, fontSize: '0.9rem' }}>
                  No scheduled exams found for your classes.
                </p>
              )}
            </div>
          </div>

          {/* 2. My Submitted Exam Requests */}
          <div className={styles.card}>
            <h3 className={styles.cardHeader}>
              <FileText size={20} className="text-primary" />
              <span>My Exam Requests ({examRequests.length})</span>
            </h3>
            
            <div className={styles.examList}>
              {examRequests.map((req) => (
                <div key={req.id} className={styles.requestItem}>
                  <div className={styles.requestLeft}>
                    <h4 className={styles.requestTitle}>{req.subject.name} Exam</h4>
                    <p className={styles.requestSub}>
                      Class {req.class.name} - {req.class.section} • {new Date(req.date).toLocaleDateString()} ({req.startTime} - {req.endTime})
                    </p>
                  </div>
                  <div className={styles.requestRight}>
                    <span 
                      className={styles.statusBadge}
                      style={{ 
                        backgroundColor: req.status === 'APPROVED' ? 'var(--success-bg)' : req.status === 'DECLINED' ? 'var(--danger-bg)' : 'var(--warning-bg)', 
                        color: req.status === 'APPROVED' ? "var(--success)" : req.status === 'DECLINED' ? "var(--danger)" : "var(--warning)" 
                      }}
                    >
                      {req.status === 'APPROVED' && <CheckCircle2 size={12} />}
                      {req.status === 'DECLINED' && <AlertCircle size={12} />}
                      {req.status === 'PENDING' && <Clock size={12} />}
                      {req.status}
                    </span>
                    {req.declineReason && (
                      <span style={{ fontSize: '0.75rem', color: "var(--danger)", maxWidth: '220px', overflowWrap: 'anywhere' }}>
                        Reason: {req.declineReason}
                      </span>
                    )}
                  </div>
                </div>
              ))}

              {examRequests.length === 0 && (
                <p style={{ textAlign: 'center', padding: '1.5rem 1rem', color: 'var(--text-secondary)', margin: 0, fontSize: '0.9rem' }}>
                  No exam requests submitted yet.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Request New Exam Form */}
        <div className={styles.sideColumn}>
          <div className={styles.card}>
            <h3 className={styles.cardHeader}>
              <CalendarIcon size={20} className="text-primary" />
              <span>Request New Exam</span>
            </h3>
            <CreateExamForm teacherId={teacher.id} subjects={teacher.subjects} />
          </div>
        </div>
      </div>
    </div>
  );
}
