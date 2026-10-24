import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import styles from "../../dashboard.module.css";
import AttendanceForm from "./AttendanceForm";
import { getSystemSetting } from "@/backend/api/actions/dashboard/admin/settings/actions";
import { getSchoolCalendarStats } from "@/backend/api/actions/dashboard/attendance/calendarStats";
import { getClassAttendanceDetails } from "@/backend/api/actions/dashboard/teacher/attendance/actions";

export default async function TeacherAttendancePage() {
  const session = await getServerSession(getAuthOptions());
  if (!session) return null;

  const canManage = await getSystemSetting("TEACHER_MANAGE_ATTENDANCE", "true");
  if (canManage === "false") {
    return (
      <div className={styles.dashboard}>
        <h1 className={styles.title}>Attendance</h1>
        <p style={{ color: "var(--danger)" }}>Attendance management has been disabled by the administrator.</p>
      </div>
    );
  }

  const teacher = await prisma.teacher.findUnique({
    where: { userId: session.user.id },
    include: {
      classTeacherOf: {
        include: {
          students: {
            where: { isActive: true },
            orderBy: { rollNumber: "asc" },
            select: {
              id: true,
              firstName: true,
              lastName: true,
              rollNumber: true,
            },
          },
        },
      },
    },
  });

  if (!teacher || !teacher.classTeacherOf) {
    return (
      <div className={styles.dashboard}>
        <h1 className={styles.title}>Attendance</h1>
        <p>You are not assigned as a Class Teacher to any class.</p>
      </div>
    );
  }

  const myClass = teacher.classTeacherOf;
  const todayStr = new Date().toISOString().split("T")[0];

  // Fetch school active days and leave days from Admin Calendar
  const calendarStats = await getSchoolCalendarStats();

  // Fetch today's class attendance details & approved leaves
  const initialDetails = await getClassAttendanceDetails(myClass.id, todayStr);

  return (
    <div className={styles.dashboard}>
      <h1 className={styles.title} style={{ margin: 0, marginBottom: "0.25rem" }}>
        Attendance
      </h1>
      <p style={{ color: "var(--text-secondary)", marginTop: 0, marginBottom: "1.75rem" }}>
        Real-time class attendance register for {myClass.name} - {myClass.section}. Changes save automatically.
      </p>

      <AttendanceForm
        myClass={myClass}
        calendarStats={calendarStats}
        initialDate={todayStr}
        initialAttendanceMap={initialDetails.attendanceMap || {}}
        initialLeaveCount={initialDetails.leaveCountToday || 0}
      />
    </div>
  );
}
