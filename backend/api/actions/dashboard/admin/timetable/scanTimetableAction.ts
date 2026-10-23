"use server";

import { prisma } from "@/backend/db/prisma";
import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import * as XLSX from "xlsx";
import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";
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
        const wordSlots = parseUniversalTimetable(textResult.value, availableSubjects);
        scannedSlots.push(...wordSlots);
      }
    }

    // 3. PDF DOCUMENT (.pdf) using unpdf
    else if (extension === "pdf" || mimeType.includes("pdf")) {
      fileType = "PDF Document";
      try {
        const uint8 = new Uint8Array(buffer);
        const pdf = await getDocumentProxy(uint8);
        const { text } = await extractText(pdf, { mergePages: true });
        const pdfSlots = parseUniversalTimetable(text || "", availableSubjects);
        scannedSlots.push(...pdfSlots);
      } catch (pdfErr) {
        console.warn("PDF parse fallback:", pdfErr);
        const textFallback = buffer.toString("utf-8");
        const fallbackSlots = parseUniversalTimetable(textFallback, availableSubjects);
        scannedSlots.push(...fallbackSlots);
      }
    }

    // 4. PHOTO / IMAGE / OTHER
    else {
      fileType = "Image / Document";
      const textContent = buffer.toString("utf-8");
      const docSlots = parseUniversalTimetable(textContent, availableSubjects);
      scannedSlots.push(...docSlots);
    }

    // Deduplicate slots strictly by (dayOfWeek, period)
    const uniqueMap = new Map<string, ScannedSlot>();
    for (const slot of scannedSlots) {
      const normDay = normalizeDay(slot.dayOfWeek);
      if (!normDay || slot.period < 1 || slot.period > 8) continue;
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
        error: `Could not detect timetable data from "${fileName}". Please ensure the file contains Days (e.g., Monday to Saturday) and Periods with Subject names, or enter them manually.`,
        fileName,
        fileType
      };
    }

    return {
      success: true,
      fileName,
      fileType,
      scannedSlots: finalSlots,
      warnings,
      totalScanned: finalSlots.length
    };
  } catch (error: unknown) {
    console.error("Error scanning timetable document:", error);
    return {
      error: error instanceof Error ? error.message : "Failed to parse timetable document."
    };
  }
}

function tokenizeSubjects(text: string, availableSubjects: Array<{ id: string; name: string }>): string[] {
  if (text.includes("\t") || text.includes("|") || text.includes(",") || text.includes(";")) {
    return text.split(/[\t|,;]+/).map(c => c.trim()).filter(Boolean);
  }
  if (/\s{2,}/.test(text)) {
    return text.split(/\s{2,}/).map(c => c.trim()).filter(Boolean);
  }

  const sortedNames = [
    ...availableSubjects.map(s => s.name),
    "Tamil", "English", "Maths", "Mathematics", "Science", "Social", "Social Studies",
    "Computer Science", "Physics", "Chemistry", "Biology", "Hindi", "Break", "Recess", "Lunch"
  ].sort((a, b) => b.length - a.length);

  let remaining = text.trim();
  const tokens: string[] = [];

  while (remaining.length > 0) {
    remaining = remaining.trim();
    let matched = false;
    for (const sub of sortedNames) {
      if (remaining.toLowerCase().startsWith(sub.toLowerCase())) {
        const nextChar = remaining.charAt(sub.length);
        if (!nextChar || /[\s,;|\-]/.test(nextChar)) {
          tokens.push(sub);
          remaining = remaining.slice(sub.length).replace(/^[\s,;|\-]+/, "");
          matched = true;
          break;
        }
      }
    }
    if (!matched) {
      const spaceIdx = remaining.indexOf(" ");
      if (spaceIdx === -1) {
        tokens.push(remaining);
        break;
      } else {
        tokens.push(remaining.slice(0, spaceIdx));
        remaining = remaining.slice(spaceIdx + 1);
      }
    }
  }

  return tokens.filter(Boolean);
}

function parseUniversalTimetable(
  rawText: string,
  availableSubjects: Array<{ id: string; name: string }>
): ScannedSlot[] {
  const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const slotsMap = new Map<string, ScannedSlot>();

  const addSlot = (day: string, period: number, rawSubject: string, startTime?: string, endTime?: string, room?: string) => {
    if (period < 1 || period > 8) return;
    const normDay = normalizeDay(day);
    if (!normDay) return;

    const isBreak = normalizeBreak(rawSubject);
    const matched = isBreak ? { subjectId: "", subjectName: "Break", isMatched: true } : matchSubject(rawSubject, availableSubjects);

    slotsMap.set(`${normDay}-${period}`, {
      id: `slot-${normDay}-${period}-${Date.now()}-${Math.random()}`,
      dayOfWeek: normDay,
      period,
      subjectId: isBreak ? "" : matched.subjectId,
      subjectName: isBreak ? "Break" : matched.subjectName,
      startTime: startTime || DEFAULT_TIMES[period]?.start || "08:00",
      endTime: endTime || DEFAULT_TIMES[period]?.end || "08:45",
      classroom: room || "",
      isBreak
    });
  };

  let currentDay: string | null = null;
  let autoPeriod = 1;

  for (const line of lines) {
    // 1. Check if line starts with a Day (e.g. "Monday Tamil English Maths Science Social" or "Saturday Tamil Maths English Science Social")
    const dayPrefixMatch = line.match(/^(MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY|MON|TUE|TUES|WED|THU|THUR|THURS|FRI|SAT)\b[\s:|\-,]*(.*)$/i);
    if (dayPrefixMatch) {
      const detectedDay = normalizeDay(dayPrefixMatch[1]);
      const restOfLine = dayPrefixMatch[2].trim();

      if (detectedDay) {
        currentDay = detectedDay;
        autoPeriod = 1;

        if (restOfLine) {
          const cells = tokenizeSubjects(restOfLine, availableSubjects);
          let pNum = 1;
          for (const cell of cells) {
            if (pNum > 8) break;
            const cellPeriodMatch = cell.match(/^(?:p|period)?\s*([1-8])[\s:.\-\)](.*)/i);
            if (cellPeriodMatch) {
              const cp = parseInt(cellPeriodMatch[1], 10);
              const sub = cellPeriodMatch[2].trim() || cell;
              addSlot(currentDay, cp, sub);
              pNum = cp + 1;
            } else {
              addSlot(currentDay, pNum, cell);
              pNum++;
            }
          }
          continue;
        }
        continue;
      }
    }

    // 2. If current day is set:
    if (currentDay) {
      // Period format: "Period 1: Tamil" or "1. English" or "P1 Tamil"
      const periodMatch = line.match(/^(?:period|p)?\s*([1-8])[\s:.\-\)\/]+(.*)/i);
      if (periodMatch) {
        const period = parseInt(periodMatch[1], 10);
        const rest = periodMatch[2].trim();
        const timeMatch = rest.match(/(\d{1,2}:\d{2})\s*(?:-|to)\s*(\d{1,2}:\d{2})/i);
        const startTime = timeMatch ? timeMatch[1] : undefined;
        const endTime = timeMatch ? timeMatch[2] : undefined;
        let cleanSub = rest.replace(/(\d{1,2}:\d{2})\s*(?:-|to)\s*(\d{1,2}:\d{2})/i, "").trim();
        cleanSub = cleanSub.replace(/(?:room|classroom|rm)[\s:]*([a-zA-Z0-9\-]+)/i, "").trim();

        addSlot(currentDay, period, cleanSub, startTime, endTime);
        autoPeriod = period + 1;
        continue;
      }

      // Check if line is a subject name directly under day heading
      const subjectCheck = matchSubject(line, availableSubjects);
      if (subjectCheck.isMatched && autoPeriod <= 8) {
        addSlot(currentDay, autoPeriod, line);
        autoPeriod++;
        continue;
      }
    }
  }

  return Array.from(slotsMap.values());
}
