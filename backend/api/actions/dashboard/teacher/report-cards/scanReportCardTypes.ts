import { z } from "zod";

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
  isCustomSubject?: boolean;
}

export interface DetectedStudentEntry {
  studentId: string;
  studentName: string;
  rollNumber: string;
  extractedName?: string;
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
  confidence?: number | string;
}

export interface ExtractedStudentSchema {
  studentName?: string;
  name?: string;
  rollNumber?: string;
  rollNo?: string;
  attendance?: string | number | null;
  subjects: Array<{
    subjectName?: string;
    name?: string;
    marksObtained?: number | null;
    marksScored?: number | null;
    maxMarks?: number | null;
    maxMark?: number | null;
    passMarks?: number | null;
    grade?: string | null;
    remarks?: string | null;
  }>;
  totalMarks?: number | null;
  total?: number | null;
  printedTotal?: number | null;
  percentage?: number | null;
  printedPercentage?: number | null;
  grade?: string | null;
  teacherRemarks?: string | null;
  confidence?: number | string | null;
}

export interface StructuredExtractionResult {
  examName?: string;
  examDate?: string;
  academicYear?: string;
  maxMarkPerSubject?: number;
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
  extractedName?: string;
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
  detectedStudents?: DetectedStudentEntry[];
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

export interface StudentEditorRecord {
  id: string;
  studentId: string;
  studentName: string;
  rollNumber: string;
  extractedName?: string;
  isMatched: boolean;
  matchConfidence: "HIGH" | "MEDIUM" | "LOW" | "NONE";
  isVerified: boolean;
  attendance?: string | number | null;
  attendanceNotFoundInDoc?: boolean;
  generalRemarks: string;
  examName: string;
  examDate: string;
  academicYear: string;
  subjects: ScannedReportCardSubject[];
  docTotal?: number;
  docPercentage?: number;
}

export const ScannedReportCardSubjectSchema = z.object({
  id: z.string(),
  subjectId: z.string().default(""),
  subjectName: z.string(),
  score: z.union([z.number(), z.literal("")]),
  maxScore: z.number().default(100),
  passMarks: z.number().default(35),
  remarks: z.string().optional().default(""),
  grade: z.string().nullable().optional(),
  status: z.enum(["PASS", "FAIL", "NEEDS_REVIEW"]).optional(),
  originalExtractedValue: z.string().nullable().optional(),
  isInvalid: z.boolean().optional(),
  validationError: z.string().optional()
});

export const DetectedStudentEntrySchema = z.object({
  studentId: z.string().default(""),
  studentName: z.string(),
  rollNumber: z.string().default(""),
  extractedName: z.string().optional(),
  className: z.string().nullable().optional(),
  academicYear: z.string().nullable().optional(),
  attendance: z.union([z.number(), z.string()]).nullable().optional(),
  subjects: z.array(ScannedReportCardSubjectSchema),
  totalMarks: z.number().optional(),
  percentage: z.number().optional(),
  grade: z.string().optional(),
  remarks: z.string().optional(),
  docTotal: z.number().optional(),
  docPercentage: z.number().optional(),
  confidence: z.union([z.number(), z.string()]).optional()
});

export const ScanReportCardResultSchema = z.object({
  success: z.boolean(),
  error: z.string().optional(),
  fileDetails: z.object({
    name: z.string(),
    type: z.string(),
    size: z.number()
  }),
  studentId: z.string().default(""),
  studentName: z.string().default(""),
  rollNumber: z.string().default(""),
  extractedName: z.string().optional(),
  studentConfidence: z.enum(["HIGH", "MEDIUM", "LOW", "NONE"]).default("NONE"),
  className: z.string().nullable().optional(),
  academicYear: z.string().nullable().optional(),
  attendance: z.union([z.number(), z.string()]).nullable().optional(),
  examName: z.string().default("Midterm Examination"),
  examDate: z.string().default(""),
  defaultMaxMarks: z.number().default(100),
  defaultPassMarks: z.number().default(35),
  generalRemarks: z.string().default(""),
  subjects: z.array(ScannedReportCardSubjectSchema).default([]),
  allDetectedStudents: z.array(DetectedStudentEntrySchema).optional(),
  detectedStudents: z.array(DetectedStudentEntrySchema).optional(),
  rawTextPreview: z.string().optional(),
  originalExtractedValues: z.record(z.string(), z.any()).optional(),
  docTotal: z.number().optional(),
  docPercentage: z.number().optional()
});
