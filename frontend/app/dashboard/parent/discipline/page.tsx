import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import styles from "../../dashboard.module.css";
import ChildSwitcher from "../ChildSwitcher";
import { AlertOctagon, Calendar, FileText, CheckCircle } from "lucide-react";

export default async function ParentDisciplinePage({
  searchParams
}: {
  searchParams: Promise<{ childId?: string }>
}) {
  const resolvedSearchParams = await searchParams;
  const session = await getServerSession(getAuthOptions());
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

  const records = await prisma.disciplineRecord.findMany({
    where: { studentId: selectedChild.id },
    orderBy: { date: 'desc' }
  });

  return (
    <div className={styles.dashboard}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <h1 className={styles.title} style={{ margin: 0 }}>Discipline Records</h1>
        <ChildSwitcher studentList={children} selectedChildId={selectedChild.id} />
      </div>

      <div className={styles.chartsContainer} style={{ marginTop: '2rem' }}>
        <div className={styles.chartCard} style={{ gridColumn: '1 / -1' }}>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {records.map((record) => (
              <div key={record.id} style={{ display: 'flex', flexDirection: 'column', padding: '1.25rem', border: '1px solid var(--border)', borderRadius: '8px', backgroundColor: 'var(--background)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ width: 36, height: 36, borderRadius: '8px', backgroundColor: 'var(--danger-bg)', color: "var(--danger)", display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <AlertOctagon size={18} />
                    </div>
                    <div>
                      <h4 style={{ margin: 0, color: 'var(--foreground)', fontSize: '1.1rem' }}>{record.incident}</h4>
                      <div style={{ display: 'flex', gap: '1rem', fontSize: '0.85rem', opacity: 0.7, marginTop: '0.25rem' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                          <Calendar size={14} /> {new Date(record.date).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, padding: '4px 8px', borderRadius: '12px', backgroundColor: 'var(--danger-bg)', color: "var(--danger)" }}>
                    {record.severity}
                  </span>
                </div>
                
                <div style={{ marginTop: '0.75rem', padding: '1rem', backgroundColor: 'rgba(0, 0, 0, 0.02)', borderRadius: '6px', borderLeft: '3px solid #ef4444' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                    <FileText size={16} style={{ marginTop: '0.1rem', opacity: 0.5 }} />
                    <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--foreground)', lineHeight: 1.5 }}>
                      {record.description}
                    </p>
                  </div>
                </div>
              </div>
            ))}

            {records.length === 0 && (
              <div style={{ textAlign: 'center', padding: '3rem', backgroundColor: 'rgba(16, 185, 129, 0.05)', borderRadius: '12px', border: '1px dashed rgba(16, 185, 129, 0.2)' }}>
                <CheckCircle size={48} style={{ opacity: 0.5, color: "var(--success)", margin: '0 auto 1rem' }} />
                <h4 style={{ margin: '0 0 0.5rem 0', color: "var(--success)", fontSize: '1.1rem' }}>Excellent Behavior</h4>
                <p style={{ margin: 0, opacity: 0.7 }}>No discipline records found for this student.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
