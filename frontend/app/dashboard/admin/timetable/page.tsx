import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import styles from "../../dashboard.module.css";
import TimetableClient from "./TimetableClient";
import { Timetable, Subject, Teacher, User } from "@prisma/client";
import { PeriodSlotData } from "@/backend/lib/timetable/timetableTypes";

type SubjectWithTeacher = Subject & { teacher: (Teacher & { user: User }) | null };
type TimetableWithRelations = Timetable & {
  subject: SubjectWithTeacher | null;
  teacher?: (Teacher & { user: User }) | null;
  class?: { id: string; name: string; section: string };
};

export default async function AdminTimetablePage({
  searchParams,
}: {
  searchParams: Promise<{ classId?: string; weekOf?: string }>;
}) {
  const session = await getServerSession(getAuthOptions());
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
  currentWeekStart.setHours(0, 0, 0, 0);

  const currentWeekEnd = new Date(currentWeekStart);
  currentWeekEnd.setDate(currentWeekStart.getDate() + 5); // up to Saturday (Mon..Sat = 6 days)

  const formatWeekLabel = (start: Date, end: Date) => {
    const sStr = start.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    const eStr = end.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    return `${sStr} to ${eStr}`;
  };
  const weekLabel = formatWeekLabel(currentWeekStart, currentWeekEnd);

  const classes = await prisma.class.findMany({
    where: { isActive: true },
    orderBy: [{ name: 'asc' }, { section: 'asc' }]
  });

  const allTimetables = await prisma.timetable.findMany({
    include: {
      subject: {
        include: { teacher: { include: { user: true } } }
      },
      teacher: {
        include: { user: true }
      },
      class: {
        select: { id: true, name: true, section: true }
      }
    }
  });

  const allTeachers = await prisma.teacher.findMany({
    include: {
      user: true,
      subjects: true
    },
    orderBy: { user: { name: 'asc' } }
  });

  // Fetch Period Slots (or seed standard defaults if none exist)
  let periodSlots = await prisma.periodSlot.findMany({
    where: classId ? { OR: [{ classId }, { classId: null }] } : { classId: null },
    orderBy: { order: 'asc' }
  });

  if (periodSlots.length === 0) {
    const defaultSlots = [
      { order: 1, label: "Period 1", startTime: "08:00", endTime: "08:45", type: "LESSON" },
      { order: 2, label: "Period 2", startTime: "08:45", endTime: "09:30", type: "LESSON" },
      { order: 3, label: "Morning Break", startTime: "09:30", endTime: "09:45", type: "BREAK" },
      { order: 4, label: "Period 3", startTime: "09:45", endTime: "10:30", type: "LESSON" },
      { order: 5, label: "Period 4", startTime: "10:30", endTime: "11:15", type: "LESSON" },
      { order: 6, label: "Period 5", startTime: "11:15", endTime: "12:00", type: "LESSON" },
      { order: 7, label: "Lunch Break", startTime: "12:00", endTime: "12:45", type: "LUNCH" },
      { order: 8, label: "Period 6", startTime: "12:45", endTime: "13:30", type: "LESSON" },
      { order: 9, label: "Period 7", startTime: "13:30", endTime: "14:15", type: "LESSON" },
      { order: 10, label: "Period 8", startTime: "14:15", endTime: "15:00", type: "LESSON" }
    ];

    await prisma.periodSlot.createMany({
      data: defaultSlots.map(s => ({
        classId: null,
        order: s.order,
        label: s.label,
        startTime: s.startTime,
        endTime: s.endTime,
        type: s.type
      }))
    });

    periodSlots = await prisma.periodSlot.findMany({
      where: { classId: null },
      orderBy: { order: 'asc' }
    });
  }

  const activeClassId = classId || (classes[0]?.id || "");

  const allSubjects = await prisma.subject.findMany({
    where: { isActive: true },
    include: {
      teacher: { include: { user: true } },
      class: { select: { id: true, name: true, section: true } }
    },
    orderBy: { name: 'asc' }
  });

  const classTimetable = allTimetables.filter(t => t.classId === activeClassId);
  let availableSubjects = allSubjects.filter(s => s.classId === activeClassId);

  // If this class has no subjects assigned yet, fallback to all active subjects so admin can always schedule
  if (availableSubjects.length === 0) {
    const seen = new Set<string>();
    availableSubjects = allSubjects.filter(s => {
      if (seen.has(s.name.toUpperCase())) return false;
      seen.add(s.name.toUpperCase());
      return true;
    });
  }

  const selectedClassObj = classes.find(c => c.id === activeClassId);
  const selectedClassName = selectedClassObj ? `${selectedClassObj.name} - ${selectedClassObj.section}` : "";
  const selectedClassGrade = selectedClassObj ? selectedClassObj.name : "";

  // Check pending substitutions today
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const pendingSubstitutionsCount = await prisma.substitution.count({
    where: {
      date: todayStart,
      status: { in: ["SUGGESTED", "UNASSIGNED"] },
      substituteTeacherId: null
    }
  });

  // Fetch events for this week
  const rawEvents = await prisma.calendarEvent.findMany({
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

  const events = rawEvents.filter(e => {
    if (!e.targetClass || e.targetClass === "ALL" || e.targetClass.toUpperCase() === "ALL CLASSES") {
      return true;
    }
    if (!selectedClassObj) return true;
    const tc = e.targetClass.trim().toLowerCase();
    return (
      tc === selectedClassObj.id.toLowerCase() ||
      tc === selectedClassName.toLowerCase() ||
      tc === selectedClassGrade.toLowerCase() ||
      selectedClassName.toLowerCase().includes(tc)
    );
  });

  // Fetch substitutions and absences for this week
  const [weekSubstitutions, weekAbsences] = await Promise.all([
    prisma.substitution.findMany({
      where: {
        date: { gte: currentWeekStart, lte: currentWeekEnd }
      },
      include: {
        substituteTeacher: { include: { user: true } },
        absentTeacher: { include: { user: true } }
      }
    }),
    prisma.teacherAbsence.findMany({
      where: {
        date: { gte: currentWeekStart, lte: currentWeekEnd },
        status: "ACTIVE"
      },
      include: {
        teacher: { include: { user: true } }
      }
    })
  ]);

  return (
    <div className={styles.dashboard}>
      <TimetableClient
        classes={classes}
        initialClassId={activeClassId}
        timetableData={classTimetable}
        allSchoolSlots={allTimetables as any}
        availableSubjects={availableSubjects}
        allSubjects={allSubjects as any}
        allTeachers={allTeachers.map(t => ({
          id: t.id,
          name: t.user.name || "Teacher",
          email: t.user.email || undefined,
          maxPeriodsPerDay: t.maxPeriodsPerDay || 6,
          maxPeriodsPerWeek: t.maxPeriodsPerWeek || 30,
          subjects: t.subjects.map(s => s.name)
        }))}
        periodSlots={periodSlots.map(p => ({
          id: p.id,
          order: p.order,
          label: p.label,
          startTime: p.startTime,
          endTime: p.endTime,
          type: p.type as any
        }))}
        pendingSubstitutionsCount={pendingSubstitutionsCount}
        events={events}
        weekOf={currentWeekStart.toISOString().split('T')[0]}
        weekLabel={weekLabel}
        weekSubstitutions={weekSubstitutions.map(s => ({
          id: s.id,
          date: s.date.toISOString().split('T')[0],
          timetableEntryId: s.timetableEntryId,
          absentTeacherId: s.absentTeacherId,
          absentTeacherName: s.absentTeacher?.user?.name || "Absent Teacher",
          substituteTeacherId: s.substituteTeacherId,
          substituteTeacherName: s.substituteTeacher?.user?.name || null,
          status: s.status,
          note: s.note
        }))}
        weekAbsences={weekAbsences.map(a => ({
          id: a.id,
          date: a.date.toISOString().split('T')[0],
          teacherId: a.teacherId,
          teacherName: a.teacher?.user?.name || "Teacher",
          fullDay: a.fullDay,
          periodNumbers: a.periodNumbers ? a.periodNumbers.split(',').map(p => parseInt(p.trim(), 10)).filter(p => !isNaN(p)) : []
        }))}
      />
    </div>
  );
}
