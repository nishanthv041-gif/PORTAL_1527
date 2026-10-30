"use server";

import { prisma } from "@/backend/db/prisma";
import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import * as XLSX from "xlsx";
import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";
import type { ScannedSlot, ScanResult } from "./scanTimetableTypes";
import type { PeriodSlotData, PeriodType } from "@/backend/lib/timetable/timetableTypes";
import { extractTimetableWithGemini, type GeminiTimetableOutput } from "./extractTimetableGemini";

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
  3: { start: "09:30", end: "09:45" }, // break
  4: { start: "09:45", end: "10:30" },
  5: { start: "10:30", end: "11:15" },
  6: { start: "11:15", end: "12:00" },
  7: { start: "12:00", end: "12:45" }, // lunch
  8: { start: "12:45", end: "13:30" },
  9: { start: "13:30", end: "14:15" },
  10: { start: "14:15", end: "15:00" }
};

const COMMON_SUBJECT_SYNONYMS: Record<string, string[]> = {
  "mathematics": ["math", "maths", "algebra", "geometry", "calc", "arithmetic", "quant", "standard maths"],
  "english": ["eng", "grammar", "literature", "reading", "general english", "eng lit"],
  "science": ["sci", "general science", "basic science", "sci & tech", "natural science"],
  "physics": ["phy", "ps", "phys"],
  "chemistry": ["chem"],
  "biology": ["bio", "botany", "zoology"],
  "social studies": ["social", "sst", "history", "civics", "geography", "evs", "social science", "soc sci"],
  "computer science": ["computer", "comp", "cs", "it", "informatics", "coding", "ict"],
  "physical education": ["pe", "pet", "sports", "games", "pt"],
  "hindi": ["hin"],
  "tamil": ["tam", "regional language"],
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

function normalizeBreak(val: string): { isBreak: boolean; type: PeriodType } {
  if (!val) return { isBreak: false, type: "LESSON" };
  const lower = val.toLowerCase().trim();
  if (lower.includes("lunch") || lower.includes("tiffin") || lower.includes("dinner")) {
    return { isBreak: true, type: "LUNCH" };
  }
  if (
    lower === "break" ||
    lower === "recess" ||
    lower === "interval" ||
    lower === "snack" ||
    lower.includes("break") ||
    lower.includes("recess") ||
    lower.includes("interval")
  ) {
    return { isBreak: true, type: "BREAK" };
  }
  if (lower === "assembly" || lower.includes("prayer")) {
    return { isBreak: true, type: "ASSEMBLY" };
  }
  if (lower === "free" || lower === "library" || lower === "study") {
    return { isBreak: false, type: "FREE" };
  }
  return { isBreak: false, type: "LESSON" };
}

function cleanString(str: string): string {
  return (str || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function matchSubject(
  rawName: string,
  availableSubjects: Array<{ id: string; name: string; teacherId?: string | null; teacher?: { user: { name: string } } | null }>
): { subjectId: string; subjectName: string; isMatched: boolean; defaultTeacherId?: string | null; defaultTeacherName?: string | null } {
  const clean = rawName.trim().toLowerCase();
  if (!clean) return { subjectId: "", subjectName: "", isMatched: false };

  // 1. Exact or partial name match
  for (const s of availableSubjects) {
    const sName = s.name.trim().toLowerCase();
    if (sName === clean || clean.includes(sName) || sName.includes(clean)) {
      return {
        subjectId: s.id,
        subjectName: s.name,
        isMatched: true,
        defaultTeacherId: s.teacherId,
        defaultTeacherName: s.teacher?.user?.name
      };
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
        return {
          subjectId: found.id,
          subjectName: found.name,
          isMatched: true,
          defaultTeacherId: found.teacherId,
          defaultTeacherName: found.teacher?.user?.name
        };
      }
    }
  }

  // 3. Fallback: flag as unmapped subject so user can map it
  return {
    subjectId: "",
    subjectName: rawName.trim(),
    isMatched: false
  };
}

function matchTeacher(
  rawTeacherName: string | null | undefined,
  allTeachers: Array<{ id: string; name: string }>,
  defaultTeacherId?: string | null,
  defaultTeacherName?: string | null
): { teacherId?: string; teacherName?: string; isMismatch: boolean } {
  if (!rawTeacherName || !rawTeacherName.trim()) {
    // AUTO-FILL assigned teacher if no teacher was provided in the file! (Solves "No Teacher")
    if (defaultTeacherId && defaultTeacherName) {
      return {
        teacherId: defaultTeacherId,
        teacherName: defaultTeacherName,
        isMismatch: false
      };
    }
    return { isMismatch: false };
  }

  const clean = cleanString(rawTeacherName);

  // Exact or contains match
  for (const t of allTeachers) {
    const tClean = cleanString(t.name);
    if (tClean === clean || tClean.includes(clean) || clean.includes(tClean)) {
      const isMismatch = Boolean(defaultTeacherId && defaultTeacherId !== t.id);
      return {
        teacherId: t.id,
        teacherName: t.name,
        isMismatch
      };
    }
  }

  // If no match found among school teachers, use assigned teacher if available, else preserve raw name
  if (defaultTeacherId && defaultTeacherName) {
    return {
      teacherId: defaultTeacherId,
      teacherName: defaultTeacherName,
      isMismatch: false
    };
  }

  return {
    teacherName: rawTeacherName.trim(),
    isMismatch: false
  };
}

export async function scanTimetableAction(formData: FormData): Promise<ScanResult> {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session || session.user.role !== "ADMIN") return { error: "Unauthorized: Admin access required." };

    const classId = formData.get("classId") as string;
    const file = formData.get("file") as File | null;
    const clientJsonPayload = formData.get("clientJson") as string | null;

    if (!classId) return { error: "Please select a class first." };

    // Fetch class subjects with assigned teacher
    const availableSubjects = await prisma.subject.findMany({
      where: { classId, isActive: true },
      include: {
        teacher: { include: { user: true } }
      }
    });

    // Fetch all teachers in school for auto-matching
    const teachersList = await prisma.teacher.findMany({
      where: { isActive: true },
      include: { user: true }
    });
    const allTeachers = teachersList.map(t => ({ id: t.id, name: t.user.name }));

    // Fetch school period slots
    const existingPeriodSlots = await prisma.periodSlot.findMany({
      where: { OR: [{ classId }, { classId: null }] },
      orderBy: { order: "asc" }
    });

    const scannedSlots: ScannedSlot[] = [];
    const detectedPeriods: PeriodSlotData[] = [];
    const warnings: string[] = [];
    let fileType = "Document";
    let fileName = file?.name || "timetable-import.json";

    // ────────────────────────────────────────────────────────────────
    // SCENARIO A: Direct client JSON payload (e.g. from SheetJS browser parser)
    // ────────────────────────────────────────────────────────────────
    if (clientJsonPayload) {
      fileType = "Structured JSON";
      try {
        const parsedJson = JSON.parse(clientJsonPayload);
        mapStructuredJsonToSlots({
          data: parsedJson,
          availableSubjects,
          allTeachers,
          existingPeriodSlots,
          scannedSlots,
          detectedPeriods,
          warnings
        });
      } catch (jsonErr: any) {
        return { error: `Failed to parse structured JSON: ${jsonErr.message}` };
      }
    }
    else if (file) {
      fileName = file.name;
      const extension = fileName.split(".").pop()?.toLowerCase() || "";
      const mimeType = file.type || "";
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // ────────────────────────────────────────────────────────────────
      // SCENARIO B: Images / Photos (Gemini Vision + In-Memory fallback)
      // ────────────────────────────────────────────────────────────────
      if (mimeType.startsWith("image/") || /\.(jpg|jpeg|png|webp|bmp)$/i.test(extension)) {
        fileType = "Image / Photo";
        const isGeminiConfigured = Boolean(process.env.GEMINI_API_KEY);

        let geminiOutput: GeminiTimetableOutput | null = null;
        if (isGeminiConfigured) {
          geminiOutput = await extractTimetableWithGemini({
            buffer,
            mimeType: mimeType || "image/jpeg"
          });
        }

        if (geminiOutput && geminiOutput.classes && geminiOutput.classes.length > 0) {
          mapStructuredJsonToSlots({
            data: geminiOutput,
            availableSubjects,
            allTeachers,
            existingPeriodSlots,
            scannedSlots,
            detectedPeriods,
            warnings
          });
        } else {
          // Fallback in-memory Tesseract recognition
          try {
            const { createWorker } = await import("tesseract.js");
            const worker = await createWorker("eng");
            const ret = await worker.recognize(buffer);
            await worker.terminate();
            const text = ret?.data?.text || "";
            if (text.trim().length > 10) {
              parseRawTextToSlots({
                text,
                availableSubjects,
                allTeachers,
                existingPeriodSlots,
                scannedSlots,
                detectedPeriods
              });
            }
          } catch (tessErr) {
            console.warn("Tesseract fallback notice:", tessErr);
          }
        }
      }

      // ────────────────────────────────────────────────────────────────
      // SCENARIO C: Excel / Spreadsheet (.xlsx, .xls, .csv)
      // ────────────────────────────────────────────────────────────────
      else if (extension === "xlsx" || extension === "xls" || extension === "csv") {
        fileType = "Spreadsheet";
        const workbook = XLSX.read(buffer, { type: "buffer" });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const rows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        parseTableRowsToSlots({
          rows,
          availableSubjects,
          allTeachers,
          existingPeriodSlots,
          scannedSlots,
          detectedPeriods
        });
      }

      // ────────────────────────────────────────────────────────────────
      // SCENARIO D: Word Document (.docx)
      // ────────────────────────────────────────────────────────────────
      else if (extension === "docx" || extension === "doc") {
        fileType = "Word Document";
        const htmlResult = await mammoth.convertToHtml({ buffer });
        const html = htmlResult.value;

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
          if (cells.length > 0) parsedRows.push(cells);
        }

        if (parsedRows.length > 0) {
          parseTableRowsToSlots({
            rows: parsedRows,
            availableSubjects,
            allTeachers,
            existingPeriodSlots,
            scannedSlots,
            detectedPeriods
          });
        }
      }

      // ────────────────────────────────────────────────────────────────
      // SCENARIO E: PDF Document (.pdf)
      // ────────────────────────────────────────────────────────────────
      else if (extension === "pdf") {
        fileType = "PDF Document";
        try {
          const uint8 = new Uint8Array(buffer);
          const pdf = await getDocumentProxy(uint8);
          const { text } = await extractText(pdf, { mergePages: true });
          parseRawTextToSlots({
            text: text || "",
            availableSubjects,
            allTeachers,
            existingPeriodSlots,
            scannedSlots,
            detectedPeriods
          });
        } catch (pdfErr) {
          console.warn("PDF parse error:", pdfErr);
        }
      }
    }

    // Deduplicate slots by (dayOfWeek, period)
    const uniqueMap = new Map<string, ScannedSlot>();
    for (const slot of scannedSlots) {
      const normDay = normalizeDay(slot.dayOfWeek);
      if (!normDay || slot.period < 1 || slot.period > 10) continue;
      uniqueMap.set(`${normDay}-${slot.period}`, {
        ...slot,
        dayOfWeek: normDay
      });
    }

    const finalSlots = Array.from(uniqueMap.values());
    finalSlots.sort((a, b) => {
      const dayA = DAYS.indexOf(a.dayOfWeek);
      const dayB = DAYS.indexOf(b.dayOfWeek);
      if (dayA !== dayB) return dayA - dayB;
      return a.period - b.period;
    });

    if (finalSlots.length === 0) {
      return {
        error: `Could not extract timetable data from "${fileName}". Please ensure the file contains day rows/columns and period subjects, or enter them manually.`,
        fileName,
        fileType,
        scannerConfigured: Boolean(process.env.GEMINI_API_KEY)
      };
    }

    return {
      success: true,
      fileName,
      fileType,
      periods: detectedPeriods.length > 0 ? detectedPeriods : undefined,
      scannedSlots: finalSlots,
      warnings,
      totalScanned: finalSlots.length,
      scannerConfigured: Boolean(process.env.GEMINI_API_KEY)
    };
  } catch (error: any) {
    console.error("Timetable scan action error:", error);
    return {
      error: error.message || "An unexpected error occurred during timetable extraction."
    };
  }
}

/**
 * Helper to map standard JSON shape:
 * { periods: [...], classes: [{ className: "...", days: [{ day: "MONDAY", slots: [...] }] }] }
 */
function mapStructuredJsonToSlots(opts: {
  data: any;
  availableSubjects: any[];
  allTeachers: any[];
  existingPeriodSlots: any[];
  scannedSlots: ScannedSlot[];
  detectedPeriods: PeriodSlotData[];
  warnings: string[];
}) {
  const { data, availableSubjects, allTeachers, existingPeriodSlots, scannedSlots, detectedPeriods, warnings } = opts;

  // Extract periods header if present
  if (data.periods && Array.isArray(data.periods)) {
    for (const p of data.periods) {
      detectedPeriods.push({
        order: Number(p.order) || detectedPeriods.length + 1,
        label: p.label || `Period ${p.order}`,
        startTime: p.start || DEFAULT_TIMES[p.order]?.start || "08:00",
        endTime: p.end || DEFAULT_TIMES[p.order]?.end || "08:45",
        type: p.type || (p.label?.toLowerCase().includes("break") ? "BREAK" : "LESSON")
      });
    }
  }

  const classes = data.classes || (data.days ? [{ className: "Target Class", days: data.days }] : []);
  for (const cls of classes) {
    for (const dayObj of (cls.days || [])) {
      const normDay = normalizeDay(dayObj.day);
      if (!normDay) continue;

      for (const slot of (dayObj.slots || [])) {
        const periodNum = Number(slot.period);
        if (isNaN(periodNum) || periodNum < 1) continue;

        const rawSubject = (slot.subject || "").trim();
        const breakInfo = normalizeBreak(rawSubject);

        let subjectId = "";
        let subjectName = rawSubject;
        let isUnknownSubject = false;
        let defaultTeacherId: string | null = null;
        let defaultTeacherName: string | null = null;

        if (breakInfo.isBreak) {
          subjectName = breakInfo.type === "LUNCH" ? "Lunch Break" : "Break";
        } else {
          const matched = matchSubject(rawSubject, availableSubjects);
          subjectId = matched.subjectId;
          subjectName = matched.subjectName;
          isUnknownSubject = !matched.isMatched;
          defaultTeacherId = matched.defaultTeacherId || null;
          defaultTeacherName = matched.defaultTeacherName || null;
        }

        // Match Teacher with auto-fill fallback
        const teacherMatch = breakInfo.isBreak
          ? { teacherId: undefined, teacherName: undefined, isMismatch: false }
          : matchTeacher(slot.teacher, allTeachers, defaultTeacherId, defaultTeacherName);

        const psObj = detectedPeriods.find(p => p.order === periodNum) || existingPeriodSlots.find(p => p.order === periodNum);
        const startTime = slot.start || psObj?.startTime || DEFAULT_TIMES[periodNum]?.start || "08:00";
        const endTime = slot.end || psObj?.endTime || DEFAULT_TIMES[periodNum]?.end || "08:45";

        scannedSlots.push({
          id: `scan-${normDay}-${periodNum}-${Math.random().toString(36).substring(2, 7)}`,
          dayOfWeek: normDay,
          period: periodNum,
          subjectId,
          subjectName,
          teacherId: teacherMatch.teacherId,
          teacherName: teacherMatch.teacherName,
          assignedTeacherId: defaultTeacherId || undefined,
          assignedTeacherName: defaultTeacherName || undefined,
          isTeacherMismatch: teacherMatch.isMismatch,
          startTime,
          endTime,
          classroom: slot.room || "",
          isBreak: breakInfo.isBreak,
          slotType: breakInfo.type,
          isUnknownSubject
        });
      }
    }
  }
}

/**
 * Helper to parse tabular 2D array of cells (from Excel or Word table)
 */
function parseTableRowsToSlots(opts: {
  rows: any[][];
  availableSubjects: any[];
  allTeachers: any[];
  existingPeriodSlots: any[];
  scannedSlots: ScannedSlot[];
  detectedPeriods: PeriodSlotData[];
}) {
  const { rows, availableSubjects, allTeachers, existingPeriodSlots, scannedSlots, detectedPeriods } = opts;
  if (!rows || rows.length === 0) return;

  // Inspect first 2 rows for period header times
  let headerRowIndex = -1;
  for (let r = 0; r < Math.min(3, rows.length); r++) {
    const rowStr = rows[r].map(c => String(c || "")).join(" ").toLowerCase();
    if (rowStr.includes("period") || rowStr.includes("p1") || rowStr.includes("08:") || rowStr.includes("09:")) {
      headerRowIndex = r;
      break;
    }
  }

  if (headerRowIndex !== -1) {
    const headerRow = rows[headerRowIndex];
    for (let c = 1; c < headerRow.length; c++) {
      const cellVal = String(headerRow[c] || "").trim();
      const timeMatch = cellVal.match(/(\d{1,2}:\d{2})\s*[-–to ]+\s*(\d{1,2}:\d{2})/i);
      const isBreak = normalizeBreak(cellVal).isBreak;

      detectedPeriods.push({
        order: c,
        label: cellVal.split("\n")[0] || `Period ${c}`,
        startTime: timeMatch ? timeMatch[1] : DEFAULT_TIMES[c]?.start || "08:00",
        endTime: timeMatch ? timeMatch[2] : DEFAULT_TIMES[c]?.end || "08:45",
        type: isBreak ? "BREAK" : "LESSON"
      });
    }
  }

  // Iterate day rows
  for (let r = 0; r < rows.length; r++) {
    if (r === headerRowIndex) continue;
    const row = rows[r];
    if (!row || row.length === 0) continue;

    const firstCell = String(row[0] || "").trim();
    const normDay = normalizeDay(firstCell);
    if (!normDay) continue;

    for (let c = 1; c < row.length; c++) {
      const rawCell = String(row[c] || "").trim();
      if (!rawCell) continue;

      const breakInfo = normalizeBreak(rawCell);
      let subjectId = "";
      let subjectName = rawCell;
      let isUnknownSubject = false;
      let defaultTeacherId: string | null = null;
      let defaultTeacherName: string | null = null;

      if (breakInfo.isBreak) {
        subjectName = breakInfo.type === "LUNCH" ? "Lunch Break" : "Break";
      } else {
        const matched = matchSubject(rawCell, availableSubjects);
        subjectId = matched.subjectId;
        subjectName = matched.subjectName;
        isUnknownSubject = !matched.isMatched;
        defaultTeacherId = matched.defaultTeacherId || null;
        defaultTeacherName = matched.defaultTeacherName || null;
      }

      // Check if cell mentions teacher in parentheses e.g. "Maths (Mr. Sharma)"
      let teacherInCell: string | null = null;
      const parenMatch = rawCell.match(/\(([^)]+)\)/);
      if (parenMatch) {
        teacherInCell = parenMatch[1];
      }

      const teacherMatch = breakInfo.isBreak
        ? { teacherId: undefined, teacherName: undefined, isMismatch: false }
        : matchTeacher(teacherInCell, allTeachers, defaultTeacherId, defaultTeacherName);

      const psObj = detectedPeriods.find(p => p.order === c) || existingPeriodSlots.find(p => p.order === c);
      const startTime = psObj?.startTime || DEFAULT_TIMES[c]?.start || "08:00";
      const endTime = psObj?.endTime || DEFAULT_TIMES[c]?.end || "08:45";

      scannedSlots.push({
        id: `row-${normDay}-${c}-${Math.random().toString(36).substring(2, 7)}`,
        dayOfWeek: normDay,
        period: c,
        subjectId,
        subjectName,
        teacherId: teacherMatch.teacherId,
        teacherName: teacherMatch.teacherName,
        assignedTeacherId: defaultTeacherId || undefined,
        assignedTeacherName: defaultTeacherName || undefined,
        isTeacherMismatch: teacherMatch.isMismatch,
        startTime,
        endTime,
        classroom: "",
        isBreak: breakInfo.isBreak,
        slotType: breakInfo.type,
        isUnknownSubject
      });
    }
  }
}

/**
 * Fallback parser for unstructured text
 */
function parseRawTextToSlots(opts: {
  text: string;
  availableSubjects: any[];
  allTeachers: any[];
  existingPeriodSlots: any[];
  scannedSlots: ScannedSlot[];
  detectedPeriods: PeriodSlotData[];
}) {
  const { text, availableSubjects, allTeachers, existingPeriodSlots, scannedSlots, detectedPeriods } = opts;
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);

  for (const line of lines) {
    const tokens = line.split(/[\t|,;]+/).map(t => t.trim()).filter(Boolean);
    if (tokens.length < 2) continue;

    const normDay = normalizeDay(tokens[0]);
    if (!normDay) continue;

    for (let i = 1; i < tokens.length; i++) {
      const raw = tokens[i];
      const breakInfo = normalizeBreak(raw);
      const matched = breakInfo.isBreak ? { subjectId: "", subjectName: "Break", isMatched: true, defaultTeacherId: null, defaultTeacherName: null } : matchSubject(raw, availableSubjects);
      const teacherMatch = matchTeacher(null, allTeachers, matched.defaultTeacherId, matched.defaultTeacherName);

      scannedSlots.push({
        id: `raw-${normDay}-${i}-${Math.random().toString(36).substring(2, 7)}`,
        dayOfWeek: normDay,
        period: i,
        subjectId: breakInfo.isBreak ? "" : matched.subjectId,
        subjectName: breakInfo.isBreak ? "Break" : matched.subjectName,
        teacherId: teacherMatch.teacherId,
        teacherName: teacherMatch.teacherName,
        assignedTeacherId: matched.defaultTeacherId || undefined,
        assignedTeacherName: matched.defaultTeacherName || undefined,
        startTime: DEFAULT_TIMES[i]?.start || "08:00",
        endTime: DEFAULT_TIMES[i]?.end || "08:45",
        classroom: "",
        isBreak: breakInfo.isBreak,
        slotType: breakInfo.type,
        isUnknownSubject: !matched.isMatched && !breakInfo.isBreak
      });
    }
  }
}
