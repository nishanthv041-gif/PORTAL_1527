import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import Link from "next/link";
import styles from "../../../dashboard.module.css";
import { ArrowLeft, BookOpen, GraduationCap } from "lucide-react";
import GradeForm from "./GradeForm";
import OpenConversationButton from "@/frontend/components/homework/OpenConversationButton";

export default async function TeacherAssignmentDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerSession(getAuthOptions());
  if (!session) return null;

  const assignment = await prisma.assignment.findUnique({
    where: { id: id },
    include: {
      class: {
        include: {
          students: {
            orderBy: { firstName: 'asc' }
          }
        }
      },
      subject: true,
      teacher: {
        include: { user: true }
      },
      submissions: true,
      _count: {
        select: { comments: true }
      }
    }
  });

  if (!assignment) return <p style={{ padding: "2rem" }}>Home Work not found.</p>;

  // Create a map of submissions by studentId for easier lookup
  const submissionMap = new Map();
  assignment.submissions.forEach(sub => {
    submissionMap.set(sub.studentId, sub);
  });

  return (
    <div className={styles.dashboard}>
      <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <Link
            href="/dashboard/teacher/assignments"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              color: 'var(--primary)',
              textDecoration: 'none',
              fontSize: '0.875rem',
              fontWeight: 600,
              marginBottom: '0.75rem'
            }}
          >
            <ArrowLeft size={16} /> Back to Home Work
          </Link>

          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.4rem" }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '3px 10px', borderRadius: '12px', backgroundColor: 'rgba(99, 102, 241, 0.12)', color: 'var(--primary)', fontSize: '0.75rem', fontWeight: 700 }}>
              <BookOpen size={13} />
              {assignment.subject?.name || "General Subject"}
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '3px 10px', borderRadius: '12px', backgroundColor: 'rgba(16, 185, 129, 0.12)', color: 'var(--success)', fontSize: '0.75rem', fontWeight: 700 }}>
              <GraduationCap size={13} />
              {assignment.class.name} - {assignment.class.section}
            </span>
          </div>

          <h1 className={styles.title} style={{ margin: 0 }}>
            {assignment.title}
          </h1>
          <p style={{ margin: '0.3rem 0 0 0', opacity: 0.7, fontSize: '0.875rem' }}>
            Due: {new Date(assignment.deadline).toLocaleDateString()} • Assigned on: {new Date(assignment.createdAt).toLocaleDateString()}
          </p>
          {assignment.description && (
            <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.9rem', color: 'var(--text-secondary)', maxWidth: '700px' }}>
              {assignment.description}
            </p>
          )}
        </div>

        <div>
          <OpenConversationButton
            assignmentId={assignment.id}
            assignmentTitle={assignment.title}
            subjectName={assignment.subject?.name}
            className={`${assignment.class.name} - ${assignment.class.section}`}
            teacherName={assignment.teacher.user.name}
            currentUser={{
              id: session.user.id,
              name: session.user.name || "Teacher",
              role: session.user.role || "TEACHER"
            }}
            initialCommentCount={assignment._count.comments}
            label="💬 Work Conversation"
          />
        </div>
      </div>

      <div className={styles.chartCard}>
        <h3 className={styles.chartHeader}>Student Submissions</h3>
        
        <div style={{ overflowX: "auto", width: "100%", maxWidth: "100%", minWidth: 0, WebkitOverflowScrolling: "touch" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", minWidth: "500px" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                <th style={{ padding: "0.75rem", fontWeight: 600 }}>Student</th>
                <th style={{ padding: "0.75rem", fontWeight: 600 }}>Status</th>
                <th style={{ padding: "0.75rem", fontWeight: 600 }}>Submitted At</th>
                <th style={{ padding: "0.75rem", fontWeight: 600 }}>Action / Grade</th>
              </tr>
            </thead>
            <tbody>
              {assignment.class.students.map((student) => {
                const sub = submissionMap.get(student.id);
                const isSubmitted = !!sub;
                
                return (
                  <tr key={student.id} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "0.75rem", fontWeight: 500 }}>
                      {student.firstName} {student.lastName}
                      <div style={{ fontSize: "0.8rem", opacity: 0.7 }}>{student.rollNumber}</div>
                    </td>
                    <td style={{ padding: "0.75rem" }}>
                      {!isSubmitted && (
                        <span style={{ fontSize: '0.75rem', padding: '4px 8px', borderRadius: '12px', backgroundColor: 'var(--danger-bg)', color: "var(--danger)" }}>
                          Missing
                        </span>
                      )}
                      {isSubmitted && sub.status === 'SUBMITTED' && (
                        <span style={{ fontSize: '0.75rem', padding: '4px 8px', borderRadius: '12px', backgroundColor: 'var(--warning-bg)', color: "var(--warning)" }}>
                          Needs Grading
                        </span>
                      )}
                      {isSubmitted && sub.status === 'GRADED' && (
                        <span style={{ fontSize: '0.75rem', padding: '4px 8px', borderRadius: '12px', backgroundColor: 'var(--success-bg)', color: "var(--success)" }}>
                          Graded
                        </span>
                      )}
                    </td>
                    <td style={{ padding: "0.75rem", opacity: 0.8, fontSize: "0.9rem" }}>
                      {isSubmitted ? new Date(sub.submittedAt).toLocaleString() : '-'}
                    </td>
                    <td style={{ padding: "0.75rem" }}>
                      {isSubmitted ? (
                        <GradeForm submission={sub} />
                      ) : (
                        <span style={{ opacity: 0.5, fontSize: "0.9rem" }}>Awaiting submission</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          
          {assignment.class.students.length === 0 && (
            <p style={{ padding: "1rem", textAlign: "center" }}>No students found in this class.</p>
          )}
        </div>
      </div>
    </div>
  );
}
