import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import { getEffectiveTimetable } from "@/backend/lib/timetable/getEffectiveTimetable";
import styles from "../dashboard.module.css";
import { GraduationCap, Users, Clock, MessageSquare, Calendar as CalendarIcon, MapPin, Star, ArrowRight, ShieldAlert, Sparkles } from "lucide-react";
import Link from "next/link";

const DAYS = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];

import { getTeacherByUserId } from "./teacherHelper";

export default async function TeacherDashboard() {
  const session = await getServerSession(getAuthOptions());

  if (!session) return null;

  const teacher = await getTeacherByUserId(session.user.id);

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
  const todayDate = new Date();
  todayDate.setHours(0, 0, 0, 0);

  const [
    activeHomeworks,
    unreadMessages,
    effectiveScheduleSlots,
    teacherAbsenceToday,
    upcomingEvents,
    upcomingMeetings
  ] = await Promise.all([
    prisma.assignment.count({
      where: {
        teacherId: teacher.id,
        deadline: { gte: new Date() }
      }
    }),
    prisma.message.count({
      where: {
        receiverId: session.user.id,
        isRead: false,
      }
    }),
    getEffectiveTimetable({ teacherId: teacher.id }, todayDate),
    prisma.teacherAbsence.findFirst({
      where: {
        teacherId: teacher.id,
        date: todayDate,
        status: "ACTIVE"
      }
    }),
    prisma.calendarEvent.findMany({
      where: {
        date: { gte: new Date() },
        OR: [{ audience: "ALL" }, { audience: "TEACHER" }, { type: "PROGRAM" }]
      },
      orderBy: { date: 'asc' },
      take: 4
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

  // Combine regular schedule and assigned substitution duties from getEffectiveTimetable
  const todaysSchedule: Array<{
    id: string;
    period: number;
    startTime: string;
    endTime: string;
    subjectName: string;
    className: string;
    classroom?: string | null;
    isSubstitution?: boolean;
    absentTeacherName?: string;
    isTeacherAbsent?: boolean;
    hasExamOverlap?: boolean;
    examName?: string | null;
  }> = [];

  for (const s of effectiveScheduleSlots) {
    if (s.isBreak) continue;
    // If regular teacher is marked absent for this slot and it's not their duty covering someone else
    if (s.isTeacherAbsent && !s.isSubstituteDuty) {
      continue;
    }
    todaysSchedule.push({
      id: s.id,
      period: s.period,
      startTime: s.startTime,
      endTime: s.endTime,
      subjectName: s.subjectName || (s.hasExamOverlap ? (s.examName || "Exam") : "Subject"),
      className: s.className,
      classroom: s.classroom,
      isSubstitution: Boolean(s.isSubstituteDuty),
      absentTeacherName: s.regularTeacherName || "Absent Colleague",
      isTeacherAbsent: s.isTeacherAbsent,
      hasExamOverlap: s.hasExamOverlap,
      examName: s.examName
    });
  }

  // Sort schedule chronologically by period
  todaysSchedule.sort((a, b) => a.period - b.period);

  const recentActivities = [...upcomingEvents.map(e => ({
    id: `e-${e.id}`,
    title: e.title,
    date: e.date,
    type: e.type === "PROGRAM" ? 'PROGRAM' : 'EVENT',
    icon: e.type === "PROGRAM" ? <Star size={18} style={{ color: '#eab308' }} /> : <CalendarIcon size={18} />
  })), ...upcomingMeetings.map(m => ({
    id: `m-${m.id}`,
    title: `Meeting with ${m.parents.length > 0 ? m.parents.map(p => p.user.name).join(', ') : 'Parents'}`,
    date: m.date,
    type: 'MEETING',
    icon: <Users size={18} />
  }))].sort((a, b) => a.date.getTime() - b.date.getTime()).slice(0, 5);

  return (
    <div className={styles.dashboard}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 className={styles.title} style={{ margin: 0 }}>Teacher Dashboard</h1>
          <p style={{ color: "var(--text-secondary)", margin: "0.25rem 0 0 0", fontSize: "0.9rem" }}>
            Welcome back, {session.user.name || "Teacher"}.
          </p>
        </div>

        <div style={{ display: "flex", gap: "0.5rem" }}>
          <Link
            href="/dashboard/teacher/timetable"
            style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", padding: "0.6rem 1rem", borderRadius: "8px", background: "var(--primary)", color: "var(--primary-fg)", textDecoration: "none", fontSize: "0.85rem", fontWeight: 600 }}
          >
            <CalendarIcon size={16} /> View Full Timetable
          </Link>
        </div>
      </div>

      {/* Teacher on leave alert banner */}
      {teacherAbsenceToday && (
        <div style={{ background: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.3)", borderRadius: "10px", padding: "1rem 1.25rem", marginBottom: "1.5rem", display: "flex", alignItems: "center", gap: "0.75rem", color: "var(--danger)" }}>
          <ShieldAlert size={20} />
          <div>
            <div style={{ fontWeight: 700 }}>You are marked on leave / absent today ({todayDayName})</div>
            <div style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>
              Reason: {teacherAbsenceToday.reason || "Approved absence"}. Your teaching periods are covered by scheduled substitutes.
            </div>
          </div>
        </div>
      )}

      {/* Metrics Row */}
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statIcon}><GraduationCap size={24} /></div>
          <div className={styles.statInfo}>
            <span className={styles.statLabel}>Assigned Classes</span>
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
            <span className={styles.statLabel}>Active Home Works</span>
            <span className={styles.statValue}>{activeHomeworks}</span>
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
        {/* Today's Schedule with Substitution Highlights */}
        <div className={styles.chartCard}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 className={styles.chartHeader} style={{ margin: 0 }}>Today&apos;s Schedule ({todayDayName})</h3>
            <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>{todaysSchedule.length} periods</span>
          </div>

          {teacherAbsenceToday && (
            <div style={{ marginTop: '0.75rem', padding: '0.75rem 1rem', background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.25)', borderRadius: '8px', color: 'var(--danger)', fontSize: '0.85rem' }}>
              <strong>Absence Recorded:</strong> You are marked absent today ({teacherAbsenceToday.fullDay ? 'Full Day' : `Periods ${teacherAbsenceToday.periodNumbers || ''}`}). Colleague substitution duties have been assigned.
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', marginTop: '1rem' }}>
            {todaysSchedule.length > 0 ? (
              todaysSchedule.map(slot => (
                <div
                  key={slot.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '1rem',
                    padding: '0.85rem 1rem',
                    background: slot.isSubstitution ? 'rgba(245, 158, 11, 0.06)' : 'var(--background)',
                    borderRadius: '8px',
                    border: `1px solid ${slot.isSubstitution ? 'rgba(245, 158, 11, 0.3)' : 'var(--border)'}`,
                    flexWrap: 'wrap',
                    minWidth: 0
                  }}
                >
                  <div
                    style={{
                      background: slot.isSubstitution ? '#d97706' : 'var(--primary)',
                      color: '#fff',
                      padding: '0.45rem 0.85rem',
                      borderRadius: '6px',
                      fontWeight: 700,
                      minWidth: '55px',
                      textAlign: 'center',
                      flexShrink: 0,
                      fontSize: '0.9rem'
                    }}
                  >
                    P{slot.period}
                  </div>

                  <div style={{ flex: '1 1 180px', minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <h4 style={{ margin: 0, color: 'var(--foreground)', overflowWrap: 'anywhere', fontSize: "0.95rem" }}>
                        {slot.subjectName}
                      </h4>
                      {slot.isSubstitution && (
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "0.25rem",
                            padding: "0.15rem 0.5rem",
                            borderRadius: "999px",
                            background: "rgba(245, 158, 11, 0.15)",
                            color: "#d97706",
                            fontSize: "0.72rem",
                            fontWeight: 700
                          }}
                        >
                          <Sparkles size={11} /> Substitution Duty
                        </span>
                      )}
                    </div>

                    <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)', overflowWrap: 'anywhere' }}>
                      Class: <strong>{slot.className}</strong>
                      {slot.isSubstitution && (
                        <span> • Covering for: <strong style={{ color: "var(--foreground)" }}>{slot.absentTeacherName}</strong></span>
                      )}
                    </p>
                  </div>

                  <div style={{ textAlign: 'right', fontSize: '0.82rem', color: 'var(--text-secondary)', marginLeft: 'auto', flexShrink: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', justifyContent: 'flex-end', marginBottom: '0.2rem' }}>
                      <Clock size={13} style={{ flexShrink: 0 }} /> {slot.startTime} - {slot.endTime}
                    </div>
                    {slot.classroom && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', justifyContent: 'flex-end' }}>
                        <MapPin size={13} style={{ flexShrink: 0 }} /> {slot.classroom}
                      </div>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)', background: 'var(--background)', borderRadius: '8px', border: '1px dashed var(--border)' }}>
                <CalendarIcon size={48} style={{ opacity: 0.2, margin: '0 auto 1rem' }} />
                <p style={{ margin: 0 }}>No classes scheduled for today.</p>
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
