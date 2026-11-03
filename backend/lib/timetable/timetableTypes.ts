export type PeriodType = "LESSON" | "BREAK" | "LUNCH" | "ASSEMBLY" | "FREE";

export interface PeriodSlotData {
  id?: string;
  classId?: string | null;
  order: number;
  label: string; // e.g. "Period 1", "Morning Break"
  startTime: string; // "08:00"
  endTime: string; // "08:45"
  type: PeriodType;
}

export interface TimetableSlotEntry {
  id?: string;
  classId: string;
  dayOfWeek: string; // MONDAY, TUESDAY...
  period: number;
  subjectId?: string | null;
  subjectName?: string | null;
  subjectCode?: string | null;
  teacherId?: string | null;
  teacherName?: string | null;
  classroom?: string | null;
  startTime?: string;
  endTime?: string;
  isBreak?: boolean;
  slotType?: PeriodType;
  status?: "DRAFT" | "PUBLISHED";
  periodSlotId?: string | null;
}

export interface TeacherLoad {
  teacherId: string;
  teacherName: string;
  periodsPerDay: Record<string, number>;
  totalPeriodsPerWeek: number;
  maxPeriodsPerDay: number;
  maxPeriodsPerWeek: number;
  utilizationPercentage: number;
  freeSlotsPerDay: Record<string, number[]>; // dayOfWeek -> array of free period numbers
  isOverloaded: boolean;
}

export interface SubjectScheduleSummary {
  subjectId: string;
  subjectName: string;
  code: string;
  requiredPeriodsPerWeek: number;
  scheduledPeriodsPerWeek: number;
  difference: number; // scheduled - required
  status: "MATCHED" | "DEFICIT" | "SURPLUS";
  teacherId?: string | null;
  teacherName?: string | null;
}

export interface TimetableConflict {
  id: string;
  type: "HARD" | "SOFT";
  category:
  | "TEACHER_CLASH"
  | "CLASS_CLASH"
  | "ROOM_CLASH"
  | "UNASSIGNED_TEACHER"
  | "TEACHER_ON_LEAVE"
  | "LESSON_IN_BREAK"
  | "TEACHER_OVERLOAD"
  | "CONSECUTIVE_OVERLOAD"
  | "UNBALANCED_SUBJECT";
  title: string;
  message: string;
  dayOfWeek: string;
  period: number;
  classId?: string;
  className?: string;
  teacherId?: string;
  teacherName?: string;
  roomId?: string;
  subjectId?: string;
  subjectName?: string;
  slotId?: string;
}

export interface TimetableCalculationResult {
  totalTeachingSlotsPerWeek: number;
  totalScheduledLessons: number;
  coveragePercentage: number;
  subjectSummaries: SubjectScheduleSummary[];
  teacherLoads: TeacherLoad[];
  hardConflicts: TimetableConflict[];
  softWarnings: TimetableConflict[];
  canPublish: boolean;
  publishBlockReasons: string[];
}

export interface FreeTeacherInfo {
  id: string;
  name: string;
  email?: string;
  subjects: string[];
  periodsToday: number;
  freePeriodsToday: number;
  maxPeriodsPerDay: number;
  freePeriodNumbers: number[];
  assignedPeriodNumbers: number[];
}

export interface BusyTeacherInfo {
  id: string;
  name: string;
  email?: string;
  classId: string;
  className: string;
  subjectName: string;
  subjectCode?: string;
  classroom?: string;
  period: number;
}

export interface PeriodStaffAvailability {
  period: number;
  periodLabel: string;
  startTime: string;
  endTime: string;
  isBreak: boolean;
  type: PeriodType;
  freeTeachers: FreeTeacherInfo[];
  busyTeachers: BusyTeacherInfo[];
  absentTeachers: Array<{
    id: string;
    name: string;
    reason?: string;
    fullDay: boolean;
  }>;
}

export interface DayFreeStaffSummary {
  dayOfWeek: string;
  totalTeachers: number;
  periods: PeriodStaffAvailability[];
  teacherDailyLoads: Array<{
    teacherId: string;
    teacherName: string;
    assignedPeriods: number[];
    freePeriods: number[];
    totalAssigned: number;
    totalFree: number;
    maxPeriodsPerDay: number;
    isOverloaded: boolean;
    subjects: string[];
    isAbsentToday: boolean;
    absenceReason?: string;
  }>;
}
