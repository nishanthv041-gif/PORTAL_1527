/**
 * SINGLE SOURCE OF TRUTH: School Date and Time Engine
 *
 * Strict Timezone: Asia/Kolkata (UTC+5:30)
 *
 * Prevents "wrong day" bugs caused by serverless UTC clocks (e.g. Vercel/Render)
 * running between 12:00 AM and 5:30 AM IST where UTC is still the previous day.
 */

export const SCHOOL_TIMEZONE = "Asia/Kolkata";

export type SchoolWeekday =
  | "MONDAY"
  | "TUESDAY"
  | "WEDNESDAY"
  | "THURSDAY"
  | "FRIDAY"
  | "SATURDAY"
  | "SUNDAY";

export const SCHOOL_WEEKDAYS: SchoolWeekday[] = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
];

export const SCHOOL_DAYS: SchoolWeekday[] = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
];

export interface SchoolDateTimeParts {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number; // 0-23
  minute: number; // 0-59
  second: number; // 0-59
  weekday: SchoolWeekday;
  isoDay: number; // 1 (Mon) .. 7 (Sun)
  sundayZero: number; // 0 (Sun) .. 6 (Sat)
  dateStr: string; // YYYY-MM-DD
  timeStr: string; // HH:mm
  minutesOfDay: number; // 0..1439
  utcInstant: Date;
}

/**
 * Coerces any date input (Date instance, timestamp number, ISO string, YYYY-MM-DD)
 * into a valid UTC Date object.
 */
export function coerceToDate(input?: Date | number | string | null): Date {
  if (!input) return new Date();
  if (input instanceof Date) return isNaN(input.getTime()) ? new Date() : input;
  if (typeof input === "number") return new Date(input);
  if (typeof input === "string") {
    // If format is date-only "YYYY-MM-DD", treat it as start of school day in Asia/Kolkata
    if (/^\d{4}-\d{2}-\d{2}$/.test(input.trim())) {
      const [y, m, d] = input.trim().split("-").map(Number);
      // Asia/Kolkata is UTC+05:30. Midnight IST = (Date.UTC(y, m-1, d, 0, 0, 0) - 5h30m)
      return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0) - 19800000);
    }
    const parsed = new Date(input);
    return isNaN(parsed.getTime()) ? new Date() : parsed;
  }
  return new Date();
}

/**
 * Returns current or target date/time components resolved strictly in Asia/Kolkata.
 */
export function getSchoolNow(refDate?: Date | number | string | null): SchoolDateTimeParts {
  const d = coerceToDate(refDate);

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: SCHOOL_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "long",
    hour12: false,
  });

  const parts = formatter.formatToParts(d);
  const partMap: Record<string, string> = {};
  for (const p of parts) {
    partMap[p.type] = p.value;
  }

  const year = parseInt(partMap.year, 10);
  const month = parseInt(partMap.month, 10);
  const day = parseInt(partMap.day, 10);
  let hour = parseInt(partMap.hour, 10);
  if (hour === 24) hour = 0; // Fix standard 24:00 edge case
  const minute = parseInt(partMap.minute, 10);
  const second = parseInt(partMap.second, 10);

  const weekdayStr = (partMap.weekday || "MONDAY").toUpperCase();
  const weekday: SchoolWeekday = SCHOOL_WEEKDAYS.includes(weekdayStr as SchoolWeekday)
    ? (weekdayStr as SchoolWeekday)
    : "MONDAY";

  const weekdayMap: Record<SchoolWeekday, { isoDay: number; sundayZero: number }> = {
    MONDAY: { isoDay: 1, sundayZero: 1 },
    TUESDAY: { isoDay: 2, sundayZero: 2 },
    WEDNESDAY: { isoDay: 3, sundayZero: 3 },
    THURSDAY: { isoDay: 4, sundayZero: 4 },
    FRIDAY: { isoDay: 5, sundayZero: 5 },
    SATURDAY: { isoDay: 6, sundayZero: 6 },
    SUNDAY: { isoDay: 7, sundayZero: 0 },
  };

  const { isoDay, sundayZero } = weekdayMap[weekday];
  const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const timeStr = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  const minutesOfDay = hour * 60 + minute;

  return {
    year,
    month,
    day,
    hour,
    minute,
    second,
    weekday,
    isoDay,
    sundayZero,
    dateStr,
    timeStr,
    minutesOfDay,
    utcInstant: d,
  };
}

/**
 * Returns today's YYYY-MM-DD string in Asia/Kolkata.
 */
export function getSchoolToday(refDate?: Date | number | string | null): string {
  return getSchoolNow(refDate).dateStr;
}

/**
 * Returns the current school weekday name and ISO numeric day (1 = Monday .. 7 = Sunday).
 */
export function getSchoolWeekday(refDate?: Date | number | string | null): {
  name: SchoolWeekday;
  isoDay: number;
  sundayZero: number;
} {
  const parts = getSchoolNow(refDate);
  return {
    name: parts.weekday,
    isoDay: parts.isoDay,
    sundayZero: parts.sundayZero,
  };
}

/**
 * Formats a date using Intl.DateTimeFormat in Asia/Kolkata.
 */
export function formatSchoolDate(
  date?: Date | number | string | null,
  options?: Intl.DateTimeFormatOptions
): string {
  const d = coerceToDate(date);
  const defaultOptions: Intl.DateTimeFormatOptions = {
    timeZone: SCHOOL_TIMEZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
  };
  return new Intl.DateTimeFormat("en-GB", {
    ...defaultOptions,
    ...options,
    timeZone: SCHOOL_TIMEZONE,
  }).format(d);
}

/**
 * Returns the exact UTC Date instant corresponding to 00:00:00.000 in Asia/Kolkata
 * for the given school date.
 *
 * Example: For "2026-11-04", 00:00:00 IST = 2026-11-03T18:30:00.000Z
 */
export function startOfSchoolDay(date?: Date | number | string | null): Date {
  const { year, month, day } = getSchoolNow(date);
  // Asia/Kolkata has constant offset of +05:30 (19,800,000 ms)
  const utcMillis = Date.UTC(year, month - 1, day, 0, 0, 0, 0) - 19800000;
  return new Date(utcMillis);
}

/**
 * Returns the exact UTC Date instant corresponding to 23:59:59.999 in Asia/Kolkata
 * for the given school date.
 *
 * Example: For "2026-11-04", 23:59:59.999 IST = 2026-11-04T18:29:59.999Z
 */
export function endOfSchoolDay(date?: Date | number | string | null): Date {
  const { year, month, day } = getSchoolNow(date);
  const utcMillis = Date.UTC(year, month - 1, day, 23, 59, 59, 999) - 19800000;
  return new Date(utcMillis);
}

/**
 * Returns the milliseconds until the next 12:00:00.000 AM in Asia/Kolkata.
 * Used to trigger instantaneous midnight transitions without page refreshes.
 */
export function msUntilNextSchoolMidnight(refDate?: Date | number | string | null): number {
  const now = coerceToDate(refDate);
  const { year, month, day } = getSchoolNow(now);

  // Next school day midnight in UTC:
  // (Date.UTC(year, month - 1, day + 1, 0, 0, 0, 0) - 19800000)
  const nextMidnightUtc = Date.UTC(year, month - 1, day + 1, 0, 0, 0, 0) - 19800000;
  const diff = nextMidnightUtc - now.getTime();
  return Math.max(diff, 0);
}

/**
 * Checks if two dates represent the exact same calendar day in Asia/Kolkata.
 */
export function isSameSchoolDay(
  d1: Date | number | string | null,
  d2: Date | number | string | null
): boolean {
  return getSchoolToday(d1) === getSchoolToday(d2);
}

/**
 * Checks if a given date is today in Asia/Kolkata.
 */
export function isSchoolToday(date: Date | number | string | null): boolean {
  return getSchoolToday(date) === getSchoolToday();
}

/**
 * Returns minutes of the day (0-1439) in Asia/Kolkata.
 */
export function getSchoolMinutesOfDay(refDate?: Date | number | string | null): number {
  return getSchoolNow(refDate).minutesOfDay;
}

/**
 * Finds the next school day (e.g. if today is Sunday, returns MONDAY).
 * If today has no classes, finds the next available weekday from availableDays.
 */
export function getNextSchoolDay(
  refDate?: Date | number | string | null,
  availableDays: string[] = SCHOOL_DAYS
): { name: SchoolWeekday; dateStr: string; daysAhead: number } {
  const base = coerceToDate(refDate);
  const { year, month, day, weekday } = getSchoolNow(base);

  const upperAvailable = availableDays.map((d) => d.toUpperCase());

  // Search next 7 days
  for (let offset = 1; offset <= 7; offset++) {
    // Next offset day in UTC
    const offsetDate = new Date(Date.UTC(year, month - 1, day + offset, 12, 0, 0) - 19800000);
    const offsetParts = getSchoolNow(offsetDate);
    if (upperAvailable.includes(offsetParts.weekday)) {
      return {
        name: offsetParts.weekday,
        dateStr: offsetParts.dateStr,
        daysAhead: offset,
      };
    }
  }

  // Fallback to MONDAY
  return {
    name: "MONDAY",
    dateStr: getSchoolToday(base),
    daysAhead: 1,
  };
}
