export interface ExtractedStudent {
  name: string;
  rollNo?: string;
  admissionNo?: string;
  marks: Record<string, number | null | "AB">; // null = uncertain/blank, "AB" = absent
  totalFromSheet?: number;
  confidence: Record<string, number>; // 0.0 to 1.0 per subject
}

export type ExtractionProviderType =
  | "GEMINI"
  | "BEDROCK"
  | "TESSERACT"
  | "SHEETJS"
  | "UNPDF"
  | "CHEERIO"
  | "MAMMOTH";

export interface ExtractedSheetResult {
  testName?: string;
  className?: string;
  section?: string;
  maxMarkPerSubject: number;
  maxTotalDeclared?: number;
  subjects: string[];
  students: ExtractedStudent[];
  warnings: string[];
  providerUsed: ExtractionProviderType;
  tokensUsed?: { input: number; output: number };
  estimatedCostUsd?: number;
  durationMs: number;
}

export interface ExtractionOptions {
  classSubjects?: { id: string; name: string; maxMarks: number; passMarks: number }[];
  classStudents?: { id: string; rollNumber?: string; name: string }[];
  customDefaults?: { defaultMaxMarks?: number; defaultPassMarks?: number };
  forceProvider?: "GEMINI" | "BEDROCK" | "TESSERACT";
  allowBedrock?: boolean;
}

export interface ExtractionProvider {
  name: ExtractionProviderType;
  isAvailable(): Promise<boolean>;
  extractFromImage?(
    buffer: Buffer,
    mimeType: string,
    options?: ExtractionOptions
  ): Promise<ExtractedSheetResult>;
  extractFromText?(
    text: string,
    options?: ExtractionOptions
  ): Promise<ExtractedSheetResult>;
}
