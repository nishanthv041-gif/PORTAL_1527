import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import styles from "../../dashboard.module.css";
import AttendanceForm, { TeacherStudentItem } from "./AttendanceForm";
import { getSystemSetting } from "@/backend/api/actions/dashboard/admin/settings/actions";

export default async function TeacherAttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
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

  const resolvedSearchParams = await searchParams;
  const todayStr = resolvedSearchParams?.date || new Date().toISOString().split("T")[0];

  const teacher = await prisma.teacher.findUnique({
    where: { userId: session.user.id },
    include: {
      classTeacherOf: {
        include: {
          students: {
            where: { isActive: true },
            include: {
              attendances: {
                orderBy: { date: "desc" },
                take: 60,
              },
            },
            orderBy: { rollNumber: "asc" },
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

  const serializedStudents: TeacherStudentItem[] = myClass.students.map((s) => {
    const todayRecord = s.attendances.find((a) => {
      const attDate = new Date(a.date).toISOString().split("T")[0];
      return attDate === todayStr;
    });

    const rawStatus = todayRecord?.status;
    const currentStatus: TeacherStudentItem["currentStatus"] =
      rawStatus === "PRESENT" ? "PRESENT" :
      rawStatus === "ABSENT" ? "ABSENT" :
      rawStatus === "LEAVE" ? "LEAVE" :
      "NOT_MARKED";

    const totalSessions = s.attendances.length;
    const presentCount = s.attendances.filter((a) => a.status === "PRESENT").length;
    const absentCount = s.attendances.filter((a) => a.status === "ABSENT").length;
    const leaveCount = s.attendances.filter((a) => a.status === "LEAVE").length;

    const attendancePercentage =
      totalSessions > 0
        ? ((presentCount / totalSessions) * 100).toFixed(1)
        : "100.0";

    return {
      id: s.id,
      name: `${s.firstName} ${s.lastName}`.trim(),
      rollNumber: s.rollNumber,
      currentStatus,
      currentRemarks: todayRecord?.remarks || "",
      attendancePercentage,
      totalSessions,
      presentCount,
      absentCount,
      leaveCount,
      recentHistory: s.attendances.slice(0, 15).map((a) => ({
        id: a.id,
        date: a.date,
        status: a.status,
        remarks: a.remarks,
      })),
    };
  });

  return (
    <div style={{ width: "100%", maxWidth: "100%", minWidth: 0, boxSizing: "border-box" }}>
      <AttendanceForm
        myClass={{ id: myClass.id, name: myClass.name, section: myClass.section }}
        students={serializedStudents}
        initialDate={todayStr}
      />
    </div>
  );
}
