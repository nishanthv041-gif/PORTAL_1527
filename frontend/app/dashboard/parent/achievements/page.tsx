import { prisma } from "@/backend/db/prisma";
import styles from "../../dashboard.module.css";
import { Award, Calendar } from "lucide-react";
import { getParentAndSelectedChild } from "../parentChildHelper";

export default async function ParentAchievementsPage({
  searchParams
}: {
  searchParams: Promise<{ childId?: string }>
}) {
  const resolvedSearchParams = await searchParams;
  const { session, parent, children, selectedChild } = await getParentAndSelectedChild(resolvedSearchParams?.childId);
  if (!session) return null;

  if (!parent || children.length === 0 || !selectedChild) {
    return <p>No children linked to your account.</p>;
  }

  const achievements = await prisma.achievement.findMany({
    where: { studentId: selectedChild.id },
    orderBy: { date: 'desc' }
  });

  return (
    <div className={styles.dashboard}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 className={styles.title} style={{ margin: 0 }}>Achievements</h1>
          <p style={{ color: 'var(--text-secondary)', margin: '0.25rem 0 0 0', fontSize: '0.9rem' }}>
            Viewing achievements for <strong>{selectedChild.firstName} {selectedChild.lastName}</strong>
          </p>
        </div>
      </div>

      <div className={styles.chartsContainer} style={{ marginTop: '2rem' }}>
        <div className={styles.chartCard} style={{ gridColumn: '1 / -1' }}>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {achievements.map((achievement) => (
              <div key={achievement.id} style={{ display: 'flex', flexDirection: 'column', padding: '1.25rem', border: '1px solid var(--border)', borderRadius: '8px', backgroundColor: 'var(--background)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ width: 36, height: 36, borderRadius: '8px', backgroundColor: 'var(--success-bg)', color: "var(--success)", display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Award size={18} />
                    </div>
                    <div>
                      <h4 style={{ margin: 0, color: 'var(--foreground)', fontSize: '1.1rem' }}>{achievement.title}</h4>
                      <div style={{ display: 'flex', gap: '1rem', fontSize: '0.85rem', opacity: 0.7, marginTop: '0.25rem' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                          <Calendar size={14} /> {new Date(achievement.date).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, padding: '4px 8px', borderRadius: '12px', backgroundColor: 'var(--success-bg)', color: "var(--success)" }}>
                    {achievement.category}
                  </span>
                </div>
                
                {achievement.description && (
                  <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                    {achievement.description}
                  </p>
                )}
              </div>
            ))}

            {achievements.length === 0 && (
              <div style={{ textAlign: 'center', padding: '3rem', border: '1px dashed var(--border)', borderRadius: '12px' }}>
                <Award size={48} style={{ opacity: 0.2, margin: '0 auto 1rem', color: 'var(--primary)' }} />
                <p style={{ margin: 0, opacity: 0.7 }}>No achievements recorded yet.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
