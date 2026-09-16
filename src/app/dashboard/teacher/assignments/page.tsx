import { getServerSession } from "next-auth/next";
import { authOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import Link from "next/link";
import styles from "../../dashboard.module.css";
import { Calendar as CalendarIcon, Edit3 } from "lucide-react";
import CreateAssignmentForm from "./CreateAssignmentForm";

export default async function TeacherAssignmentsPage() {
  const session = await getServerSession(authOptions);
  if (!session) return null;

  const teacher = await prisma.teacher.findUnique({
    where: { userId: session.user.id },
    include: {
      classes: true
    }
  });

  if (!teacher) return null;

  const assignments = await prisma.assignment.findMany({
    where: {
      teacherId: teacher.id
    },
    include: {
      class: true,
      _count: {
        select: { submissions: true }
      }
    },
    orderBy: {
      deadline: 'desc'
    }
  });

  return (
    <div className={styles.dashboard}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 className={styles.title}>Assignments</h1>
      </div>

      <div className={styles.chartsContainer}>
        <div className={styles.chartCard}>
          <h3 className={styles.chartHeader}>My Assignments</h3>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {assignments.map((assignment) => (
              <Link href={`/dashboard/teacher/assignments/${assignment.id}`} key={assignment.id} style={{ textDecoration: 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem', border: '1px solid var(--border)', borderRadius: '8px', backgroundColor: 'var(--background)', transition: 'border-color 0.2s' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ width: 40, height: 40, borderRadius: '8px', backgroundColor: 'var(--primary-bg)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Edit3 size={20} />
                    </div>
                    <div>
                      <h4 style={{ margin: 0, color: 'var(--foreground)' }}>{assignment.title}</h4>
                      <p style={{ margin: 0, fontSize: '0.85rem', opacity: 0.7, color: 'var(--foreground)' }}>
                        {assignment.class.name} - {assignment.class.section}
                      </p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.25rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', opacity: 0.8, color: 'var(--foreground)' }}>
                      <CalendarIcon size={14} />
                      Due: {new Date(assignment.deadline).toLocaleDateString()}
                    </div>
                    <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '12px', backgroundColor: assignment._count.submissions > 0 ? 'var(--primary-bg)' : 'rgba(156, 163, 175, 0.1)', color: assignment._count.submissions > 0 ? 'var(--primary)' : 'var(--foreground)' }}>
                      {assignment._count.submissions} Submissions
                    </span>
                  </div>
                </div>
              </Link>
            ))}

            {assignments.length === 0 && (
              <p style={{ textAlign: 'center', padding: '2rem', opacity: 0.7 }}>No assignments created yet.</p>
            )}
          </div>
        </div>

        <div className={styles.chartCard}>
          <h3 className={styles.chartHeader}>Create New Assignment</h3>
          <CreateAssignmentForm classes={teacher.classes} teacherId={teacher.id} />
        </div>
      </div>
    </div>
  );
}
