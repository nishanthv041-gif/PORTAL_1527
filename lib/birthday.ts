import { getSchoolNow } from "@/lib/time";

export interface BirthdayDateParts {
  year: number;
  month: number;
  day: number;
  dateString: string; // YYYY-MM-DD
  dmyString: string;  // DD/MM/YYYY
}

/**
 * Checks if a given year is a leap year according to the Gregorian calendar.
 */
export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
}

/**
 * Returns today's calendar date components strictly in Asia/Kolkata (IST, UTC+5:30).
 */
export function getTodayIST(refDate?: Date | number | string | null): BirthdayDateParts {
  const schoolNow = getSchoolNow(refDate);
  const year = schoolNow.year;
  const month = schoolNow.month;
  const day = schoolNow.day;
  const dateString = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const dmyString = `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`;

  return {
    year,
    month,
    day,
    dateString,
    dmyString,
  };
}

/**
 * Safely parses any Date instance, ISO string, or DD/MM/YYYY string into numeric parts.
 * Crucial: Extracts UTC components from Date instances so that Prisma `@db.Date` fields
 * (stored as YYYY-MM-DDT00:00:00.000Z) NEVER shift backwards by one day on US/UTC servers!
 */
export function parseDobToParts(
  dob: Date | string | null | undefined
): { year: number; month: number; day: number; isoDateStr: string; dmyStr: string } | null {
  if (!dob) return null;

  let year = 0;
  let month = 0;
  let day = 0;

  if (dob instanceof Date) {
    if (isNaN(dob.getTime())) return null;
    year = dob.getUTCFullYear();
    month = dob.getUTCMonth() + 1;
    day = dob.getUTCDate();
  } else if (typeof dob === "string") {
    const trimmed = dob.trim();
    if (!trimmed) return null;

    // 1. Check ISO YYYY-MM-DD
    const isoMatch = trimmed.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
    // 2. Check DD-MM-YYYY, DD/MM/YYYY, DD.MM.YYYY
    const dmyMatch = trimmed.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);

    if (isoMatch) {
      year = parseInt(isoMatch[1], 10);
      month = parseInt(isoMatch[2], 10);
      day = parseInt(isoMatch[3], 10);
    } else if (dmyMatch) {
      day = parseInt(dmyMatch[1], 10);
      month = parseInt(dmyMatch[2], 10);
      year = parseInt(dmyMatch[3], 10);
    } else {
      const parsed = new Date(trimmed);
      if (isNaN(parsed.getTime())) return null;
      year = parsed.getUTCFullYear();
      month = parsed.getUTCMonth() + 1;
      day = parsed.getUTCDate();
    }
  } else {
    return null;
  }

  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const isoDateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const dmyStr = `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`;

  return { year, month, day, isoDateStr, dmyStr };
}

/**
 * Formats a Date of Birth into DD/MM/YYYY format for UI presentation.
 */
export function formatDobDmy(dob: Date | string | null | undefined): string {
  const parts = parseDobToParts(dob);
  return parts ? parts.dmyStr : "—";
}

/**
 * Checks if someone's birthday is TODAY strictly in Asia/Kolkata (IST).
 * - Matches day + month ONLY (birth year does NOT affect whether today is their birthday).
 * - Leap Year Rule: If born on Feb 29, in non-leap years their birthday is celebrated on Feb 28.
 */
export function isBirthdayToday(
  dob: Date | string | null | undefined,
  refDate?: Date | { month: number; day: number; year?: number } | null
): boolean {
  const parts = parseDobToParts(dob);
  if (!parts) return false;

  let targetYear: number;
  let targetMonth: number;
  let targetDay: number;

  if (refDate && typeof refDate === "object" && "month" in refDate && "day" in refDate) {
    targetMonth = refDate.month;
    targetDay = refDate.day;
    targetYear = refDate.year ?? getTodayIST().year;
  } else {
    const today = getTodayIST(refDate as Date);
    targetYear = today.year;
    targetMonth = today.month;
    targetDay = today.day;
  }

  // Exact day + month match
  if (parts.month === targetMonth && parts.day === targetDay) {
    return true;
  }

  // Leap Day rule: Born Feb 29, celebrated on Feb 28 in non-leap years
  if (parts.month === 2 && parts.day === 29 && targetMonth === 2 && targetDay === 28) {
    return !isLeapYear(targetYear);
  }

  return false;
}

/**
 * Checks if a birthday occurred within the past N days (e.g. 2 days ago, yesterday)
 * in Asia/Kolkata. Used for safety catch-up if the scheduled cron missed a day.
 */
export function isBirthdayInPastDays(
  dob: Date | string | null | undefined,
  pastDaysCount: number = 2
): { isLate: boolean; daysAgo: number; forYear: number } | null {
  const parts = parseDobToParts(dob);
  if (!parts) return false as any ? null : null;

  const today = getTodayIST();
  const currentYear = today.year;

  for (let offset = 1; offset <= pastDaysCount; offset++) {
    // Target past date in IST
    const pastDateInstant = new Date(Date.UTC(today.year, today.month - 1, today.day - offset, 12, 0, 0) - 19800000);
    const pastParts = getTodayIST(pastDateInstant);

    if (isBirthdayToday(dob, pastParts)) {
      return {
        isLate: true,
        daysAgo: offset,
        forYear: currentYear,
      };
    }
  }

  return null;
}

/**
 * Calculates days until the next occurrence of this person's birthday in Asia/Kolkata.
 * Returns 0 if today is their birthday.
 */
export function getDaysUntilBirthday(
  dob: Date | string | null | undefined,
  refDate?: Date | null
): number | null {
  const parts = parseDobToParts(dob);
  if (!parts) return null;

  const today = getTodayIST(refDate);

  if (isBirthdayToday(dob, today)) {
    return 0;
  }

  let nextYear = today.year;
  let nextMonth = parts.month;
  let nextDay = parts.day;

  // Leap year adjustment for upcoming celebration
  if (nextMonth === 2 && nextDay === 29 && !isLeapYear(nextYear)) {
    nextDay = 28;
  }

  // Check if birthday has already passed this year
  if (nextMonth < today.month || (nextMonth === today.month && nextDay < today.day)) {
    nextYear++;
    if (nextMonth === 2 && parts.day === 29 && !isLeapYear(nextYear)) {
      nextDay = 28;
    } else if (nextMonth === 2 && parts.day === 29 && isLeapYear(nextYear)) {
      nextDay = 29;
    }
  }

  const todayUtc = Date.UTC(today.year, today.month - 1, today.day);
  const nextBdayUtc = Date.UTC(nextYear, nextMonth - 1, nextDay);

  const diffDays = Math.round((nextBdayUtc - todayUtc) / (1000 * 60 * 60 * 24));
  return Math.max(diffDays, 0);
}
