import { getServerSession } from "next-auth/next";
import { authOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import Link from "next/link";
import styles from "../../../dashboard.module.css";
import { ArrowLeft } from "lucide-react";
import GradeForm from "./GradeForm";

export default async function TeacherAssignmentDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
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
      submissions: true
    }
  });

  if (!assignment) return <p>Assignment not found.</p>;

  // Create a map of submissions by studentId for easier lookup
  const submissionMap = new Map();
  assignment.submissions.forEach(sub => {
    submissionMap.set(sub.studentId, sub);
  });

  return (
    <div className={styles.dashboard}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
        <Link href="/dashboard/teacher/assignments" style={{ color: 'var(--foreground)', opacity: 0.7 }}>
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className={styles.title} style={{ margin: 0 }}>
            {assignment.title}
          </h1>
          <p style={{ margin: 0, opacity: 0.7, fontSize: '0.875rem' }}>
            Class: {assignment.class.name} - {assignment.class.section} | Due: {new Date(assignment.deadline).toLocaleDateString()}
          </p>
        </div>
      </div>

      <div className={styles.chartCard}>
        <h3 className={styles.chartHeader}>Submissions</h3>
        
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
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
