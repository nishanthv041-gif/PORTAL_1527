import { getServerSession } from "next-auth/next";
import { authOptions } from "../../../api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import styles from "../../dashboard.module.css";
import ChildSwitcher from "../ChildSwitcher";
import { BookOpen, Calendar as CalendarIcon, CheckCircle, Clock } from "lucide-react";

export default async function ParentAssignmentsPage({
  searchParams
}: {
  searchParams: Promise<{ childId?: string }>
}) {
  const resolvedSearchParams = await searchParams;
  const session = await getServerSession(authOptions);
  if (!session) return null;

  const parent = await prisma.parent.findUnique({
    where: { userId: session.user.id },
    include: {
      children: {
        include: {
          student: true
        }
      }
    }
  });

  if (!parent || parent.children.length === 0) {
    return <p>No children linked to your account.</p>;
  }

  const children = parent.children.map(s => s.student);
  
  let selectedChild = children[0];
  if (resolvedSearchParams.childId) {
    const found = children.find(c => c.id === resolvedSearchParams.childId);
    if (found) selectedChild = found;
  }

  const assignments = await prisma.assignment.findMany({
    where: { classId: selectedChild.classId! },
    include: {
      submissions: {
        where: { studentId: selectedChild.id }
      },
      teacher: {
        include: { user: true }
      }
    },
    orderBy: { deadline: 'desc' }
  });

  return (
    <div className={styles.dashboard}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <h1 className={styles.title} style={{ margin: 0 }}>Assignments</h1>
        <ChildSwitcher studentList={children} selectedChildId={selectedChild.id} />
      </div>

      <div className={styles.chartsContainer} style={{ marginTop: '2rem' }}>
        <div className={styles.chartCard} style={{ gridColumn: '1 / -1' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {assignments.map((assignment) => {
              const sub = assignment.submissions[0];
              const isSubmitted = !!sub;

              return (
                <div key={assignment.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem', border: '1px solid var(--border)', borderRadius: '8px', backgroundColor: 'var(--background)', transition: 'border-color 0.2s', flexWrap: 'wrap', gap: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ width: 40, height: 40, borderRadius: '8px', backgroundColor: 'var(--primary-bg)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <BookOpen size={20} />
                    </div>
                    <div>
                      <h4 style={{ margin: 0, color: 'var(--foreground)' }}>{assignment.title}</h4>
                      <p style={{ margin: 0, fontSize: '0.85rem', opacity: 0.7, color: 'var(--foreground)' }}>
                        Teacher: {assignment.teacher.user.name}
                      </p>
                    </div>
                  </div>
                  
                  <div style={{ display: 'flex', alignItems: 'center', gap: '2rem', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.25rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', opacity: 0.8, color: 'var(--foreground)' }}>
                        <CalendarIcon size={14} />
                        Due: {new Date(assignment.deadline).toLocaleDateString()}
                      </div>
                      
                      {!isSubmitted && (
                        <span style={{ fontSize: '0.75rem', padding: '4px 8px', borderRadius: '12px', backgroundColor: 'var(--danger-bg)', color: "var(--danger)", display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                          <Clock size={12} /> Missing / Pending
                        </span>
                      )}
                      {isSubmitted && sub.status === 'SUBMITTED' && (
                        <span style={{ fontSize: '0.75rem', padding: '4px 8px', borderRadius: '12px', backgroundColor: 'var(--warning-bg)', color: "var(--warning)", display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                          <CheckCircle size={12} /> Submitted (Not Graded)
                        </span>
                      )}
                      {isSubmitted && sub.status === 'GRADED' && (
                        <span style={{ fontSize: '0.75rem', padding: '4px 8px', borderRadius: '12px', backgroundColor: 'var(--success-bg)', color: "var(--success)", display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                          <CheckCircle size={12} /> Graded
                        </span>
                      )}
                    </div>

                    {isSubmitted && sub.status === 'GRADED' && sub.remarks && (
                      <div style={{ padding: '0.5rem 1rem', backgroundColor: 'rgba(16, 185, 129, 0.05)', borderRadius: '6px', border: '1px dashed rgba(16, 185, 129, 0.3)', minWidth: '150px' }}>
                        <span style={{ fontSize: '0.75rem', opacity: 0.7, display: 'block', marginBottom: '0.25rem' }}>Grade / Remarks</span>
                        <span style={{ fontSize: '0.875rem', fontWeight: 500, color: "var(--success)" }}>{sub.remarks}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {assignments.length === 0 && (
              <p style={{ textAlign: 'center', padding: '2rem', opacity: 0.7 }}>No assignments found for this class.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
