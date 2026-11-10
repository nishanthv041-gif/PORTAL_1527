import {
  ExtractedSheetResult,
  ExtractionOptions,
  ExtractionProvider,
  ExtractionProviderType
} from "./types";
import { extractFromSpreadsheet } from "./readers/spreadsheet";
import { extractFromPdfText } from "./readers/pdfText";
import { readDocumentFromUrl, fenceUntrustedText } from "./readers/urlReader";
import { GeminiProvider } from "./providers/gemini";
import { TesseractProvider } from "./providers/tesseract";
import { BedrockProvider } from "./providers/bedrock";
import { matchStudentToClass, MatchedStudentResult } from "./studentMatcher";
import { normalizeSubjectName } from "./normalizer";
import { prisma } from "@/backend/db/prisma";

export * from "./types";
export * from "./normalizer";
export * from "./studentMatcher";
export * from "./readers/ssrfGuard";
export * from "./readers/urlReader";

// Circuit Breaker State for External AI Providers
interface CircuitState {
  failureCount: number;
  lastFailureTime: number;
  isOpen: boolean;
}

const circuitMap = new Map<string, CircuitState>();
const FAILURE_THRESHOLD = 3;
const COOLDOWN_PERIOD_MS = 15 * 60 * 1000; // 15 minutes

function isCircuitOpen(providerName: string): boolean {
  const state = circuitMap.get(providerName);
  if (!state || !state.isOpen) return false;
  if (Date.now() - state.lastFailureTime > COOLDOWN_PERIOD_MS) {
    // Reset circuit after cooldown
    circuitMap.set(providerName, { failureCount: 0, lastFailureTime: 0, isOpen: false });
    return false;
  }
  return true;
}

function recordSuccess(providerName: string): void {
  circuitMap.set(providerName, { failureCount: 0, lastFailureTime: 0, isOpen: false });
}

function recordFailure(providerName: string): void {
  const current = circuitMap.get(providerName) || { failureCount: 0, lastFailureTime: 0, isOpen: false };
  const newFailures = current.failureCount + 1;
  const isOpen = newFailures >= FAILURE_THRESHOLD;
  circuitMap.set(providerName, {
    failureCount: newFailures,
    lastFailureTime: Date.now(),
    isOpen
  });
}

export interface UnifiedExtractionRequest {
  fileBuffer?: Buffer;
  mimeType?: string;
  fileName?: string;
  webUrl?: string;
  rawText?: string;
  classId: string;
  examId?: string;
  userId: string;
  options?: ExtractionOptions;
}

export interface FormattedReportCardStudent extends MatchedStudentResult {
  attendance?: string | null;
  remarks?: string;
  docTotal?: number;
  docPercentage?: number;
  subjects: {
    id: string;
    subjectId: string;
    subjectName: string;
    score: number | "" | "AB";
    maxScore: number;
    passMarks: number;
    remarks: string;
    grade: string;
    status: "PASS" | "FAIL" | "ABSENT" | "NEEDS_REVIEW";
  }[];
}

export interface UnifiedExtractionOutput {
  success: boolean;
  extractionId?: string;
  providerUsed: ExtractionProviderType;
  modelId?: string;
  fileName?: string;
  fileDetails: {
    name: string;
    type: string;
    size: number;
  };
  studentId: string;
  studentName: string;
  rollNumber: string;
  extractedName: string;
  studentConfidence: "HIGH" | "MEDIUM" | "NONE";
  examName: string;
  examDate: string;
  academicYear: string;
  defaultMaxMarks: number;
  defaultPassMarks: number;
  attendance: string | null;
  generalRemarks: string;
  subjects: FormattedReportCardStudent["subjects"];
  allDetectedStudents: FormattedReportCardStudent[];
  detectedStudents: FormattedReportCardStudent[];
  warnings: string[];
  docTotal?: number;
  docPercentage?: number;
  tokensUsed?: { input: number; output: number };
  estimatedCostUsd?: number;
  durationMs: number;
}

/**
 * Main entry point for report card extraction.
 * Handles files, URLs, text, provider fallback, student matching, and staging persistence.
 */
export async function runReportCardExtraction(
  req: UnifiedExtractionRequest
): Promise<UnifiedExtractionOutput> {
  const startTime = Date.now();
  const gemini = new GeminiProvider();
  const bedrock = new BedrockProvider();
  const tesseract = new TesseractProvider();

  let sheetResult: ExtractedSheetResult | null = null;
  let sourceRef = req.fileName || req.webUrl || "uploaded-file";
  let sourceType: "UPLOAD" | "URL" = req.webUrl ? "URL" : "UPLOAD";
  let effectiveBuffer = req.fileBuffer;
  let effectiveMime = req.mimeType || "application/octet-stream";
  let effectiveText = req.rawText;

  // 1. If web link provided, fetch and parse via SSRF Guard
  if (req.webUrl) {
    const parsedWeb = await readDocumentFromUrl(req.webUrl);
    sourceRef = req.webUrl;
    sourceType = "URL";

    if (parsedWeb.sourceType === "SPREADSHEET" && parsedWeb.buffer) {
      effectiveBuffer = parsedWeb.buffer;
      effectiveMime = parsedWeb.mimeType || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    } else if (parsedWeb.sourceType === "PDF" && parsedWeb.buffer) {
      effectiveBuffer = parsedWeb.buffer;
      effectiveMime = "application/pdf";
    } else if (parsedWeb.sourceType === "IMAGE" && parsedWeb.buffer) {
      effectiveBuffer = parsedWeb.buffer;
      effectiveMime = parsedWeb.mimeType || "image/png";
    } else if (parsedWeb.rawText) {
      effectiveText = fenceUntrustedText(parsedWeb.rawText);
    }
  }

  // 2. Identify file format and select extraction pathway
  const isExcel =
    effectiveMime.includes("sheet") ||
    effectiveMime.includes("excel") ||
    effectiveMime.includes("csv") ||
    /\.(xlsx|xls|csv)$/i.test(sourceRef);

  const isPdf = effectiveMime.includes("pdf") || /\.pdf$/i.test(sourceRef);
  const isImage = effectiveMime.startsWith("image/") || /\.(jpg|jpeg|png|webp|bmp)$/i.test(sourceRef);

  // Pathway A: Spreadsheets (SheetJS)
  if (effectiveBuffer && isExcel) {
    sheetResult = extractFromSpreadsheet(effectiveBuffer);
  }

  // Pathway B: Digital Vector PDF (unpdf)
  if (!sheetResult && effectiveBuffer && isPdf) {
    sheetResult = await extractFromPdfText(effectiveBuffer);
  }

  // Pathway C: Clean text from web scrape
  if (!sheetResult && effectiveText) {
    // Try Gemini with fenced text
    if (!isCircuitOpen("GEMINI") && (await gemini.isAvailable())) {
      try {
        sheetResult = await gemini.extractFromText(effectiveText, req.options);
        recordSuccess("GEMINI");
      } catch (gemErr) {
        recordFailure("GEMINI");
        console.warn("Gemini text extraction failed, trying fallbacks:", gemErr);
      }
    }

    // Try Bedrock if enabled and Gemini was unavailable
    if (!sheetResult && (await bedrock.isAvailable())) {
      try {
        sheetResult = await bedrock.extractFromText(effectiveText, req.options);
        recordSuccess("BEDROCK");
      } catch (bedErr) {
        recordFailure("BEDROCK");
        console.warn("Bedrock text extraction failed:", bedErr);
      }
    }

    // Fallback: Tesseract heuristic parser on text
    if (!sheetResult) {
      sheetResult = await tesseract.extractFromText(effectiveText, req.options);
    }
  }

  // Pathway D: Images or Scanned PDFs (Vision / OCR)
  if (!sheetResult && effectiveBuffer && (isImage || isPdf)) {
    // Primary: Google Gemini 2.0 Flash Vision (Free)
    if (!isCircuitOpen("GEMINI") && (await gemini.isAvailable())) {
      try {
        sheetResult = await gemini.extractFromImage(effectiveBuffer, effectiveMime, req.options);
        recordSuccess("GEMINI");
      } catch (gemErr) {
        recordFailure("GEMINI");
        console.warn("Gemini vision extraction failed, trying fallbacks:", gemErr);
      }
    }

    // Secondary (Optional Paid): AWS Bedrock Claude (if enabled)
    if (!sheetResult && (await bedrock.isAvailable())) {
      try {
        sheetResult = await bedrock.extractFromImage(effectiveBuffer, effectiveMime, req.options);
        recordSuccess("BEDROCK");
      } catch (bedErr) {
        recordFailure("BEDROCK");
        console.warn("Bedrock vision extraction failed:", bedErr);
      }
    }

    // Tertiary: Offline in-memory Tesseract.js OCR
    if (!sheetResult) {
      sheetResult = await tesseract.extractFromImage(effectiveBuffer, effectiveMime, req.options);
    }
  }

  // Fallback if completely empty
  if (!sheetResult) {
    sheetResult = {
      maxMarkPerSubject: req.options?.customDefaults?.defaultMaxMarks || 100,
      subjects: [],
      students: [],
      warnings: ["Unable to parse mark sheet data from the provided document."],
      providerUsed: "SHEETJS",
      durationMs: Date.now() - startTime
    };
  }

  // 3. Map extracted subjects and students to class entities
  const classSubjects = req.options?.classSubjects || [];
  const classStudents = req.options?.classStudents || [];
  const defaultMax = sheetResult.maxMarkPerSubject || req.options?.customDefaults?.defaultMaxMarks || 100;
  const defaultPass = req.options?.customDefaults?.defaultPassMarks || 35;

  const detectedSubjects = sheetResult.subjects;

  const formattedStudents: FormattedReportCardStudent[] = sheetResult.students.map((st, sIdx) => {
    const matched = matchStudentToClass(st.name, st.rollNo, classStudents);

    // Build subject rows for this student
    const studentSubjects = detectedSubjects.map((subName, subIdx) => {
      // Find matching subject in class definition if exists
      const matchedClassSub = classSubjects.find(
        cs => normalizeSubjectName(cs.name) === normalizeSubjectName(subName)
      );

      const rawMark = st.marks[subName];
      let score: number | "" | "AB" = "";
      let status: "PASS" | "FAIL" | "ABSENT" | "NEEDS_REVIEW" = "NEEDS_REVIEW";
      let grade = "-";

      const maxScore = matchedClassSub?.maxMarks || defaultMax;
      const passMarks = matchedClassSub?.passMarks || defaultPass;

      if (rawMark === "AB") {
        score = "AB";
        status = "ABSENT";
        grade = "AB";
      } else if (typeof rawMark === "number") {
        score = rawMark;
        status = rawMark >= passMarks ? "PASS" : "FAIL";
        const percentage = (rawMark / maxScore) * 100;
        if (percentage >= 90) grade = "A+";
        else if (percentage >= 80) grade = "A";
        else if (percentage >= 70) grade = "B+";
        else if (percentage >= 60) grade = "B";
        else if (percentage >= 50) grade = "C";
        else if (percentage >= 35) grade = "D";
        else grade = "E";
      }

      return {
        id: `subj-${Date.now()}-${sIdx}-${subIdx}`,
        subjectId: matchedClassSub?.id || `unassigned-${subIdx}`,
        subjectName: subName,
        score,
        maxScore,
        passMarks,
        remarks: status === "ABSENT" ? "Absent" : "",
        grade,
        status
      };
    });

    // Compute totals
    let totalMarks = 0;
    let maxTotal = 0;
    studentSubjects.forEach(s => {
      if (typeof s.score === "number") totalMarks += s.score;
      maxTotal += s.maxScore;
    });

    const docPercentage = maxTotal > 0 ? parseFloat(((totalMarks / maxTotal) * 100).toFixed(1)) : undefined;

    return {
      ...matched,
      attendance: null,
      remarks: "",
      docTotal: st.totalFromSheet || totalMarks,
      docPercentage,
      subjects: studentSubjects
    };
  });

  // 4. Save Staging Snapshot in `ReportCardExtraction` table (Non-blocking / best effort)
  let stagingId: string | undefined;
  try {
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30-day retention
    const stagingRecord = await prisma.reportCardExtraction.create({
      data: {
        sourceType,
        sourceRef,
        classId: req.classId,
        examId: req.examId || null,
        provider: sheetResult.providerUsed,
        modelId: sheetResult.providerUsed === "BEDROCK" ? process.env.BEDROCK_MODEL_ID || "claude-3-5-haiku" : "gemini-2.0-flash",
        status: "STAGED",
        subjectCount: sheetResult.subjects.length,
        studentCount: sheetResult.students.length,
        extractedData: sheetResult as any,
        warnings: sheetResult.warnings as any,
        tokensIn: sheetResult.tokensUsed?.input || 0,
        tokensOut: sheetResult.tokensUsed?.output || 0,
        costUsd: sheetResult.estimatedCostUsd || 0.0,
        createdById: req.userId,
        expiresAt
      }
    });
    stagingId = stagingRecord.id;
  } catch (dbErr) {
    console.warn("Failed to save report card staging record (non-critical):", dbErr);
  }

  const firstStudent = formattedStudents.find(s => s.studentId) || formattedStudents[0];

  return {
    success: true,
    extractionId: stagingId,
    providerUsed: sheetResult.providerUsed,
    modelId: sheetResult.providerUsed === "BEDROCK" ? process.env.BEDROCK_MODEL_ID || "claude-3-5-haiku" : "gemini-2.0-flash",
    fileName: sourceRef,
    fileDetails: {
      name: sourceRef,
      type: effectiveMime,
      size: effectiveBuffer ? effectiveBuffer.length : 0
    },
    studentId: firstStudent?.studentId || "",
    studentName: firstStudent?.studentName || "",
    rollNumber: firstStudent?.rollNumber || "",
    extractedName: firstStudent?.extractedName || firstStudent?.studentName || "",
    studentConfidence: firstStudent?.confidence || "NONE",
    examName: sheetResult.testName || "Examination",
    examDate: new Date().toISOString().split("T")[0],
    academicYear: "2026-2027",
    defaultMaxMarks: defaultMax,
    defaultPassMarks: defaultPass,
    attendance: null,
    generalRemarks: "",
    subjects: firstStudent?.subjects || [],
    allDetectedStudents: formattedStudents,
    detectedStudents: formattedStudents,
    warnings: sheetResult.warnings,
    docTotal: firstStudent?.docTotal,
    docPercentage: firstStudent?.docPercentage,
    tokensUsed: sheetResult.tokensUsed,
    estimatedCostUsd: sheetResult.estimatedCostUsd,
    durationMs: Date.now() - startTime
  };
}
