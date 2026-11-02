import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import styles from "../../dashboard.module.css";
import { TeacherStudentItem } from "./AttendanceForm";
import TeacherAttendanceContainer from "./TeacherAttendanceContainer";
import { getSystemSetting } from "@/backend/api/actions/dashboard/admin/settings/actions";
import {
  getEffectiveAcademicYearRange,
  countSchoolWorkingDays,
  calculateAttendancePercentage,
  getLocalTodayDateString,
} from "@/backend/lib/services/attendanceCalculation";

export default async function TeacherAttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; tab?: string; view?: string }>;
}) {
  const session = await getServerSession(getAuthOptions());
  if (!session) return null;

  const resolvedSearchParams = await searchParams;
  const todayStr = resolvedSearchParams?.date || getLocalTodayDateString();

  const [year, month, day] = todayStr.split("-").map(Number);
  const startOfDay = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
  const endOfDay = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));

  const teacher = await prisma.teacher.findUnique({
    where: { userId: session.user.id },
    include: {
      user: true,
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
      attendances: {
        orderBy: { date: "desc" },
      },
    },
  });

  if (!teacher) {
    return (
      <div className={styles.dashboard}>
        <h1 className={styles.title}>Attendance</h1>
        <p>Teacher account profile not found. Please contact the administrator.</p>
      </div>
    );
  }

  const myClass = teacher.classTeacherOf;

  // Determine official school working days up to current date (starting from batch start date)
  const { start: academicStart } = await getEffectiveAcademicYearRange(startOfDay, myClass?.id);
  const officialWorkingDays = await countSchoolWorkingDays(academicStart, endOfDay, myClass?.id);

  // --- 1. Compute Logged-in Teacher's Personal Attendance ---
  const teacherTodayRecords = teacher.attendances.filter((a) => {
    const attDate = new Date(a.date).toISOString().split("T")[0];
    return attDate === todayStr;
  });

  const fnTeacherRecord = teacherTodayRecords.find((a) => {
    if (a.remarks?.toUpperCase().includes("AFTERNOON") || a.remarks?.includes("[AN]")) return false;
    if (a.remarks?.toUpperCase().includes("FORENOON") || a.remarks?.includes("[FN]")) return true;
    return new Date(a.date).getUTCHours() < 12;
  });

  const anTeacherRecord = teacherTodayRecords.find((a) => {
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

  const forenoonTeacherStatus = normalizeStatus(fnTeacherRecord?.status);
  const afternoonTeacherStatus = normalizeStatus(anTeacherRecord?.status);

  const teacherPresentedDays = teacher.attendances.filter((a) => a.status === "PRESENT").length;
  const teacherAbsentedDays = teacher.attendances.filter((a) => a.status === "ABSENT").length;
  const teacherLateDays = teacher.attendances.filter((a) => a.status === "LATE").length;
  const teacherLeaveDays = teacher.attendances.filter((a) => a.status === "LEAVE").length;
  const teacherRecordedTotal = teacherPresentedDays + teacherAbsentedDays + teacherLateDays + teacherLeaveDays;

  const officialTeacherWorkingSessions = officialWorkingDays * 2;
  const totalTeacherSessions = Math.max(officialTeacherWorkingSessions, teacherRecordedTotal, 1);
  const attendedTeacherSessions = teacherPresentedDays + teacherLateDays;
  const teacherAttendancePercentage = calculateAttendancePercentage(attendedTeacherSessions, totalTeacherSessions);

  const teacherAttendanceData = {
    totalSessions: totalTeacherSessions,
    presentedDays: teacherPresentedDays,
    absentedDays: teacherAbsentedDays,
    lateDays: teacherLateDays,
    leaveDays: teacherLeaveDays,
    attendancePercentage: teacherAttendancePercentage,
    todayDate: todayStr,
    forenoonStatus: forenoonTeacherStatus,
    forenoonRemarks: fnTeacherRecord?.remarks || "",
    afternoonStatus: afternoonTeacherStatus,
    afternoonRemarks: anTeacherRecord?.remarks || "",
    attendances: teacher.attendances.map((a) => {
      const isAN = a.remarks?.toUpperCase().includes("AFTERNOON") || new Date(a.date).getUTCHours() >= 12;
      return {
        id: a.id,
        date: a.date.toISOString(),
        session: (isAN ? "Afternoon" : "Forenoon") as "Forenoon" | "Afternoon",
        status: a.status === "LEAVE" ? "LATE" : a.status,
        remarks: a.remarks,
      };
    }),
  };

  const teacherInfo = {
    id: teacher.id,
    name: teacher.user.name || "Teacher",
    email: teacher.user.email || "",
    employeeId: `EMP-${teacher.id.slice(-4).toUpperCase()}`,
    qualification: teacher.qualification,
    classTeacherOf: myClass ? { id: myClass.id, name: myClass.name, section: myClass.section } : null,
  };

  // --- 2. Compute Class Student Attendance (if class teacher & permission enabled) ---
  const canManage = await getSystemSetting("TEACHER_MANAGE_ATTENDANCE", "true");
  let classData = null;

  if (myClass && canManage !== "false") {
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

      const fnStatus = normalizeStatus(fnRecord?.status);
      const anStatus = normalizeStatus(anRecord?.status);

      const presentCount = s.attendances.filter((a) => a.status === "PRESENT").length;
      const absentCount = s.attendances.filter((a) => a.status === "ABSENT").length;
      const lateCount = s.attendances.filter((a) => a.status === "LATE").length;
      const leaveCount = s.attendances.filter((a) => a.status === "LEAVE").length;
      const recordedTotal = presentCount + absentCount + lateCount + leaveCount;

      const officialWorkingSessions = officialWorkingDays * 2;
      const totalWorkingSessions = Math.max(officialWorkingSessions, recordedTotal, 1);
      const attendedSessions = presentCount + lateCount;
      const attendancePercentage = calculateAttendancePercentage(attendedSessions, totalWorkingSessions);

      return {
        id: s.id,
        name: `${s.firstName} ${s.lastName}`.trim(),
        rollNumber: s.rollNumber,
        forenoonStatus: fnStatus,
        forenoonRemarks: fnRecord?.remarks || "",
        afternoonStatus: anStatus,
        afternoonRemarks: anRecord?.remarks || "",
        currentStatus: fnStatus,
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

    classData = {
      myClass: { id: myClass.id, name: myClass.name, section: myClass.section },
      students: serializedStudents,
      initialDate: todayStr,
    };
  }

  const requestedTab = resolvedSearchParams?.tab || resolvedSearchParams?.view;
  const initialTab = requestedTab === "my-attendance" || !classData
    ? ("my-attendance" as const)
    : ("class-attendance" as const);

  return (
    <div style={{ width: "100%", maxWidth: "100%", minWidth: 0, boxSizing: "border-box" }}>
      <TeacherAttendanceContainer
        classData={classData}
        teacherInfo={teacherInfo}
        attendanceData={teacherAttendanceData}
        initialTab={initialTab}
      />
    </div>
  );
}
