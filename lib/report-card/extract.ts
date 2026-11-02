import * as XLSX from "xlsx";
import { z } from "zod";
import {
  MARK_SHEET_VISION_PROMPT,
  ExtractedSheetVisionSchema,
  type ExtractedSheetVisionOutput
} from "./prompts";

export type ExtractedSheet = {
  testName?: string;
  className?: string;
  section?: string;
  maxMarkPerSubject: number;        // default 100, detect from "/100 EACH"
  maxTotalDeclared?: number;        // from "Total marks: 500 maximum"
  subjects: string[];               // dynamic: ["Tamil","English","Maths","Science","Social"]
  students: {
    name: string;
    rollNo?: string;
    marks: Record<string, number | null>;   // key = subject, null = unreadable
    totalFromSheet?: number;                // only for cross-checking
    confidence: Record<string, number>;     // 0..1 per cell
  }[];
  warnings: string[];               // shown to the teacher
};

/**
 * Subject name normalizer (map aliases to one canonical name).
 * Unknown names are converted to Title Case.
 */
export function normalizeSubjectName(raw: string): string {
  const clean = raw.trim().toUpperCase().replace(/[^A-Z0-9\s]/g, "");

  if (/^(MATHS?|MATHEMATICS|MATHS?1|MATHS?2)$/.test(clean)) return "Mathematics";
  if (/^(SOCIAL(\s*SCIENCE)?|SST|HIS(TORY)?|GEO(GRAPHY)?)$/.test(clean)) return "Social Science";
  if (/^(SCI(ENCE)?|GEN(ERAL)?\s*SCI(ENCE)?)$/.test(clean)) return "Science";
  if (/^(TAMIL|TAM)$/.test(clean)) return "Tamil";
  if (/^(ENG(LISH)?|LANG(\s*2)?)$/.test(clean)) return "English";
  if (/^(HINDI|HIN)$/.test(clean)) return "Hindi";
  if (/^(COMP(UTER)?(\s*SCI(ENCE)?)?|CS|IP|IT)$/.test(clean)) return "Computer Science";
  if (/^(EVS|ENV(IRONMENTAL)?(\s*STUDIES)?)$/.test(clean)) return "Environmental Studies";
  if (/^(PHYSICS|PHY)$/.test(clean)) return "Physics";
  if (/^(CHEM(ISTRY)?|CHE)$/.test(clean)) return "Chemistry";
  if (/^(BIO(LOGY)?|BOTANY|ZOOLOGY)$/.test(clean)) return "Biology";

  // Title Case fallback
  return raw
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Extracts student marks from spreadsheet files (.xlsx, .xls, .csv).
 */
export function extractFromSpreadsheet(buffer: ArrayBuffer | Uint8Array | Buffer): ExtractedSheet {
  const wb = XLSX.read(buffer, { type: "array" });
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const rawRows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

  const warnings: string[] = [];
  let headerRowIdx = -1;
  let testName: string | undefined;
  let className: string | undefined;
  let section: string | undefined;
  let maxMarkPerSubject = 100;
  let maxTotalDeclared: number | undefined;

  // Search header row and metadata
  for (let r = 0; r < Math.min(10, rawRows.length); r++) {
    const rowStr = rawRows[r].map((c: any) => String(c).trim()).join(" ").toUpperCase();

    // Check for max marks in title/header
    const eachMatch = rowStr.match(/\/(\d+)\s*EACH/) || rowStr.match(/OUT\s*OF\s*(\d+)/);
    if (eachMatch) maxMarkPerSubject = parseInt(eachMatch[1], 10);

    const maxTotMatch = rowStr.match(/TOTAL\s*MARKS?:\s*(\d+)\s*MAXIMUM/) || rowStr.match(/MAXIMUM\s*TOTAL:\s*(\d+)/);
    if (maxTotMatch) maxTotalDeclared = parseInt(maxTotMatch[1], 10);

    if (rowStr.includes("STUDENT NAME") || rowStr.includes("NAME") || rowStr.includes("CANDIDATE")) {
      headerRowIdx = r;
      break;
    }
  }

  if (headerRowIdx === -1) {
    return {
      maxMarkPerSubject: 100,
      subjects: [],
      students: [],
      warnings: ["Could not locate the header row containing 'STUDENT NAME' or 'NAME'."]
    };
  }

  const headerRow = rawRows[headerRowIdx].map((c: any) => String(c).trim());
  let nameColIdx = -1;
  let rollColIdx = -1;
  let totalColIdx = -1;

  headerRow.forEach((colName, idx) => {
    const up = colName.toUpperCase();
    if (up.includes("ROLL") || up.includes("REG") || up.includes("ADMISSION")) rollColIdx = idx;
    else if (up.includes("NAME") || up.includes("STUDENT")) nameColIdx = idx;
    else if (up === "TOTAL" || up.startsWith("TOTAL")) totalColIdx = idx;
  });

  if (nameColIdx === -1) nameColIdx = 0;

  // Identify subjects: every column between the name/roll columns and the TOTAL column
  const subjectCols: { name: string; idx: number }[] = [];
  headerRow.forEach((colName, idx) => {
    if (idx === nameColIdx || idx === rollColIdx || idx === totalColIdx) return;
    const up = colName.toUpperCase();
    if (up.includes("PERCENT") || up.includes("GRADE") || up.includes("RESULT") || up.includes("RANK") || up.includes("ATTENDANCE") || up.includes("S.NO") || up === "SNO") {
      return;
    }
    if (colName.trim()) {
      subjectCols.push({ name: normalizeSubjectName(colName), idx });
    }
  });

  const subjects = subjectCols.map(s => s.name);

  // Validate declared max total vs detected subject count
  if (maxTotalDeclared && subjects.length > 0) {
    const expectedSubjectCount = Math.round(maxTotalDeclared / maxMarkPerSubject);
    if (expectedSubjectCount !== subjects.length) {
      warnings.push(`Expected ${expectedSubjectCount} subjects based on declared maximum ${maxTotalDeclared}, but found ${subjects.length}. A column may be missing.`);
    }
  }

  // Extract student data
  const students: ExtractedSheet["students"] = [];

  for (let r = headerRowIdx + 1; r < rawRows.length; r++) {
    const row = rawRows[r];
    const nameVal = String(row[nameColIdx] || "").trim();
    if (!nameVal || nameVal.toUpperCase().includes("TOTAL") || nameVal.toUpperCase().includes("AVERAGE")) {
      continue;
    }

    const rollNo = rollColIdx !== -1 ? String(row[rollColIdx] || "").trim() : undefined;
    const marks: Record<string, number | null> = {};
    const confidence: Record<string, number> = {};

    let totalFromSheet: number | undefined;
    if (totalColIdx !== -1 && row[totalColIdx] !== undefined && row[totalColIdx] !== "") {
      const parsedTot = parseFloat(String(row[totalColIdx]));
      if (!isNaN(parsedTot)) totalFromSheet = parsedTot;
    }

    subjectCols.forEach(sc => {
      const cellVal = row[sc.idx];
      if (cellVal === "" || cellVal === null || cellVal === undefined) {
        marks[sc.name] = null;
        confidence[sc.name] = 0;
      } else {
        const num = parseFloat(String(cellVal));
        if (isNaN(num)) {
          marks[sc.name] = null;
          confidence[sc.name] = 0.3;
        } else {
          marks[sc.name] = num;
          confidence[sc.name] = 1.0;
        }
      }
    });

    // Recalculate total and cross-check
    const calculatedSum = Object.values(marks).reduce<number>((acc, m) => (m !== null ? acc + m : acc), 0);
    if (totalFromSheet !== undefined && totalFromSheet !== calculatedSum) {
      warnings.push(`${nameVal}: sheet total ${totalFromSheet} vs calculated ${calculatedSum}, please check.`);
    }

    students.push({
      name: nameVal,
      rollNo,
      marks,
      totalFromSheet,
      confidence
    });
  }

  return {
    testName,
    className,
    section,
    maxMarkPerSubject,
    maxTotalDeclared,
    subjects,
    students,
    warnings
  };
}

/**
 * Extracts student marks using Google Gemini Vision (free tier) with Zod validation.
 */
export async function extractWithGeminiVision(
  imageBuffer: Buffer,
  mimeType: string = "image/png"
): Promise<ExtractedSheet | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const base64Data = imageBuffer.toString("base64");

  const runCall = async (): Promise<ExtractedSheetVisionOutput | null> => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: MARK_SHEET_VISION_PROMPT },
                  { inline_data: { mime_type: mimeType, data: base64Data } }
                ]
              }
            ],
            generationConfig: {
              response_mime_type: "application/json",
              temperature: 0.1
            }
          })
        }
      );

      clearTimeout(timeout);
      if (!res.ok) return null;

      const data = await res.json();
      const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) return null;

      const parsed = JSON.parse(rawText);
      const validated = ExtractedSheetVisionSchema.safeParse(parsed);
      return validated.success ? validated.data : null;
    } catch {
      return null;
    }
  };

  // Primary call + 1 retry on validation failure
  let output = await runCall();
  if (!output) {
    output = await runCall();
  }

  if (!output) return null;

  const warnings: string[] = [];
  const normalizedSubjects = output.subjects.map(normalizeSubjectName);

  if (output.maxTotal && normalizedSubjects.length > 0) {
    const expected = Math.round(output.maxTotal / output.maxPerSubject);
    if (expected !== normalizedSubjects.length) {
      warnings.push(`Expected ${expected} subjects based on declared maximum ${output.maxTotal}, but found ${normalizedSubjects.length}. A column may be missing.`);
    }
  }

  const students = output.students.map(st => {
    const marks: Record<string, number | null> = {};
    const confidence: Record<string, number> = {};

    normalizedSubjects.forEach((subName, idx) => {
      const origKey = output!.subjects[idx] || subName;
      let val = st.marks[origKey] !== undefined ? st.marks[origKey] : st.marks[subName];
      if (val === undefined) val = null;

      marks[subName] = val;
      confidence[subName] = val !== null ? (output!.uncertain.includes(`${st.name}-${subName}`) ? 0.4 : 0.95) : 0;
    });

    const calculatedSum = Object.values(marks).reduce<number>((acc, m) => (m !== null ? acc + m : acc), 0);
    if (st.total !== null && st.total !== undefined && st.total !== calculatedSum) {
      warnings.push(`${st.name}: sheet total ${st.total} vs calculated ${calculatedSum}, please check.`);
    }

    return {
      name: st.name,
      rollNo: st.rollNo || undefined,
      marks,
      totalFromSheet: st.total || undefined,
      confidence
    };
  });

  return {
    maxMarkPerSubject: output.maxPerSubject || 100,
    maxTotalDeclared: output.maxTotal || undefined,
    subjects: normalizedSubjects,
    students,
    warnings
  };
}
