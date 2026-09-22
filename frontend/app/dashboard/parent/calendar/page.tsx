import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import styles from "../../dashboard.module.css";
import ParentCalendarClient from "./ParentCalendarClient";

export default async function ParentCalendarPage() {
  const session = await getServerSession(getAuthOptions());
  if (!session) return null;

  const events = await prisma.calendarEvent.findMany({
    where: {
      OR: [
        { audience: 'ALL' },
        { audience: 'STUDENT' }, // Parents want to see student events
        { audience: 'PARENTS' }  // Just in case it's added
      ]
    },
    orderBy: { date: 'asc' }
  });

  // Convert dates to ISO strings for client component serialization
  const serializedEvents = events.map(event => ({
    ...event,
    date: event.date.toISOString(),
    endDate: event.endDate?.toISOString() || null,
    createdAt: event.createdAt.toISOString()
  }));

  return (
    <div className={styles.dashboard}>
      <h1 className={styles.title} style={{ margin: 0, marginBottom: '1rem' }}>School Calendar</h1>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>View upcoming school events, holidays, and deadlines.</p>

      <div className={styles.chartCard} style={{ minHeight: '600px', display: 'flex', flexDirection: 'column' }}>
        <ParentCalendarClient initialEvents={serializedEvents} />
      </div>
    </div>
  );
}
