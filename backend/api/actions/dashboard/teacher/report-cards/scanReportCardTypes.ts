export interface ScannedReportCardSubject {
  id: string; // Temporary ID for client editing
  subjectId: string; // Mapped class subject ID (empty if unmatched)
  subjectName: string;
  score: number | "";
  maxScore: number;
  passMarks: number;
  remarks: string;
  isInvalid?: boolean;
  validationError?: string;
}

export interface DetectedStudentEntry {
  studentId: string;
  studentName: string;
  rollNumber: string;
  subjects: ScannedReportCardSubject[];
  totalMarks?: number;
  percentage?: number;
  grade?: string;
  remarks?: string;
}

export interface ScanReportCardResult {
  success: boolean;
  error?: string;
  fileDetails: {
    name: string;
    type: string;
    size: number;
  };
  studentId: string;
  studentName: string;
  rollNumber: string;
  studentConfidence: "HIGH" | "MEDIUM" | "LOW" | "NONE";
  examName: string;
  examDate: string; // YYYY-MM-DD
  defaultMaxMarks: number;
  defaultPassMarks: number;
  generalRemarks: string;
  subjects: ScannedReportCardSubject[];
  allDetectedStudents?: DetectedStudentEntry[];
  rawTextPreview?: string;
}
