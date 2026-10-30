import type {
  TimetableSlotEntry,
  TimetableConflict,
  PeriodSlotData,
  TeacherLoad,
  SubjectScheduleSummary
} from "./timetableTypes";

export interface ConflictEngineInput {
  targetClassId?: string;
  allSchoolSlots: TimetableSlotEntry[];
  periodSlots: PeriodSlotData[];
  teacherLoads: TeacherLoad[];
  subjectSummaries: SubjectScheduleSummary[];
  teachersOnLeave?: Array<{ teacherId: string; date?: string; dayOfWeek?: string; fullDay?: boolean; periodNumbers?: number[] }>;
}

/**
 * Deterministic Conflict & Warning Analysis Engine
 */
export function analyzeTimetableConflicts(input: ConflictEngineInput): {
  hardConflicts: TimetableConflict[];
  softWarnings: TimetableConflict[];
  canPublish: boolean;
  publishBlockReasons: string[];
} {
  const hardConflicts: TimetableConflict[] = [];
  const softWarnings: TimetableConflict[] = [];
  const publishBlockReasons: string[] = [];

  const { allSchoolSlots, periodSlots, teacherLoads, subjectSummaries, teachersOnLeave = [], targetClassId } = input;

  // 1. Identify non-teaching period numbers from PeriodSlots
  const nonTeachingPeriods = new Set<number>();
  for (const ps of periodSlots) {
    if (ps.type === "BREAK" || ps.type === "LUNCH") {
      nonTeachingPeriods.add(ps.order);
    }
  }

  // 2. Index slots for collision detection
  // Key: day-period-teacherId
  const teacherOccupancy = new Map<string, TimetableSlotEntry[]>();
  // Key: day-period-classId
  const classOccupancy = new Map<string, TimetableSlotEntry[]>();
  // Key: day-period-classroom
  const roomOccupancy = new Map<string, TimetableSlotEntry[]>();

  for (const slot of allSchoolSlots) {
    const isBreak = slot.isBreak || slot.slotType === "BREAK" || slot.slotType === "LUNCH";
    const day = (slot.dayOfWeek || "").toUpperCase();
    const p = slot.period;

    // Check: Lesson placed in a designated Break/Lunch slot
    if (!isBreak && nonTeachingPeriods.has(p)) {
      if (!targetClassId || slot.classId === targetClassId) {
        hardConflicts.push({
          id: `break-clash-${slot.id || `${day}-${p}`}`,
          type: "HARD",
          category: "LESSON_IN_BREAK",
          title: "Lesson in Non-Teaching Slot",
          message: `Period ${p} is designated as Break/Lunch in the period structure. Teaching subjects cannot be scheduled here.`,
          dayOfWeek: day,
          period: p,
          classId: slot.classId,
          subjectId: slot.subjectId || undefined,
          subjectName: slot.subjectName || undefined,
          slotId: slot.id
        });
      }
    }

    if (isBreak) continue;

    // Check: Subject has no assigned teacher
    if (slot.subjectId && !slot.teacherId && (!targetClassId || slot.classId === targetClassId)) {
      hardConflicts.push({
        id: `no-teacher-${slot.id || `${day}-${p}`}`,
        type: "HARD",
        category: "UNASSIGNED_TEACHER",
        title: "Unassigned Teacher",
        message: `${slot.subjectName || "Subject"} in Period ${p} has no assigned teacher.`,
        dayOfWeek: day,
        period: p,
        classId: slot.classId,
        subjectId: slot.subjectId,
        subjectName: slot.subjectName || undefined,
        slotId: slot.id
      });
    }

    // Teacher index
    if (slot.teacherId) {
      const tKey = `${day}-${p}-${slot.teacherId}`;
      if (!teacherOccupancy.has(tKey)) teacherOccupancy.set(tKey, []);
      teacherOccupancy.get(tKey)!.push(slot);
    }

    // Class index
    if (slot.classId) {
      const cKey = `${day}-${p}-${slot.classId}`;
      if (!classOccupancy.has(cKey)) classOccupancy.set(cKey, []);
      classOccupancy.get(cKey)!.push(slot);
    }

    // Room index
    if (slot.classroom && slot.classroom.trim().length > 0) {
      const rKey = `${day}-${p}-${slot.classroom.trim().toLowerCase()}`;
      if (!roomOccupancy.has(rKey)) roomOccupancy.set(rKey, []);
      roomOccupancy.get(rKey)!.push(slot);
    }
  }

  // 3. HARD CONFLICT: Teacher Clash (same teacher in two classes in same day & period)
  for (const [tKey, slots] of teacherOccupancy.entries()) {
    if (slots.length > 1) {
      const first = slots[0];
      const second = slots[1];
      const affectsTarget = !targetClassId || slots.some(s => s.classId === targetClassId);

      if (affectsTarget) {
        const teacherName = first.teacherName || "Teacher";
        hardConflicts.push({
          id: `t-clash-${tKey}`,
          type: "HARD",
          category: "TEACHER_CLASH",
          title: "Teacher Schedule Clash",
          message: `${teacherName} is double-booked on ${first.dayOfWeek} Period ${first.period} across multiple classes.`,
          dayOfWeek: first.dayOfWeek,
          period: first.period,
          teacherId: first.teacherId || undefined,
          teacherName,
          classId: first.classId,
          slotId: first.id
        });
      }
    }
  }

  // 4. HARD CONFLICT: Class Clash (class has two subjects in same day & period)
  for (const [cKey, slots] of classOccupancy.entries()) {
    if (slots.length > 1) {
      const first = slots[0];
      const affectsTarget = !targetClassId || first.classId === targetClassId;

      if (affectsTarget) {
        hardConflicts.push({
          id: `c-clash-${cKey}`,
          type: "HARD",
          category: "CLASS_CLASH",
          title: "Class Double Booking",
          message: `Class has multiple subjects assigned on ${first.dayOfWeek} Period ${first.period}.`,
          dayOfWeek: first.dayOfWeek,
          period: first.period,
          classId: first.classId,
          slotId: first.id
        });
      }
    }
  }

  // 5. HARD CONFLICT: Room Clash (room double-booked in same day & period)
  for (const [rKey, slots] of roomOccupancy.entries()) {
    if (slots.length > 1) {
      const first = slots[0];
      const affectsTarget = !targetClassId || slots.some(s => s.classId === targetClassId);

      if (affectsTarget) {
        hardConflicts.push({
          id: `r-clash-${rKey}`,
          type: "HARD",
          category: "ROOM_CLASH",
          title: "Room Clash",
          message: `Room "${first.classroom}" is double-booked on ${first.dayOfWeek} Period ${first.period}.`,
          dayOfWeek: first.dayOfWeek,
          period: first.period,
          roomId: first.classroom || undefined,
          classId: first.classId,
          slotId: first.id
        });
      }
    }
  }

  // 6. HARD CONFLICT: Teacher on Leave
  for (const leave of teachersOnLeave) {
    if (!leave.dayOfWeek) continue;
    const leaveDay = leave.dayOfWeek.toUpperCase();
    for (const slot of allSchoolSlots) {
      if (slot.isBreak || slot.slotType === "BREAK" || slot.slotType === "LUNCH") continue;
      if (slot.teacherId === leave.teacherId && (slot.dayOfWeek || "").toUpperCase() === leaveDay) {
        if (leave.fullDay || leave.periodNumbers?.includes(slot.period)) {
          if (!targetClassId || slot.classId === targetClassId) {
            hardConflicts.push({
              id: `leave-clash-${slot.id || `${leaveDay}-${slot.period}`}`,
              type: "HARD",
              category: "TEACHER_ON_LEAVE",
              title: "Teacher on Approved Leave",
              message: `${slot.teacherName || "Teacher"} is on approved leave on ${leaveDay} Period ${slot.period}.`,
              dayOfWeek: leaveDay,
              period: slot.period,
              teacherId: slot.teacherId,
              teacherName: slot.teacherName || undefined,
              classId: slot.classId,
              slotId: slot.id
            });
          }
        }
      }
    }
  }

  // 7. SOFT WARNING: Teacher Overload
  for (const tLoad of teacherLoads) {
    if (tLoad.isOverloaded) {
      softWarnings.push({
        id: `overload-${tLoad.teacherId}`,
        type: "SOFT",
        category: "TEACHER_OVERLOAD",
        title: "Teacher Workload Limit Exceeded",
        message: `${tLoad.teacherName} is scheduled for ${tLoad.totalPeriodsPerWeek} periods/week (max: ${tLoad.maxPeriodsPerWeek}) or exceeds daily limit of ${tLoad.maxPeriodsPerDay} periods.`,
        dayOfWeek: "WEEKLY",
        period: 0,
        teacherId: tLoad.teacherId,
        teacherName: tLoad.teacherName
      });
    }
  }

  // 8. SOFT WARNING: Subject repeated > 2 times on the same day for a single class
  const classDaySubjectCount = new Map<string, { count: number; sample: TimetableSlotEntry }>();
  for (const slot of allSchoolSlots) {
    if (slot.isBreak || !slot.subjectId) continue;
    if (targetClassId && slot.classId !== targetClassId) continue;

    const day = (slot.dayOfWeek || "").toUpperCase();
    const key = `${slot.classId}-${day}-${slot.subjectId}`;
    const cur = classDaySubjectCount.get(key) || { count: 0, sample: slot };
    cur.count += 1;
    classDaySubjectCount.set(key, cur);
  }

  for (const [key, { count, sample }] of classDaySubjectCount.entries()) {
    if (count > 2) {
      softWarnings.push({
        id: `repeat-${key}`,
        type: "SOFT",
        category: "UNBALANCED_SUBJECT",
        title: "Subject Scheduled Multiple Times",
        message: `${sample.subjectName || "Subject"} is scheduled ${count} times on ${sample.dayOfWeek}. Consider distributing across other days.`,
        dayOfWeek: sample.dayOfWeek,
        period: sample.period,
        classId: sample.classId,
        subjectId: sample.subjectId || undefined,
        subjectName: sample.subjectName || undefined,
        slotId: sample.id
      });
    }
  }

  // 9. SOFT WARNING: Consecutive Periods Overload (> 3 consecutive lessons for same teacher without break)
  const teacherDayPeriods = new Map<string, number[]>();
  for (const slot of allSchoolSlots) {
    if (slot.isBreak || !slot.teacherId) continue;
    const day = (slot.dayOfWeek || "").toUpperCase();
    const key = `${slot.teacherId}-${day}`;
    if (!teacherDayPeriods.has(key)) teacherDayPeriods.set(key, []);
    teacherDayPeriods.get(key)!.push(slot.period);
  }

  for (const [key, periods] of teacherDayPeriods.entries()) {
    periods.sort((a, b) => a - b);
    let consecutive = 1;
    for (let i = 1; i < periods.length; i++) {
      if (periods[i] === periods[i - 1] + 1) {
        consecutive++;
        if (consecutive > 3) {
          const [tId, day] = key.split("-");
          const tName = teacherLoads.find(t => t.teacherId === tId)?.teacherName || "Teacher";
          softWarnings.push({
            id: `consecutive-${key}-${periods[i]}`,
            type: "SOFT",
            category: "CONSECUTIVE_OVERLOAD",
            title: "Consecutive Periods Warning",
            message: `${tName} has ${consecutive} back-to-back periods on ${day}. Recommend inserting a break.`,
            dayOfWeek: day,
            period: periods[i],
            teacherId: tId,
            teacherName: tName
          });
          break;
        }
      } else {
        consecutive = 1;
      }
    }
  }

  // Build publish block reasons
  if (hardConflicts.length > 0) {
    for (const c of hardConflicts) {
      publishBlockReasons.push(`${c.title}: ${c.message}`);
    }
  }

  return {
    hardConflicts,
    softWarnings,
    canPublish: hardConflicts.length === 0,
    publishBlockReasons
  };
}
