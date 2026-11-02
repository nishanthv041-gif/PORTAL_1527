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
      <div className={styles.headerRow} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h1 className={styles.title} style={{ margin: 0 }}>Exams &amp; Marks Management</h1>
          <p style={{ margin: "0.25rem 0 0 0", fontSize: "0.875rem", color: "var(--text-secondary)" }}>
            Manage exam schedules, subject marks tasks, and exam requests.
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
          <Link
            href="/dashboard/teacher/exams/tasks"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.45rem",
              padding: "0.55rem 1rem",
              borderRadius: "8px",
              background: "#3b82f6",
              color: "#ffffff",
              textDecoration: "none",
              fontSize: "0.85rem",
              fontWeight: 600,
              boxShadow: "0 2px 8px rgba(59, 130, 246, 0.3)",
            }}
          >
            <BookOpen size={16} />
            <span>My Marks Tasks</span>
          </Link>
          <Link
            href="/dashboard/teacher/exams/requests"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.45rem",
              padding: "0.55rem 1rem",
              borderRadius: "8px",
              background: "rgba(255, 255, 255, 0.08)",
              color: "#e2e8f0",
              textDecoration: "none",
              fontSize: "0.85rem",
              fontWeight: 600,
              border: "1px solid rgba(255, 255, 255, 0.12)",
            }}
          >
            <FileText size={16} />
            <span>Exam Requests</span>
          </Link>
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
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
              <h3 className={styles.cardHeader} style={{ margin: 0 }}>
                <FileText size={20} className="text-primary" />
                <span>My Exam Requests ({examRequests.length})</span>
              </h3>
              <Link
                href="/dashboard/teacher/exams/requests"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  color: 'var(--primary, #3b82f6)',
                  textDecoration: 'none',
                }}
              >
                Propose New Exam →
              </Link>
            </div>
            
            <div className={styles.examList}>
              {examRequests.map((req) => (
                <div key={req.id} className={styles.requestItem}>
                  <div className={styles.requestLeft}>
                    <h4 className={styles.requestTitle}>{req.subject?.name ? `${req.subject.name} Exam` : (req.title || "Examination")}</h4>
                    <p className={styles.requestSub}>
                      Class {req.class.name} - {req.class.section} • {new Date(req.date || new Date()).toLocaleDateString()} ({req.startTime || "09:00"} - {req.endTime || "12:00"})
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
