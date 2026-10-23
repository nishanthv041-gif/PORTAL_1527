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
      subject: { teacherId: teacher.id },
      isBreak: false
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

  // 3. Fetch all timetable slots for all classes so teacher can view any class timetable
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
        <p style={{ color: "var(--text-secondary)", marginTop: "0.25rem", marginBottom: 0, fontSize: "0.9rem" }}>
          View live on-time schedules for your classes and personal teaching periods.
        </p>
      </div>

      <TeacherTimetableClient
        classes={classes}
        initialClassId={initialClassId}
        teacherSchedule={teacherSchedule as any}
        classTimetableMap={classTimetableMap as any}
        teacherName={teacher.user.name}
      />
    </div>
  );
}
