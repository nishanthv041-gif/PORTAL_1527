import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import styles from "../../dashboard.module.css";
import AttendanceForm, { TeacherStudentItem } from "./AttendanceForm";
import { getSystemSetting } from "@/backend/api/actions/dashboard/admin/settings/actions";
import {
  getAcademicYearRange,
  getEffectiveAcademicYearRange,
  countSchoolWorkingDays,
  calculateAttendancePercentage,
  getLocalTodayDateString,
} from "@/backend/lib/services/attendanceCalculation";

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
  const todayStr = resolvedSearchParams?.date || getLocalTodayDateString();

  const [year, month, day] = todayStr.split("-").map(Number);
  const startOfDay = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
  const endOfDay = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));

  const teacher = await prisma.teacher.findUnique({
    where: { userId: session.user.id },
    include: {
      classTeacherOf: {
        include: {
          students: {
            where: { isActive: true },
            include: {
              attendances: {
                where: {
                  date: {
                    lte: endOfDay,
                  },
                },
                orderBy: { date: "desc" },
              },
            },
            orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
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

  // Determine official school working days up to current date for this specific class (starting from batch start date)
  const { start: academicStart } = await getEffectiveAcademicYearRange(startOfDay, myClass.id);
  const officialWorkingDays = await countSchoolWorkingDays(academicStart, endOfDay, myClass.id);

  const serializedStudents: TeacherStudentItem[] = myClass.students.map((s) => {
    const todayRecords = s.attendances.filter((a) => {
      const attDate = new Date(a.date).toISOString().split("T")[0];
      return attDate === todayStr;
    });

    const fnRecord = todayRecords.find((a) => {
      if (a.remarks?.toUpperCase().includes("AFTERNOON") || a.remarks?.includes("[AN]")) return false;
      if (a.remarks?.toUpperCase().includes("FORENOON") || a.remarks?.includes("[FN]")) return true;
      return new Date(a.date).getUTCHours() < 12;
    });

    const anRecord = todayRecords.find((a) => {
      if (a.remarks?.toUpperCase().includes("AFTERNOON") || a.remarks?.includes("[AN]")) return true;
      if (a.remarks?.toUpperCase().includes("FORENOON") || a.remarks?.includes("[FN]")) return false;
      return new Date(a.date).getUTCHours() >= 12;
    });

    const normalizeStatus = (st?: string | null): "PRESENT" | "ABSENT" | "LATE" | "NOT_MARKED" => {
      if (st === "PRESENT") return "PRESENT";
      if (st === "ABSENT") return "ABSENT";
      if (st === "LATE") return "LATE";
      if (st === "LEAVE") return "LATE";
      return "NOT_MARKED";
    };

    const forenoonStatus = normalizeStatus(fnRecord?.status);
    const afternoonStatus = normalizeStatus(anRecord?.status);

    const presentCount = s.attendances.filter((a) => a.status === "PRESENT").length;
    const absentCount = s.attendances.filter((a) => a.status === "ABSENT").length;
    const lateCount = s.attendances.filter((a) => a.status === "LATE").length;
    const leaveCount = s.attendances.filter((a) => a.status === "LEAVE").length;
    const recordedTotal = presentCount + absentCount + lateCount + leaveCount;

    // Each school worked day in calendar has 2 sessions (FN and AN)
    const officialWorkingSessions = officialWorkingDays * 2;
    const totalWorkingSessions = Math.max(officialWorkingSessions, recordedTotal, 1);

    const attendedSessions = presentCount + lateCount;
    const attendancePercentage = calculateAttendancePercentage(attendedSessions, totalWorkingSessions);

    return {
      id: s.id,
      name: `${s.firstName} ${s.lastName}`.trim(),
      rollNumber: s.rollNumber,
      forenoonStatus,
      forenoonRemarks: fnRecord?.remarks || "",
      afternoonStatus,
      afternoonRemarks: anRecord?.remarks || "",
      currentStatus: forenoonStatus,
      currentRemarks: fnRecord?.remarks || "",
      attendancePercentage,
      totalSessions: totalWorkingSessions,
      presentCount,
      absentCount,
      lateCount,
      leaveCount,
      recentHistory: s.attendances.slice(0, 30).map((a) => {
        const isAN = a.remarks?.toUpperCase().includes("AFTERNOON") || new Date(a.date).getUTCHours() >= 12;
        return {
          id: a.id,
          date: a.date,
          session: isAN ? "Afternoon" : "Forenoon",
          status: a.status === "LEAVE" ? "LATE" : a.status,
          remarks: a.remarks,
        };
      }),
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
