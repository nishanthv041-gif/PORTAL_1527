import { getServerSession } from "next-auth/next";
import { authOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import styles from "../../dashboard.module.css";
import CreateMeetingForm from "./CreateMeetingForm";
import { Calendar, Clock, MapPin, Link as LinkIcon } from "lucide-react";

export default async function ParentMeetingsPage() {
  const session = await getServerSession(authOptions);
  if (!session) return null;

  const parent = await prisma.parent.findUnique({
    where: { userId: session.user.id },
    include: {
      children: {
        include: {
          student: {
            include: {
              class: {
                include: {
                  teacher: {
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

  if (!parent) return null;

  // Extract unique teachers for their children
  const teacherMap = new Map();
  parent.children.forEach(s => {
    if (s.student.class?.teacher) {
      teacherMap.set(s.student.class.teacher.id, {
        id: s.student.class.teacher.id,
        name: s.student.class.teacher.user.name,
        subject: `Class Teacher - ${s.student.class.name} ${s.student.class.section}`
      });
    }
  });

  const teachers = Array.from(teacherMap.values());

  const meetings = await prisma.meeting.findMany({
    where: { 
      parents: {
        some: {
          id: parent.id
        }
      }
    },
    include: { teachers: { include: { user: true } } },
    orderBy: [{ date: 'asc' }, { time: 'asc' }]
  });

  const upcomingMeetings = meetings.filter(m => new Date(m.date) >= new Date(new Date().setHours(0,0,0,0)));

  return (
    <div className={styles.dashboard}>
      <h1 className={styles.title}>Meetings with Teachers</h1>
      
      <div className={styles.chartsContainer}>
        <div className={styles.chartCard}>
          <h3 className={styles.chartHeader}>Upcoming Meetings</h3>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {upcomingMeetings.map((meeting) => (
              <div key={meeting.id} style={{ display: 'flex', flexDirection: 'column', padding: '1.25rem', border: '1px solid var(--border)', borderRadius: '8px', backgroundColor: 'var(--background)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                  <h4 style={{ margin: 0, color: 'var(--primary)', fontSize: '1.1rem' }}>{meeting.agenda}</h4>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--foreground)' }}>
                    Teachers: {meeting.teachers.length > 0 ? meeting.teachers.map(t => t.user.name).join(', ') : 'None'}
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
              </div>
            ))}

            {upcomingMeetings.length === 0 && (
              <p style={{ textAlign: 'center', padding: '2rem', opacity: 0.7 }}>No upcoming meetings scheduled.</p>
            )}
          </div>
        </div>

        <div className={styles.chartCard}>
          <h3 className={styles.chartHeader}>Request a Meeting</h3>
          <CreateMeetingForm parentId={parent.id} teachers={teachers} />
        </div>
      </div>
    </div>
  );
}
