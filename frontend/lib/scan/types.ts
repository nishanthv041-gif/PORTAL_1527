import { z } from "zod";

export const ScanSubjectSchema = z.object({
  name: z.string(),
  marks: z.number().nullable(),
  maxMarks: z.number().default(100),
  passMark: z.number().nullable().default(null),
  absent: z.boolean().default(false),
  confidence: z.number().default(0.95),
  rawText: z.string().optional(),
  bbox: z
    .object({
      x0: z.number(),
      y0: z.number(),
      x1: z.number(),
      y1: z.number(),
    })
    .optional(),
});

export type ScanSubject = z.infer<typeof ScanSubjectSchema>;

export const ScanStudentSchema = z.object({
  rollNo: z.string().nullable().default(null),
  name: z.string(),
  attendance: z.string().nullable().default(null),
  subjects: z.array(ScanSubjectSchema),
  printedTotal: z.number().nullable().default(null),
  printedPercentage: z.number().nullable().default(null),
  remarks: z.string().nullable().default(null),
  confidence: z.number().default(0.9),
  totalMismatchWarning: z.string().optional(),
  bbox: z
    .object({
      x0: z.number(),
      y0: z.number(),
      x1: z.number(),
      y1: z.number(),
    })
    .optional(),
});

export type ScanStudent = z.infer<typeof ScanStudentSchema>;

export const ScanResultSchema = z.object({
  layout: z.enum(["A", "B", "C", "D"]),
  examination: z.string().nullable().default(null),
  examDate: z.string().nullable().default(null),
  classLabel: z.string().nullable().default(null),
  maxMarksDefault: z.number().default(100),
  passMarksDefault: z.number().default(35),
  students: z.array(ScanStudentSchema),
  warnings: z.array(z.string()).default([]),
  rawTextPreview: z.string().optional(),
  fileDetails: z
    .object({
      name: z.string(),
      size: z.number(),
      type: z.string(),
    })
    .optional(),
});

export type ScanResult = z.infer<typeof ScanResultSchema>;

export type ScanStage =
  | "image-load"
  | "preprocess"
  | "ocr-init"
  | "ocr-recognize"
  | "table-parse"
  | "json-validate";

export interface ScanProgressUpdate {
  stage: ScanStage;
  percent: number;
  message: string;
}

export interface WordBox {
  text: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  confidence: number;
  lineNum?: number;
}

export interface ScanDebugInfo {
  stage: ScanStage;
  layout: "A" | "B" | "C" | "D";
  wordCount: number;
  headerWords: string[];
  columnBounds: Array<{ name: string; x0: number; x1: number }>;
  rawLines: string[];
  finalJson: ScanResult | null;
  rawWords: WordBox[];
}

