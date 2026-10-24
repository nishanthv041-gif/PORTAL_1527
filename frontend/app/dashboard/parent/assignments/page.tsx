import { prisma } from "@/backend/db/prisma";
import styles from "../../dashboard.module.css";
import { BookOpen, Calendar as CalendarIcon, CheckCircle2, FileText } from "lucide-react";
import { getParentAndSelectedChild } from "../parentChildHelper";
import ParentChildBanner from "../ParentChildBanner";

export default async function ParentAssignmentsPage({
  searchParams
}: {
  searchParams: Promise<{ childId?: string }>
}) {
  const resolvedSearchParams = await searchParams;
  const { session, parent, children, selectedChild } = await getParentAndSelectedChild(resolvedSearchParams?.childId);
  if (!session) return null;

  if (!parent || children.length === 0 || !selectedChild) {
    return (
      <div className={styles.dashboard}>
        <h1 className={styles.title}>School Assignments</h1>
        <p>No children linked to your account.</p>
      </div>
    );
  }

  // School Portal Assignments (Homework / tasks assigned to the child's class)
  const assignments = selectedChild.classId ? await prisma.assignment.findMany({
    where: { classId: selectedChild.classId },
    include: {
      teacher: {
        include: { user: true }
      },
      class: true
    },
    orderBy: { deadline: 'desc' }
  }) : [];

  return (
    <div className={styles.dashboard}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 className={styles.title} style={{ margin: 0 }}>School Assignments</h1>
          <p style={{ color: 'var(--text-secondary)', margin: '0.25rem 0 0 0', fontSize: '0.9rem' }}>
            Classwork and homework assigned for <strong>{selectedChild.firstName} {selectedChild.lastName}</strong>
          </p>
        </div>
      </div>

      <div style={{ marginTop: '1.25rem' }}>
        <ParentChildBanner 
          selectedChild={selectedChild} 
          studentList={children} 
          activePage="other" 
        />
      </div>

      <div className={styles.chartsContainer} style={{ marginTop: '1.5rem' }}>
        <div className={styles.chartCard} style={{ gridColumn: '1 / -1' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {assignments.map((assignment) => {
              const isPastDue = new Date(assignment.deadline) < new Date();

              return (
                <div 
                  key={assignment.id} 
                  style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between', 
                    padding: '1.25rem', 
                    border: '1px solid var(--border)', 
                    borderRadius: '10px', 
                    backgroundColor: 'var(--background)', 
                    transition: 'border-color 0.2s', 
                    flexWrap: 'wrap', 
                    gap: '1rem' 
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', minWidth: '240px', flex: '1 1 300px' }}>
                    <div style={{ 
                      width: 44, 
                      height: 44, 
                      borderRadius: '10px', 
                      backgroundColor: 'rgba(99, 102, 241, 0.12)', 
                      color: 'var(--primary)', 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center',
                      flexShrink: 0
                    }}>
                      <BookOpen size={22} />
                    </div>
                    <div>
                      <h4 style={{ margin: 0, color: 'var(--foreground)', fontSize: '1rem', fontWeight: 600 }}>
                        {assignment.title}
                      </h4>
                      <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        Assigned by {assignment.teacher?.user?.name || 'Class Teacher'} • {assignment.class.name} - {assignment.class.section}
                      </p>
                      {assignment.description && (
                        <p style={{ margin: '0.4rem 0 0 0', fontSize: '0.85rem', color: 'var(--foreground)', opacity: 0.85 }}>
                          {assignment.description}
                        </p>
                      )}
                    </div>
                  </div>
                  
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.35rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        <CalendarIcon size={14} />
                        Due: {new Date(assignment.deadline).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </div>
                      
                      <span style={{ 
                        fontSize: '0.75rem', 
                        padding: '4px 10px', 
                        borderRadius: '12px', 
                        backgroundColor: isPastDue ? 'rgba(156, 163, 175, 0.15)' : 'rgba(16, 185, 129, 0.15)', 
                        color: isPastDue ? 'var(--text-secondary)' : 'var(--success)', 
                        display: 'inline-flex', 
                        alignItems: 'center', 
                        gap: '0.25rem',
                        fontWeight: 600 
                      }}>
                        <CheckCircle2 size={12} />
                        {isPastDue ? 'Completed / Past Due' : 'Active Homework'}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}

            {assignments.length === 0 && (
              <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
                <FileText size={40} style={{ opacity: 0.3, margin: '0 auto 0.75rem' }} />
                <p style={{ margin: 0, fontWeight: 500 }}>No assignments scheduled for this class.</p>
                <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.85rem', opacity: 0.7 }}>
                  New homework assigned by teachers will appear here.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
