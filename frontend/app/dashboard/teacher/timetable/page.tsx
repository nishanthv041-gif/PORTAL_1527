import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import styles from "../../dashboard.module.css";
import { Clock, MapPin } from "lucide-react";

const DAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];

export default async function TeacherTimetablePage() {
  const session = await getServerSession(getAuthOptions());
  if (!session) return null;

  const teacher = await prisma.teacher.findUnique({
    where: { userId: session.user.id },
  });

  if (!teacher) return <p>Teacher not found.</p>;

  // Fetch all timetable slots assigned to this teacher's subjects
  const schedule = await prisma.timetable.findMany({
    where: {
      subject: { teacherId: teacher.id },
      isBreak: false
    },
    include: {
      class: true,
      subject: true
    },
    orderBy: { period: 'asc' }
  });

  // Group by day
  const scheduleByDay: Record<string, typeof schedule> = {};
  DAYS.forEach(day => {
    scheduleByDay[day] = schedule.filter(s => s.dayOfWeek === day);
  });

  return (
    <div className={styles.dashboard}>
      <h1 className={styles.title}>My Timetable</h1>
      
      <div className={styles.chartCard}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          {DAYS.map(day => {
            const daySlots = scheduleByDay[day] || [];
            if (daySlots.length === 0) return null;

            return (
              <div key={day} style={{ borderBottom: '1px solid var(--border)', paddingBottom: '1.5rem' }}>
                <h3 style={{ margin: '0 0 1rem 0', color: 'var(--primary)', borderBottom: '2px solid var(--primary)', display: 'inline-block', paddingBottom: '0.25rem' }}>
                  {day}
                </h3>
                
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
                  {daySlots.map(slot => (
                    <div key={slot.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', padding: '1rem', background: 'var(--background)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                      <div style={{ background: 'rgba(99, 102, 241, 0.1)', color: 'var(--primary)', padding: '0.5rem 1rem', borderRadius: '6px', fontWeight: 600, minWidth: '60px', textAlign: 'center' }}>
                        P{slot.period}
                      </div>
                      <div style={{ flex: 1 }}>
                        <h4 style={{ margin: '0 0 0.25rem 0', color: 'var(--foreground)' }}>{slot.subject?.name}</h4>
                        <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Class {slot.class.name} - {slot.class.section}</p>
                        
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', opacity: 0.8 }}>
                          <Clock size={14} /> {slot.startTime} - {slot.endTime}
                        </div>
                        {slot.classroom && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', opacity: 0.8, marginTop: '0.25rem' }}>
                            <MapPin size={14} /> {slot.classroom}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          
          {schedule.length === 0 && (
            <p style={{ textAlign: 'center', padding: '2rem', opacity: 0.7 }}>
              You have no classes scheduled yet.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
