import * as XLSX from "xlsx";
import { calculateReportCardGrade } from "./constants";

export interface StudentMatchTarget {
  id: string;
  rollNumber: string;
  name: string;
}

export interface SubjectMatchTarget {
  id: string;
  name: string;
  maxMarks?: number;
  passMarks?: number;
}

export interface ExtractedSubjectMark {
  subjectName: string;
  matchedSubjectId?: string;
  score: number | null | "AB"; // null if missing/not found. NEVER default to 0!
  maxScore: number;
  passMarks: number;
  grade: string;
  status: "PASS" | "FAIL" | "ABSENT" | "NEEDS_REVIEW";
  remarks: string;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  rawText: string;
  isInvalid: boolean;
}

export interface ExtractedStudentRow {
  rowIndex: number;
  rawRollNumber: string;
  rawName: string;
  matchedStudentId: string;
  matchedStudentName: string;
  matchedRollNumber: string;
  matchType: "EXACT_ROLL" | "EXACT_NAME" | "FUZZY_NAME" | "UNMATCHED";
  confidence: "HIGH" | "MEDIUM" | "LOW";
  subjects: ExtractedSubjectMark[];
  totalMarks: number;
  maxTotalMarks: number;
  percentage: number;
  grade: string;
  resultStatus: "PASSED" | "NEEDS SUPPORT" | "PENDING";
  attendance?: string;
  generalRemarks: string;
  printedTotal?: number;
  totalMismatchWarning?: string;
}

export interface ExtractionResult {
  success: boolean;
  error?: string;
  fileDetails: {
    name: string;
    type: string;
    size: number;
  };
  examName?: string;
  examDate?: string;
  isClassSheet: boolean;
  detectedSubjects: string[];
  students: ExtractedStudentRow[];
  rawTextPreview?: string;
  debugInfo?: {
    headerLine?: string;
    columnsDetected?: string[];
    rawLinesCount?: number;
    rawText?: string;
  };
}

export const COMMON_SUBJECT_PATTERNS: Record<string, string[]> = {
  "Tamil": ["tamil", "tam", "language 1", "first language", "regional language", "lang 1"],
  "English": ["english", "eng", "language 2", "second language", "general english", "lang 2"],
  "Maths": ["maths", "mathematics", "math", "quant", "basic maths", "standard maths"],
  "Science": ["science", "sci", "general science", "gen sci", "natural science"],
  "Social": ["social", "social science", "soc sci", "social studies", "sst", "history"],
  "Hindi": ["hindi", "hin", "third language", "lang 3"],
  "Computer": ["computer", "computer science", "cs", "it", "information technology", "coding", "ict"],
  "Physics": ["physics", "phy"],
  "Chemistry": ["chemistry", "chem"],
  "Biology": ["biology", "bio"],
  "Economics": ["economics", "eco"],
  "Commerce": ["commerce", "comm", "business studies"]
};

export function normalizeText(str: string): string {
  return (str || "").toLowerCase().trim().replace(/[^a-z0-9]/g, "");
}

export function cleanRollNumber(str: string): string {
  return (str || "").toUpperCase().trim().replace(/[^A-Z0-9]/g, "");
}

/**
 * Robust matching against database students of the active class
 */
export function matchStudent(
  rawRoll: string,
  rawName: string,
  classStudents: StudentMatchTarget[]
): {
  studentId: string;
  studentName: string;
  rollNumber: string;
  matchType: "EXACT_ROLL" | "EXACT_NAME" | "FUZZY_NAME" | "UNMATCHED";
  confidence: "HIGH" | "MEDIUM" | "LOW";
} {
  const cleanRoll = cleanRollNumber(rawRoll);
  const cleanN = normalizeText(rawName);

  // 1. Try Exact Roll / Admission Number match
  if (cleanRoll) {
    const byRoll = classStudents.find(
      s => cleanRollNumber(s.rollNumber) === cleanRoll
    );
    if (byRoll) {
      return {
        studentId: byRoll.id,
        studentName: byRoll.name,
        rollNumber: byRoll.rollNumber,
        matchType: "EXACT_ROLL",
        confidence: "HIGH"
      };
    }
  }

  // 2. Try Exact Name match
  if (cleanN) {
    const byName = classStudents.find(
      s => normalizeText(s.name) === cleanN
    );
    if (byName) {
      return {
        studentId: byName.id,
        studentName: byName.name,
        rollNumber: byName.rollNumber,
        matchType: "EXACT_NAME",
        confidence: "HIGH"
      };
    }

    // 3. Try Fuzzy Name match (contains or starts with)
    const byFuzzy = classStudents.find(s => {
      const targetNorm = normalizeText(s.name);
      return (targetNorm.length >= 3 && cleanN.length >= 3) &&
        (targetNorm.includes(cleanN) || cleanN.includes(targetNorm));
    });
    if (byFuzzy) {
      return {
        studentId: byFuzzy.id,
        studentName: byFuzzy.name,
        rollNumber: byFuzzy.rollNumber,
        matchType: "FUZZY_NAME",
        confidence: "MEDIUM"
      };
    }
  }

  return {
    studentId: "",
    studentName: rawName || "",
    rollNumber: rawRoll || "",
    matchType: "UNMATCHED",
    confidence: "LOW"
  };
}

/**
 * Maps raw column / text header to class subject
 */
export function matchSubjectName(
  rawCol: string,
  classSubjects: SubjectMatchTarget[]
): { canonicalName: string; subjectId?: string } {
  const norm = normalizeText(rawCol);

  // Direct match against class subjects
  const directMatch = classSubjects.find(
    cs => normalizeText(cs.name) === norm || norm.includes(normalizeText(cs.name))
  );
  if (directMatch) {
    return { canonicalName: directMatch.name, subjectId: directMatch.id };
  }

  // Common aliases
  for (const [canonical, aliases] of Object.entries(COMMON_SUBJECT_PATTERNS)) {
    if (norm === normalizeText(canonical) || aliases.some(a => normalizeText(a) === norm || norm.includes(normalizeText(a)))) {
      const matchingClassSub = classSubjects.find(
        cs => normalizeText(cs.name) === normalizeText(canonical) || aliases.some(a => normalizeText(cs.name) === normalizeText(a))
      );
      return {
        canonicalName: matchingClassSub ? matchingClassSub.name : canonical,
        subjectId: matchingClassSub?.id
      };
    }
  }

  return { canonicalName: rawCol.trim() };
}

/**
 * Parses numeric score safely.
 * NEVER defaults to 0 if absent or not found! Returns null.
 */
function parseScoreValue(
  val: any,
  defaultMaxMarks: number,
  defaultPassMarks: number
): {
  score: number | null | "AB";
  confidence: "HIGH" | "MEDIUM" | "LOW";
  status: "PASS" | "FAIL" | "ABSENT" | "NEEDS_REVIEW";
  rawText: string;
} {
  if (val === null || val === undefined || val === "") {
    return { score: null, confidence: "LOW", status: "NEEDS_REVIEW", rawText: "" };
  }

  const str = String(val).trim();
  const lower = str.toLowerCase();

  if (["ab", "abs", "absent", "a"].includes(lower)) {
    return { score: "AB", confidence: "HIGH", status: "ABSENT", rawText: str };
  }

  // Handle format like "86/100" or "86 / 100"
  const part = str.split("/")[0].trim();
  const num = Number(part);

  if (!isNaN(num) && part !== "") {
    const isPass = num >= defaultPassMarks;
    const isHigh = num >= 0 && num <= defaultMaxMarks;
    return {
      score: num,
      confidence: isHigh ? "HIGH" : "MEDIUM",
      status: isPass ? "PASS" : "FAIL",
      rawText: str
    };
  }

  return { score: null, confidence: "LOW", status: "NEEDS_REVIEW", rawText: str };
}

export function calculateStudentTotals(
  subjects: ExtractedSubjectMark[]
): {
  totalMarks: number;
  maxTotalMarks: number;
  percentage: number;
  grade: string;
  resultStatus: "PASSED" | "NEEDS SUPPORT" | "PENDING";
} {
  let totalMarks = 0;
  let maxTotalMarks = 0;
  let hasFail = false;
  let hasMissing = false;

  subjects.forEach(sub => {
    maxTotalMarks += sub.maxScore;
    if (sub.score === "AB") {
      hasFail = true;
    } else if (typeof sub.score === "number") {
      totalMarks += sub.score;
      if (sub.score < sub.passMarks) {
        hasFail = true;
      }
    } else {
      hasMissing = true;
    }
  });

  const percentage = maxTotalMarks > 0 ? parseFloat(((totalMarks / maxTotalMarks) * 100).toFixed(1)) : 0;
  const grade = hasMissing ? "-" : calculateReportCardGrade(percentage, hasFail);

  // Result is PENDING as long as any mark is missing
  const resultStatus: "PASSED" | "NEEDS SUPPORT" | "PENDING" = hasMissing
    ? "PENDING"
    : hasFail
      ? "NEEDS SUPPORT"
      : "PASSED";

  return {
    totalMarks,
    maxTotalMarks,
    percentage,
    grade,
    resultStatus
  };
}

/**
 * Layer 1: In-browser Excel (.xlsx, .xls) and CSV Parsing
 */
export async function parseSpreadsheet(
  file: File,
  classStudents: StudentMatchTarget[],
  classSubjects: SubjectMatchTarget[],
  defaultMaxMarks = 100,
  defaultPassMarks = 35
): Promise<ExtractionResult> {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];

  const rawRows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });
  if (!rawRows || rawRows.length === 0) {
    throw new Error("Spreadsheet contains no data or could not be read.");
  }

  let headerRowIndex = -1;
  let rollColIndex = -1;
  let nameColIndex = -1;
  let attendanceColIndex = -1;
  let remarksColIndex = -1;
  let totalColIndex = -1;
  let subjectCols: Array<{ colIndex: number; canonicalName: string; subjectId?: string }> = [];

  const NON_SUBJECT_COL_KEYS = [
    "sno", "s.no", "slno", "sl no", "no", "id", "rollno", "roll no", "roll",
    "regno", "reg no", "register no", "admissionno", "admission no", "adm no",
    "studentname", "student name", "name", "candidate", "total", "tot", "grand total",
    "percentage", "percent", "pct", "%", "grade", "rank", "result", "status",
    "attendance", "att", "remark", "remarks", "signature"
  ];

  // Scan up to first 12 rows for header row
  for (let r = 0; r < Math.min(rawRows.length, 12); r++) {
    const row = rawRows[r].map(c => String(c).trim());
    let rollIdx = -1;
    let nameIdx = -1;
    const subMatches: Array<{ colIndex: number; canonicalName: string; subjectId?: string }> = [];

    row.forEach((cell, cIdx) => {
      const norm = normalizeText(cell);
      if (!norm) return;

      if (norm.includes("roll") || norm.includes("regno") || norm.includes("admno") || norm === "reg" || norm === "adm") {
        rollIdx = cIdx;
      } else if (norm.includes("name") || norm === "student" || norm === "candidate") {
        nameIdx = cIdx;
      } else if (norm.includes("attend") || norm === "att") {
        attendanceColIndex = cIdx;
      } else if (norm.includes("remark") || norm.includes("comment")) {
        remarksColIndex = cIdx;
      } else if (norm === "total" || norm === "tot" || norm === "grandtotal") {
        totalColIndex = cIdx;
      } else if (!NON_SUBJECT_COL_KEYS.includes(norm)) {
        const matched = matchSubjectName(cell, classSubjects);
        subMatches.push({
          colIndex: cIdx,
          canonicalName: matched.canonicalName,
          subjectId: matched.subjectId
        });
      }
    });

    if ((rollIdx !== -1 || nameIdx !== -1) && subMatches.length > 0) {
      headerRowIndex = r;
      rollColIndex = rollIdx;
      nameColIndex = nameIdx;
      subjectCols = subMatches;
      break;
    }
  }

  // Fallback if roll/name header was not explicitly labelled
  if (headerRowIndex === -1) {
    for (let r = 0; r < Math.min(rawRows.length, 6); r++) {
      const row = rawRows[r].map(c => String(c).trim());
      const subMatches = row
        .map((cell, cIdx) => {
          const norm = normalizeText(cell);
          if (!norm || NON_SUBJECT_COL_KEYS.includes(norm)) return null;
          return { colIndex: cIdx, ...matchSubjectName(cell, classSubjects) };
        })
        .filter(Boolean) as Array<{ colIndex: number; canonicalName: string; subjectId?: string }>;

      if (subMatches.length >= 2) {
        headerRowIndex = r;
        subjectCols = subMatches;
        if (rollColIndex === -1 && rawRows[r][0]) rollColIndex = 0;
        if (nameColIndex === -1 && rawRows[r][1]) nameColIndex = 1;
        break;
      }
    }
  }

  if (headerRowIndex === -1 || subjectCols.length === 0) {
    throw new Error("Could not detect student or subject headers in spreadsheet. Please verify column headers.");
  }

  // Extract optional Exam Name and Date only if present in document
  let detectedExamName: string | undefined = undefined;
  let detectedExamDate: string | undefined = undefined;

  for (let r = 0; r < headerRowIndex; r++) {
    const text = rawRows[r].join(" ");
    if (/unit\s*test|midterm|quarterly|half\s*yearly|annual|model/i.test(text)) {
      const m = text.match(/(Unit Test \d+|Midterm Examination|Quarterly Exam|Half-Yearly Exam|Annual Exam|Model Exam)/i);
      if (m) detectedExamName = m[0];
    }
    const dateMatch = text.match(/\b\d{4}-\d{2}-\d{2}\b|\b\d{2}[-/]\d{2}[-/]\d{4}\b/);
    if (dateMatch) {
      detectedExamDate = dateMatch[0];
    }
  }

  // Parse Student Data Rows
  const studentRows: ExtractedStudentRow[] = [];

  for (let r = headerRowIndex + 1; r < rawRows.length; r++) {
    const row = rawRows[r];
    if (!row || row.length === 0) continue;

    const rawRoll = rollColIndex !== -1 ? String(row[rollColIndex] || "").trim() : "";
    const rawName = nameColIndex !== -1 ? String(row[nameColIndex] || "").trim() : "";

    // Skip summary / footer rows
    const combinedRowStr = row.slice(0, 3).join(" ").toLowerCase();
    if (combinedRowStr.includes("total") || combinedRowStr.includes("average") || combinedRowStr.includes("signature")) {
      continue;
    }

    if (!rawRoll && !rawName) continue;

    const matched = matchStudent(rawRoll, rawName, classStudents);
    const attendanceVal = attendanceColIndex !== -1 ? String(row[attendanceColIndex] || "").trim() : undefined;
    const remarksVal = remarksColIndex !== -1 ? String(row[remarksColIndex] || "").trim() : "";
    const printedTotalVal = totalColIndex !== -1 && !isNaN(Number(row[totalColIndex])) ? Number(row[totalColIndex]) : undefined;

    const subjects: ExtractedSubjectMark[] = subjectCols.map((subCol, sIdx) => {
      const rawVal = row[subCol.colIndex];
      const parsed = parseScoreValue(rawVal, defaultMaxMarks, defaultPassMarks);
      const isNum = typeof parsed.score === "number";
      const grade = isNum ? calculateReportCardGrade((parsed.score as number / defaultMaxMarks) * 100) : "-";

      return {
        subjectName: subCol.canonicalName,
        matchedSubjectId: subCol.subjectId || `sub-${sIdx}`,
        score: parsed.score,
        maxScore: defaultMaxMarks,
        passMarks: defaultPassMarks,
        grade,
        status: parsed.status,
        remarks: "",
        confidence: parsed.confidence,
        rawText: parsed.rawText,
        isInvalid: parsed.score === null || (isNum && ((parsed.score as number) < 0 || (parsed.score as number) > defaultMaxMarks))
      };
    });

    const totals = calculateStudentTotals(subjects);

    // Cross-check printed total vs sum of extracted subject marks
    let totalMismatchWarning: string | undefined = undefined;
    let confidence: "HIGH" | "MEDIUM" | "LOW" = matched.confidence;

    if (printedTotalVal !== undefined && !totals.resultStatus.includes("PENDING")) {
      if (printedTotalVal === totals.totalMarks) {
        confidence = "HIGH";
      } else {
        confidence = "LOW";
        totalMismatchWarning = `Total in document: ${printedTotalVal}, sum of subjects: ${totals.totalMarks}`;
      }
    }

    studentRows.push({
      rowIndex: studentRows.length + 1,
      rawRollNumber: rawRoll,
      rawName,
      matchedStudentId: matched.studentId,
      matchedStudentName: matched.studentName || rawName,
      matchedRollNumber: matched.rollNumber || rawRoll,
      matchType: matched.matchType,
      confidence,
      subjects,
      totalMarks: totals.totalMarks,
      maxTotalMarks: totals.maxTotalMarks,
      percentage: totals.percentage,
      grade: totals.grade,
      resultStatus: totals.resultStatus,
      attendance: attendanceVal,
      generalRemarks: remarksVal,
      printedTotal: printedTotalVal,
      totalMismatchWarning
    });
  }

  return {
    success: true,
    fileDetails: {
      name: file.name,
      type: file.name.split(".").pop()?.toUpperCase() || "XLSX",
      size: file.size
    },
    examName: detectedExamName,
    examDate: detectedExamDate,
    isClassSheet: studentRows.length > 1,
    detectedSubjects: subjectCols.map(s => s.canonicalName),
    students: studentRows,
    rawTextPreview: rawRows.slice(0, 10).map(r => r.join("\t")).join("\n")
  };
}

/**
 * Layer 2: Text PDF Positional Table Reconstructor using unpdf getTextContent()
 */
export async function parsePdfDocument(
  file: File,
  classStudents: StudentMatchTarget[],
  classSubjects: SubjectMatchTarget[],
  defaultMaxMarks = 100,
  defaultPassMarks = 35,
  onProgress?: (progress: number, message: string) => void
): Promise<ExtractionResult> {
  onProgress?.(20, "Extracting text and positional layout from PDF...");
  const arrayBuffer = await file.arrayBuffer();

  const unpdf = await import("unpdf");
  const pdf = await unpdf.getDocumentProxy(new Uint8Array(arrayBuffer));
  const totalPages = pdf.numPages;

  interface ItemWithPos {
    str: string;
    x: number;
    y: number;
    w: number;
  }

  const allItems: ItemWithPos[] = [];
  let rawPreview = "";

  for (let p = 1; p <= totalPages; p++) {
    onProgress?.(20 + Math.round((p / totalPages) * 40), `Analyzing PDF page ${p} of ${totalPages}...`);
    const page = await pdf.getPage(p);
    const textContent = await page.getTextContent();

    for (const item of textContent.items as any[]) {
      if (item.str && item.str.trim()) {
        allItems.push({
          str: item.str.trim(),
          x: item.transform[4],
          y: item.transform[5],
          w: item.width || 0
        });
      }
    }
  }

  if (allItems.length === 0) {
    throw new Error("No readable text found in PDF. If this is a scanned document, please use image mode or check file quality.");
  }

  onProgress?.(65, "Rebuilding mark table columns & rows...");

  // Sort items top-to-bottom (higher Y first), then left-to-right (lower X first)
  allItems.sort((a, b) => b.y - a.y || a.x - b.x);
  rawPreview = allItems.map(it => it.str).join(" ");

  // Group into lines by Y coordinate with 6pt tolerance
  const lines: ItemWithPos[][] = [];
  let curLine: ItemWithPos[] = [];
  let curY: number | null = null;

  for (const it of allItems) {
    if (curY === null || Math.abs(it.y - curY) <= 6) {
      curLine.push(it);
      curY = it.y;
    } else {
      if (curLine.length) lines.push(curLine.sort((a, b) => a.x - b.x));
      curLine = [it];
      curY = it.y;
    }
  }
  if (curLine.length) lines.push(curLine.sort((a, b) => a.x - b.x));

  // Find Header Row: line containing the most known subject names
  const SUBJECT_KEYWORDS = ["tamil", "english", "maths", "mathematics", "science", "social", "hindi", "computer", "physics", "chemistry", "total"];
  let headerLineIndex = -1;
  let maxHeaderMatches = 0;

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const matchCount = l.filter(it => SUBJECT_KEYWORDS.some(k => normalizeText(it.str).includes(k))).length;
    if (matchCount > maxHeaderMatches && matchCount >= 2) {
      maxHeaderMatches = matchCount;
      headerLineIndex = i;
    }
  }

  if (headerLineIndex === -1) {
    // Fallback: parse raw text lines if table layout is absent
    return parseRawTextLinesFallback(rawPreview, file.name, file.size, classStudents, classSubjects, defaultMaxMarks, defaultPassMarks);
  }

  const headerItems = lines[headerLineIndex];

  // Build Column Ranges from header X positions
  const columns = headerItems.map((h, i) => {
    const prev = headerItems[i - 1];
    const next = headerItems[i + 1];
    const left = prev ? (h.x + prev.x) / 2 : h.x - 50;
    const right = next ? (h.x + next.x) / 2 : h.x + 80;
    const isTotalCol = normalizeText(h.str) === "total" || normalizeText(h.str) === "tot";
    const mappedSubject = isTotalCol ? null : matchSubjectName(h.str, classSubjects);

    return {
      name: h.str,
      canonicalName: mappedSubject ? mappedSubject.canonicalName : h.str,
      subjectId: mappedSubject?.subjectId,
      isTotal: isTotalCol,
      x: h.x,
      left,
      right
    };
  });

  // Extract optional Exam Name and Date from lines above header
  let detectedExamName: string | undefined = undefined;
  let detectedExamDate: string | undefined = undefined;

  for (let i = 0; i < headerLineIndex; i++) {
    const text = lines[i].map(it => it.str).join(" ");
    if (/unit\s*test|midterm|quarterly|half\s*yearly|annual|model/i.test(text)) {
      const m = text.match(/(Unit Test \d+|Midterm Examination|Quarterly Exam|Half-Yearly Exam|Annual Exam|Model Exam)/i);
      if (m) detectedExamName = m[0];
    }
    const dMatch = text.match(/\b\d{4}-\d{2}-\d{2}\b|\b\d{2}[-/]\d{2}[-/]\d{4}\b/);
    if (dMatch) detectedExamDate = dMatch[0];
  }

  // Process data lines below header
  const firstCol = columns[0];
  const subjectCols = columns.filter(c => !c.isTotal && c !== firstCol);
  const _totalCol = columns.find(c => c.isTotal);

  const studentRows: ExtractedStudentRow[] = [];
  let currentStudentRow: {
    name: string;
    rollNo: string;
    marksMap: Record<string, number | null | "AB">;
    printedTotal?: number;
  } | null = null;

  for (let i = headerLineIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    const firstColItem = line.find(it => it.x <= firstCol.right);
    const hasRollKeyword = line.some(it => it.str.toLowerCase().includes("roll"));
    const numberItemsInColumns = line.filter(it => it.x > firstCol.right && (!isNaN(parseFloat(it.str)) || ["ab", "abs", "a"].includes(it.str.toLowerCase())));

    if (numberItemsInColumns.length > 0) {
      // Main student line with scores!
      const studentName = firstColItem ? firstColItem.str : "";
      const marksMap: Record<string, number | null | "AB"> = {};
      let printedTotal: number | undefined = undefined;

      for (const it of line) {
        if (it === firstColItem) continue;
        const col = columns.find(c => it.x >= c.left && it.x <= c.right);
        if (!col) continue;

        if (col.isTotal) {
          const num = parseFloat(it.str);
          if (!isNaN(num)) printedTotal = num;
        } else {
          const parsed = parseScoreValue(it.str, defaultMaxMarks, defaultPassMarks);
          marksMap[col.canonicalName] = parsed.score;
        }
      }

      currentStudentRow = {
        name: studentName,
        rollNo: "",
        marksMap,
        printedTotal
      };
      // Check if student line itself contains roll number (e.g. "ANUSHKA A 7376252AD114")
      const rollMatch = line.map(it => it.str).join(" ").match(/([A-Z0-9]{6,})/);
      if (rollMatch) {
        currentStudentRow.rollNo = rollMatch[1];
      }

      // Add to rows
      studentRows.push(finalizeExtractedStudent(
        studentRows.length + 1,
        currentStudentRow.name,
        currentStudentRow.rollNo,
        subjectCols,
        currentStudentRow.marksMap,
        classStudents,
        defaultMaxMarks,
        defaultPassMarks,
        currentStudentRow.printedTotal
      ));
    } else if (hasRollKeyword && studentRows.length > 0) {
      // Sub-line with roll number for the active student!
      const lastRow = studentRows[studentRows.length - 1];
      const fullStr = line.map(it => it.str).join(" ");
      const m = fullStr.match(/(?:roll\s*(?:no)?[:\s]*)?([A-Z0-9]{6,})/i);
      if (m && m[1]) {
        lastRow.rawRollNumber = m[1];
        const reMatch = matchStudent(m[1], lastRow.rawName, classStudents);
        lastRow.matchedStudentId = reMatch.studentId;
        lastRow.matchedStudentName = reMatch.studentName || lastRow.rawName;
        lastRow.matchedRollNumber = reMatch.rollNumber || m[1];
        lastRow.matchType = reMatch.matchType;
        if (reMatch.confidence === "HIGH") lastRow.confidence = "HIGH";
      }
    }
  }

  onProgress?.(100, "PDF marks extraction complete!");

  return {
    success: true,
    fileDetails: {
      name: file.name,
      type: "PDF",
      size: file.size
    },
    examName: detectedExamName,
    examDate: detectedExamDate,
    isClassSheet: studentRows.length > 1,
    detectedSubjects: subjectCols.map(s => s.canonicalName),
    students: studentRows,
    rawTextPreview: rawPreview.slice(0, 500),
    debugInfo: {
      headerLine: headerItems.map(it => it.str).join(" | "),
      columnsDetected: columns.map(c => `${c.name} [${Math.round(c.left)}-${Math.round(c.right)}]`),
      rawLinesCount: lines.length,
      rawText: rawPreview
    }
  };
}

function finalizeExtractedStudent(
  rowIndex: number,
  rawName: string,
  rawRoll: string,
  subjectCols: Array<{ canonicalName: string; subjectId?: string }>,
  marksMap: Record<string, number | null | "AB">,
  classStudents: StudentMatchTarget[],
  defaultMaxMarks: number,
  defaultPassMarks: number,
  printedTotal?: number
): ExtractedStudentRow {
  const matched = matchStudent(rawRoll, rawName, classStudents);

  const subjects: ExtractedSubjectMark[] = subjectCols.map((col, idx) => {
    const scoreVal = marksMap[col.canonicalName] !== undefined ? marksMap[col.canonicalName] : null;
    const isNum = typeof scoreVal === "number";
    const grade = isNum ? calculateReportCardGrade((scoreVal / defaultMaxMarks) * 100) : (scoreVal === "AB" ? "F" : "-");
    const status = isNum
      ? (scoreVal >= defaultPassMarks ? "PASS" : "FAIL")
      : (scoreVal === "AB" ? "ABSENT" : "NEEDS_REVIEW");

    return {
      subjectName: col.canonicalName,
      matchedSubjectId: col.subjectId || `sub-${idx}`,
      score: scoreVal,
      maxScore: defaultMaxMarks,
      passMarks: defaultPassMarks,
      grade,
      status,
      remarks: "",
      confidence: scoreVal !== null ? "HIGH" : "LOW",
      rawText: scoreVal !== null ? String(scoreVal) : "",
      isInvalid: scoreVal === null || (isNum && (scoreVal < 0 || scoreVal > defaultMaxMarks))
    };
  });

  const totals = calculateStudentTotals(subjects);
  let confidence = matched.confidence;
  let totalMismatchWarning: string | undefined = undefined;

  if (printedTotal !== undefined && !totals.resultStatus.includes("PENDING")) {
    if (printedTotal === totals.totalMarks) {
      confidence = "HIGH";
    } else {
      confidence = "LOW";
      totalMismatchWarning = `Total in document: ${printedTotal}, sum of subjects: ${totals.totalMarks}`;
    }
  }

  return {
    rowIndex,
    rawRollNumber: rawRoll,
    rawName,
    matchedStudentId: matched.studentId,
    matchedStudentName: matched.studentName || rawName,
    matchedRollNumber: matched.rollNumber || rawRoll,
    matchType: matched.matchType,
    confidence,
    subjects,
    totalMarks: totals.totalMarks,
    maxTotalMarks: totals.maxTotalMarks,
    percentage: totals.percentage,
    grade: totals.grade,
    resultStatus: totals.resultStatus,
    generalRemarks: "",
    printedTotal,
    totalMismatchWarning
  };
}

/**
 * Fallback for unstructured PDF or flat text
 */
function parseRawTextLinesFallback(
  text: string,
  fileName: string,
  fileSize: number,
  classStudents: StudentMatchTarget[],
  classSubjects: SubjectMatchTarget[],
  defaultMaxMarks = 100,
  defaultPassMarks = 35
): ExtractionResult {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  let detectedExamName: string | undefined = undefined;
  let detectedExamDate: string | undefined = undefined;

  for (const line of lines) {
    if (/unit\s*test|midterm|quarterly|half\s*yearly|annual|model/i.test(line)) {
      const m = line.match(/(Unit Test \d+|Midterm Examination|Quarterly Exam|Half-Yearly Exam|Annual Exam|Model Exam)/i);
      if (m) detectedExamName = m[0];
    }
    const dMatch = line.match(/\b\d{4}-\d{2}-\d{2}\b|\b\d{2}[-/]\d{2}[-/]\d{4}\b/);
    if (dMatch) detectedExamDate = dMatch[0];
  }

  const studentRows: ExtractedStudentRow[] = [];

  for (const st of classStudents) {
    const hasName = text.toLowerCase().includes(st.name.toLowerCase());
    const hasRoll = st.rollNumber && text.toUpperCase().includes(st.rollNumber.toUpperCase());

    if (hasName || hasRoll) {
      const subjects: ExtractedSubjectMark[] = classSubjects.map((sub) => {
        let scoreVal: number | null = null;
        for (const line of lines) {
          if (line.toLowerCase().includes(sub.name.toLowerCase())) {
            const numM = line.match(/\b\d{1,3}\b/);
            if (numM) {
              const num = Number(numM[0]);
              if (num >= 0 && num <= defaultMaxMarks) {
                scoreVal = num;
                break;
              }
            }
          }
        }

        const isNum = scoreVal !== null;
        const grade = scoreVal !== null ? calculateReportCardGrade((scoreVal / defaultMaxMarks) * 100) : "-";
        const status = scoreVal !== null ? (scoreVal >= defaultPassMarks ? "PASS" : "FAIL") : "NEEDS_REVIEW";

        return {
          subjectName: sub.name,
          matchedSubjectId: sub.id,
          score: scoreVal,
          maxScore: defaultMaxMarks,
          passMarks: defaultPassMarks,
          grade,
          status,
          remarks: "",
          confidence: isNum ? "HIGH" : "LOW",
          rawText: isNum ? String(scoreVal) : "",
          isInvalid: scoreVal === null
        };
      });

      const totals = calculateStudentTotals(subjects);

      studentRows.push({
        rowIndex: studentRows.length + 1,
        rawRollNumber: st.rollNumber,
        rawName: st.name,
        matchedStudentId: st.id,
        matchedStudentName: st.name,
        matchedRollNumber: st.rollNumber,
        matchType: hasRoll ? "EXACT_ROLL" : "EXACT_NAME",
        confidence: "HIGH",
        subjects,
        totalMarks: totals.totalMarks,
        maxTotalMarks: totals.maxTotalMarks,
        percentage: totals.percentage,
        grade: totals.grade,
        resultStatus: totals.resultStatus,
        generalRemarks: ""
      });
    }
  }

  return {
    success: studentRows.length > 0,
    fileDetails: { name: fileName, type: "PDF", size: fileSize },
    examName: detectedExamName,
    examDate: detectedExamDate,
    isClassSheet: studentRows.length > 1,
    detectedSubjects: classSubjects.map(s => s.name),
    students: studentRows,
    rawTextPreview: lines.slice(0, 15).join("\n")
  };
}

/**
 * Layer 3: Image OCR with canvas enhancement and Tesseract.js Worker
 */
export async function parseScannedImage(
  file: File,
  classStudents: StudentMatchTarget[],
  classSubjects: SubjectMatchTarget[],
  defaultMaxMarks = 100,
  defaultPassMarks = 35,
  onProgress?: (progress: number, message: string) => void
): Promise<ExtractionResult> {
  onProgress?.(15, "Preprocessing image for optical recognition...");
  const processedBlob = await preprocessImageCanvas(file);

  onProgress?.(30, "Initializing OCR recognition worker...");
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng");

  onProgress?.(45, "Reading document text and numbers...");
  const ret = await worker.recognize(processedBlob);
  await worker.terminate();

  onProgress?.(80, "Mapping recognized marks to students and subjects...");
  const rawText = ret?.data?.text || "";

  return parseRawTextLinesFallback(
    rawText,
    file.name,
    file.size,
    classStudents,
    classSubjects,
    defaultMaxMarks,
    defaultPassMarks
  );
}

/**
 * Preprocesses an image via Canvas: grayscale, high contrast thresholding
 */
async function preprocessImageCanvas(file: File): Promise<Blob> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement("canvas");
      const MAX_DIM = 2000;
      let width = img.width;
      let height = img.height;

      if (width > MAX_DIM || height > MAX_DIM) {
        if (width > height) {
          height = Math.round((height * MAX_DIM) / width);
          width = MAX_DIM;
        } else {
          width = Math.round((width * MAX_DIM) / height);
          height = MAX_DIM;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(file);
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      try {
        const imgData = ctx.getImageData(0, 0, width, height);
        const d = imgData.data;
        const contrast = 1.25;
        const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));

        for (let i = 0; i < d.length; i += 4) {
          const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
          const enhanced = Math.min(255, Math.max(0, factor * (gray - 128) + 128));
          d[i] = enhanced;
          d[i + 1] = enhanced;
          d[i + 2] = enhanced;
        }
        ctx.putImageData(imgData, 0, 0);
      } catch {
        // canvas fallback
      }

      canvas.toBlob(blob => resolve(blob || file), "image/jpeg", 0.9);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file);
    };

    img.src = url;
  });
}

/**
 * Universal layered extraction entrypoint.
 * Operates purely in-memory in browser; file is never sent or stored.
 */
export async function extractMarksDocument(
  file: File,
  classStudents: StudentMatchTarget[],
  classSubjects: SubjectMatchTarget[],
  defaultMaxMarks = 100,
  defaultPassMarks = 35,
  onProgress?: (progress: number, message: string) => void
): Promise<ExtractionResult> {
  const fileName = file.name.toLowerCase();
  const ext = fileName.split(".").pop() || "";

  if (["xlsx", "xls", "csv"].includes(ext)) {
    onProgress?.(30, "Parsing Excel / CSV spreadsheet in browser...");
    const res = await parseSpreadsheet(file, classStudents, classSubjects, defaultMaxMarks, defaultPassMarks);
    onProgress?.(100, "Spreadsheet extraction complete!");
    return res;
  }

  if (ext === "pdf") {
    onProgress?.(15, "Reading PDF document...");
    const res = await parsePdfDocument(file, classStudents, classSubjects, defaultMaxMarks, defaultPassMarks, onProgress);
    onProgress?.(100, "PDF extraction complete!");
    return res;
  }

  if (["jpg", "jpeg", "png", "webp", "bmp"].includes(ext)) {
    onProgress?.(10, "Processing scanned image or photo...");
    const res = await parseScannedImage(file, classStudents, classSubjects, defaultMaxMarks, defaultPassMarks, onProgress);
    onProgress?.(100, "Image OCR extraction complete!");
    return res;
  }

  throw new Error(`Unsupported document extension (.${ext}). Supported: .xlsx, .xls, .csv, .pdf, .jpg, .jpeg, .png, .webp`);
}
