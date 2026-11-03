import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import StaffAttendanceClient, { StaffRecordItem } from "./StaffAttendanceClient";
import {
  getEffectiveAcademicYearRange,
  countSchoolWorkingDays,
  calculateAttendancePercentage,
  getLocalTodayDateString,
} from "@/backend/lib/services/attendanceCalculation";

export const dynamic = "force-dynamic";

export default async function AdminStaffAttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const session = await getServerSession(getAuthOptions());
  if (!session || session.user.role !== "ADMIN") return null;

  const resolvedSearchParams = await searchParams;
  const todayStr = resolvedSearchParams?.date || getLocalTodayDateString();

  const [year, month, day] = todayStr.split("-").map(Number);
  const startOfDay = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
  const endOfDay = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));

  // Determine official academic working days up to current date (starting from batch start date)
  const { start: academicStart } = await getEffectiveAcademicYearRange(startOfDay);
  const officialWorkingDaysPromise = countSchoolWorkingDays(academicStart, endOfDay);

  // Fetch all active non-teaching staff (excluding teachers) and today's attendance records
  const [staffMembers, dateAttendances, officialWorkingDays] = await Promise.all([
    prisma.staff.findMany({
      where: {
        isActive: true,
        user: {
          role: { in: ["STAFF", "NON_TEACHING_STAFF"] },
        },
      },
      include: {
        user: true,
        attendances: {
          where: {
            date: {
              gte: academicStart,
              lte: endOfDay,
            },
          },
          orderBy: { date: "desc" },
        },
      },
      orderBy: { user: { name: "asc" } },
    }),
    prisma.staffAttendance.findMany({
      where: {
        date: { gte: startOfDay, lte: endOfDay },
      },
    }),
    officialWorkingDaysPromise,
  ]);

  // Precompute baseline statistics for each staff member using official school working days
  const serializedStaff: StaffRecordItem[] = staffMembers.map((staff) => {
    const staffTodayRecords = dateAttendances.filter((a) => a.staffId === staff.id);
    const fnRecord = staffTodayRecords.find((a) => {
      if (a.remarks?.toUpperCase().includes("AFTERNOON") || a.remarks?.includes("[AN]")) return false;
      if (a.remarks?.toUpperCase().includes("FORENOON") || a.remarks?.includes("[FN]")) return true;
      return new Date(a.date).getUTCHours() < 12;
    });
    const anRecord = staffTodayRecords.find((a) => {
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

    const presentedDays = staff.attendances.filter((a) => a.status === "PRESENT").length;
    const absentedDays = staff.attendances.filter((a) => a.status === "ABSENT").length;
    const lateDays = staff.attendances.filter((a) => a.status === "LATE").length;
    const leaveDays = staff.attendances.filter((a) => a.status === "LEAVE").length;
    const recordedTotal = presentedDays + absentedDays + lateDays + leaveDays;

    // Each school working day in calendar has 2 sessions (FN and AN)
    const officialWorkingSessions = officialWorkingDays * 2;
    const effectiveWorkingUnits = Math.max(officialWorkingSessions, recordedTotal, 1);

    const attendedSessions = presentedDays + lateDays;
    const attendancePercentage = calculateAttendancePercentage(attendedSessions, effectiveWorkingUnits);

    return {
      id: staff.id,
      user: {
        id: staff.user.id,
        name: staff.user.name,
        email: staff.user.email,
        role: staff.user.role,
      },
      phone: staff.phone,
      designation: staff.designation,
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
      attendances: staff.attendances.map((a) => {
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
      <StaffAttendanceClient
        staffMembers={serializedStaff}
        initialDate={todayStr}
      />
    </div>
  );
}

