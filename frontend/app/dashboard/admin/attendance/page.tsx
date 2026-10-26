import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import AttendanceClient, { AdminStudentItem } from "./AttendanceClient";
import {
  getAcademicYearRange,
  getEffectiveAcademicYearRange,
  countSchoolWorkingDays,
  calculateAttendancePercentage,
} from "@/backend/lib/services/attendanceCalculation";

export default async function AdminAttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ classId?: string; date?: string }>;
}) {
  const session = await getServerSession(getAuthOptions());
  if (!session || session.user.role !== "ADMIN") return null;

  const resolvedSearchParams = await searchParams;

  const todayStr = resolvedSearchParams?.date || new Date().toISOString().split("T")[0];
  const [year, month, day] = todayStr.split("-").map(Number);
  const startOfDay = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
  const endOfDay = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));

  // Fetch all active classes
  const classes = await prisma.class.findMany({
    where: { isActive: true },
    orderBy: [{ name: "asc" }, { section: "asc" }],
    select: { id: true, name: true, section: true },
  });

  const selectedClassId = resolvedSearchParams?.classId || (classes.length > 0 ? classes[0].id : "");

  // Determine official school working days up to current date for the selected class (starting from batch start date)
  const { start: academicStart } = await getEffectiveAcademicYearRange(startOfDay, selectedClassId);
  const officialWorkingDays = await countSchoolWorkingDays(academicStart, endOfDay, selectedClassId);

  let serializedStudents: AdminStudentItem[] = [];

  if (selectedClassId) {
    const rawStudents = await prisma.student.findMany({
      where: { classId: selectedClassId, isActive: true },
      include: {
        class: { select: { id: true, name: true, section: true } },
        attendances: {
          orderBy: { date: "desc" },
          take: 60,
        },
      },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    });

    serializedStudents = rawStudents.map((s) => {
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

      // Each school worked day in calendar has 2 sessions (Forenoon & Afternoon)
      const officialWorkingSessions = officialWorkingDays * 2;
      const totalWorkingSessions = Math.max(officialWorkingSessions, recordedTotal, 1);

      // Present and Late are counted in attendance percentage; Late tracks tardiness
      const attendedSessions = presentCount + lateCount;
      const attendancePercentage = calculateAttendancePercentage(attendedSessions, totalWorkingSessions);

      return {
        id: s.id,
        name: `${s.firstName} ${s.lastName}`.trim(),
        rollNumber: s.rollNumber,
        admissionNo: s.admissionNo,
        classId: s.classId || selectedClassId,
        className: s.class ? `${s.class.name} - ${s.class.section}` : "",
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
  }

  return (
    <div style={{ width: "100%", maxWidth: "100%", minWidth: 0, boxSizing: "border-box" }}>
      <AttendanceClient
        classes={classes}
        students={serializedStudents}
        selectedClassId={selectedClassId}
        initialDate={todayStr}
      />
    </div>
  );
}
