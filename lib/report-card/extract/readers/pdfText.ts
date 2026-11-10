import { extractText } from "unpdf";
import { ExtractedSheetResult, ExtractedStudent } from "../types";
import { normalizeSubjectName } from "../normalizer";

/**
 * Parses vector text extracted from digital PDFs.
 */
export async function extractFromPdfText(
  buffer: ArrayBuffer | Uint8Array | Buffer
): Promise<ExtractedSheetResult | null> {
  const startTime = Date.now();
  try {
    const uint8 = new Uint8Array(buffer);
    const pdfData = await extractText(uint8);
    const pages = pdfData.text || [];
    const fullText = pages.join("\n");

    if (!fullText || fullText.trim().length < 20) {
      return null; // Might be a scanned PDF requiring OCR/Vision
    }

    const lines = fullText
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(l => l.length > 0);

    const warnings: string[] = [];
    let headerLineIdx = -1;
    let maxMarkPerSubject = 100;
    let maxTotalDeclared: number | undefined;

    // Search header line
    for (let i = 0; i < Math.min(20, lines.length); i++) {
      const up = lines[i].toUpperCase();
      const eachMatch = up.match(/\/(\d+)\s*EACH/) || up.match(/OUT\s*OF\s*(\d+)/);
      if (eachMatch) maxMarkPerSubject = parseInt(eachMatch[1], 10);

      const maxTotMatch = up.match(/TOTAL\s*MARKS?:\s*(\d+)\s*MAXIMUM/) || up.match(/MAXIMUM\s*TOTAL:\s*(\d+)/);
      if (maxTotMatch) maxTotalDeclared = parseInt(maxTotMatch[1], 10);

      if (up.includes("STUDENT NAME") || up.includes("NAME") || up.includes("CANDIDATE")) {
        headerLineIdx = i;
        break;
      }
    }

    if (headerLineIdx === -1) {
      return null;
    }

    // Attempt to split header line by tabs, multiple spaces, or pipe
    const headerLine = lines[headerLineIdx];
    const headerCols = headerLine.split(/\t+|\s{2,}|\|/).map(c => c.trim()).filter(Boolean);

    let nameColIdx = -1;
    let rollColIdx = -1;
    let totalColIdx = -1;

    headerCols.forEach((col, idx) => {
      const up = col.toUpperCase();
      if (up.includes("ROLL") || up.includes("REG") || up.includes("ADMISSION")) rollColIdx = idx;
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
      const cols = line.split(/\t+|\s{2,}|\|/).map(c => c.trim()).filter(Boolean);
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
            confidence[sc.name] = 1.0;
          } else {
            const num = parseFloat(rawCell);
            if (isNaN(num)) {
              marks[sc.name] = null;
              confidence[sc.name] = 0.3;
            } else {
              marks[sc.name] = num;
              confidence[sc.name] = 1.0;
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

    if (students.length === 0 || subjects.length === 0) {
      return null;
    }

    return {
      maxMarkPerSubject,
      maxTotalDeclared,
      subjects,
      students,
      warnings,
      providerUsed: "UNPDF",
      durationMs: Date.now() - startTime
    };
  } catch {
    return null;
  }
}

