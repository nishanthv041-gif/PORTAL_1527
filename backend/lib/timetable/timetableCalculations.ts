import type {
  PeriodSlotData,
  TimetableSlotEntry,
  SubjectScheduleSummary,
  TeacherLoad,
  PeriodType,
  FreeTeacherInfo,
  BusyTeacherInfo,
  PeriodStaffAvailability,
  DayFreeStaffSummary
} from "./timetableTypes";

export const SCHOOL_WORKING_DAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];

/**
 * Converts "HH:MM" string to minutes from midnight
 */
export function timeToMinutes(timeStr: string): number {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/**
 * Validates an array of period slots:
 * - End time must be after start time
 * - Slots must be in strictly ascending order without overlaps
 */
export function validatePeriodSlots(slots: PeriodSlotData[]): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  if (!slots || slots.length === 0) {
    return { valid: false, errors: ["At least one period slot is required."] };
  }

  // Sort by order
  const sorted = [...slots].sort((a, b) => a.order - b.order);

  for (let i = 0; i < sorted.length; i++) {
    const cur = sorted[i];
    const startMin = timeToMinutes(cur.startTime);
    const endMin = timeToMinutes(cur.endTime);

    if (endMin <= startMin) {
      errors.push(`${cur.label || `Period ${cur.order}`}: End time (${cur.endTime}) must be strictly after start time (${cur.startTime}).`);
    }

    if (i > 0) {
      const prev = sorted[i - 1];
      const prevEndMin = timeToMinutes(prev.endTime);
      if (startMin < prevEndMin) {
        errors.push(`${cur.label || `Period ${cur.order}`} starts at ${cur.startTime}, overlapping with previous ${prev.label || `Period ${prev.order}`} which ends at ${prev.endTime}.`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Quick generation of standard period slots
 */
export function generateQuickPeriodSlots(config: {
  startTime: string; // e.g. "08:00"
  lessonDurationMinutes: number; // e.g. 45
  totalPeriods: number; // e.g. 8
  breakAfterPeriod?: number; // e.g. 2
  breakDurationMinutes?: number; // e.g. 15
  lunchAfterPeriod?: number; // e.g. 5
  lunchDurationMinutes?: number; // e.g. 45
}): PeriodSlotData[] {
  const slots: PeriodSlotData[] = [];
  let curMin = timeToMinutes(config.startTime);
  let periodCounter = 1;

  const minToTimeStr = (min: number) => {
    const h = Math.floor(min / 60).toString().padStart(2, "0");
    const m = (min % 60).toString().padStart(2, "0");
    return `${h}:${m}`;
  };

  for (let i = 1; i <= config.totalPeriods; i++) {
    const startStr = minToTimeStr(curMin);
    curMin += config.lessonDurationMinutes;
    const endStr = minToTimeStr(curMin);

    slots.push({
      order: periodCounter++,
      label: `Period ${i}`,
      startTime: startStr,
      endTime: endStr,
      type: "LESSON"
    });

    // Check if break comes after this period
    if (config.breakAfterPeriod && i === config.breakAfterPeriod && config.breakDurationMinutes) {
      const bStart = minToTimeStr(curMin);
      curMin += config.breakDurationMinutes;
      const bEnd = minToTimeStr(curMin);
      slots.push({
        order: periodCounter++,
        label: "Break",
        startTime: bStart,
        endTime: bEnd,
        type: "BREAK"
      });
    }

    // Check if lunch comes after this period
    if (config.lunchAfterPeriod && i === config.lunchAfterPeriod && config.lunchDurationMinutes) {
      const lStart = minToTimeStr(curMin);
      curMin += config.lunchDurationMinutes;
      const lEnd = minToTimeStr(curMin);
      slots.push({
        order: periodCounter++,
        label: "Lunch Break",
        startTime: lStart,
        endTime: lEnd,
        type: "LUNCH"
      });
    }
  }

  return slots;
}

/**
 * Computes required vs scheduled periods for all subjects in a class
 */
export function calculateSubjectSummaries(
  subjectsOrOptions: any,
  timetableSlotsArg?: TimetableSlotEntry[]
): SubjectScheduleSummary[] {
  let subjects: Array<{
    id: string;
    name: string;
    code: string;
    requiredPeriodsPerWeek?: number | null;
    teacherId?: string | null;
    teacherName?: string | null;
  }> = [];
  let timetableSlots: TimetableSlotEntry[] = [];

  if (Array.isArray(subjectsOrOptions)) {
    subjects = subjectsOrOptions;
    timetableSlots = timetableSlotsArg || [];
  } else if (subjectsOrOptions && typeof subjectsOrOptions === "object") {
    subjects = subjectsOrOptions.subjects || subjectsOrOptions.classSubjects || [];
    timetableSlots = subjectsOrOptions.timetableSlots || subjectsOrOptions.classSlots || [];
  }

  const countsBySubject = new Map<string, number>();

  for (const slot of timetableSlots) {
    if (slot.isBreak || slot.slotType === "BREAK" || slot.slotType === "LUNCH") continue;
    if (!slot.subjectId) continue;
    countsBySubject.set(slot.subjectId, (countsBySubject.get(slot.subjectId) || 0) + 1);
  }

  return subjects.map(sub => {
    const req = sub.requiredPeriodsPerWeek || 5;
    const scheduled = countsBySubject.get(sub.id) || 0;
    const diff = scheduled - req;
    let status: SubjectScheduleSummary["status"] = "MATCHED";
    if (diff < 0) status = "DEFICIT";
    if (diff > 0) status = "SURPLUS";

    return {
      subjectId: sub.id,
      subjectName: sub.name,
      code: sub.code,
      requiredPeriodsPerWeek: req,
      scheduledPeriodsPerWeek: scheduled,
      difference: diff,
      status,
      teacherId: sub.teacherId,
      teacherName: sub.teacherName
    };
  });
}

/**
 * Calculates teacher utilization, periods per day, and free periods across the school
 */
export function calculateTeacherLoads(
  teachersOrOptions: any,
  allSchoolSlotsArg?: TimetableSlotEntry[],
  workingDaysArg: string[] = SCHOOL_WORKING_DAYS,
  totalLessonPeriodsArg: number = 8
): TeacherLoad[] {
  let teachers: Array<{
    id: string;
    name: string;
    maxPeriodsPerDay?: number | null;
    maxPeriodsPerWeek?: number | null;
  }> = [];
  let allSchoolSlots: TimetableSlotEntry[] = [];
  let workingDays = workingDaysArg;
  let totalLessonPeriods = totalLessonPeriodsArg;

  if (Array.isArray(teachersOrOptions)) {
    teachers = teachersOrOptions;
    allSchoolSlots = allSchoolSlotsArg || [];
  } else if (teachersOrOptions && typeof teachersOrOptions === "object") {
    teachers = teachersOrOptions.teachers || [];
    allSchoolSlots = teachersOrOptions.allSchoolSlots || [];
    if (teachersOrOptions.workingDays) workingDays = teachersOrOptions.workingDays;
    if (teachersOrOptions.totalLessonPeriods) totalLessonPeriods = teachersOrOptions.totalLessonPeriods;
  }
  return teachers.map(t => {
    const maxPerDay = t.maxPeriodsPerDay || 6;
    const maxPerWeek = t.maxPeriodsPerWeek || 30;

    const periodsPerDay: Record<string, number> = {};
    const occupiedSlotsPerDay: Record<string, Set<number>> = {};

    for (const day of workingDays) {
      periodsPerDay[day] = 0;
      occupiedSlotsPerDay[day] = new Set<number>();
    }

    for (const slot of allSchoolSlots) {
      if (slot.isBreak || slot.slotType === "BREAK" || slot.slotType === "LUNCH") continue;
      const tMatch = slot.teacherId === t.id || (slot as any).subject?.teacherId === t.id;
      if (tMatch) {
        const d = (slot.dayOfWeek || "").toUpperCase();
        if (periodsPerDay[d] !== undefined) {
          periodsPerDay[d] += 1;
          occupiedSlotsPerDay[d].add(slot.period);
        }
      }
    }

    let totalPeriodsPerWeek = 0;
    const freeSlotsPerDay: Record<string, number[]> = {};

    for (const day of workingDays) {
      totalPeriodsPerWeek += periodsPerDay[day] || 0;

      // Identify free periods
      const freeList: number[] = [];
      for (let p = 1; p <= totalLessonPeriods; p++) {
        if (!occupiedSlotsPerDay[day]?.has(p)) {
          freeList.push(p);
        }
      }
      freeSlotsPerDay[day] = freeList;
    }

    const utilization = maxPerWeek > 0
      ? Math.round((totalPeriodsPerWeek / maxPerWeek) * 100)
      : 0;

    const isOverloaded = totalPeriodsPerWeek > maxPerWeek || Object.values(periodsPerDay).some(p => p > maxPerDay);

    return {
      teacherId: t.id,
      teacherName: t.name,
      periodsPerDay,
      totalPeriodsPerWeek,
      maxPeriodsPerDay: maxPerDay,
      maxPeriodsPerWeek: maxPerWeek,
      utilizationPercentage: utilization,
      freeSlotsPerDay,
      isOverloaded
    };
  });
}

/**
 * Calculates real-time free period staff and teachers for a specific day and period slots
 */
export function calculateFreePeriodStaff(params: {
  dayOfWeek: string;
  periodSlots: PeriodSlotData[];
  allSchoolSlots: any[];
  allTeachers: Array<{
    id: string;
    name: string;
    email?: string;
    maxPeriodsPerDay?: number | null;
    subjects?: string[];
  }>;
  classes?: Array<{ id: string; name: string; section: string }>;
  absencesToday?: Array<{ teacherId: string; fullDay: boolean; periodNumbers?: number[]; reason?: string }>;
}): DayFreeStaffSummary {
  const normDay = (params.dayOfWeek || "").trim().toUpperCase();
  const sortedPeriods = [...params.periodSlots].sort((a, b) => a.order - b.order);
  const classesMap = new Map<string, string>();
  (params.classes || []).forEach(c => classesMap.set(c.id, `${c.name} - ${c.section}`));

  // Index absences
  const absenceMap = new Map<string, { fullDay: boolean; periodNumbers: number[]; reason?: string }>();
  (params.absencesToday || []).forEach(a => {
    absenceMap.set(a.teacherId, {
      fullDay: a.fullDay,
      periodNumbers: a.periodNumbers || [],
      reason: a.reason
    });
  });

  // Calculate teacher occupancy across the day
  // teacherId -> Set of busy period numbers
  const teacherBusyPeriods = new Map<string, Set<number>>();
  // key: `${teacherId}-${period}` -> busy slot details
  const teacherBusySlotDetails = new Map<string, any>();

  params.allTeachers.forEach(t => {
    teacherBusyPeriods.set(t.id, new Set<number>());
  });

  for (const slot of params.allSchoolSlots) {
    if ((slot.dayOfWeek || "").toUpperCase() !== normDay) continue;
    const isBreak = slot.isBreak || slot.slotType === "BREAK" || slot.slotType === "LUNCH";
    if (isBreak) continue;

    const tId = slot.teacherId || slot.subject?.teacherId;
    if (tId && teacherBusyPeriods.has(tId)) {
      teacherBusyPeriods.get(tId)!.add(slot.period);
      teacherBusySlotDetails.set(`${tId}-${slot.period}`, slot);
    }
  }

  // Pre-calculate daily totals for each teacher
  const lessonPeriods = sortedPeriods.filter(p => p.type !== "BREAK" && p.type !== "LUNCH");

  const teacherDailyLoads = params.allTeachers.map(t => {
    const busySet = teacherBusyPeriods.get(t.id) || new Set<number>();
    const assignedPeriods = Array.from(busySet).sort((a, b) => a - b);
    const freePeriods: number[] = [];

    for (const p of lessonPeriods) {
      if (!busySet.has(p.order)) {
        freePeriods.push(p.order);
      }
    }

    const maxDay = t.maxPeriodsPerDay || 6;
    const absence = absenceMap.get(t.id);

    return {
      teacherId: t.id,
      teacherName: t.name,
      assignedPeriods,
      freePeriods,
      totalAssigned: assignedPeriods.length,
      totalFree: freePeriods.length,
      maxPeriodsPerDay: maxDay,
      isOverloaded: assignedPeriods.length > maxDay,
      subjects: t.subjects || [],
      isAbsentToday: !!absence?.fullDay,
      absenceReason: absence?.reason
    };
  });

  const teacherLoadMap = new Map(teacherDailyLoads.map(tl => [tl.teacherId, tl]));

  // Build availability for every period
  const periods: PeriodStaffAvailability[] = sortedPeriods.map(pSlot => {
    const isBreak = pSlot.type === "BREAK" || pSlot.type === "LUNCH";
    const periodNum = pSlot.order;

    if (isBreak) {
      return {
        period: periodNum,
        periodLabel: pSlot.label,
        startTime: pSlot.startTime,
        endTime: pSlot.endTime,
        isBreak: true,
        type: pSlot.type,
        freeTeachers: [],
        busyTeachers: [],
        absentTeachers: []
      };
    }

    const freeTeachers: FreeTeacherInfo[] = [];
    const busyTeachers: BusyTeacherInfo[] = [];
    const absentTeachers: Array<{ id: string; name: string; reason?: string; fullDay: boolean }> = [];

    for (const t of params.allTeachers) {
      const loadInfo = teacherLoadMap.get(t.id);
      const absence = absenceMap.get(t.id);
      const isAbsentThisPeriod = absence && (absence.fullDay || absence.periodNumbers.includes(periodNum));

      if (isAbsentThisPeriod) {
        absentTeachers.push({
          id: t.id,
          name: t.name,
          reason: absence?.reason,
          fullDay: !!absence?.fullDay
        });
        continue;
      }

      const busySlot = teacherBusySlotDetails.get(`${t.id}-${periodNum}`);
      if (busySlot) {
        const clsName = classesMap.get(busySlot.classId) || (busySlot.class ? `${busySlot.class.name} - ${busySlot.class.section}` : busySlot.classId);
        busyTeachers.push({
          id: t.id,
          name: t.name,
          email: t.email,
          classId: busySlot.classId,
          className: clsName,
          subjectName: busySlot.subject?.name || busySlot.subjectName || "Subject",
          subjectCode: busySlot.subject?.code || busySlot.subjectCode,
          classroom: busySlot.classroom,
          period: periodNum
        });
      } else {
        freeTeachers.push({
          id: t.id,
          name: t.name,
          email: t.email,
          subjects: t.subjects || [],
          periodsToday: loadInfo?.totalAssigned || 0,
          freePeriodsToday: loadInfo?.totalFree || 0,
          maxPeriodsPerDay: loadInfo?.maxPeriodsPerDay || 6,
          freePeriodNumbers: loadInfo?.freePeriods || [],
          assignedPeriodNumbers: loadInfo?.assignedPeriods || []
        });
      }
    }

    // Sort free teachers by periodsToday ascending (teachers with fewer classes first)
    freeTeachers.sort((a, b) => a.periodsToday - b.periodsToday);

    return {
      period: periodNum,
      periodLabel: pSlot.label,
      startTime: pSlot.startTime,
      endTime: pSlot.endTime,
      isBreak: false,
      type: pSlot.type,
      freeTeachers,
      busyTeachers,
      absentTeachers
    };
  });

  return {
    dayOfWeek: normDay,
    totalTeachers: params.allTeachers.length,
    periods,
    teacherDailyLoads
  };
}
