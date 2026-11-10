import * as path from "path";
import {
  ExtractedSheetResult,
  ExtractedStudent,
  ExtractionOptions,
  ExtractionProvider
} from "../types";
import { normalizeSubjectName } from "../normalizer";

export class TesseractProvider implements ExtractionProvider {
  name = "TESSERACT" as const;

  async isAvailable(): Promise<boolean> {
    try {
      require.resolve("tesseract.js");
      return true;
    } catch {
      return false;
    }
  }

  async extractFromImage(
    buffer: Buffer,
    mimeType: string = "image/png",
    options?: ExtractionOptions
  ): Promise<ExtractedSheetResult> {
    const startTime = Date.now();
    const { createWorker } = await import("tesseract.js");

    const worker = await createWorker("eng");
    let ocrText = "";
    try {
      const result = await worker.recognize(buffer);
      ocrText = result?.data?.text || "";
    } finally {
      await worker.terminate();
    }

    return this.parseOcrText(ocrText, startTime, options);
  }

  async extractFromText(
    text: string,
    options?: ExtractionOptions
  ): Promise<ExtractedSheetResult> {
    const startTime = Date.now();
    return this.parseOcrText(text, startTime, options);
  }

  private parseOcrText(
    text: string,
    startTime: number,
    options?: ExtractionOptions
  ): ExtractedSheetResult {
    const lines = text
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(l => l.length > 0);

    const warnings: string[] = [];
    let headerLineIdx = -1;
    let maxMarkPerSubject = options?.customDefaults?.defaultMaxMarks || 100;
    let maxTotalDeclared: number | undefined;

    for (let i = 0; i < Math.min(15, lines.length); i++) {
      const up = lines[i].toUpperCase();
      const eachMatch = up.match(/\/(\d+)\s*EACH/) || up.match(/OUT\s*OF\s*(\d+)/);
      if (eachMatch) maxMarkPerSubject = parseInt(eachMatch[1], 10);

      const maxTotMatch = up.match(/TOTAL\s*MARKS?:\s*(\d+)\s*MAXIMUM/) || up.match(/MAXIMUM\s*TOTAL:\s*(\d+)/);
      if (maxTotMatch) maxTotalDeclared = parseInt(maxTotMatch[1], 10);

      if (up.includes("NAME") || up.includes("STUDENT") || up.includes("ROLL")) {
        headerLineIdx = i;
        break;
      }
    }

    if (headerLineIdx === -1) {
      return {
        maxMarkPerSubject,
        subjects: [],
        students: [],
        warnings: ["Tesseract OCR: Could not clearly locate header row with student names."],
        providerUsed: "TESSERACT",
        durationMs: Date.now() - startTime
      };
    }

    const headerLine = lines[headerLineIdx];
    const headerCols = headerLine.split(/\s{2,}|\t+|\|/).map(c => c.trim()).filter(Boolean);

    let nameColIdx = -1;
    let rollColIdx = -1;
    let totalColIdx = -1;

    headerCols.forEach((col, idx) => {
      const up = col.toUpperCase();
      if (up.includes("ROLL") || up.includes("REG") || up.includes("ADM")) rollColIdx = idx;
      else if (up.includes("NAME") || up.includes("STUDENT")) nameColIdx = idx;
      else if (up === "TOTAL" || up.startsWith("TOTAL")) totalColIdx = idx;
    });

    if (nameColIdx === -1) nameColIdx = 0;

    const subjectCols: { name: string; idx: number }[] = [];
    headerCols.forEach((col, idx) => {
      if (idx === nameColIdx || idx === rollColIdx || idx === totalColIdx) return;
      const up = col.toUpperCase();
      if (up.includes("PERCENT") || up.includes("GRADE") || up.includes("RESULT") || up.includes("RANK") || up.includes("ATTENDANCE") || up.includes("S.NO") || up === "SNO") {
        return;
      }
      subjectCols.push({ name: normalizeSubjectName(col), idx });
    });

    const subjects = subjectCols.map(s => s.name);
    const students: ExtractedStudent[] = [];

    for (let i = headerLineIdx + 1; i < lines.length; i++) {
      const line = lines[i];
      const cols = line.split(/\s{2,}|\t+|\|/).map(c => c.trim()).filter(Boolean);
      if (cols.length < 2) continue;

      const nameVal = cols[nameColIdx] || "";
      if (!nameVal || nameVal.toUpperCase().includes("TOTAL") || nameVal.toUpperCase().includes("AVERAGE")) {
        continue;
      }

      const rollNo = rollColIdx !== -1 ? cols[rollColIdx] : undefined;
      const marks: Record<string, number | null | "AB"> = {};
      const confidence: Record<string, number> = {};

      let totalFromSheet: number | undefined;
      if (totalColIdx !== -1 && cols[totalColIdx]) {
        const parsedTot = parseFloat(cols[totalColIdx]);
        if (!isNaN(parsedTot)) totalFromSheet = parsedTot;
      }

      subjectCols.forEach(sc => {
        const rawCell = cols[sc.idx];
        if (!rawCell) {
          marks[sc.name] = null;
          confidence[sc.name] = 0;
        } else {
          const up = rawCell.toUpperCase();
          if (up === "AB" || up === "ABSENT") {
            marks[sc.name] = "AB";
            confidence[sc.name] = 0.8;
          } else {
            const num = parseFloat(rawCell.replace(/[^0-9.]/g, ""));
            if (isNaN(num)) {
              marks[sc.name] = null;
              confidence[sc.name] = 0.2;
            } else {
              marks[sc.name] = num;
              confidence[sc.name] = 0.75;
            }
          }
        }
      });

      students.push({
        name: nameVal,
        rollNo,
        marks,
        totalFromSheet,
        confidence
      });
    }

    return {
      maxMarkPerSubject,
      maxTotalDeclared,
      subjects,
      students,
      warnings,
      providerUsed: "TESSERACT",
      durationMs: Date.now() - startTime
    };
  }
}
