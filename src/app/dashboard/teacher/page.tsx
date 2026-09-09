import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import styles from "../dashboard.module.css";
import { GraduationCap, Users, Clock, MessageSquare, Calendar as CalendarIcon, MapPin } from "lucide-react";

const DAYS = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];

export default async function TeacherDashboard() {
  const session = await getServerSession(authOptions);
  
  if (!session) return null;

  const teacher = await prisma.teacher.findUnique({
    where: { userId: session.user.id },
    include: {
      classes: {
        include: {
          _count: {
            select: { students: true }
          }
        }
      }
    }
  });

  if (!teacher) {
    return (
      <div className={styles.dashboard}>
        <h1 className={styles.title}>Teacher Dashboard</h1>
        <p>No teacher record found for this user.</p>
      </div>
    );
  }

  const classCount = teacher.classes.length;
  const studentCount = teacher.classes.reduce((sum, cls) => sum + cls._count.students, 0);

  const todayDayName = DAYS[new Date().getDay()];

  const [
    pendingSubmissions,
    unreadMessages,
    todaysSchedule,
    upcomingEvents,
    upcomingMeetings
  ] = await Promise.all([
    prisma.submission.count({
      where: {
        status: "PENDING",
        assignment: { teacherId: teacher.id }
      }
    }),
    prisma.message.count({
      where: {
        receiverId: session.user.id,
        isRead: false,
      }
    }),
    prisma.timetable.findMany({
      where: {
        dayOfWeek: todayDayName,
        subject: { teacherId: teacher.id },
        isBreak: false
      },
      include: { class: true, subject: true },
      orderBy: { period: 'asc' }
    }),
    prisma.calendarEvent.findMany({
      where: {
        date: { gte: new Date() },
        OR: [{ audience: "ALL" }, { audience: "TEACHER" }]
      },
      orderBy: { date: 'asc' },
      take: 3
    }),
    prisma.meeting.findMany({
      where: { 
        teachers: { some: { id: teacher.id } },
        date: { gte: new Date() }
      },
      include: { parents: { include: { user: true } } },
      orderBy: [{ date: 'asc' }, { time: 'asc' }],
      take: 3
    })
  ]);

  const recentActivities = [...upcomingEvents.map(e => ({
    id: `e-${e.id}`,
    title: e.title,
    date: e.date,
    type: 'EVENT',
    icon: <CalendarIcon size={18} />
  })), ...upcomingMeetings.map(m => ({
    id: `m-${m.id}`,
    title: `Meeting with ${m.parents.length > 0 ? m.parents.map(p => p.user.name).join(', ') : 'Parents'}`,
    date: m.date,
    type: 'MEETING',
    icon: <Users size={18} />
  }))].sort((a, b) => a.date.getTime() - b.date.getTime()).slice(0, 5);

  return (
    <div className={styles.dashboard}>
      <h1 className={styles.title}>Teacher Dashboard</h1>
      
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statIcon}><GraduationCap size={24} /></div>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>My Classes</span>
            <span className={styles.statValue}>{classCount}</span>
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statIcon}><Users size={24} /></div>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>Total Students</span>
            <span className={styles.statValue}>{studentCount}</span>
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statIcon}><Clock size={24} /></div>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>Pending Tasks</span>
            <span className={styles.statValue}>{pendingSubmissions}</span>
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statIcon}><MessageSquare size={24} /></div>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>Unread Messages</span>
            <span className={styles.statValue}>{unreadMessages}</span>
          </div>
        </div>
      </div>

      <div className={styles.chartsContainer}>
        <div className={styles.chartCard}>
          <h3 className={styles.chartHeader}>Today&apos;s Schedule</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
            {todaysSchedule.length > 0 ? (
              todaysSchedule.map(slot => (
                <div key={slot.id} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem', background: 'var(--background)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                  <div style={{ background: "var(--primary)", color: "var(--primary-fg)", padding: '0.5rem 1rem', borderRadius: '6px', fontWeight: 600, minWidth: '80px', textAlign: 'center' }}>
                    P{slot.period}
                  </div>
                  <div style={{ flex: 1 }}>
                    <h4 style={{ margin: '0 0 0.25rem 0', color: 'var(--foreground)' }}>{slot.subject?.name}</h4>
                    <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Class {slot.class.name} - {slot.class.section}</p>
                  </div>
                  <div style={{ textAlign: 'right', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', justifyContent: 'flex-end', marginBottom: '0.25rem' }}>
                      <Clock size={14} /> {slot.startTime} - {slot.endTime}
                    </div>
                    {slot.classroom && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', justifyContent: 'flex-end' }}>
                        <MapPin size={14} /> {slot.classroom}
                      </div>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)', background: 'var(--background)', borderRadius: '8px', border: '1px dashed var(--border)' }}>
                <CalendarIcon size={48} style={{ opacity: 0.2, margin: '0 auto 1rem' }} />
                <p>No classes scheduled for today.</p>
              </div>
            )}
          </div>
        </div>

        <div className={styles.chartCard}>
          <h3 className={styles.chartHeader}>Upcoming Events & Meetings</h3>
          <div className={styles.recentActivity}>
            {recentActivities.length > 0 ? (
              recentActivities.map(activity => (
                <div key={activity.id} className={styles.activityItem}>
                  <div className={styles.activityIcon}>{activity.icon}</div>
                  <div className={styles.activityDetails}>
                    <span className={styles.activityTitle}>{activity.title}</span>
                    <span className={styles.activityTime}>{activity.date.toLocaleDateString()}</span>
                  </div>
                </div>
              ))
            ) : (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                <p>No upcoming events or meetings.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
