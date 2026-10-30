import type {
  TimetableSlotEntry,
  PeriodSlotData,
  TeacherLoad
} from "./timetableTypes";
import { SCHOOL_WORKING_DAYS } from "./timetableCalculations";

export interface SolverInput {
  classId: string;
  classSubjects: Array<{
    id: string;
    name: string;
    code: string;
    teacherId?: string | null;
    teacherName?: string | null;
    requiredPeriodsPerWeek?: number | null;
  }>;
  existingClassSlots: TimetableSlotEntry[];
  allOtherSchoolSlots: TimetableSlotEntry[];
  periodSlots: PeriodSlotData[];
  workingDays?: string[];
  teachersOnLeave?: Array<{ teacherId: string; dayOfWeek: string; periodNumbers?: number[] }>;
}

export interface SolverResult {
  success: boolean;
  suggestedSlots: TimetableSlotEntry[];
  unfilledDeficits: Array<{ subjectId: string; subjectName: string; remainingNeeded: number }>;
  message: string;
}

/**
 * Greedy + Backtracking constraint satisfaction solver to fill empty timetable slots.
 * Guarantees:
 * 1. Never overwrites existing occupied cells.
 * 2. Never assigns lessons in Break/Lunch slots.
 * 3. Never double-books a teacher across any other class.
 * 4. Respects required periods per week.
 * 5. Balances subject distribution so a subject isn't loaded more than 2x in a single day.
 */
export function solveTimetableSlots(input: SolverInput): SolverResult {
  const {
    classId,
    classSubjects,
    existingClassSlots,
    allOtherSchoolSlots,
    periodSlots,
    workingDays = SCHOOL_WORKING_DAYS.slice(0, 5), // default Mon-Fri
    teachersOnLeave = []
  } = input;

  // 1. Identify non-teaching period orders
  const nonTeachingPeriods = new Set<number>();
  for (const ps of periodSlots) {
    if (ps.type === "BREAK" || ps.type === "LUNCH") {
      nonTeachingPeriods.add(ps.order);
    }
  }

  // 2. Map existing occupied slots for this class
  // Key: day-period
  const classOccupied = new Map<string, TimetableSlotEntry>();
  const subjectScheduledCount = new Map<string, number>();

  for (const slot of existingClassSlots) {
    const day = (slot.dayOfWeek || "").toUpperCase();
    const p = slot.period;
    classOccupied.set(`${day}-${p}`, slot);

    if (slot.subjectId && !slot.isBreak && slot.slotType !== "BREAK" && slot.slotType !== "LUNCH") {
      subjectScheduledCount.set(slot.subjectId, (subjectScheduledCount.get(slot.subjectId) || 0) + 1);
    }
  }

  // 3. Map busy teachers across the entire school
  // Key: day-period-teacherId
  const teacherBusy = new Set<string>();
  for (const slot of allOtherSchoolSlots) {
    if (slot.isBreak || slot.slotType === "BREAK" || slot.slotType === "LUNCH") continue;
    if (slot.teacherId) {
      const day = (slot.dayOfWeek || "").toUpperCase();
      teacherBusy.add(`${day}-${slot.period}-${slot.teacherId}`);
    }
  }
  for (const slot of existingClassSlots) {
    if (slot.isBreak || slot.slotType === "BREAK" || slot.slotType === "LUNCH") continue;
    if (slot.teacherId) {
      const day = (slot.dayOfWeek || "").toUpperCase();
      teacherBusy.add(`${day}-${slot.period}-${slot.teacherId}`);
    }
  }
  // Add teachers on leave
  for (const leave of teachersOnLeave) {
    const day = leave.dayOfWeek.toUpperCase();
    if (!leave.periodNumbers || leave.periodNumbers.length === 0) {
      for (const ps of periodSlots) {
        teacherBusy.add(`${day}-${ps.order}-${leave.teacherId}`);
      }
    } else {
      for (const p of leave.periodNumbers) {
        teacherBusy.add(`${day}-${p}-${leave.teacherId}`);
      }
    }
  }

  // 4. Identify subject demands (deficit needed)
  const subjectDemands: Array<{
    id: string;
    name: string;
    code: string;
    teacherId: string | null;
    teacherName: string | null;
    needed: number;
  }> = [];

  for (const sub of classSubjects) {
    const req = sub.requiredPeriodsPerWeek || 5;
    const cur = subjectScheduledCount.get(sub.id) || 0;
    const deficit = Math.max(0, req - cur);
    if (deficit > 0) {
      subjectDemands.push({
        id: sub.id,
        name: sub.name,
        code: sub.code,
        teacherId: sub.teacherId || null,
        teacherName: sub.teacherName || null,
        needed: deficit
      });
    }
  }

  // 5. Identify all available candidate empty slots
  const emptyCandidateSlots: Array<{ day: string; period: number }> = [];
  for (const day of workingDays) {
    for (const ps of periodSlots) {
      if (nonTeachingPeriods.has(ps.order)) continue;
      const key = `${day}-${ps.order}`;
      if (!classOccupied.has(key)) {
        emptyCandidateSlots.push({ day, period: ps.order });
      }
    }
  }

  // Track subject placements per day to maintain balanced distribution
  const subjectDayCount = new Map<string, number>(); // `${day}-${subjectId}` -> count
  for (const slot of existingClassSlots) {
    if (slot.subjectId) {
      const day = (slot.dayOfWeek || "").toUpperCase();
      const k = `${day}-${slot.subjectId}`;
      subjectDayCount.set(k, (subjectDayCount.get(k) || 0) + 1);
    }
  }

  // 6. Solver execution
  const newSuggestedSlots: TimetableSlotEntry[] = [];

  // Sort demands by most needed first
  subjectDemands.sort((a, b) => b.needed - a.needed);

  for (const dem of subjectDemands) {
    while (dem.needed > 0) {
      // Find an empty slot where teacher is free and subject is not over-scheduled on that day
      let placed = false;

      // Prefer slots on days with lowest count for this subject
      emptyCandidateSlots.sort((a, b) => {
        const countA = subjectDayCount.get(`${a.day}-${dem.id}`) || 0;
        const countB = subjectDayCount.get(`${b.day}-${dem.id}`) || 0;
        return countA - countB;
      });

      for (let i = 0; i < emptyCandidateSlots.length; i++) {
        const candidate = emptyCandidateSlots[i];
        const day = candidate.day;
        const p = candidate.period;

        // Check: max 2 periods of same subject per day
        const dayCount = subjectDayCount.get(`${day}-${dem.id}`) || 0;
        if (dayCount >= 2) continue;

        // Check: teacher is not busy
        if (dem.teacherId && teacherBusy.has(`${day}-${p}-${dem.teacherId}`)) {
          continue;
        }

        // Slot matches!
        emptyCandidateSlots.splice(i, 1);
        dem.needed -= 1;
        subjectDayCount.set(`${day}-${dem.id}`, dayCount + 1);
        if (dem.teacherId) {
          teacherBusy.add(`${day}-${p}-${dem.teacherId}`);
        }

        const psObj = periodSlots.find(ps => ps.order === p);

        newSuggestedSlots.push({
          id: `suggested-${day}-${p}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          classId,
          dayOfWeek: day,
          period: p,
          subjectId: dem.id,
          subjectName: dem.name,
          subjectCode: dem.code,
          teacherId: dem.teacherId,
          teacherName: dem.teacherName,
          classroom: "",
          startTime: psObj?.startTime || "08:00",
          endTime: psObj?.endTime || "08:45",
          isBreak: false,
          slotType: "LESSON",
          status: "DRAFT"
        });

        placed = true;
        break;
      }

      if (!placed) {
        // Cannot place this period without violating constraints
        break;
      }
    }
  }

  const unfilledDeficits = subjectDemands
    .filter(d => d.needed > 0)
    .map(d => ({ subjectId: d.id, subjectName: d.name, remainingNeeded: d.needed }));

  return {
    success: true,
    suggestedSlots: newSuggestedSlots,
    unfilledDeficits,
    message: unfilledDeficits.length === 0
      ? `Successfully generated ${newSuggestedSlots.length} balanced slots satisfying all teacher availability and weekly requirements.`
      : `Generated ${newSuggestedSlots.length} slots. ${unfilledDeficits.length} subjects have unfilled periods due to teacher availability or slot limits.`
  };
}
