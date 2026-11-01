import { Prisma } from "@prisma/client";

export const RESIDENCE_TYPE_DAYSCHOLAR = "DAYSCHOLAR";
export const RESIDENCE_TYPE_HOSTEL = "HOSTEL";

/**
 * Single source of truth for Prisma queries:
 * An active Day Scholar student.
 * Never matches any student with residenceType "HOSTEL" or isActive false.
 */
export function getDayScholarWhere(): Prisma.StudentWhereInput {
  return {
    isActive: true,
    OR: [
      { residenceType: RESIDENCE_TYPE_DAYSCHOLAR },
      { residenceType: null }, // defaults to DAYSCHOLAR in schema
    ],
    NOT: {
      residenceType: RESIDENCE_TYPE_HOSTEL,
    },
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
 */
export function isDayScholarStudent(student?: {
  residenceType?: string | null;
  isActive?: boolean | null;
} | null): boolean {
  if (!student) return false;
  if (student.isActive === false) return false;
  if (!student.residenceType) return true; // defaults to DAYSCHOLAR
  const val = String(student.residenceType).trim().toUpperCase();
  return val !== RESIDENCE_TYPE_HOSTEL && (val === RESIDENCE_TYPE_DAYSCHOLAR || val.includes("DAY"));
}

