import { prisma } from "@/backend/db/prisma";

export interface SchoolCalendarStats {
  totalActiveDays: number;
  totalLeaveDays: number;
  academicYearStart: string;
}

/**
 * Calculates total school active (working) days and total leave/holiday days
 * based on the Admin Calendar (CalendarEvent where type === 'HOLIDAY').
 */
export async function getSchoolCalendarStats(referenceDate: Date = new Date()): Promise<SchoolCalendarStats> {
  try {
    // 1. Determine Academic Year Start Date (default: June 1st of current academic cycle)
    const currentYear = referenceDate.getFullYear();
    const currentMonth = referenceDate.getMonth(); // 0-indexed (5 is June)

    // Academic year runs from June 1 to May 31.
    // If we are in Jan-May, academic year started June 1 of previous calendar year.
    const startYear = currentMonth >= 5 ? currentYear : currentYear - 1;
    const academicStart = new Date(startYear, 5, 1, 0, 0, 0, 0); // June 1

    // 2. Fetch all holiday events from Admin Calendar in this academic year
    const academicEnd = new Date(startYear + 1, 4, 31, 23, 59, 59, 999); // May 31

    const holidayEvents = await prisma.calendarEvent.findMany({
      where: {
        type: "HOLIDAY",
        date: {
          gte: academicStart,
          lte: academicEnd,
        },
      },
    });

    // Collect all unique holiday date strings (YYYY-MM-DD)
    const holidayDateSet = new Set<string>();

    for (const h of holidayEvents) {
      const start = new Date(h.date);
      const end = h.endDate ? new Date(h.endDate) : new Date(h.date);

      const cur = new Date(start);
      cur.setHours(0, 0, 0, 0);
      end.setHours(0, 0, 0, 0);

      while (cur <= end) {
        holidayDateSet.add(cur.toISOString().split("T")[0]);
        cur.setDate(cur.getDate() + 1);
      }
    }

    const totalLeaveDays = holidayDateSet.size;

    // 3. Calculate Total Active (Working) School Days from Academic Start up to referenceDate
    // Count weekdays (Monday through Friday, excluding official holidays)
    let activeDaysCount = 0;
    const todayEnd = new Date(referenceDate);
    todayEnd.setHours(0, 0, 0, 0);

    const scanDate = new Date(academicStart);
    while (scanDate <= todayEnd) {
      const dayOfWeek = scanDate.getDay(); // 0 is Sunday, 6 is Saturday
      const dateStr = scanDate.toISOString().split("T")[0];

      // Standard school working days: Monday (1) through Friday (5)
      const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;
      const isHoliday = holidayDateSet.has(dateStr);

      if (isWeekday && !isHoliday) {
        activeDaysCount++;
      }

      scanDate.setDate(scanDate.getDate() + 1);
    }

    return {
      totalActiveDays: Math.max(0, activeDaysCount),
      totalLeaveDays,
      academicYearStart: academicStart.toISOString().split("T")[0],
    };
  } catch (error) {
    console.error("Error calculating school calendar stats:", error);
    return {
      totalActiveDays: 0,
      totalLeaveDays: 0,
      academicYearStart: new Date().toISOString().split("T")[0],
    };
  }
}
