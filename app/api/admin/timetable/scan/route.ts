import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import * as XLSX from "xlsx";
import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

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

function normalizeBreak(cellText: string): boolean {
  if (!cellText) return false;
  const lower = cellText.toLowerCase();
  return (
    lower.includes("break") ||
    lower.includes("recess") ||
    lower.includes("lunch") ||
    lower.includes("interval") ||
    lower.includes("snack") ||
    lower === "yes" ||
    lower === "true" ||
    lower === "1"
  );
}

function matchSubject(
  rawName: string,
  availableSubjects: Array<{ id: string; name: string }>
): { subjectId: string; subjectName: string; isMatched: boolean } {
  const clean = rawName.trim().toLowerCase();
  if (!clean) return { subjectId: "", subjectName: "", isMatched: false };

  for (const s of availableSubjects) {
    const sName = s.name.trim().toLowerCase();
    if (sName === clean || clean.includes(sName) || sName.includes(clean)) {
      return { subjectId: s.id, subjectName: s.name, isMatched: true };
    }
  }

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

  return {
    subjectId: availableSubjects[0]?.id || "",
    subjectName: rawName.trim(),
    isMatched: false
  };
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session || session.user.role !== "ADMIN") {
      return NextResponse.json({ success: false, error: "Unauthorized access." }, { status: 200 });
    }

    const formData = await req.formData();
    const classId = formData.get("classId") as string;
    const file = formData.get("file") as File;

    if (!classId) {
      return NextResponse.json({ success: false, error: "Please select a class first." }, { status: 200 });
    }
    if (!file) {
      return NextResponse.json({ success: false, error: "Please upload a file to scan." }, { status: 200 });
    }

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
    const scannedSlots: Array<{
      id: string;
      dayOfWeek: string;
      period: number;
      subjectId: string;
      subjectName: string;
      startTime: string;
      endTime: string;
      classroom: string;
      isBreak: boolean;
    }> = [];
    const warnings: string[] = [];

    // 1. EXCEL / SPREADSHEET (.xlsx, .xls, .csv)
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
        return NextResponse.json({ success: false, error: "The uploaded spreadsheet is empty." }, { status: 200 });
      }

      const headerIndex = rows.findIndex(r => 
        r && r.some((c: any) => String(c).toLowerCase().includes("day")) &&
        r.some((c: any) => String(c).toLowerCase().includes("period") || String(c).toLowerCase().includes("subject"))
      );

      if (headerIndex !== -1 && rows.length > headerIndex + 1) {
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
            warnings.push(`Row ${r + 1}: Subject "${rawSubject}" assigned as "${matched.subjectName}".`);
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
        for (let r = 0; r < rows.length; r++) {
          const row = rows[r];
          if (!row || row.length === 0) continue;

          const firstCell = String(row[0] || "");
          const normDay = normalizeDay(firstCell);
          if (!normDay) continue;

          for (let p = 1; p <= 8 && p < row.length; p++) {
            const rawCell = String(row[p] || "").trim();
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
      }
    }
    // 2. WORD DOCUMENT (.docx, .doc)
    else if (
      extension === "docx" ||
      extension === "doc" ||
      mimeType.includes("word") ||
      mimeType.includes("officedocument.wordprocessingml")
    ) {
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
        if (cells.length > 0) {
          parsedRows.push(cells);
        }
      }

      if (parsedRows.length > 0) {
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
        const textResult = await mammoth.extractRawText({ buffer });
        parseTextIntoSlots(textResult.value, availableSubjects, scannedSlots);
      }
    }
    // 3. PDF DOCUMENT (.pdf) using unpdf (pure JS/WASM, zero native canvas dependencies)
    else if (extension === "pdf" || mimeType.includes("pdf")) {
      fileType = "PDF Document";
      try {
        const uint8 = new Uint8Array(buffer);
        const pdf = await getDocumentProxy(uint8);
        const { text } = await extractText(pdf, { mergePages: true });
        parseTextIntoSlots(text || "", availableSubjects, scannedSlots);
      } catch (pdfErr) {
        console.warn("PDF parse fallback:", pdfErr);
        const textFallback = buffer.toString("utf-8");
        parseTextIntoSlots(textFallback, availableSubjects, scannedSlots);
      }
    }
    // 4. IMAGE or other files
    else {
      fileType = "Image / Document";
      const textContent = buffer.toString("utf-8");
      parseTextIntoSlots(textContent, availableSubjects, scannedSlots);
    }

    if (scannedSlots.length === 0) {
      return NextResponse.json({
        success: false,
        error: `Could not automatically detect period slots from "${fileName}". Please click '⚡ Load Standard 8-Period Template' or '+ Add Slots Manually' to set up the timetable easily.`,
        fileName,
        fileType
      }, { status: 200 });
    }

    return NextResponse.json({
      success: true,
      fileName,
      fileType,
      scannedSlots,
      warnings,
      totalScanned: scannedSlots.length
    }, { status: 200 });

  } catch (err: unknown) {
    console.error("API timetable scan error:", err);
    return NextResponse.json({
      success: false,
      error: err instanceof Error ? err.message : "An unexpected error occurred while parsing the file."
    }, { status: 200 });
  }
}

function parseTextIntoSlots(
  text: string,
  availableSubjects: Array<{ id: string; name: string }>,
  scannedSlots: any[]
) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  let currentDay: string | null = null;

  for (const line of lines) {
    const detectedDay = normalizeDay(line);
    if (detectedDay) {
      currentDay = detectedDay;
      continue;
    }

    if (!currentDay) continue;

    const periodMatch = line.match(/(?:period|p)?\s*([1-8])[\s:.\-\)\/]+(.*)/i);
    if (periodMatch) {
      const period = parseInt(periodMatch[1], 10);
      const rest = periodMatch[2].trim();
      const isBreak = normalizeBreak(rest);

      const timeMatch = rest.match(/(\d{1,2}:\d{2})\s*(?:-|to)\s*(\d{1,2}:\d{2})/i);
      const startTime = timeMatch ? timeMatch[1] : (DEFAULT_TIMES[period]?.start || "08:00");
      const endTime = timeMatch ? timeMatch[2] : (DEFAULT_TIMES[period]?.end || "08:45");

      let cleanSubject = rest.replace(/(\d{1,2}:\d{2})\s*(?:-|to)\s*(\d{1,2}:\d{2})/i, "").trim();
      cleanSubject = cleanSubject.replace(/(?:room|classroom|rm)[\s:]*([a-zA-Z0-9\-]+)/i, "").trim();

      const matched = isBreak ? { subjectId: "", subjectName: "Break", isMatched: true } : matchSubject(cleanSubject, availableSubjects);

      scannedSlots.push({
        id: `slot-${currentDay}-${period}-${Date.now()}-${Math.random()}`,
        dayOfWeek: currentDay,
        period,
        subjectId: isBreak ? "" : matched.subjectId,
        subjectName: isBreak ? "Break" : matched.subjectName,
        startTime,
        endTime,
        classroom: "",
        isBreak
      });
    }
  }
}
