import { z } from "zod";
import { getSchoolNow } from "@/lib/time";

export type RoleType = "STUDENT" | "TEACHER" | "STAFF" | "ADMIN" | "PARENT" | "DRIVER";

export interface ParsedDobResult {
  isValid: boolean;
  dateStr?: string; // YYYY-MM-DD
  year?: number;
  month?: number;
  day?: number;
  age?: number;
  error?: string;
  warning?: string;
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
}

function getDaysInMonth(year: number, month: number): number {
  if (month === 2) {
    return isLeapYear(year) ? 29 : 28;
  }
  if ([4, 6, 9, 11].includes(month)) {
    return 30;
  }
  return 31;
}

/**
 * Strict calendar date parser with India day-first precedence.
 * Parses:
 *  - YYYY-MM-DD (ISO)
 *  - DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY
 * Validates real calendar dates (rejects 31/02/2015, month > 12, day > 31).
 */
export function parseAndValidateDob(
  input: string | Date | null | undefined,
  role: RoleType = "STUDENT",
  required: boolean = true
): ParsedDobResult {
  if (!input) {
    if (required) {
      return { isValid: false, error: "Date of Birth is required." };
    }
    return { isValid: true };
  }

  let str = "";
  if (input instanceof Date) {
    if (isNaN(input.getTime())) return { isValid: false, error: "Invalid calendar date." };
    // Use UTC date parts so that Prisma @db.Date (stored as YYYY-MM-DDT00:00:00.000Z)
    // never shifts by -1 day in servers or environments with timezones behind UTC
    const y = input.getUTCFullYear();
    const m = String(input.getUTCMonth() + 1).padStart(2, "0");
    const d = String(input.getUTCDate()).padStart(2, "0");
    str = `${y}-${m}-${d}`;
  } else {
    str = String(input).trim();
  }

  if (!str) {
    if (required) return { isValid: false, error: "Date of Birth is required." };
    return { isValid: true };
  }

  let year = 0;
  let month = 0;
  let day = 0;

  // 1. Check ISO YYYY-MM-DD
  const isoMatch = str.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  // 2. Check DD-MM-YYYY, DD/MM/YYYY, DD.MM.YYYY
  const dmyMatch = str.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);

  if (isoMatch) {
    year = parseInt(isoMatch[1], 10);
    month = parseInt(isoMatch[2], 10);
    day = parseInt(isoMatch[3], 10);
  } else if (dmyMatch) {
    day = parseInt(dmyMatch[1], 10);
    month = parseInt(dmyMatch[2], 10);
    year = parseInt(dmyMatch[3], 10);
  } else {
    return {
      isValid: false,
      error: "Invalid date format. Use YYYY-MM-DD or DD-MM-YYYY.",
    };
  }

  // Basic numeric range checks
  if (year < 1920 || year > 2100) {
    return { isValid: false, error: `Invalid year (${year}).` };
  }
  if (month < 1 || month > 12) {
    return { isValid: false, error: `Invalid month (${month}). Must be 1 to 12.` };
  }

  const maxDays = getDaysInMonth(year, month);
  if (day < 1 || day > maxDays) {
    return {
      isValid: false,
      error: `Invalid day (${day}) for ${month}/${year}. Max allowed is ${maxDays}.`,
    };
  }

  const schoolNow = getSchoolNow();
  const todayYear = schoolNow.year;
  const todayMonth = schoolNow.month;
  const todayDay = schoolNow.day;

  // Future date check
  if (
    year > todayYear ||
    (year === todayYear && month > todayMonth) ||
    (year === todayYear && month === todayMonth && day > todayDay)
  ) {
    return { isValid: false, error: "Date of Birth cannot be in the future." };
  }

  // Calculate age accurately
  let age = todayYear - year;
  if (todayMonth < month || (todayMonth === month && todayDay < day)) {
    age--;
  }

  const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  // Plausible age range check per role
  let warning: string | undefined;
  if (role === "STUDENT") {
    if (age < 2 || age > 25) {
      warning = `Student age (${age} yrs) outside typical school range (2 to 25 years).`;
    }
  } else {
    // Adult roles: TEACHER, STAFF, ADMIN, PARENT, DRIVER
    if (age < 18 || age > 80) {
      warning = `Age (${age} yrs) outside typical adult range (18 to 80 years).`;
    }
  }

  return {
    isValid: true,
    dateStr,
    year,
    month,
    day,
    age,
    warning,
  };
}

/**
 * Shared Zod schema builder for Date of Birth fields
 */
export function dobZodSchema(role: RoleType = "STUDENT", required: boolean = true) {
  return z
    .string()
    .optional()
    .nullable()
    .superRefine((val, ctx) => {
      if (!val && !required) return;
      const res = parseAndValidateDob(val, role, required);
      if (!res.isValid) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: res.error || "Invalid date of birth",
        });
      }
    });
}
