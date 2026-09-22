import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import styles from "../../dashboard.module.css";
import CalendarClient from "./CalendarClient";

export default async function AdminCalendarPage() {
  const session = await getServerSession(getAuthOptions());
  if (!session || session.user.role !== 'ADMIN') return null;

  const events = await prisma.calendarEvent.findMany({
    orderBy: [{ date: 'asc' }, { startTime: 'asc' }]
  });

  return (
    <div className={styles.dashboard}>
      <h1 className={styles.title} style={{ margin: 0, marginBottom: '1rem' }}>School Calendar</h1>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>Manage all school events, holidays, and exams.</p>

      <CalendarClient events={events} />
    </div>
  );
}
