import {
  getAcademicYearRange,
  getEffectiveAcademicYearRange,
  countSchoolWorkingDays,
  getSchoolScheduleMap,
  toDateString,
} from "@/backend/lib/services/attendanceCalculation";

export interface SchoolCalendarStats {
  totalActiveDays: number;
  totalLeaveDays: number;
  academicYearStart: string;
}

/**
 * Calculates total school active (working) days and total leave/holiday days
 * based on the School Calendar (SchoolDaySchedule overrides + CalendarEvent holidays),
 * starting strictly from the active batch's configured start date.
 */
export async function getSchoolCalendarStats(
  referenceDate: Date = new Date(),
  classId?: string | null
): Promise<SchoolCalendarStats> {
  try {
    const { start: academicStart, end: academicEnd } = await getEffectiveAcademicYearRange(referenceDate, classId);

    // Get schedule map for the entire academic year
    const scheduleMap = await getSchoolScheduleMap(academicStart, academicEnd);

    // Count leave days in the academic year
    let totalLeaveDays = 0;
    scheduleMap.forEach((entry) => {
      if (entry.status === "LEAVE_DAY") {
        totalLeaveDays++;
      }
    });

    // Count active school working days from academicStart up to referenceDate for this class
    const totalActiveDays = await countSchoolWorkingDays(academicStart, referenceDate, classId);

    return {
      totalActiveDays,
      totalLeaveDays,
      academicYearStart: toDateString(academicStart),
    };
  } catch (error) {
    console.error("Error calculating school calendar stats:", error);
    return {
      totalActiveDays: 0,
      totalLeaveDays: 0,
      academicYearStart: toDateString(new Date()),
    };
  }
}
