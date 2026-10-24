import { prisma } from "@/backend/db/prisma";
import styles from "../../dashboard.module.css";
import { BookOpen, Calendar as CalendarIcon } from "lucide-react";
import { getSystemSetting } from "@/backend/api/actions/dashboard/admin/settings/actions";
import { getParentAndSelectedChild } from "../parentChildHelper";

export default async function ParentExamsPage({
  searchParams
}: {
  searchParams: Promise<{ childId?: string }>
}) {
  const resolvedSearchParams = await searchParams;
  const { session, parent, children, selectedChild } = await getParentAndSelectedChild(resolvedSearchParams?.childId);
  if (!session) return null;

  const canView = await getSystemSetting("RESULT_VISIBILITY", "false");
  if (canView === "false") {
    return (
      <div className={styles.dashboard}>
        <h1 className={styles.title}>Exams & Marks</h1>
        <p style={{ color: "var(--danger)" }}>Exam results are currently hidden by the administrator.</p>
      </div>
    );
  }

  if (!parent || children.length === 0 || !selectedChild) {
    return (
      <div className={styles.dashboard}>
        <h1 className={styles.title}>Exams & Marks</h1>
        <p>No children linked to your account.</p>
      </div>
    );
  }

  const exams = selectedChild.classId ? await prisma.exam.findMany({
    where: { classId: selectedChild.classId },
    include: {
      marks: {
        where: { studentId: selectedChild.id },
        include: { subject: true }
      }
    },
    orderBy: { date: 'desc' }
  }) : [];

  return (
    <div className={styles.dashboard}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 className={styles.title} style={{ margin: 0 }}>Exams & Marks</h1>
          <p style={{ color: 'var(--text-secondary)', margin: '0.25rem 0 0 0', fontSize: '0.9rem' }}>
            Viewing exams and marks for <strong>{selectedChild.firstName} {selectedChild.lastName}</strong>
          </p>
        </div>
      </div>

      <div className={styles.chartsContainer} style={{ marginTop: '2rem' }}>
        {exams.map((exam) => (
          <div key={exam.id} className={styles.chartCard}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem', paddingBottom: '1rem', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{ width: 40, height: 40, borderRadius: '8px', backgroundColor: 'rgba(99, 102, 241, 0.1)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <BookOpen size={20} />
                </div>
                <div>
                  <h3 style={{ margin: 0, color: 'var(--foreground)' }}>{exam.name}</h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', opacity: 0.7, marginTop: '0.25rem' }}>
                    <CalendarIcon size={14} />
                    {new Date(exam.date).toLocaleDateString()}
                  </div>
                </div>
              </div>
              <span style={{ fontSize: '0.75rem', padding: '4px 8px', borderRadius: '12px', backgroundColor: exam.marks.length > 0 ? 'var(--success-bg)' : 'var(--warning-bg)', color: exam.marks.length > 0 ? "var(--success)" : "var(--warning)" }}>
                {exam.marks.length > 0 ? 'Marks Available' : 'Upcoming/Pending'}
              </span>
            </div>

            {exam.marks.length > 0 ? (
              <div style={{ overflowX: 'auto', width: '100%', maxWidth: '100%', minWidth: 0, WebkitOverflowScrolling: 'touch' }}>
                <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", minWidth: "350px" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border)" }}>
                      <th style={{ padding: "0.5rem 0", fontWeight: 600, fontSize: '0.875rem' }}>Subject</th>
                      <th style={{ padding: "0.5rem 0", fontWeight: 600, fontSize: '0.875rem' }}>Score</th>
                      <th style={{ padding: "0.5rem 0", fontWeight: 600, fontSize: '0.875rem' }}>Percentage</th>
                    </tr>
                  </thead>
                  <tbody>
                    {exam.marks.map((mark) => (
                      <tr key={mark.id} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={{ padding: "0.75rem 0", fontSize: '0.875rem' }}>{mark.subject.name}</td>
                        <td style={{ padding: "0.75rem 0", fontSize: '0.875rem', fontWeight: 500 }}>
                          {mark.score} / {mark.maxScore}
                        </td>
                        <td style={{ padding: "0.75rem 0", fontSize: '0.875rem' }}>
                          {((mark.score / mark.maxScore) * 100).toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p style={{ fontSize: '0.875rem', opacity: 0.7, margin: 0, textAlign: 'center', padding: '1rem 0' }}>
                No marks have been published for this exam yet.
              </p>
            )}
          </div>
        ))}

        {exams.length === 0 && (
          <div className={styles.chartCard} style={{ gridColumn: '1 / -1' }}>
            <p style={{ textAlign: 'center', opacity: 0.7, padding: '2rem' }}>No exams found for this class.</p>
          </div>
        )}
      </div>
    </div>
  );
}
