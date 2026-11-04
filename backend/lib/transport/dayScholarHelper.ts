import { Prisma } from "@prisma/client";

export const RESIDENCE_TYPE_DAYSCHOLAR = "DAYSCHOLAR";
export const RESIDENCE_TYPE_HOSTEL = "HOSTEL";

/**
 * Single source of truth for Prisma queries:
 * An active Day Scholar student.
 * Never matches any student with residenceType containing "HOSTEL" or isActive false.
 */
export function getDayScholarWhere(): Prisma.StudentWhereInput {
  return {
    isActive: true,
    OR: [
      { residenceType: { in: ["DAYSCHOLAR", "DAY_SCHOLAR", "Day Scholar", "day scholar", "DAYSCHOLAR "] } },
      { residenceType: null },
      { residenceType: "" },
    ],
    NOT: [
      { residenceType: { in: ["HOSTEL", "HOSTELER", "Hostel", "hostel", "Hosteler", "hosteler", "HOSTEL "] } },
    ],
  };
}

/**
 * Returns Prisma where condition for BusStudent assignments
 * ensuring the assigned student is strictly a valid, active Day Scholar.
 */
export function getDayScholarBusStudentWhere(academicYear?: string): Prisma.BusStudentWhereInput {
  return {
    ...(academicYear ? { academicYear } : {}),
    student: getDayScholarWhere(),
  };
}

/**
 * Synchronous validation helper for student objects.
 * Strictly guarantees that hostel students are NEVER treated as day scholars.
 */
export function isDayScholarStudent(student?: {
  residenceType?: string | null;
  isActive?: boolean | null;
} | null): boolean {
  if (!student) return false;
  if (student.isActive === false) return false;
  if (!student.residenceType || student.residenceType.trim() === "") return true; // defaults to DAYSCHOLAR
  const val = String(student.residenceType).trim().toUpperCase();
  if (val.includes("HOSTEL")) return false;
  return val.includes("DAY") || val === RESIDENCE_TYPE_DAYSCHOLAR;
}

