export interface ScannedReportCardSubject {
  id: string; // Temporary unique ID for client editing
  subjectId: string; // Mapped class subject ID (empty if unmatched)
  subjectName: string;
  score: number | "";
  maxScore: number;
  passMarks: number;
  remarks: string;
  grade?: string | null;
  status?: "PASS" | "FAIL" | "NEEDS_REVIEW";
  originalExtractedValue?: string | null;
  isInvalid?: boolean;
  validationError?: string;
}

export interface DetectedStudentEntry {
  studentId: string;
  studentName: string;
  rollNumber: string;
  className?: string | null;
  academicYear?: string | null;
  attendance?: number | string | null;
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
  className?: string | null;
  academicYear?: string | null;
  attendance?: number | string | null;
  examName: string;
  examDate: string; // YYYY-MM-DD
  defaultMaxMarks: number;
  defaultPassMarks: number;
  generalRemarks: string;
  subjects: ScannedReportCardSubject[];
  allDetectedStudents?: DetectedStudentEntry[];
  rawTextPreview?: string;
  originalExtractedValues?: {
    student?: string;
    rollNumber?: string;
    exam?: string;
    date?: string;
    attendance?: string;
    marks?: Record<string, string>;
  };
}
