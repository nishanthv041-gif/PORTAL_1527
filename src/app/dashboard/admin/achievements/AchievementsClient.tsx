"use client";

import { Award, User, Calendar, CheckCircle, XCircle } from "lucide-react";
import { toggleAchievementVerificationAction } from "./actions";
import { Achievement, Student, Class } from "@prisma/client";

type AchievementWithStudent = Achievement & {
  student: Student & { class: Class | null };
};

export default function AchievementsClient({ achievements }: { achievements: AchievementWithStudent[] }) {
  const toggleVerification = async (id: string, currentStatus: boolean) => {
    const res = await toggleAchievementVerificationAction(id, !currentStatus);
    if (res.error) alert(res.error);
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '1.5rem' }}>
      {achievements.map(achievement => (
        <div key={achievement.id} style={{ background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '1.5rem', flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
              <div>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {achievement.category}
                </span>
                <h3 style={{ margin: '0.5rem 0 0 0', fontSize: '1.25rem', fontWeight: 600 }}>{achievement.title}</h3>
              </div>
              <div style={{ background: 'var(--warning-bg)', color: "var(--warning)", padding: '0.75rem', borderRadius: '50%' }}>
                <Award size={24} />
              </div>
            </div>
            
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', margin: '0 0 1.5rem 0', lineHeight: 1.5 }}>
              {achievement.description || "No description provided."}
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', padding: '1rem', background: 'rgba(0,0,0,0.02)', borderRadius: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>
                <User size={14} color="var(--primary)" /> {achievement.student.firstName} {achievement.student.lastName}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginLeft: '1.25rem' }}>
                Class: {achievement.student.class?.name}-{achievement.student.class?.section}
              </div>
            </div>
          </div>

          <div style={{ padding: '1rem 1.5rem', background: 'rgba(0,0,0,0.02)', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              <Calendar size={14} /> {new Date(achievement.date).toLocaleDateString()}
            </div>
            <button 
              onClick={() => toggleVerification(achievement.id, achievement.isVerified)}
              style={{ 
                background: achievement.isVerified ? 'var(--success-bg)' : 'rgba(107, 114, 128, 0.1)', 
                color: achievement.isVerified ? "var(--success)" : "var(--text-secondary)", 
                border: 'none', 
                padding: '0.5rem 0.75rem', 
                borderRadius: '8px', 
                fontSize: '0.75rem',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '0.25rem',
                cursor: 'pointer'
              }}
            >
              {achievement.isVerified ? <><CheckCircle size={14} /> Verified</> : <><XCircle size={14} /> Unverified</>}
            </button>
          </div>
        </div>
      ))}
      {achievements.length === 0 && (
        <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '4rem', color: 'var(--text-secondary)', background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
          <Award size={48} style={{ opacity: 0.2, margin: '0 auto 1rem', color: "var(--warning)" }} />
          <p>No achievements have been recorded yet.</p>
        </div>
      )}
    </div>
  );
}
