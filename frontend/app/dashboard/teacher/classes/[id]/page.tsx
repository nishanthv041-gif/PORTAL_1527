import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import { autoDeleteExpiredHomework } from "@/backend/api/actions/dashboard/teacher/assignments/actions";
import Link from "next/link";
import styles from "../../../dashboard.module.css";
import {
  ArrowLeft,
  User,
  BookOpen,
  Calendar as CalendarIcon,
  Clock,
  MessageSquare,
  PlusCircle,
  UserCheck,
  ExternalLink
} from "lucide-react";

export default async function TeacherClassRosterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerSession(getAuthOptions());
  if (!session) return null;

  // Clean up any expired homework past deadline
  await autoDeleteExpiredHomework();

  const [cls, teacher, classHomework] = await Promise.all([
    prisma.class.findUnique({
      where: { id: id },
      include: {
        students: {
          orderBy: { firstName: 'asc' }
        }
      }
    }),
    prisma.teacher.findUnique({
      where: { userId: session.user.id },
      select: { id: true, user: { select: { name: true } } }
    }),
    prisma.assignment.findMany({
      where: {
        classId: id
      },
      include: {
        subject: {
          include: {
            teacher: {
              include: { user: true }
            }
          }
        },
        teacher: {
          include: { user: true }
        },
        _count: {
          select: { comments: true }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    })
  ]);

  if (!cls) {
    return <p style={{ padding: "2rem" }}>Class not found.</p>;
  }

  const isToday = (date: Date) => {
    const today = new Date();
    return (
      date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear()
    );
  };

  return (
    <div className={styles.dashboard}>
      {/* Top Navigation */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem", marginBottom: "1rem" }}>
        <div>
          <Link
            href="/dashboard/teacher/classes"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.4rem",
              color: "var(--primary)",
              textDecoration: "none",
              fontSize: "0.875rem",
              fontWeight: 600,
              marginBottom: "0.5rem"
            }}
          >
            <ArrowLeft size={16} /> Back to Classes
          </Link>
          <h1 className={styles.title} style={{ margin: 0 }}>
            {cls.name} - {cls.section} Class Portal
          </h1>
        </div>

        <Link
          href="/dashboard/teacher/assignments"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.4rem",
            padding: "0.6rem 1.25rem",
            borderRadius: "8px",
            backgroundColor: "var(--primary)",
            color: "var(--primary-fg)",
            textDecoration: "none",
            fontSize: "0.85rem",
            fontWeight: 700
          }}
        >
          <PlusCircle size={15} />
          <span>Assign Subject Home Work</span>
        </Link>
      </div>

      {/* =========================================================
          SECTION 1: TODAY'S CLASS HOME WORK
         ========================================================= */}
      <div className={styles.chartCard} style={{ marginBottom: "1.5rem", padding: "1.5rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem", marginBottom: "1rem" }}>
          <div>
            <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 700, display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span>📅 Today&apos;s Home Work for {cls.name} - {cls.section}</span>
              <span style={{ fontSize: "0.75rem", padding: "2px 8px", borderRadius: "12px", backgroundColor: "rgba(99, 102, 241, 0.12)", color: "var(--primary)" }}>
                {classHomework.length} Active Task{classHomework.length !== 1 ? "s" : ""}
              </span>
            </h3>
            <p style={{ margin: "0.2rem 0 0 0", fontSize: "0.825rem", color: "var(--text-secondary)" }}>
              All subject tasks assigned to students in this class. Managed by each subject&apos;s assigned staff.
            </p>
          </div>
        </div>

        {classHomework.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
            {classHomework.map((hw) => {
              const staffName = hw.subject?.teacher?.user?.name || hw.teacher?.user?.name || "Subject Staff";
              const createdToday = isToday(new Date(hw.createdAt));
              const dueToday = isToday(new Date(hw.deadline));

              return (
                <div
                  key={hw.id}
                  style={{
                    padding: "1rem 1.25rem",
                    borderRadius: "10px",
                    border: "1px solid var(--border)",
                    backgroundColor: "var(--background)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: "1rem"
                  }}
                >
                  <div style={{ flex: "1 1 300px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", flexWrap: "wrap", marginBottom: "0.35rem" }}>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.25rem",
                          padding: "2px 8px",
                          borderRadius: "10px",
                          backgroundColor: "rgba(99, 102, 241, 0.12)",
                          color: "var(--primary)",
                          fontSize: "0.75rem",
                          fontWeight: 700
                        }}
                      >
                        <BookOpen size={12} />
                        {hw.subject?.name || "General Subject"}
                      </span>

                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.25rem",
                          padding: "2px 8px",
                          borderRadius: "10px",
                          backgroundColor: "rgba(100, 116, 139, 0.1)",
                          color: "var(--text-secondary)",
                          fontSize: "0.75rem",
                          fontWeight: 600
                        }}
                      >
                        <UserCheck size={12} />
                        Staff: {staffName}
                      </span>

                      {createdToday && (
                        <span style={{ fontSize: "0.75rem", padding: "2px 7px", borderRadius: "10px", backgroundColor: "rgba(16, 185, 129, 0.15)", color: "var(--success)", fontWeight: 700 }}>
                          ✨ Given Today
                        </span>
                      )}

                      {dueToday && (
                        <span style={{ fontSize: "0.75rem", padding: "2px 7px", borderRadius: "10px", backgroundColor: "rgba(234, 179, 8, 0.15)", color: "#ca8a04", fontWeight: 700 }}>
                          ⚠️ Due Today
                        </span>
                      )}
                    </div>

                    <h4 style={{ margin: "0 0 0.25rem 0", fontSize: "1rem", fontWeight: 700, color: "var(--foreground)" }}>
                      {hw.title}
                    </h4>

                    {hw.description && (
                      <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: 1.4 }}>
                        {hw.description}
                      </p>
                    )}

                    <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginTop: "0.35rem", fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                      <span>Assigned: {new Date(hw.createdAt).toLocaleDateString()}</span>
                      <span style={{ fontWeight: 600, color: dueToday ? "#ca8a04" : "var(--foreground)" }}>
                        Due: {new Date(hw.deadline).toLocaleDateString()}
                      </span>
                    </div>
                  </div>

                  <div>
                    <Link
                      href={`/dashboard/teacher/assignments/${hw.id}`}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.4rem",
                        padding: "6px 14px",
                        borderRadius: "8px",
                        backgroundColor: "var(--card)",
                        border: "1px solid var(--border)",
                        color: "var(--primary)",
                        fontSize: "0.85rem",
                        fontWeight: 600,
                        textDecoration: "none"
                      }}
                    >
                      <MessageSquare size={14} />
                      <span>Console & Conversation ({hw._count.comments})</span>
                      <ExternalLink size={13} />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ padding: "1.75rem 1rem", textAlign: "center", color: "var(--text-secondary)" }}>
            <BookOpen size={36} style={{ opacity: 0.3, margin: "0 auto 0.5rem" }} />
            <p style={{ margin: 0, fontSize: "0.875rem" }}>
              No home work assigned for this class today.
            </p>
          </div>
        )}
      </div>

      {/* =========================================================
          SECTION 2: CLASS STUDENTS ROSTER
         ========================================================= */}
      <div className={styles.chartCard} style={{ padding: "1.5rem" }}>
        <h3 style={{ margin: "0 0 1rem 0", fontSize: "1.15rem", fontWeight: 700 }}>
          Students Enrolled ({cls.students.length})
        </h3>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: "1rem" }}>
          {cls.students.map((student) => (
            <div key={student.id} style={{ display: "flex", alignItems: "center", gap: "1rem", padding: "1rem", border: "1px solid var(--border)", borderRadius: "8px", backgroundColor: "var(--background)" }}>
              <div style={{ width: "40px", height: "40px", borderRadius: "50%", backgroundColor: "rgba(99, 102, 241, 0.1)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--primary)" }}>
                <User size={20} />
              </div>
              <div style={{ display: "flex", flexDirection: "column" }}>
                <span style={{ fontWeight: 600 }}>{student.firstName} {student.lastName}</span>
                <span style={{ fontSize: "0.8rem", opacity: 0.7 }}>Roll No: {student.rollNumber}</span>
              </div>
            </div>
          ))}

          {cls.students.length === 0 && (
            <p style={{ opacity: 0.7 }}>No students enrolled in this class.</p>
          )}
        </div>
      </div>
    </div>
  );
}
