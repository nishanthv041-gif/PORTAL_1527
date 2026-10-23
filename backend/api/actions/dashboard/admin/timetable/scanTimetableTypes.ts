export type ScannedSlot = {
  id: string;
  dayOfWeek: string;
  period: number;
  subjectId: string;
  subjectName: string;
  startTime: string;
  endTime: string;
  classroom: string;
  isBreak: boolean;
};

export type ScanResult = {
  success?: boolean;
  error?: string;
  fileName?: string;
  fileType?: string;
  scannedSlots?: ScannedSlot[];
  warnings?: string[];
  totalScanned?: number;
};
