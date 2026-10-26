import { prisma } from "@/backend/db/prisma";
import {
  DayScheduleStatus,
  getDefaultDayStatus,
  toDateString,
  getAcademicYearRange,
  getEffectiveAcademicYearRange,
  countSchoolWorkingDays,
} from "./attendanceCalculation";

export interface SerializedCalendarEvent {
  id: string;
  title: string;
  type: string;
  date: string;
  endDate: string | null;
  startTime: string;
  endTime: string;
  location: string | null;
  description: string | null;
  targetClass: string | null;
  targetSection: string | null;
  organizer: string | null;
  audience: string;
  status: string;
  isPublished: boolean;
}

export interface CalendarDayModel {
  dateStr: string;
  dayNumber: number;
  dayOfWeek: number;
  dayName: string;
  isToday: boolean;
  status: DayScheduleStatus;
  title?: string | null;
  reason?: string | null;
  targetClassType?: string; // "ALL" | "SPECIFIC"
  targetClassIds?: string | null; // Comma-separated class IDs or "ALL"
  targetClassNames?: string | null; // e.g. "Grade 10 - A, Grade 12 - B"
  isCustom: boolean;
  events: SerializedCalendarEvent[];
}

export interface MonthCalendarData {
  year: number;
  month: number; // 0-indexed (0 = Jan, 9 = Oct)
  monthName: string;
  firstDayOfWeek: number;
  daysInMonth: number;
  days: CalendarDayModel[];
  stats: {
    totalDays: number;
    workingDays: number;
    leaveDays: number;
    eventsCount: number;
  };
  academicStats: {
    academicWorkingDaysToDate: number;
    academicYearStart: string;
  };
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export async function getMonthCalendarData(
  targetYear?: number,
  targetMonth?: number,
  audienceFilter?: string // "ALL" | "TEACHER" | "PARENT" | "STUDENT"
): Promise<MonthCalendarData> {
  const now = new Date();
  const year = targetYear !== undefined && !isNaN(targetYear) ? targetYear : now.getFullYear();
  const month = targetMonth !== undefined && !isNaN(targetMonth) ? targetMonth : now.getMonth();

  const monthStart = new Date(year, month, 1, 0, 0, 0, 0);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthEnd = new Date(year, month, daysInMonth, 23, 59, 59, 999);
  const firstDayOfWeek = monthStart.getDay();

  // 1. Fetch SchoolDaySchedule overrides for this month
  const customSchedules = await prisma.schoolDaySchedule.findMany({
    where: {
      date: {
        gte: monthStart,
        lte: monthEnd,
      },
    },
  });

  const scheduleMap = new Map<string, {
    status: DayScheduleStatus;
    title?: string | null;
    reason?: string | null;
    targetClassType?: string;
    targetClassIds?: string | null;
    targetClassNames?: string | null;
    isCustom: boolean;
  }>();

  for (const s of customSchedules) {
    const key = toDateString(s.date);
    scheduleMap.set(key, {
      status: s.status === "WORKING_DAY" ? "WORKING_DAY" : "LEAVE_DAY",
      title: s.title,
      reason: s.reason,
      targetClassType: s.targetClassType || "ALL",
      targetClassIds: s.targetClassIds,
      targetClassNames: s.targetClassNames,
      isCustom: s.isCustom,
    });
  }

  // 2. Fetch CalendarEvents for this month
  const eventWhere: Record<string, unknown> = {
    date: {
      gte: monthStart,
      lte: monthEnd,
    },
  };

  if (audienceFilter && audienceFilter !== "ADMIN") {
    eventWhere.OR = [
      { audience: "ALL" },
      { audience: audienceFilter },
    ];
  }

  const calendarEvents = await prisma.calendarEvent.findMany({
    where: eventWhere,
    orderBy: [{ startTime: "asc" }, { title: "asc" }],
  });

  const eventsMap = new Map<string, SerializedCalendarEvent[]>();

  for (const e of calendarEvents) {
    const key = toDateString(e.date);
    const serialized: SerializedCalendarEvent = {
      id: e.id,
      title: e.title,
      type: e.type,
      date: toDateString(e.date),
      endDate: e.endDate ? toDateString(e.endDate) : null,
      startTime: e.startTime,
      endTime: e.endTime,
      location: e.location,
      description: e.description,
      targetClass: e.targetClass,
      targetSection: e.targetSection,
      organizer: e.organizer,
      audience: e.audience,
      status: e.status,
      isPublished: e.isPublished,
    };

    if (!eventsMap.has(key)) {
      eventsMap.set(key, []);
    }
    eventsMap.get(key)!.push(serialized);

    // If it's a holiday and not overridden in SchoolDaySchedule, mark as leave day
    if (e.type === "HOLIDAY" && !scheduleMap.has(key)) {
      scheduleMap.set(key, {
        status: "LEAVE_DAY",
        title: e.title,
        reason: e.description || "Holiday Event",
        targetClassType: "ALL",
        targetClassIds: "ALL",
        targetClassNames: "All Classes",
        isCustom: false,
      });
    }
  }

  // 3. Build Day Models
  const todayStr = toDateString(now);
  const days: CalendarDayModel[] = [];

  let monthWorkingDays = 0;
  let monthLeaveDays = 0;
  let totalEventsInMonth = 0;

  for (let d = 1; d <= daysInMonth; d++) {
    const dayDate = new Date(year, month, d, 0, 0, 0, 0);
    const dateStr = toDateString(dayDate);
    const dayOfWeek = dayDate.getDay();

    const override = scheduleMap.get(dateStr);
    let status: DayScheduleStatus;
    let title: string | null | undefined = null;
    let reason: string | null | undefined = null;
    let targetClassType: string | undefined = "ALL";
    let targetClassIds: string | null | undefined = null;
    let targetClassNames: string | null | undefined = null;
    let isCustom = false;

    if (override) {
      status = override.status;
      title = override.title;
      reason = override.reason;
      targetClassType = override.targetClassType;
      targetClassIds = override.targetClassIds;
      targetClassNames = override.targetClassNames;
      isCustom = override.isCustom;
    } else {
      status = getDefaultDayStatus(dayDate);
      if (status === "LEAVE_DAY") {
        title = dayOfWeek === 0 ? "Sunday Weekend" : "Saturday Weekend";
      } else {
        title = "Regular Working Day";
      }
    }

    if (status === "WORKING_DAY") {
      monthWorkingDays++;
    } else {
      monthLeaveDays++;
    }

    const dayEvents = eventsMap.get(dateStr) || [];
    totalEventsInMonth += dayEvents.length;

    days.push({
      dateStr,
      dayNumber: d,
      dayOfWeek,
      dayName: DAY_NAMES[dayOfWeek],
      isToday: dateStr === todayStr,
      status,
      title,
      reason,
      targetClassType,
      targetClassIds,
      targetClassNames,
      isCustom,
      events: dayEvents,
    });
  }

  // 4. Academic stats up to today
  const { start: academicStart } = await getEffectiveAcademicYearRange(now);
  const academicWorkingDaysToDate = await countSchoolWorkingDays(academicStart, now);

  return {
    year,
    month,
    monthName: MONTH_NAMES[month],
    firstDayOfWeek,
    daysInMonth,
    days,
    stats: {
      totalDays: daysInMonth,
      workingDays: monthWorkingDays,
      leaveDays: monthLeaveDays,
      eventsCount: totalEventsInMonth,
    },
    academicStats: {
      academicWorkingDaysToDate,
      academicYearStart: toDateString(academicStart),
    },
  };
}
