import { prisma } from "@/backend/db/prisma";

export type DayScheduleStatus = "WORKING_DAY" | "LEAVE_DAY";

export interface DayInfo {
  dateStr: string; // YYYY-MM-DD
  dayNumber: number;
  dayOfWeek: number; // 0 = Sun, 1 = Mon, ..., 6 = Sat
  status: DayScheduleStatus;
  title?: string | null;
  reason?: string | null;
  isCustom: boolean;
  events: {
    id: string;
    title: string;
    type: string;
    startTime?: string;
    endTime?: string;
    location?: string | null;
    audience?: string;
  }[];
}

export interface AcademicCalendarSummary {
  academicYearStart: string;
  academicYearEnd: string;
  totalWorkingDaysToDate: number;
  totalLeaveDaysToDate: number;
  totalMonthWorkingDays: number;
  totalMonthLeaveDays: number;
}

/**
 * Standard utility to format date into YYYY-MM-DD cleanly without timezone offset bugs.
 */
export function toDateString(d: Date | string): string {
  if (typeof d === "string") {
    return d.split("T")[0];
  }
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Parse YYYY-MM-DD into a localized midnight Date object.
 */
export function parseDateString(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

/**
 * Academic Year Boundary: June 1 to May 31.
 */
export function getAcademicYearRange(refDate: Date = new Date()): { start: Date; end: Date } {
  const currentYear = refDate.getFullYear();
  const currentMonth = refDate.getMonth(); // 0 is January, 5 is June

  // If before June, the cycle began June 1 of previous calendar year
  const startYear = currentMonth >= 5 ? currentYear : currentYear - 1;
  const start = new Date(startYear, 5, 1, 0, 0, 0, 0); // June 1
  const end = new Date(startYear + 1, 4, 31, 23, 59, 59, 999); // May 31 of next year
  return { start, end };
}

/**
 * Default rule if no explicit override exists:
 * - Sunday (0): LEAVE_DAY
 * - Monday to Friday (1-5): WORKING_DAY
 * - Saturday (6): LEAVE_DAY (Weekend)
 */
export function getDefaultDayStatus(d: Date): DayScheduleStatus {
  const day = d.getDay();
  if (day === 0 || day === 6) {
    return "LEAVE_DAY";
  }
  return "WORKING_DAY";
}

/**
 * Computes the exact DayStatus for every day in [startDate, endDate]
 * merging SchoolDaySchedule overrides and CalendarEvents.
 */
export async function getSchoolScheduleMap(
  startDate: Date,
  endDate: Date
): Promise<Map<string, { status: DayScheduleStatus; title?: string | null; reason?: string | null; isCustom: boolean }>> {
  const scheduleMap = new Map<string, { status: DayScheduleStatus; title?: string | null; reason?: string | null; isCustom: boolean }>();

  // 1. Fetch custom overrides from SchoolDaySchedule
  const customOverrides = await prisma.schoolDaySchedule.findMany({
    where: {
      date: {
        gte: startDate,
        lte: endDate,
      },
    },
  });

  for (const override of customOverrides) {
    const key = toDateString(override.date);
    scheduleMap.set(key, {
      status: override.status === "WORKING_DAY" ? "WORKING_DAY" : "LEAVE_DAY",
      title: override.title,
      reason: override.reason,
      isCustom: override.isCustom,
    });
  }

  // 2. Fetch Holiday calendar events that may declare school leaves
  const holidayEvents = await prisma.calendarEvent.findMany({
    where: {
      type: "HOLIDAY",
      date: {
        gte: startDate,
        lte: endDate,
      },
    },
  });

  for (const h of holidayEvents) {
    const key = toDateString(h.date);
    // Only set if not explicitly overridden in SchoolDaySchedule
    if (!scheduleMap.has(key)) {
      scheduleMap.set(key, {
        status: "LEAVE_DAY",
        title: h.title,
        reason: h.description || "School Holiday",
        isCustom: false,
      });
    }
  }

  return scheduleMap;
}

/**
 * Counts total school working days in [startDate, endDate].
 */
export async function countSchoolWorkingDays(startDate: Date, endDate: Date): Promise<number> {
  const scheduleMap = await getSchoolScheduleMap(startDate, endDate);

  let workingDays = 0;
  const cursor = new Date(startDate);
  cursor.setHours(0, 0, 0, 0);

  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);

  while (cursor <= end) {
    const key = toDateString(cursor);
    const existing = scheduleMap.get(key);

    const status = existing ? existing.status : getDefaultDayStatus(cursor);
    if (status === "WORKING_DAY") {
      workingDays++;
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  return workingDays;
}

/**
 * Standard module of percentage calculation.
 * Ensures consistent precision and capping between 0.0% and 100.0%.
 */
export function calculateAttendancePercentage(
  presentUnits: number,
  totalWorkingUnits: number
): string {
  if (totalWorkingUnits <= 0) {
    return "100.0";
  }
  const pct = (presentUnits / totalWorkingUnits) * 100;
  const clamped = Math.min(100, Math.max(0, pct));
  return clamped.toFixed(1);
}

/**
 * Standard Calculation for Student Attendance:
 * Evaluates present sessions/days against official school working days.
 */
export async function getStudentStandardAttendanceStats(
  studentId: string,
  referenceDate: Date = new Date()
) {
  const { start: academicStart } = getAcademicYearRange(referenceDate);

  // 1. Fetch attendance records for this student in current academic period
  const records = await prisma.attendance.findMany({
    where: {
      studentId,
      date: {
        gte: academicStart,
        lte: referenceDate,
      },
    },
    orderBy: { date: "asc" },
  });

  const presentCount = records.filter((r) => r.status === "PRESENT").length;
  const absentCount = records.filter((r) => r.status === "ABSENT").length;
  const leaveCount = records.filter((r) => r.status === "LEAVE").length;

  // 2. Count official school working days from academicStart to referenceDate
  const officialWorkingDays = await countSchoolWorkingDays(academicStart, referenceDate);

  // In schools with Forenoon + Afternoon sessions, recorded sessions might be 2x or 1x.
  // We use max(officialWorkingDays, records.length) as the authoritative base
  const totalSessionsOrDays = Math.max(officialWorkingDays, presentCount + absentCount + leaveCount);

  const percentage = calculateAttendancePercentage(presentCount, totalSessionsOrDays);

  return {
    studentId,
    officialWorkingDays,
    presentCount,
    absentCount,
    leaveCount,
    totalSessionsOrDays,
    percentage,
  };
}

/**
 * Standard Calculation for Teacher Attendance:
 * Evaluates present days against official school working days.
 */
export async function getTeacherStandardAttendanceStats(
  teacherId: string,
  referenceDate: Date = new Date()
) {
  const { start: academicStart } = getAcademicYearRange(referenceDate);

  const records = await prisma.teacherAttendance.findMany({
    where: {
      teacherId,
      date: {
        gte: academicStart,
        lte: referenceDate,
      },
    },
    orderBy: { date: "asc" },
  });

  const presentCount = records.filter((r) => r.status === "PRESENT").length;
  const absentCount = records.filter((r) => r.status === "ABSENT").length;
  const leaveCount = records.filter((r) => r.status === "LEAVE").length;

  const officialWorkingDays = await countSchoolWorkingDays(academicStart, referenceDate);
  const totalDays = Math.max(officialWorkingDays, presentCount + absentCount + leaveCount);

  const percentage = calculateAttendancePercentage(presentCount, totalDays);

  return {
    teacherId,
    officialWorkingDays,
    presentCount,
    absentCount,
    leaveCount,
    totalDays,
    percentage,
  };
}
