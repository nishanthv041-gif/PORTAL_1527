"use server";

import { prisma } from "@/backend/db/prisma";
import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import * as XLSX from "xlsx";
import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";
import { createWorker } from "tesseract.js";
import type { ScannedSlot, ScanResult } from "./scanTimetableTypes";

const DAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
const DAY_ALIASES: Record<string, string> = {
  "MON": "MONDAY",
  "MONDAY": "MONDAY",
  "TUE": "TUESDAY",
  "TUES": "TUESDAY",
  "TUESDAY": "TUESDAY",
  "WED": "WEDNESDAY",
  "WEDNESDAY": "WEDNESDAY",
  "THU": "THURSDAY",
  "THUR": "THURSDAY",
  "THURS": "THURSDAY",
  "THURSDAY": "THURSDAY",
  "FRI": "FRIDAY",
  "FRIDAY": "FRIDAY",
  "SAT": "SATURDAY",
  "SATURDAY": "SATURDAY",
};

const DEFAULT_TIMES: Record<number, { start: string; end: string }> = {
  1: { start: "08:00", end: "08:45" },
  2: { start: "08:45", end: "09:30" },
  3: { start: "09:30", end: "10:15" },
  4: { start: "10:30", end: "11:15" },
  5: { start: "11:15", end: "12:00" },
  6: { start: "12:45", end: "13:30" },
  7: { start: "13:30", end: "14:15" },
  8: { start: "14:15", end: "15:00" },
};

const COMMON_SUBJECT_SYNONYMS: Record<string, string[]> = {
  "mathematics": ["math", "maths", "algebra", "geometry", "calc", "arithmetic"],
  "english": ["eng", "grammar", "literature", "reading"],
  "science": ["sci", "general science", "basic science"],
  "physics": ["phy", "ps"],
  "chemistry": ["chem"],
  "biology": ["bio", "botany", "zoology"],
  "social studies": ["social", "sst", "history", "civics", "geography", "evs"],
  "computer science": ["computer", "comp", "cs", "it", "informatics", "coding"],
  "physical education": ["pe", "pet", "sports", "games", "pt"],
  "hindi": ["hin"],
  "tamil": ["tam"],
  "arts": ["art", "drawing", "craft", "music"],
};


function normalizeDay(rawDay: string): string | null {
  if (!rawDay) return null;
  const clean = rawDay.trim().toUpperCase().replace(/[^A-Z]/g, "");
  for (const [alias, fullDay] of Object.entries(DAY_ALIASES)) {
    if (clean === alias || clean.startsWith(alias)) {
      return fullDay;
    }
  }
  return null;
}

function normalizeBreak(val: string): boolean {
  if (!val) return false;
  const lower = val.toLowerCase().trim();
  return (
    lower === "break" ||
    lower === "lunch" ||
    lower === "recess" ||
    lower === "interval" ||
    lower === "tiffin" ||
    lower === "snack" ||
    lower === "free" ||
    lower.includes("lunch") ||
    lower.includes("recess") ||
    lower.includes("interval")
  );
}

function matchSubject(
  rawName: string,
  availableSubjects: Array<{ id: string; name: string }>
): { subjectId: string; subjectName: string; isMatched: boolean } {
  const clean = rawName.trim().toLowerCase();
  if (!clean) return { subjectId: "", subjectName: "", isMatched: false };

  // 1. Exact or partial name match
  for (const s of availableSubjects) {
    const sName = s.name.trim().toLowerCase();
    if (sName === clean || clean.includes(sName) || sName.includes(clean)) {
      return { subjectId: s.id, subjectName: s.name, isMatched: true };
    }
  }

  // 2. Synonyms match
  for (const [canonical, synonyms] of Object.entries(COMMON_SUBJECT_SYNONYMS)) {
    if (clean === canonical || synonyms.some(syn => clean === syn || clean.includes(syn))) {
      const found = availableSubjects.find(s => {
        const sName = s.name.toLowerCase();
        return sName === canonical || synonyms.some(syn => sName.includes(syn));
      });
      if (found) {
        return { subjectId: found.id, subjectName: found.name, isMatched: true };
      }
    }
  }

  // 3. Fallback: if availableSubjects has at least one subject, suggest raw name
  return {
    subjectId: availableSubjects[0]?.id || "",
    subjectName: rawName.trim(),
    isMatched: false
  };
}

export async function scanTimetableAction(formData: FormData): Promise<ScanResult> {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session || session.user.role !== "ADMIN") return { error: "Unauthorized" };

    const classId = formData.get("classId") as string;
    const file = formData.get("file") as File;

    if (!classId) return { error: "Please select a class first." };
    if (!file) return { error: "Please select a file to scan." };

    const availableSubjects = await prisma.subject.findMany({
      where: { classId, isActive: true },
      select: { id: true, name: true }
    });

    const fileName = file.name || "uploaded-file";
    const extension = fileName.split(".").pop()?.toLowerCase() || "";
    const mimeType = file.type || "";

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    let fileType = "Document";
    const scannedSlots: ScannedSlot[] = [];
    const warnings: string[] = [];

    // ────────────────────────────────────────────────────────────────
    // 1. EXCEL / SPREADSHEET (.xlsx, .xls, .csv)
    // ────────────────────────────────────────────────────────────────
    if (
      ["xlsx", "xls", "csv"].includes(extension) ||
      mimeType.includes("spreadsheet") ||
      mimeType.includes("excel") ||
      mimeType.includes("csv")
    ) {
      fileType = "Excel Spreadsheet";
      const wb = XLSX.read(buffer, { type: "buffer" });
      const wsName = wb.SheetNames[0];
      const ws = wb.Sheets[wsName];

      const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
      if (!rows || rows.length === 0) {
        return { error: "The uploaded spreadsheet is empty." };
      }

      // Check if it has header row with "Day", "Period", "Subject" (List format)
      const headerIndex = rows.findIndex(r => 
        r.some((c: any) => String(c).toLowerCase().includes("day")) &&
        r.some((c: any) => String(c).toLowerCase().includes("period") || String(c).toLowerCase().includes("subject"))
      );

      if (headerIndex !== -1 && rows.length > headerIndex + 1) {
        // List format
        const headerRow = rows[headerIndex].map((c: any) => String(c || "").trim().toLowerCase());
        const dayCol = headerRow.findIndex((c: string) => c.includes("day"));
        const periodCol = headerRow.findIndex((c: string) => c.includes("period"));
        const subjectCol = headerRow.findIndex((c: string) => c.includes("subject"));
        const startCol = headerRow.findIndex((c: string) => c.includes("start"));
        const endCol = headerRow.findIndex((c: string) => c.includes("end"));
        const roomCol = headerRow.findIndex((c: string) => c.includes("room") || c.includes("class"));
        const breakCol = headerRow.findIndex((c: string) => c.includes("break"));

        for (let r = headerIndex + 1; r < rows.length; r++) {
          const row = rows[r];
          if (!row || row.length === 0) continue;

          const rawDay = String(row[dayCol] || "");
          const normDay = normalizeDay(rawDay);
          const rawPeriod = parseInt(String(row[periodCol] || ""), 10);
          const rawSubject = String(row[subjectCol] || "").trim();
          const isBreak = breakCol !== -1 ? normalizeBreak(String(row[breakCol])) : normalizeBreak(rawSubject);

          if (!normDay || isNaN(rawPeriod) || rawPeriod < 1 || rawPeriod > 8) {
            continue;
          }

          const matched = isBreak ? { subjectId: "", subjectName: "Break / Recess", isMatched: true } : matchSubject(rawSubject, availableSubjects);
          if (!isBreak && !matched.isMatched && rawSubject) {
            warnings.push(`Row ${r + 1}: Subject "${rawSubject}" was not an exact match. Assigned to "${matched.subjectName}".`);
          }

          scannedSlots.push({
            id: `slot-${normDay}-${rawPeriod}-${Date.now()}-${Math.random()}`,
            dayOfWeek: normDay,
            period: rawPeriod,
            subjectId: isBreak ? "" : matched.subjectId,
            subjectName: isBreak ? "Break" : matched.subjectName,
            startTime: String(row[startCol] || "").trim() || DEFAULT_TIMES[rawPeriod]?.start || "08:00",
            endTime: String(row[endCol] || "").trim() || DEFAULT_TIMES[rawPeriod]?.end || "08:45",
            classroom: String(row[roomCol] || "").trim(),
            isBreak
          });
        }
      } else {
        // Matrix format: Rows are Days, Columns are Periods (or vice-versa)
        for (let r = 0; r < rows.length; r++) {
          const row = rows[r];
          if (!row || row.length === 0) continue;

          const firstCell = String(row[0] || "");
          const normDay = normalizeDay(firstCell);
          if (!normDay) continue;

          // Columns 1 to 8 correspond to Period 1 to 8
          for (let p = 1; p <= 8 && p < row.length; p++) {
            const rawCell = String(row[p] || "").trim();
            if (!rawCell) continue;

            const isBreak = normalizeBreak(rawCell);
            const matched = isBreak ? { subjectId: "", subjectName: "Break", isMatched: true } : matchSubject(rawCell, availableSubjects);

            if (!isBreak && !matched.isMatched && rawCell) {
              warnings.push(`${normDay} Period ${p}: Subject "${rawCell}" suggested as "${matched.subjectName}".`);
            }

            scannedSlots.push({
              id: `slot-${normDay}-${p}-${Date.now()}-${Math.random()}`,
              dayOfWeek: normDay,
              period: p,
              subjectId: isBreak ? "" : matched.subjectId,
              subjectName: isBreak ? "Break" : matched.subjectName,
              startTime: DEFAULT_TIMES[p]?.start || "08:00",
              endTime: DEFAULT_TIMES[p]?.end || "08:45",
              classroom: "",
              isBreak
            });
          }
        }
      }
    }

    // ────────────────────────────────────────────────────────────────
    // 2. WORD DOCUMENT (.docx)
    // ────────────────────────────────────────────────────────────────
    else if (
      extension === "docx" ||
      extension === "doc" ||
      mimeType.includes("word") ||
      mimeType.includes("officedocument.wordprocessingml")
    ) {
      fileType = "Word Document";
      const htmlResult = await mammoth.convertToHtml({ buffer });
      const html = htmlResult.value;

      // Extract tables from HTML: <tr>...<td>...
      const tableRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
      let trMatch;
      const parsedRows: string[][] = [];

      while ((trMatch = tableRegex.exec(html)) !== null) {
        const rowContent = trMatch[1];
        const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>|<th[^>]*>([\s\S]*?)<\/th>/gi;
        let tdMatch;
        const cells: string[] = [];
        while ((tdMatch = cellRegex.exec(rowContent)) !== null) {
          const cleanText = (tdMatch[1] || tdMatch[2] || "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").trim();
          cells.push(cleanText);
        }
        if (cells.length > 0) {
          parsedRows.push(cells);
        }
      }

      if (parsedRows.length > 0) {
        // Iterate table rows to find days and period cells
        for (const cells of parsedRows) {
          const normDay = normalizeDay(cells[0]);
          if (!normDay) continue;

          for (let p = 1; p <= 8 && p < cells.length; p++) {
            const rawCell = cells[p].trim();
            if (!rawCell) continue;

            const isBreak = normalizeBreak(rawCell);
            const matched = isBreak ? { subjectId: "", subjectName: "Break", isMatched: true } : matchSubject(rawCell, availableSubjects);

            scannedSlots.push({
              id: `slot-${normDay}-${p}-${Date.now()}-${Math.random()}`,
              dayOfWeek: normDay,
              period: p,
              subjectId: isBreak ? "" : matched.subjectId,
              subjectName: isBreak ? "Break" : matched.subjectName,
              startTime: DEFAULT_TIMES[p]?.start || "08:00",
              endTime: DEFAULT_TIMES[p]?.end || "08:45",
              classroom: "",
              isBreak
            });
          }
        }
      } else {
        // Fallback to raw text parsing
        const textResult = await mammoth.extractRawText({ buffer });
        parseTextLinesIntoSlots(textResult.value, availableSubjects, scannedSlots, warnings);
      }
    }

    // ────────────────────────────────────────────────────────────────
    // 3. PDF DOCUMENT (.pdf)
    // ────────────────────────────────────────────────────────────────
    else if (extension === "pdf" || mimeType.includes("pdf")) {
      fileType = "PDF Document";
      const parser = new PDFParse({ data: buffer });
      const pdfData = await parser.getText();
      const text = pdfData.text || "";
      await parser.destroy();
      parseTextLinesIntoSlots(text, availableSubjects, scannedSlots, warnings);
    }

    // ────────────────────────────────────────────────────────────────
    // 4. PHOTO / IMAGE (.png, .jpg, .jpeg, .webp, .bmp)
    // ────────────────────────────────────────────────────────────────
    else if (
      ["png", "jpg", "jpeg", "webp", "bmp"].includes(extension) ||
      mimeType.startsWith("image/")
    ) {
      fileType = "Photo / Image";
      const worker = await createWorker("eng");
      const ret = await worker.recognize(buffer);
      await worker.terminate();

      const ocrText = ret.data.text || "";
      parseTextLinesIntoSlots(ocrText, availableSubjects, scannedSlots, warnings);
    } else {
      // General text fallback
      const textContent = buffer.toString("utf-8");
      parseTextLinesIntoSlots(textContent, availableSubjects, scannedSlots, warnings);
    }

    if (scannedSlots.length === 0) {
      return {
        error: `Could not detect timetable data from "${fileName}". Please ensure the file contains Days (e.g., Monday to Saturday) and Periods with Subject names, or enter them manually.`,
        fileName,
        fileType
      };
    }

    return {
      success: true,
      fileName,
      fileType,
      scannedSlots,
      warnings,
      totalScanned: scannedSlots.length
    };
  } catch (error: unknown) {
    console.error("Error scanning timetable document:", error);
    return {
      error: error instanceof Error ? error.message : "Failed to parse timetable document."
    };
  }
}

/**
 * Universal text line parser for PDF, OCR Images, and plain text
 */
function parseTextLinesIntoSlots(
  text: string,
  availableSubjects: Array<{ id: string; name: string }>,
  scannedSlots: ScannedSlot[],
  warnings: string[]
) {
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  let currentDay: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check if line specifies day
    const normDay = normalizeDay(line);
    if (normDay) {
      currentDay = normDay;
      continue;
    }

    // If day is set, check if line contains periods or subjects
    if (currentDay) {
      // E.g., "Period 1: Math (08:00 - 08:45) Room 101" or "1. Mathematics" or "P1 - Science"
      const periodMatch = line.match(/(?:period\s*|p\s*|^)([1-8])\s*[:\.\-\)]\s*(.*)/i);
      if (periodMatch) {
        const periodNum = parseInt(periodMatch[1], 10);
        const rest = periodMatch[2].trim();
        const isBreak = normalizeBreak(rest);
        const matched = isBreak ? { subjectId: "", subjectName: "Break", isMatched: true } : matchSubject(rest, availableSubjects);

        scannedSlots.push({
          id: `slot-${currentDay}-${periodNum}-${Date.now()}-${Math.random()}`,
          dayOfWeek: currentDay,
          period: periodNum,
          subjectId: isBreak ? "" : matched.subjectId,
          subjectName: isBreak ? "Break" : matched.subjectName,
          startTime: DEFAULT_TIMES[periodNum]?.start || "08:00",
          endTime: DEFAULT_TIMES[periodNum]?.end || "08:45",
          classroom: "",
          isBreak
        });
        continue;
      }

      // Check if line contains tab-separated or pipe-separated columns:
      const parts = line.split(/[\t|]+/).map(p => p.trim()).filter(Boolean);
      if (parts.length >= 2) {
        const firstAsDay = normalizeDay(parts[0]);
        const dayToUse = firstAsDay || currentDay;
        const startIndex = firstAsDay ? 1 : 0;

        for (let pIndex = 0; pIndex < 8 && (startIndex + pIndex) < parts.length; pIndex++) {
          const rawCell = parts[startIndex + pIndex];
          const period = pIndex + 1;
          const isBreak = normalizeBreak(rawCell);
          const matched = isBreak ? { subjectId: "", subjectName: "Break", isMatched: true } : matchSubject(rawCell, availableSubjects);

          scannedSlots.push({
            id: `slot-${dayToUse}-${period}-${Date.now()}-${Math.random()}`,
            dayOfWeek: dayToUse,
            period,
            subjectId: isBreak ? "" : matched.subjectId,
            subjectName: isBreak ? "Break" : matched.subjectName,
            startTime: DEFAULT_TIMES[period]?.start || "08:00",
            endTime: DEFAULT_TIMES[period]?.end || "08:45",
            classroom: "",
            isBreak
          });
        }
      }
    }
  }

  // Deduplicate slots by dayOfWeek + period (keep last)
  const uniqueMap = new Map<string, ScannedSlot>();
  for (const s of scannedSlots) {
    uniqueMap.set(`${s.dayOfWeek}-${s.period}`, s);
  }
  scannedSlots.length = 0;
  scannedSlots.push(...Array.from(uniqueMap.values()));
}
