import { MAX_DOCUMENT_FILE_SIZE } from "./config";
import type {
  ScanResult,
  ScanStage,
  ScanProgressUpdate,
  ScanDebugInfo,
  WordBox,
} from "./types";
import { ScanResultSchema } from "./types";
import { preprocessImageForOcr } from "./preprocess";
import { runBrowserOcr, runDigitRefinementOcr } from "./ocr";
import { reconstructTableFromWords } from "./table-reconstruction";
import { parseExcelOrCsv } from "./excel-scan";
import { parsePdfDocument } from "./pdf-scan";
import { attemptVisionScan } from "./vision-scan";

export * from "./types";
export * from "./config";
export * from "./preprocess";
export * from "./ocr";
export * from "./table-reconstruction";

export class ScanStageError extends Error {
  stage: ScanStage;
  originalError?: any;

  constructor(stage: ScanStage, message: string, originalError?: any) {
    super(message);
    this.name = "ScanStageError";
    this.stage = stage;
    this.originalError = originalError;
  }
}

export interface ScanOptions {
  defaultMaxMarks?: number;
  defaultPassMarks?: number;
  onProgress?: (update: ScanProgressUpdate) => void;
}

/**
 * Universal In-Browser Document Scanner
 * Accepts Excel (.xlsx/.xls), CSV, Text PDF, Scanned PDF, or Image (PNG/JPG/WEBP).
 * Strictly in-memory; zero file storage; stage-based error reporting.
 */
export async function scanMarksheetDocument(
  file: File,
  options?: ScanOptions
): Promise<{ result: ScanResult; debugInfo: ScanDebugInfo }> {
  let currentStage: ScanStage = "image-load";

  const notifyProgress = (stage: ScanStage, percent: number, message: string) => {
    currentStage = stage;
    options?.onProgress?.({ stage, percent, message });
  };

  try {
    // 0. File Size Check
    if (file.size > MAX_DOCUMENT_FILE_SIZE) {
      throw new ScanStageError(
        "image-load",
        `File exceeds maximum limit of 10MB (${(file.size / (1024 * 1024)).toFixed(1)} MB).`
      );
    }

    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    const isSpreadsheet = ["xlsx", "xls", "csv"].includes(ext);
    const isPdf = ext === "pdf";

    // 1. Spreadsheet Path (SheetJS)
    if (isSpreadsheet) {
      notifyProgress("table-parse", 20, "Reading spreadsheet data...");
      const result = await parseExcelOrCsv(
        file,
        options?.defaultMaxMarks || 100,
        options?.defaultPassMarks || 35
      );

      notifyProgress("json-validate", 90, "Validating extracted student rows...");
      const validated = ScanResultSchema.parse(result);

      notifyProgress("json-validate", 100, "Done");
      return {
        result: validated,
        debugInfo: {
          stage: "json-validate",
          layout: validated.layout,
          wordCount: validated.students.length * 6,
          headerWords: validated.students[0]?.subjects.map((s) => s.name) || [],
          columnBounds: [],
          rawLines: [],
          finalJson: validated,
          rawWords: [],
        },
      };
    }

    // 2. PDF Path (pdf.js Text or Rendered OCR)
    if (isPdf) {
      notifyProgress("image-load", 15, "Loading PDF document...");
      const result = await parsePdfDocument(
        file,
        options?.defaultMaxMarks || 100,
        options?.defaultPassMarks || 35,
        (pct, msg) => notifyProgress("ocr-recognize", pct, msg)
      );

      notifyProgress("json-validate", 95, "Validating PDF extraction data...");
      const validated = ScanResultSchema.parse(result);

      notifyProgress("json-validate", 100, "Done");
      return {
        result: validated,
        debugInfo: {
          stage: "json-validate",
          layout: validated.layout,
          wordCount: 0,
          headerWords: validated.students[0]?.subjects.map((s) => s.name) || [],
          columnBounds: [],
          rawLines: validated.rawTextPreview ? validated.rawTextPreview.split("\n") : [],
          finalJson: validated,
          rawWords: [],
        },
      };
    }

    // 3. Image / Photo Mark Sheet Path
    notifyProgress("image-load", 10, "Decoding document image...");
    let preprocessed: any = null;

    try {
      notifyProgress("preprocess", 20, "Optimizing image resolution and contrast for OCR...");
      preprocessed = await preprocessImageForOcr(file, 2000);
    } catch (err: any) {
      throw new ScanStageError("preprocess", `Failed to preprocess image: ${err?.message || "Invalid image"}`, err);
    }

    // Optional Vision API check (disabled by default)
    const visionResult = await attemptVisionScan(preprocessed.blob);
    if (visionResult && visionResult.students.length > 0) {
      notifyProgress("json-validate", 100, "Smart scan completed successfully.");
      return {
        result: visionResult,
        debugInfo: {
          stage: "json-validate",
          layout: visionResult.layout,
          wordCount: 0,
          headerWords: visionResult.students[0]?.subjects.map((s) => s.name) || [],
          columnBounds: [],
          rawLines: [],
          finalJson: visionResult,
          rawWords: [],
        },
      };
    }

    // Local In-Browser OCR
    let ocrOutput: { words: WordBox[]; rawText: string };
    try {
      notifyProgress("ocr-init", 30, "Starting self-hosted OCR engine...");
      ocrOutput = await runBrowserOcr(preprocessed.canvas, (pct, msg) => {
        notifyProgress("ocr-recognize", pct, msg);
      });
    } catch (err: any) {
      throw new ScanStageError(
        "ocr-init",
        `OCR engine initialization error: ${err?.message || "Worker blocked"}. Ensure /public/tesseract/ assets are accessible.`,
        err
      );
    }

    if (!ocrOutput.words || ocrOutput.words.length === 0) {
      throw new ScanStageError(
        "ocr-recognize",
        "Could not detect any clear text or marks in the image. Please try a clearer photo or the Excel template."
      );
    }

    // Optional Digit-Refinement Second Pass
    // Identify any words that look like numbers or were confused (e.g. £2, Eo, El)
    const candidateNumberWords = ocrOutput.words.filter(
      (w) =>
        /[£E0-9]/.test(w.text) &&
        w.x0 > 350 && // To the right of the student name column
        w.y0 > 200 // Below the top title
    );

    if (candidateNumberWords.length > 0) {
      try {
        notifyProgress("ocr-recognize", 75, "Refining numerical score accuracy...");
        const refinementRegions = candidateNumberWords.slice(0, 30).map((w, idx) => ({
          id: `w-${idx}`,
          rect: { x0: w.x0, y0: w.y0, x1: w.x1, y1: w.y1 },
        }));

        const refinedMap = await runDigitRefinementOcr(preprocessed.canvas, refinementRegions);
        // Apply refined text back to word boxes
        refinementRegions.forEach((r, idx) => {
          const refined = refinedMap.get(r.id);
          if (refined && /\d/.test(refined)) {
            candidateNumberWords[idx].text = refined;
          }
        });
      } catch (refineErr) {
        console.warn("Secondary digit refinement skipped:", refineErr);
      }
    }

    // 4. Template-Independent Table Reconstruction
    let scanResult: ScanResult;
    try {
      notifyProgress("table-parse", 85, "Reconstructing student gradebook table...");
      scanResult = reconstructTableFromWords(ocrOutput.words, {
        defaultMaxMarks: options?.defaultMaxMarks || 100,
        defaultPassMarks: options?.defaultPassMarks || 35,
      });

      scanResult.fileDetails = {
        name: file.name,
        size: file.size,
        type: file.type || "image/png",
      };
    } catch (err: any) {
      throw new ScanStageError("table-parse", `Failed to parse table structure: ${err?.message}`, err);
    }

    if (scanResult.students.length === 0) {
      throw new ScanStageError(
        "table-parse",
        "No student rows or subject marks could be matched. Please verify the document has readable columns."
      );
    }

    // 5. JSON Schema Validation
    let validated: ScanResult;
    try {
      notifyProgress("json-validate", 95, "Validating extracted grade data...");
      validated = ScanResultSchema.parse(scanResult);
    } catch (err: any) {
      throw new ScanStageError("json-validate", `Data schema validation failed: ${err?.message}`, err);
    }

    notifyProgress("json-validate", 100, "Extraction complete");

    const debugInfo: ScanDebugInfo = {
      stage: "json-validate",
      layout: validated.layout,
      wordCount: ocrOutput.words.length,
      headerWords: validated.students[0]?.subjects.map((s) => s.name) || [],
      columnBounds: [],
      rawLines: ocrOutput.rawText.split("\n"),
      finalJson: validated,
      rawWords: ocrOutput.words,
    };

    return { result: validated, debugInfo };
  } catch (err: any) {
    if (err instanceof ScanStageError) {
      throw err;
    }
    throw new ScanStageError(currentStage, err?.message || "Document scan failed unexpectedly.", err);
  }
}

