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
  docTotal?: number;
  docPercentage?: number;
  confidence?: number;
}

export interface ExtractedStudentSchema {
  studentName: string;
  rollNumber?: string;
  attendance?: string;
  subjects: Array<{
    subjectName: string;
    marksObtained: number | null;
    maxMarks?: number | null;
    passMarks?: number | null;
    grade?: string | null;
    remarks?: string | null;
  }>;
  totalMarks?: number | null;
  percentage?: number | null;
  grade?: string | null;
  teacherRemarks?: string | null;
}

export interface StructuredExtractionResult {
  examName?: string;
  examDate?: string;
  academicYear?: string;
  students: ExtractedStudentSchema[];
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
  docTotal?: number;
  docPercentage?: number;
}

