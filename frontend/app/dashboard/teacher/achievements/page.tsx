import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import styles from "../../dashboard.module.css";
import CreateAchievementForm from "./CreateAchievementForm";
import { Award, User, Calendar, CheckCircle, Clock } from "lucide-react";

export default async function TeacherAchievementsPage() {
  const session = await getServerSession(getAuthOptions());
  if (!session) return null;

  const teacher = await prisma.teacher.findUnique({
    where: { userId: session.user.id },
    include: {
      classes: {
        include: {
          students: {
            orderBy: { firstName: 'asc' }
          }
        }
      }
    }
  });

  if (!teacher) return null;

  // Extract unique students
  const studentMap = new Map();
  teacher.classes.forEach(c => {
    c.students.forEach(s => {
      if (!studentMap.has(s.id)) {
        studentMap.set(s.id, {
          id: s.id,
          name: `${s.firstName} ${s.lastName}`,
          rollNo: s.rollNumber,
          className: `${c.name} - ${c.section}`
        });
      }
    });
  });

  const students = Array.from(studentMap.values());
  const studentIds = students.map(s => s.id);

  const achievements = await prisma.achievement.findMany({
    where: { studentId: { in: studentIds } },
    include: { student: true },
    orderBy: { date: 'desc' }
  });

  return (
    <div className={styles.dashboard}>
      <h1 className={styles.title}>Student Achievements</h1>
      
      <div className={styles.chartsContainer}>
        <div className={styles.chartCard}>
          <h3 className={styles.chartHeader}>Recent Achievements</h3>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {achievements.map((achievement) => (
              <div key={achievement.id} style={{ display: 'flex', flexDirection: 'column', padding: '1.25rem', border: '1px solid var(--border)', borderRadius: '8px', backgroundColor: 'var(--background)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                  <h4 style={{ margin: 0, color: 'var(--primary)', fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Award size={18} /> {achievement.title}
                  </h4>
                  <span style={{ 
                    fontSize: '0.75rem', 
                    fontWeight: 600, 
                    padding: '4px 8px', 
                    borderRadius: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.25rem',
                    backgroundColor: achievement.isVerified ? 'var(--success-bg)' : 'var(--warning-bg)',
                    color: achievement.isVerified ? "var(--success)" : "var(--warning)"
                  }}>
                    {achievement.isVerified ? <><CheckCircle size={12} /> Verified</> : <><Clock size={12} /> Pending Verification</>}
                  </span>
                </div>
                
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', fontSize: '0.875rem', opacity: 0.8, marginBottom: '0.5rem' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <User size={14} /> Student: {achievement.student.firstName} {achievement.student.lastName}
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <Calendar size={14} /> {new Date(achievement.date).toLocaleDateString()}
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: '#8b5cf6' }}>
                    <Award size={14} /> Category: {achievement.category}
                  </span>
                </div>
                
                {achievement.description && (
                  <div style={{ marginTop: '0.5rem', fontSize: '0.875rem', lineHeight: 1.5 }}>
                    {achievement.description}
                  </div>
                )}
              </div>
            ))}

            {achievements.length === 0 && (
              <p style={{ textAlign: 'center', padding: '2rem', opacity: 0.7 }}>No achievements recorded for your students.</p>
            )}
          </div>
        </div>

        <div className={styles.chartCard}>
          <h3 className={styles.chartHeader}>Record Achievement</h3>
          <CreateAchievementForm students={students} />
        </div>
      </div>
    </div>
  );
}
