import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import styles from "../../dashboard.module.css";
import { Calendar as CalendarIcon } from "lucide-react";
import TeacherTimetableClient from "./TeacherTimetableClient";

export default async function TeacherTimetablePage({
  searchParams
}: {
  searchParams?: Promise<{ classId?: string }>;
}) {
  const session = await getServerSession(getAuthOptions());
  if (!session) return null;

  const resolvedParams = searchParams ? await searchParams : {};

  const teacher = await prisma.teacher.findUnique({
    where: { userId: session.user.id },
    include: {
      user: true,
      classes: true,
    }
  });

  if (!teacher) return <div className={styles.dashboard}><p>Teacher profile not found.</p></div>;

  // 1. Fetch all active classes
  const classes = await prisma.class.findMany({
    where: { isActive: true },
    select: { id: true, name: true, section: true },
    orderBy: [{ name: "asc" }, { section: "asc" }]
  });

  // 2. Fetch the teacher's personal teaching schedule slots
  const teacherSchedule = await prisma.timetable.findMany({
    where: {
      isBreak: false,
      OR: [
        { teacherId: teacher.id },
        { subject: { teacherId: teacher.id } }
      ]
    },
    include: {
      class: {
        select: { id: true, name: true, section: true }
      },
      subject: {
        include: {
          teacher: {
            include: { user: { select: { name: true } } }
          }
        }
      }
    },
    orderBy: [
      { period: "asc" },
      { startTime: "asc" }
    ]
  });

  // 3. Fetch substitutions assigned to this teacher for today
  const todayDate = new Date();
  todayDate.setHours(0, 0, 0, 0);

  const assignedSubstitutions = await prisma.substitution.findMany({
    where: {
      date: todayDate,
      substituteTeacherId: teacher.id,
      status: "ASSIGNED"
    },
    include: {
      timetableEntry: {
        include: {
          class: { select: { id: true, name: true, section: true } },
          subject: { include: { teacher: { include: { user: { select: { name: true } } } } } }
        }
      },
      absentTeacher: { include: { user: true } }
    }
  });

  // 4. Fetch all timetable slots for all classes so teacher can view any class timetable
  const allClassesTimetable = await prisma.timetable.findMany({
    include: {
      class: {
        select: { id: true, name: true, section: true }
      },
      subject: {
        include: {
          teacher: {
            include: { user: { select: { name: true } } }
          }
        }
      }
    },
    orderBy: [
      { period: "asc" },
      { startTime: "asc" }
    ]
  });

  // Group timetable slots by classId
  const classTimetableMap: Record<string, typeof allClassesTimetable> = {};
  allClassesTimetable.forEach(slot => {
    if (!classTimetableMap[slot.classId]) {
      classTimetableMap[slot.classId] = [];
    }
    classTimetableMap[slot.classId].push(slot);
  });

  const initialClassId = resolvedParams.classId || teacher.classes[0]?.id || classes[0]?.id || "";

  return (
    <div className={styles.dashboard}>
      <div style={{ marginBottom: "1.5rem" }}>
        <h1 className={styles.title} style={{ margin: 0, display: "flex", alignItems: "center", gap: "0.6rem" }}>
          <CalendarIcon className="text-primary" size={28} />
          Timetable &amp; Class Schedule
        </h1>
      </div>

      <TeacherTimetableClient
        classes={classes}
        initialClassId={initialClassId}
        teacherSchedule={teacherSchedule as any}
        assignedSubstitutions={assignedSubstitutions.map(s => ({
          id: s.id,
          period: s.timetableEntry.period,
          startTime: s.timetableEntry.startTime,
          endTime: s.timetableEntry.endTime,
          className: `${s.timetableEntry.class.name} - ${s.timetableEntry.class.section}`,
          subjectName: s.timetableEntry.subject?.name || "Subject",
          classroom: s.timetableEntry.classroom,
          absentTeacherName: s.absentTeacher?.user?.name || "Original Teacher",
          note: s.note
        }))}
        classTimetableMap={classTimetableMap as any}
        teacherName={teacher.user.name}
      />
    </div>
  );
}
