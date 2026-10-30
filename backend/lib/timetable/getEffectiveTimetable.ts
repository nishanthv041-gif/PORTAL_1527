import { prisma } from "@/backend/db/prisma";

const DAYS_OF_WEEK = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];

export type TimetableScope =
  | { classId: string }
  | { teacherId: string }
  | { studentId: string }
  | { school: true };

export interface EffectiveTimetableSlot {
  id: string; // timetable id
  baseSlotId: string;
  classId: string;
  className: string;
  dayOfWeek: string;
  period: number;
  startTime: string;
  endTime: string;
  classroom?: string | null;
  isBreak: boolean;
  slotType: "LESSON" | "BREAK" | "LUNCH" | "ASSEMBLY" | "FREE" | "EXAM";
  status: "DRAFT" | "PUBLISHED";
  subjectId?: string | null;
  subjectName?: string | null;
  subjectCode?: string | null;

  // Regular assigned teacher
  regularTeacherId?: string | null;
  regularTeacherName?: string | null;

  // Substitution overlay fields
  isSubstituted: boolean;
  isSubstituteDuty?: boolean; // true if this slot is a duty assigned to the queried teacher
  isTeacherAbsent?: boolean;
  isFreePeriod?: boolean;
  substituteTeacherId?: string | null;
  substituteTeacherName?: string | null;
  substitutionId?: string | null;
  substitutionStatus?: string | null;
  note?: string | null;

  // Exam overlay fields
  hasExamOverlap?: boolean;
  examName?: string | null;
  examId?: string | null;
}

/**
 * Returns date formatted as "30 Oct 2026"
 */
export function formatSchoolDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric"
  });
}

/**
 * Normalizes any Date or YYYY-MM-DD string to start of day UTC
 */
export function normalizeDateToUTC(dateInput: Date | string): Date {
  if (typeof dateInput === "string") {
    const clean = dateInput.split("T")[0];
    return new Date(`${clean}T00:00:00.000Z`);
  }
  const y = dateInput.getFullYear();
  const m = String(dateInput.getMonth() + 1).padStart(2, "0");
  const d = String(dateInput.getDate()).padStart(2, "0");
  return new Date(`${y}-${m}-${d}T00:00:00.000Z`);
}

/**
 * Single authoritative function that merges base timetable slots with:
 * 1. That date's one-day substitutions (assigned substitute teacher or free period)
 * 2. Active teacher absences for that date
 * 3. Approved exams scheduled on that date for that class
 *
 * NEVER modifies the base timetable. Used across Admin, Teacher, Parent, and Student portals.
 */
export async function getEffectiveTimetable(
  scope: TimetableScope,
  dateInput: Date | string
): Promise<EffectiveTimetableSlot[]> {
  const targetDate = normalizeDateToUTC(dateInput);
  const dayOfWeek = DAYS_OF_WEEK[targetDate.getUTCDay()];

  // 1. Resolve student classId if scope is studentId
  let targetClassId: string | null = null;
  let targetTeacherId: string | null = null;

  if ("classId" in scope && scope.classId) {
    targetClassId = scope.classId;
  } else if ("studentId" in scope && scope.studentId) {
    const student = await prisma.student.findUnique({
      where: { id: scope.studentId },
      select: { classId: true }
    });
    targetClassId = student?.classId || null;
  } else if ("teacherId" in scope && scope.teacherId) {
    targetTeacherId = scope.teacherId;
  }

  // 2. Fetch base timetable slots matching dayOfWeek and scope
  const baseSlotsQuery: any = {
    dayOfWeek
  };

  if (targetClassId) {
    baseSlotsQuery.classId = targetClassId;
  } else if (targetTeacherId) {
    baseSlotsQuery.OR = [
      { teacherId: targetTeacherId },
      { subject: { teacherId: targetTeacherId } }
    ];
  }

  const baseSlots = await prisma.timetable.findMany({
    where: baseSlotsQuery,
    include: {
      class: { select: { id: true, name: true, section: true } },
      subject: {
        include: {
          teacher: { include: { user: { select: { name: true } } } }
        }
      },
      teacher: { include: { user: { select: { name: true } } } }
    },
    orderBy: [{ period: "asc" }, { startTime: "asc" }]
  });

  // 3. Fetch substitutions on this specific date
  const substitutions = await prisma.substitution.findMany({
    where: { date: targetDate },
    include: {
      timetableEntry: {
        include: {
          class: { select: { id: true, name: true, section: true } },
          subject: {
            include: {
              teacher: { include: { user: { select: { name: true } } } }
            }
          },
          teacher: { include: { user: { select: { name: true } } } }
        }
      },
      absentTeacher: { include: { user: { select: { name: true } } } },
      substituteTeacher: { include: { user: { select: { name: true } } } }
    }
  });

  // 4. Fetch active teacher absences on this date
  const activeAbsences = await prisma.teacherAbsence.findMany({
    where: {
      date: targetDate,
      status: "ACTIVE"
    }
  });
  const absenceMap = new Map<string, { fullDay: boolean; periods: number[] }>();
  for (const abs of activeAbsences) {
    const periods = abs.periodNumbers
      ? abs.periodNumbers.split(",").map(p => parseInt(p.trim(), 10)).filter(p => !isNaN(p))
      : [];
    absenceMap.set(abs.teacherId, {
      fullDay: abs.fullDay,
      periods
    });
  }

  // 5. Fetch approved exams on this date (exams and approved exam requests)
  const [examsOnDate, examRequestsOnDate] = await Promise.all([
    prisma.exam.findMany({
      where: { date: targetDate },
      select: { id: true, name: true, classId: true }
    }),
    prisma.examRequest.findMany({
      where: { date: targetDate, status: "APPROVED" },
      include: { subject: { select: { name: true } } }
    })
  ]);

  const examByClassMap = new Map<string, string>();
  for (const ex of examsOnDate) {
    examByClassMap.set(ex.classId, ex.name);
  }
  for (const req of examRequestsOnDate) {
    examByClassMap.set(req.classId, `${req.subject.name} Exam`);
  }

  // 6. Index substitutions by timetableEntryId
  const subBySlotId = new Map<string, typeof substitutions[0]>();
  for (const sub of substitutions) {
    subBySlotId.set(sub.timetableEntryId, sub);
  }

  // 7. Build effective timetable slots
  const effectiveSlots: EffectiveTimetableSlot[] = [];

  for (const slot of baseSlots) {
    const regularTeacherId = slot.teacherId || slot.subject?.teacherId || null;
    const regularTeacherName = slot.teacher?.user?.name || slot.subject?.teacher?.user?.name || null;
    const sub = subBySlotId.get(slot.id);

    // Check if regular teacher is marked absent for this period
    let isTeacherAbsent = false;
    if (regularTeacherId && absenceMap.has(regularTeacherId)) {
      const absInfo = absenceMap.get(regularTeacherId)!;
      if (absInfo.fullDay || absInfo.periods.includes(slot.period)) {
        isTeacherAbsent = true;
      }
    }

    const hasSub = Boolean(sub);
    const isAssigned = sub?.status === "ASSIGNED" && Boolean(sub.substituteTeacherId);
    const isFreePeriod = sub?.status === "UNASSIGNED" || (!hasSub && isTeacherAbsent);

    const examName = examByClassMap.get(slot.classId) || null;

    effectiveSlots.push({
      id: slot.id,
      baseSlotId: slot.id,
      classId: slot.classId,
      className: `${slot.class.name} - ${slot.class.section}`,
      dayOfWeek: slot.dayOfWeek,
      period: slot.period,
      startTime: slot.startTime,
      endTime: slot.endTime,
      classroom: slot.classroom,
      isBreak: slot.isBreak,
      slotType: (slot.slotType as any) || (slot.isBreak ? "BREAK" : "LESSON"),
      status: (slot.status as any) || "PUBLISHED",
      subjectId: slot.subjectId,
      subjectName: slot.subject?.name || null,
      subjectCode: slot.subject?.code || null,

      regularTeacherId,
      regularTeacherName,

      isSubstituted: hasSub || isTeacherAbsent,
      isTeacherAbsent,
      isFreePeriod,
      substituteTeacherId: sub?.substituteTeacherId || null,
      substituteTeacherName: sub?.substituteTeacher?.user?.name || null,
      substitutionId: sub?.id || null,
      substitutionStatus: sub?.status || (isTeacherAbsent ? "UNASSIGNED" : null),
      note: sub?.note || null,

      hasExamOverlap: Boolean(examName),
      examName
    });
  }

  // 8. If scope is teacherId, also include any extra substitution duties assigned to this teacher on this date
  if (targetTeacherId) {
    const extraDuties = substitutions.filter(
      s => s.substituteTeacherId === targetTeacherId && s.status === "ASSIGNED"
    );

    for (const duty of extraDuties) {
      const slot = duty.timetableEntry;
      // If duty belongs to a different class or subject not already in baseSlots
      const alreadyIncluded = effectiveSlots.some(s => s.baseSlotId === slot.id);
      if (!alreadyIncluded) {
        effectiveSlots.push({
          id: `duty-${duty.id}`,
          baseSlotId: slot.id,
          classId: slot.classId,
          className: `${slot.class.name} - ${slot.class.section}`,
          dayOfWeek: slot.dayOfWeek,
          period: slot.period,
          startTime: slot.startTime,
          endTime: slot.endTime,
          classroom: slot.classroom,
          isBreak: slot.isBreak,
          slotType: (slot.slotType as any) || "LESSON",
          status: "PUBLISHED",
          subjectId: slot.subjectId,
          subjectName: slot.subject?.name || null,
          subjectCode: slot.subject?.code || null,

          regularTeacherId: duty.absentTeacherId,
          regularTeacherName: duty.absentTeacher?.user?.name || "Absent Colleague",

          isSubstituted: true,
          isSubstituteDuty: true,
          substituteTeacherId: targetTeacherId,
          substituteTeacherName: duty.substituteTeacher?.user?.name || null,
          substitutionId: duty.id,
          substitutionStatus: "ASSIGNED",
          note: duty.note || `Covering for ${duty.absentTeacher?.user?.name || "Absent Teacher"}`
        });
      }
    }
  }

  // Sort chronologically by period
  effectiveSlots.sort((a, b) => a.period - b.period);

  return effectiveSlots;
}

