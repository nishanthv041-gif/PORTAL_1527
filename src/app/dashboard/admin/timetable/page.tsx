import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import styles from "../../dashboard.module.css";
import TimetableClient from "./TimetableClient";
import { Timetable, Subject, Teacher, User } from "@prisma/client";

type SubjectWithTeacher = Subject & { teacher: (Teacher & { user: User }) | null };
type TimetableWithRelations = Timetable & { subject: SubjectWithTeacher | null };

export default async function AdminTimetablePage({
  searchParams,
}: {
  searchParams: Promise<{ classId?: string; weekOf?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'ADMIN') return null;

  const resolvedSearchParams = await searchParams;
  const { classId, weekOf } = resolvedSearchParams;

  let currentWeekStart = new Date();
  if (weekOf) {
    currentWeekStart = new Date(weekOf);
  }
  // Ensure it's a Monday
  const day = currentWeekStart.getDay();
  const diff = currentWeekStart.getDate() - day + (day === 0 ? -6 : 1); 
  currentWeekStart.setDate(diff);
  currentWeekStart.setHours(0,0,0,0);

  const currentWeekEnd = new Date(currentWeekStart);
  currentWeekEnd.setDate(currentWeekStart.getDate() + 6); // up to Saturday

  const classes = await prisma.class.findMany({
    where: { isActive: true },
    orderBy: [{ name: 'asc' }, { section: 'asc' }]
  });

  const allTimetables = await prisma.timetable.findMany({
    include: {
      subject: {
        include: { teacher: { include: { user: true } } }
      }
    }
  });

  let classTimetable: TimetableWithRelations[] = [];
  let availableSubjects: SubjectWithTeacher[] = [];

  if (classId) {
    classTimetable = allTimetables.filter(t => t.classId === classId);
    availableSubjects = await prisma.subject.findMany({
      where: { classId, isActive: true },
      include: { teacher: { include: { user: true } } }
    });
  }

  // Fetch events for this week
  const events = await prisma.calendarEvent.findMany({
    where: {
      OR: [
        { date: { gte: currentWeekStart, lt: currentWeekEnd } },
        {
          AND: [
            { endDate: { not: null } },
            { endDate: { gte: currentWeekStart } },
            { date: { lte: currentWeekEnd } }
          ]
        }
      ]
    }
  });

  return (
    <div className={styles.dashboard}>
      <h1 className={styles.title} style={{ margin: 0, marginBottom: '1rem' }}>Timetable Management</h1>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>Manage schedules and avoid double-booking teachers.</p>

      <TimetableClient 
        classes={classes}
        initialClassId={classId || ""}
        timetableData={classTimetable}
        availableSubjects={availableSubjects}
        events={events}
        weekOf={currentWeekStart.toISOString().split('T')[0]}
      />
    </div>
  );
}
