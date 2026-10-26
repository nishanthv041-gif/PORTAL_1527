import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import TeacherAttendanceClient, { TeacherRecordItem } from "./TeacherAttendanceClient";
import {
  getAcademicYearRange,
  getEffectiveAcademicYearRange,
  countSchoolWorkingDays,
  calculateAttendancePercentage,
} from "@/backend/lib/services/attendanceCalculation";

export default async function AdminTeacherAttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const session = await getServerSession(getAuthOptions());
  if (!session || session.user.role !== "ADMIN") return null;

  const resolvedSearchParams = await searchParams;
  const todayStr = resolvedSearchParams?.date || new Date().toISOString().split("T")[0];

  const [year, month, day] = todayStr.split("-").map(Number);
  const startOfDay = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
  const endOfDay = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));

  // Determine official academic working days up to current date (starting from batch start date)
  const { start: academicStart } = await getEffectiveAcademicYearRange(startOfDay);
  const officialWorkingDaysPromise = countSchoolWorkingDays(academicStart, endOfDay);

  // Fetch all active teachers and today's attendance records
  const [teachers, dateAttendances, officialWorkingDays] = await Promise.all([
    prisma.teacher.findMany({
      where: { isActive: true },
      include: {
        user: true,
        attendances: {
          orderBy: { date: "desc" },
          take: 60,
        },
      },
      orderBy: { user: { name: "asc" } },
    }),
    prisma.teacherAttendance.findMany({
      where: {
        date: { gte: startOfDay, lte: endOfDay },
      },
    }),
    officialWorkingDaysPromise,
  ]);

  // Precompute baseline statistics for each teacher using official school working days
  const serializedTeachers: TeacherRecordItem[] = teachers.map((teacher) => {
    const teacherTodayRecords = dateAttendances.filter((a) => a.teacherId === teacher.id);
    const fnRecord = teacherTodayRecords.find((a) => {
      if (a.remarks?.toUpperCase().includes("AFTERNOON") || a.remarks?.includes("[AN]")) return false;
      if (a.remarks?.toUpperCase().includes("FORENOON") || a.remarks?.includes("[FN]")) return true;
      return new Date(a.date).getUTCHours() < 12;
    });
    const anRecord = teacherTodayRecords.find((a) => {
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

    const presentedDays = teacher.attendances.filter((a) => a.status === "PRESENT").length;
    const absentedDays = teacher.attendances.filter((a) => a.status === "ABSENT").length;
    const lateDays = teacher.attendances.filter((a) => a.status === "LATE").length;
    const leaveDays = teacher.attendances.filter((a) => a.status === "LEAVE").length;
    const recordedTotal = presentedDays + absentedDays + lateDays + leaveDays;

    // Each school worked day in calendar has 2 sessions (FN and AN)
    const officialWorkingSessions = officialWorkingDays * 2;
    const effectiveWorkingUnits = Math.max(officialWorkingSessions, recordedTotal, 1);

    const attendedSessions = presentedDays + lateDays;
    const attendancePercentage = calculateAttendancePercentage(attendedSessions, effectiveWorkingUnits);

    return {
      id: teacher.id,
      user: {
        id: teacher.user.id,
        name: teacher.user.name,
        email: teacher.user.email,
        role: teacher.user.role,
      },
      totalSessions: effectiveWorkingUnits,
      presentedDays,
      absentedDays,
      lateDays,
      leaveDays,
      attendancePercentage,
      forenoonStatus,
      forenoonRemarks: fnRecord?.remarks || "",
      afternoonStatus,
      afternoonRemarks: anRecord?.remarks || "",
      todayStatus: forenoonStatus,
      todayRemarks: fnRecord?.remarks || "",
      attendances: teacher.attendances.map((a) => {
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
      <TeacherAttendanceClient
        teachers={serializedTeachers}
        initialDate={todayStr}
      />
    </div>
  );
}
