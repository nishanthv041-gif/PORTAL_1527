import { getServerSession } from "next-auth/next";
import { authOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import styles from "../../dashboard.module.css";
import TeacherCalendarClient from "./TeacherCalendarClient";

export default async function TeacherCalendarPage() {
  const session = await getServerSession(authOptions);
  if (!session) return null;

  const teacher = await prisma.teacher.findUnique({
    where: { userId: session.user.id },
    include: { user: true }
  });

  if (!teacher) return null;

  // Teachers see ALL events, and TEACHER events
  const events = await prisma.calendarEvent.findMany({
    where: {
      OR: [
        { audience: "ALL" },
        { audience: "TEACHER" }
      ]
    },
    orderBy: [{ date: 'asc' }, { startTime: 'asc' }]
  });

  return (
    <div className={styles.dashboard}>
      <h1 className={styles.title} style={{ margin: 0, marginBottom: '1rem' }}>Calendar</h1>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>View school events and create events for teachers.</p>

      <TeacherCalendarClient events={events} currentUserName={teacher.user.name} />
    </div>
  );
}
