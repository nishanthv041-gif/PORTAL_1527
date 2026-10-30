import type { PeriodSlotData, PeriodType } from "@/backend/lib/timetable/timetableTypes";

export type ScannedSlot = {
  id: string;
  dayOfWeek: string;
  period: number;
  subjectId: string;
  subjectName: string;
  teacherId?: string;
  teacherName?: string;
  assignedTeacherId?: string;
  assignedTeacherName?: string;
  isTeacherMismatch?: boolean;
  startTime: string;
  endTime: string;
  classroom: string;
  isBreak: boolean;
  slotType?: PeriodType;
  isUnknownSubject?: boolean;
  warning?: string;
};

export type ScanResult = {
  success?: boolean;
  error?: string;
  fileName?: string;
  fileType?: string;
  periods?: PeriodSlotData[];
  scannedSlots?: ScannedSlot[];
  warnings?: string[];
  totalScanned?: number;
  detectedClasses?: string[];
  scannerConfigured?: boolean;
};
