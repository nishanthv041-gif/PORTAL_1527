import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import Link from "next/link";
import styles from "./TeacherExams.module.css";
import { BookOpen, Calendar as CalendarIcon, Clock, CheckCircle2, AlertCircle, FileText, CheckSquare } from "lucide-react";
import CreateExamForm from "./CreateExamForm";
import { getSystemSetting } from "@/backend/api/actions/dashboard/admin/settings/actions";
import { formatClassName } from "@/lib/teacher/formatClassName";

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
      classes: {
        include: {
          subjects: {
            include: {
              teacher: { include: { user: true } },
            },
          },
        },
      },
      classTeacherOf: {
        include: {
          subjects: {
            include: {
              teacher: { include: { user: true } },
            },
          },
        },
      },
      subjects: {
        include: {
          class: {
            include: {
              subjects: true,
            },
          },
        },
      },
    },
  });

  if (!teacher) return null;

  // Build list of all classes accessible to this teacher
  const classesMap = new Map<string, any>();
  if (teacher.classTeacherOf) {
    classesMap.set(teacher.classTeacherOf.id, {
      ...teacher.classTeacherOf,
      isClassTeacher: true,
    });
  }
  teacher.classes.forEach((c) => {
    if (!classesMap.has(c.id)) {
      classesMap.set(c.id, { ...c, isClassTeacher: false });
    }
  });
  teacher.subjects.forEach((s) => {
    if (s.class && !classesMap.has(s.class.id)) {
      classesMap.set(s.class.id, { ...s.class, isClassTeacher: false });
    }
  });

  const allClasses = Array.from(classesMap.values());
  const teacherClassIds = allClasses.map((c) => c.id);

  // Construct list of assigned subjects for this subject staff across their classes
  const assignedSubjectsMap = new Map<string, {
    id: string;
    name: string;
    code: string | null;
    classId: string;
    className: string;
    section: string;
    maxMarks: number;
    passMarks: number;
  }>();

  (teacher.subjects || []).forEach((s) => {
    if (s && s.class) {
      assignedSubjectsMap.set(s.id, {
        id: s.id,
        name: s.name,
        code: s.code || null,
        classId: s.class.id,
        className: s.class.name,
        section: s.class.section,
        maxMarks: s.maxMarks || 100,
        passMarks: s.passMarks || 35,
      });
    }
  });

  (teacher.classes || []).forEach((c) => {
    (c.subjects || []).forEach((s: any) => {
      if (s && s.teacherId === teacher.id && !assignedSubjectsMap.has(s.id)) {
        assignedSubjectsMap.set(s.id, {
          id: s.id,
          name: s.name,
          code: s.code || null,
          classId: c.id,
          className: c.name,
          section: c.section,
          maxMarks: s.maxMarks || 100,
          passMarks: s.passMarks || 35,
        });
      }
    });
  });

  const ctClass = teacher.classTeacherOf;
  if (assignedSubjectsMap.size === 0 && ctClass) {
    (ctClass.subjects || []).forEach((s: any) => {
      assignedSubjectsMap.set(s.id, {
        id: s.id,
        name: s.name,
        code: s.code || null,
        classId: ctClass.id,
        className: ctClass.name,
        section: ctClass.section,
        maxMarks: s.maxMarks || 100,
        passMarks: s.passMarks || 35,
      });
    });
  }

  const assignedSubjects = Array.from(assignedSubjectsMap.values());

  // Filter out standalone report card records created purely for report card dispatch.
  // Genuine school exams have an associated exam request or configured exam subjects.
  const exams = await prisma.exam.findMany({
    where: {
      classId: { in: teacherClassIds },
      OR: [
        { requestId: { not: null } },
        { examSubjects: { some: {} } },
      ],
    },
    include: {
      class: true,
      examSubjects: {
        include: {
          subject: true,
          teacher: { include: { user: true } },
        },
      },
      _count: {
        select: { marks: true },
      },
    },
    orderBy: {
      date: "desc",
    },
  });

  const examRequests = await prisma.examRequest.findMany({
    where: {
      OR: [
        { teacherId: teacher.id },
        { requestedByStaffId: teacher.id },
        { classId: { in: teacherClassIds } },
      ],
    },
    include: {
      class: true,
      subject: true,
      requestSubjects: {
        include: { subject: true },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  return (
    <div className={styles.container}>
      <div className={styles.headerRow} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h1 className={styles.title} style={{ margin: 0 }}>Exams &amp; Marks Management</h1>
          <p style={{ margin: "0.25rem 0 0 0", fontSize: "0.875rem", color: "var(--text-secondary)" }}>
            Request new examinations, manage subject marks tasks, and review consolidated class grids.
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
            <span>All Requests ({examRequests.length})</span>
          </Link>
        </div>
      </div>

      <div className={styles.examsGrid}>
        {/* Left Column: Scheduled Exams & Exam Requests */}
        <div className={styles.mainColumn}>
          {/* 1. Scheduled Approved School Exams */}
          <div className={styles.card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "0.5rem" }}>
              <h3 className={styles.cardHeader} style={{ margin: 0 }}>
                <BookOpen size={20} className="text-primary" />
                <span>Scheduled School Exams ({exams.length})</span>
              </h3>
              <span style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>
                Standalone report card marks appear in Report Card History
              </span>
            </div>
            
            <div className={styles.examList}>
              {exams.map((exam) => {
                const isClassTeacher = teacher.classTeacherOf?.id === exam.classId;

                return (
                  <div key={exam.id} className={styles.examItem} style={{ flexDirection: "column", alignItems: "stretch", gap: "0.75rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
                      <div className={styles.examLeft}>
                        <div className={styles.examIconBox}>
                          <BookOpen size={20} />
                        </div>
                        <div className={styles.examMeta}>
                          <h4 className={styles.examTitle}>{exam.name}</h4>
                          <p className={styles.examSubText}>
                            {formatClassName(exam.class.name, exam.class.section)} • {exam.examSubjects.length} Subject{exam.examSubjects.length !== 1 ? "s" : ""}
                          </p>
                        </div>
                      </div>
                      <div className={styles.examRight}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.82rem", color: "var(--text-secondary)" }}>
                          <CalendarIcon size={14} />
                          <span>{new Date(exam.date).toLocaleDateString()}</span>
                        </div>
                        <span 
                          className={styles.statusBadge}
                          style={{ 
                            backgroundColor: exam.isPublished ? "rgba(16, 185, 129, 0.15)" : exam._count.marks > 0 ? "rgba(59, 130, 246, 0.15)" : "var(--warning-bg)", 
                            color: exam.isPublished ? "#10b981" : exam._count.marks > 0 ? "#60a5fa" : "var(--warning)" 
                          }}
                        >
                          {exam.isPublished ? <CheckCircle2 size={12} /> : <Clock size={12} />}
                          {exam.isPublished ? "Published" : exam._count.marks > 0 ? "Marks In Progress" : "Scheduled"}
                        </span>
                      </div>
                    </div>

                    {/* Quick Action Buttons */}
                    <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", borderTop: "1px solid var(--border)", paddingTop: "0.6rem" }}>
                      <Link
                        href={`/dashboard/teacher/exams/tasks`}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.35rem",
                          padding: "0.35rem 0.75rem",
                          borderRadius: "6px",
                          background: "rgba(59, 130, 246, 0.12)",
                          color: "#3b82f6",
                          border: "1px solid rgba(59, 130, 246, 0.25)",
                          fontSize: "0.78rem",
                          fontWeight: 700,
                          textDecoration: "none",
                        }}
                      >
                        <CheckSquare size={13} />
                        <span>Enter Subject Marks</span>
                      </Link>

                      {isClassTeacher && (
                        <Link
                          href={`/dashboard/teacher/exams/${exam.id}/review`}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "0.35rem",
                            padding: "0.35rem 0.75rem",
                            borderRadius: "6px",
                            background: "rgba(16, 185, 129, 0.12)",
                            color: "#10b981",
                            border: "1px solid rgba(16, 185, 129, 0.25)",
                            fontSize: "0.78rem",
                            fontWeight: 700,
                            textDecoration: "none",
                          }}
                        >
                          <span>Review &amp; Verify Class Grid (CT)</span>
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })}

              {exams.length === 0 && (
                <div style={{ textAlign: "center", padding: "2.5rem 1rem", color: "var(--text-secondary)" }}>
                  <CalendarIcon size={36} style={{ opacity: 0.35, margin: "0 auto 0.5rem" }} />
                  <p style={{ margin: "0 0 0.25rem 0", fontWeight: 600, color: "var(--foreground)" }}>
                    No Scheduled School Exams Found
                  </p>
                  <p style={{ margin: 0, fontSize: "0.85rem" }}>
                    Standalone report cards appear in Report Card Sent History. Use the form on the right to propose a new examination to the Admin.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* 2. My Submitted Exam Requests */}
          <div className={styles.card}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem", marginBottom: "1rem" }}>
              <h3 className={styles.cardHeader} style={{ margin: 0 }}>
                <FileText size={20} className="text-primary" />
                <span>My Exam Requests ({examRequests.length})</span>
              </h3>
              <Link
                href="/dashboard/teacher/exams/requests"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.4rem",
                  fontSize: "0.8rem",
                  fontWeight: 600,
                  color: "var(--primary, #3b82f6)",
                  textDecoration: "none",
                }}
              >
                View Detailed Requests →
              </Link>
            </div>
            
            <div className={styles.examList}>
              {examRequests.map((req) => {
                const isApproved = req.status === "APPROVED";
                const isDeclined = req.status === "DECLINED" || req.status === "REJECTED";
                const subCount = req.requestSubjects?.length || (req.subject ? 1 : 0);

                return (
                  <div key={req.id} className={styles.requestItem}>
                    <div className={styles.requestLeft}>
                      <h4 className={styles.requestTitle}>{req.title || "Examination"}</h4>
                      <p className={styles.requestSub}>
                        {formatClassName(req.class.name, req.class.section)} • {subCount} Subject{subCount !== 1 ? "s" : ""} • {new Date(req.date || req.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className={styles.requestRight}>
                      <span 
                        className={styles.statusBadge}
                        style={{ 
                          backgroundColor: isApproved ? "var(--success-bg)" : isDeclined ? "var(--danger-bg)" : "var(--warning-bg)", 
                          color: isApproved ? "var(--success)" : isDeclined ? "var(--danger)" : "var(--warning)" 
                        }}
                      >
                        {isApproved && <CheckCircle2 size={12} />}
                        {isDeclined && <AlertCircle size={12} />}
                        {!isApproved && !isDeclined && <Clock size={12} />}
                        {req.status === "PENDING_ADMIN" ? "Awaiting Admin Approval" : req.status}
                      </span>
                      {req.declineReason && (
                        <span style={{ fontSize: "0.75rem", color: "var(--danger)", maxWidth: "220px", overflowWrap: "anywhere" }}>
                          Reason: {req.declineReason}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}

              {examRequests.length === 0 && (
                <p style={{ textAlign: "center", padding: "1.5rem 1rem", color: "var(--text-secondary)", margin: 0, fontSize: "0.9rem" }}>
                  No exam requests submitted yet. Use the form on the right to propose an exam.
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
            <p style={{ fontSize: "0.825rem", color: "var(--text-secondary)", margin: "-0.5rem 0 1rem 0" }}>
              Configure exam type, dates, test timings, pass marks, and maximum marks for your assigned classes. Submits to Admin for timetable scheduling.
            </p>
            <CreateExamForm teacherId={teacher.id} assignedSubjects={assignedSubjects} />
          </div>
        </div>
      </div>
    </div>
  );
}
