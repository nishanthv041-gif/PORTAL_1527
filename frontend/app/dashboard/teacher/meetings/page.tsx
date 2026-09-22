import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import styles from "../../dashboard.module.css";
import CreateMeetingForm from "./CreateMeetingForm";
import { Calendar, Clock, MapPin, Link as LinkIcon } from "lucide-react";

export default async function TeacherMeetingsPage() {
  const session = await getServerSession(getAuthOptions());
  if (!session) return null;

  const teacher = await prisma.teacher.findUnique({
    where: { userId: session.user.id },
    include: {
      classes: {
        include: {
          students: {
            include: {
              parents: {
                include: {
                  parent: {
                    include: {
                      user: true
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  });

  if (!teacher) return null;

  // Extract unique parents
  const parentMap = new Map();
  teacher.classes.forEach(c => {
    c.students.forEach(s => {
      s.parents.forEach(p => {
        if (!parentMap.has(p.parent.id)) {
          parentMap.set(p.parent.id, {
            id: p.parent.id,
            name: p.parent.user.name,
            studentName: `${s.firstName} ${s.lastName}`
          });
        }
      });
    });
  });

  const parents = Array.from(parentMap.values());

  const meetings = await prisma.meeting.findMany({
    where: { 
      teachers: {
        some: {
          id: teacher.id
        }
      }
    },
    include: { parents: { include: { user: true } } },
    orderBy: [{ date: 'asc' }, { time: 'asc' }]
  });

  const upcomingMeetings = meetings.filter(m => new Date(m.date) >= new Date(new Date().setHours(0,0,0,0)));

  return (
    <div className={styles.dashboard}>
      <h1 className={styles.title}>Meetings</h1>
      
      <div className={styles.chartsContainer}>
        <div className={styles.chartCard}>
          <h3 className={styles.chartHeader}>Upcoming Meetings</h3>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {upcomingMeetings.map((meeting) => (
              <div key={meeting.id} style={{ display: 'flex', flexDirection: 'column', padding: '1.25rem', border: '1px solid var(--border)', borderRadius: '8px', backgroundColor: 'var(--background)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                  <h4 style={{ margin: 0, color: 'var(--primary)', fontSize: '1.1rem' }}>{meeting.agenda}</h4>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--foreground)' }}>
                    Parents: {meeting.parents.length > 0 ? meeting.parents.map(p => p.user.name).join(', ') : 'None'}
                  </span>
                </div>
                
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', fontSize: '0.875rem', opacity: 0.8, marginBottom: '0.5rem' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <Calendar size={14} /> {new Date(meeting.date).toLocaleDateString()}
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <Clock size={14} /> {meeting.time}
                  </span>
                  {meeting.location && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      <MapPin size={14} /> {meeting.location}
                    </span>
                  )}
                </div>
                
                {meeting.link && (
                  <div style={{ marginTop: '0.5rem' }}>
                    <a href={meeting.link} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.875rem', color: "var(--primary)", textDecoration: 'none', background: 'var(--primary-bg)', padding: '4px 8px', borderRadius: '4px' }}>
                      <LinkIcon size={14} /> Join Meeting
                    </a>
                  </div>
                )}
                
                {meeting.summary && (
                  <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: 'var(--card)', borderRadius: '6px', fontSize: '0.875rem' }}>
                    <strong>Summary:</strong> {meeting.summary}
                  </div>
                )}
              </div>
            ))}

            {upcomingMeetings.length === 0 && (
              <p style={{ textAlign: 'center', padding: '2rem', opacity: 0.7 }}>No upcoming meetings scheduled.</p>
            )}
          </div>
        </div>

        <div className={styles.chartCard}>
          <h3 className={styles.chartHeader}>Schedule a Meeting</h3>
          <CreateMeetingForm teacherId={teacher.id} parents={parents} />
        </div>
      </div>
    </div>
  );
}
