import * as XLSX from "xlsx";
import { REPORT_CARD_GRADE_SCALE, calculateReportCardGrade } from "./constants";

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
  score: number | "" | "AB";
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
  attendance: string;
  generalRemarks: string;
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
}

const COMMON_SUBJECT_PATTERNS: Record<string, string[]> = {
  "Tamil": ["tamil", "tam", "language 1", "first language", "regional language"],
  "English": ["english", "eng", "language 2", "second language", "general english"],
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

function normalizeText(str: string): string {
  return (str || "").toLowerCase().trim().replace(/[^a-z0-9]/g, "");
}

function cleanRollNumber(str: string): string {
  return (str || "").toUpperCase().trim().replace(/[^A-Z0-9]/g, "");
}

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
      return targetNorm.includes(cleanN) || cleanN.includes(targetNorm);
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

export function matchSubjectName(
  rawCol: string,
  classSubjects: SubjectMatchTarget[]
): { canonicalName: string; subjectId?: string } {
  const norm = normalizeText(rawCol);

  // First try direct match against class subjects
  const directMatch = classSubjects.find(
    cs => normalizeText(cs.name) === norm || norm.includes(normalizeText(cs.name))
  );
  if (directMatch) {
    return { canonicalName: directMatch.name, subjectId: directMatch.id };
  }

  // Next try common aliases
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

function parseScoreValue(
  val: any,
  defaultMaxMarks: number,
  defaultPassMarks: number
): {
  score: number | "" | "AB";
  confidence: "HIGH" | "MEDIUM" | "LOW";
  status: "PASS" | "FAIL" | "ABSENT" | "NEEDS_REVIEW";
  rawText: string;
} {
  if (val === null || val === undefined || val === "") {
    return { score: "", confidence: "LOW", status: "NEEDS_REVIEW", rawText: "" };
  }

  const str = String(val).trim();
  const lower = str.toLowerCase();

  if (["ab", "abs", "absent", "a"].includes(lower)) {
    return { score: "AB", confidence: "HIGH", status: "ABSENT", rawText: str };
  }

  // Handle formats like "86/100" or "86 / 100"
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

  return { score: "", confidence: "LOW", status: "NEEDS_REVIEW", rawText: str };
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
  let hasEmpty = false;

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
      hasEmpty = true;
    }
  });

  const percentage = maxTotalMarks > 0 ? parseFloat(((totalMarks / maxTotalMarks) * 100).toFixed(1)) : 0;
  const grade = hasEmpty && totalMarks === 0 ? "-" : calculateReportCardGrade(percentage, hasFail);

  const resultStatus: "PASSED" | "NEEDS SUPPORT" | "PENDING" = hasEmpty
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
 * Layer 1: Parse Excel (.xlsx, .xls) and CSV in the browser using SheetJS
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

  // 1. Auto-detect Header Row
  let headerRowIndex = -1;
  let rollColIndex = -1;
  let nameColIndex = -1;
  let attendanceColIndex = -1;
  let remarksColIndex = -1;
  let subjectCols: Array<{ colIndex: number; canonicalName: string; subjectId?: string }> = [];

  const NON_SUBJECT_COL_KEYS = [
    "sno", "s.no", "slno", "sl no", "no", "id", "rollno", "roll no", "roll",
    "regno", "reg no", "register no", "admissionno", "admission no", "adm no",
    "studentname", "student name", "name", "candidate", "total", "tot", "grand total",
    "percentage", "percent", "pct", "%", "grade", "rank", "result", "status",
    "attendance", "att", "remark", "remarks", "signature"
  ];

  for (let r = 0; r < Math.min(rawRows.length, 12); r++) {
    const row = rawRows[r].map(c => String(c).trim());
    let rollIdx = -1;
    let nameIdx = -1;
    let subMatches: Array<{ colIndex: number; canonicalName: string; subjectId?: string }> = [];

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
      } else if (!NON_SUBJECT_COL_KEYS.includes(norm)) {
        // Potential subject column
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

  // Fallback if header row not identified with roll/name
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
        // Attempt first column as roll/name if not found
        if (rollColIndex === -1 && rawRows[r][0]) rollColIndex = 0;
        if (nameColIndex === -1 && rawRows[r][1]) nameColIndex = 1;
        break;
      }
    }
  }

  if (headerRowIndex === -1 || subjectCols.length === 0) {
    throw new Error("Could not detect student or subject headers in spreadsheet. Please verify column names.");
  }

  // Extract metadata (Exam Name, Date) from preceding rows if available
  let detectedExamName = "Midterm Examination";
  let detectedExamDate = new Date().toISOString().split("T")[0];

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

  // 2. Parse Student Data Rows
  const studentRows: ExtractedStudentRow[] = [];

  for (let r = headerRowIndex + 1; r < rawRows.length; r++) {
    const row = rawRows[r];
    if (!row || row.length === 0) continue;

    const rawRoll = rollColIndex !== -1 ? String(row[rollColIndex] || "").trim() : "";
    const rawName = nameColIndex !== -1 ? String(row[nameColIndex] || "").trim() : "";

    // Skip footer / summary rows (like "Total", "Average", "Class Highest")
    const combinedRowStr = row.slice(0, 3).join(" ").toLowerCase();
    if (combinedRowStr.includes("total") || combinedRowStr.includes("average") || combinedRowStr.includes("signature")) {
      continue;
    }

    if (!rawRoll && !rawName) continue;

    const matched = matchStudent(rawRoll, rawName, classStudents);
    const attendanceVal = attendanceColIndex !== -1 ? String(row[attendanceColIndex] || "").trim() : "";
    const remarksVal = remarksColIndex !== -1 ? String(row[remarksColIndex] || "").trim() : "";

    // Extract subjects
    const subjects: ExtractedSubjectMark[] = subjectCols.map((subCol, sIdx) => {
      const rawVal = row[subCol.colIndex];
      const parsed = parseScoreValue(rawVal, defaultMaxMarks, defaultPassMarks);
      const isNum = typeof parsed.score === "number";
      const grade = isNum ? calculateReportCardGrade((parsed.score as number / defaultMaxMarks) * 100) : (parsed.score === "AB" ? "F" : "-");

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
        isInvalid: parsed.score === "" || (isNum && ((parsed.score as number) < 0 || (parsed.score as number) > defaultMaxMarks))
      };
    });

    const totals = calculateStudentTotals(subjects);

    studentRows.push({
      rowIndex: studentRows.length + 1,
      rawRollNumber: rawRoll,
      rawName,
      matchedStudentId: matched.studentId,
      matchedStudentName: matched.studentName || rawName,
      matchedRollNumber: matched.rollNumber || rawRoll,
      matchType: matched.matchType,
      confidence: matched.confidence,
      subjects,
      totalMarks: totals.totalMarks,
      maxTotalMarks: totals.maxTotalMarks,
      percentage: totals.percentage,
      grade: totals.grade,
      resultStatus: totals.resultStatus,
      attendance: attendanceVal,
      generalRemarks: remarksVal
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
    students: studentRows
  };
}

/**
 * Layer 2: Parse text PDF in browser using unpdf
 */
export async function parsePdfDocument(
  file: File,
  classStudents: StudentMatchTarget[],
  classSubjects: SubjectMatchTarget[],
  defaultMaxMarks = 100,
  defaultPassMarks = 35,
  onProgress?: (progress: number, message: string) => void
): Promise<ExtractionResult> {
  onProgress?.(20, "Extracting text structure from PDF...");
  const arrayBuffer = await file.arrayBuffer();

  const unpdf = await import("unpdf");
  const pdf = await unpdf.getDocumentProxy(new Uint8Array(arrayBuffer));
  const totalPages = pdf.numPages;

  let fullText = "";
  for (let p = 1; p <= totalPages; p++) {
    onProgress?.(20 + Math.round((p / totalPages) * 40), `Reading PDF page ${p} of ${totalPages}...`);
    const pageText = await unpdf.extractText(pdf, { mergePages: false });
    if (Array.isArray(pageText)) {
      fullText += pageText.join("\n") + "\n";
    } else {
      fullText += String(pageText) + "\n";
    }
  }

  onProgress?.(70, "Analyzing mark table structure...");

  // Parse extracted raw text lines
  return parseRawTextLines(
    fullText,
    file.name,
    file.size,
    classStudents,
    classSubjects,
    defaultMaxMarks,
    defaultPassMarks
  );
}

/**
 * Layer 3: Image Preprocessing on Canvas + OCR with Tesseract.js Worker
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

  // 1. In-browser canvas enhancement (Grayscale + Contrast enhancement)
  const processedBlob = await preprocessImageCanvas(file);

  onProgress?.(30, "Initializing OCR recognition worker...");
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng");

  onProgress?.(45, "Reading document text and numbers...");
  const ret = await worker.recognize(processedBlob);
  await worker.terminate();

  onProgress?.(80, "Mapping recognized marks to students and subjects...");
  const rawText = ret?.data?.text || "";

  return parseRawTextLines(
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

      // Contrast enhancement & grayscale
      try {
        const imgData = ctx.getImageData(0, 0, width, height);
        const d = imgData.data;
        const contrast = 1.25; // 25% contrast boost
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
        // canvas security or buffer fallback
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
 * Parses raw text extracted from PDF or OCR into structured students & marks
 */
function parseRawTextLines(
  text: string,
  fileName: string,
  fileSize: number,
  classStudents: StudentMatchTarget[],
  classSubjects: SubjectMatchTarget[],
  defaultMaxMarks = 100,
  defaultPassMarks = 35
): ExtractionResult {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  let detectedExamName = "Midterm Examination";
  let detectedExamDate = new Date().toISOString().split("T")[0];

  // Search for exam name and date in text
  for (const line of lines) {
    if (/unit\s*test|midterm|quarterly|half\s*yearly|annual|model/i.test(line)) {
      const m = line.match(/(Unit Test \d+|Midterm Examination|Quarterly Exam|Half-Yearly Exam|Annual Exam|Model Exam)/i);
      if (m) detectedExamName = m[0];
    }
    const dMatch = line.match(/\b\d{4}-\d{2}-\d{2}\b|\b\d{2}[-/]\d{2}[-/]\d{4}\b/);
    if (dMatch) detectedExamDate = dMatch[0];
  }

  const studentRows: ExtractedStudentRow[] = [];

  // Check if multiple students exist in tabular format
  // Format typically: "ANUSHKA A 7376252AD114 86 91 88 84 90 439" or similar
  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];

    // Check for roll number in line (e.g. 7376252AD114 or 6-15 alphanumeric)
    const rollMatch = line.match(/\b([A-Z0-9]{6,16})\b/);
    let matchedStudent: ReturnType<typeof matchStudent> | null = null;

    if (rollMatch) {
      const candidateRoll = rollMatch[1];
      const match = matchStudent(candidateRoll, "", classStudents);
      if (match.matchType !== "UNMATCHED") {
        matchedStudent = match;
      }
    }

    // Check by name if roll didn't match
    if (!matchedStudent) {
      for (const st of classStudents) {
        if (line.toLowerCase().includes(st.name.toLowerCase())) {
          matchedStudent = {
            studentId: st.id,
            studentName: st.name,
            rollNumber: st.rollNumber,
            matchType: "EXACT_NAME",
            confidence: "HIGH"
          };
          break;
        }
      }
    }

    if (matchedStudent) {
      // Extract numbers from this line or next line as subject scores
      const numberMatches = (line.match(/\b\d{1,3}\b/g) || []).map(Number);
      // Filter numbers that look like marks (0-100) and ignore roll numbers
      const scoreCandidates = numberMatches.filter(n => n >= 0 && n <= defaultMaxMarks);

      const subjects: ExtractedSubjectMark[] = classSubjects.map((sub, sIdx) => {
        const score = scoreCandidates[sIdx] !== undefined ? scoreCandidates[sIdx] : "";
        const isNum = typeof score === "number";
        const grade = isNum ? calculateReportCardGrade((score / (sub.maxMarks || defaultMaxMarks)) * 100) : "-";
        const status = isNum ? (score >= (sub.passMarks || defaultPassMarks) ? "PASS" : "FAIL") : "NEEDS_REVIEW";

        return {
          subjectName: sub.name,
          matchedSubjectId: sub.id,
          score,
          maxScore: sub.maxMarks || defaultMaxMarks,
          passMarks: sub.passMarks || defaultPassMarks,
          grade,
          status,
          remarks: "",
          confidence: isNum ? "HIGH" : "LOW",
          rawText: isNum ? String(score) : "",
          isInvalid: score === ""
        };
      });

      const totals = calculateStudentTotals(subjects);

      studentRows.push({
        rowIndex: studentRows.length + 1,
        rawRollNumber: matchedStudent.rollNumber,
        rawName: matchedStudent.studentName,
        matchedStudentId: matchedStudent.studentId,
        matchedStudentName: matchedStudent.studentName,
        matchedRollNumber: matchedStudent.rollNumber,
        matchType: matchedStudent.matchType,
        confidence: matchedStudent.confidence,
        subjects,
        totalMarks: totals.totalMarks,
        maxTotalMarks: totals.maxTotalMarks,
        percentage: totals.percentage,
        grade: totals.grade,
        resultStatus: totals.resultStatus,
        attendance: "",
        generalRemarks: ""
      });
    }
  }

  // If no multi-student rows detected, parse as a Single-Student mark sheet
  if (studentRows.length === 0) {
    let singleStudent = classStudents[0] || null;
    let singleRoll = "";
    let singleName = "";

    // Search lines for student name / roll
    for (const line of lines) {
      const rM = line.match(/(?:roll|reg|admission)\s*(?:no|number)?[:\s-]*([A-Z0-9]+)/i);
      if (rM) {
        singleRoll = rM[1];
        const match = matchStudent(singleRoll, "", classStudents);
        if (match.matchType !== "UNMATCHED") {
          singleStudent = classStudents.find(s => s.id === match.studentId) || singleStudent;
        }
      }
      const nM = line.match(/(?:name|student)\s*[:\s-]+([A-Za-z\s.]+)/i);
      if (nM) {
        singleName = nM[1].trim();
        const match = matchStudent("", singleName, classStudents);
        if (match.matchType !== "UNMATCHED") {
          singleStudent = classStudents.find(s => s.id === match.studentId) || singleStudent;
        }
      }
    }

    // Extract subjects line by line (e.g. "Tamil: 86", "English 91", "Mathematics 88")
    const subjects: ExtractedSubjectMark[] = classSubjects.map(sub => {
      let score: number | "" = "";
      let confidence: "HIGH" | "MEDIUM" | "LOW" = "LOW";

      for (const line of lines) {
        const lower = line.toLowerCase();
        if (lower.includes(sub.name.toLowerCase()) || COMMON_SUBJECT_PATTERNS[sub.name]?.some(a => lower.includes(a))) {
          const numM = line.match(/\b\d{1,3}\b/);
          if (numM) {
            const num = Number(numM[0]);
            if (num >= 0 && num <= (sub.maxMarks || defaultMaxMarks)) {
              score = num;
              confidence = "HIGH";
              break;
            }
          }
        }
      }

      const scoreNum = typeof score === "number" ? score : null;
      const isNum = scoreNum !== null;
      const maxScore = sub.maxMarks || defaultMaxMarks;
      const passMarks = sub.passMarks || defaultPassMarks;
      const grade = scoreNum !== null ? calculateReportCardGrade((scoreNum / maxScore) * 100) : "-";
      const status = scoreNum !== null ? (scoreNum >= passMarks ? "PASS" : "FAIL") : "NEEDS_REVIEW";

      return {
        subjectName: sub.name,
        matchedSubjectId: sub.id,
        score,
        maxScore,
        passMarks,
        grade,
        status,
        remarks: "",
        confidence,
        rawText: isNum ? String(score) : "",
        isInvalid: score === ""
      };
    });

    const totals = calculateStudentTotals(subjects);

    studentRows.push({
      rowIndex: 1,
      rawRollNumber: singleRoll || singleStudent?.rollNumber || "",
      rawName: singleName || singleStudent?.name || "",
      matchedStudentId: singleStudent?.id || "",
      matchedStudentName: singleStudent?.name || singleName || "Student",
      matchedRollNumber: singleStudent?.rollNumber || singleRoll || "",
      matchType: singleStudent ? "EXACT_NAME" : "UNMATCHED",
      confidence: singleStudent ? "HIGH" : "LOW",
      subjects,
      totalMarks: totals.totalMarks,
      maxTotalMarks: totals.maxTotalMarks,
      percentage: totals.percentage,
      grade: totals.grade,
      resultStatus: totals.resultStatus,
      attendance: "",
      generalRemarks: ""
    });
  }

  return {
    success: true,
    fileDetails: {
      name: fileName,
      type: fileName.split(".").pop()?.toUpperCase() || "DOCUMENT",
      size: fileSize
    },
    examName: detectedExamName,
    examDate: detectedExamDate,
    isClassSheet: studentRows.length > 1,
    detectedSubjects: classSubjects.map(s => s.name),
    students: studentRows,
    rawTextPreview: lines.slice(0, 10).join("\n")
  };
}

/**
 * Universal layered extraction entrypoint.
 * Automatically delegates to Spreadsheet, PDF, or Image OCR based on file type.
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

  if (ext === "json") {
    onProgress?.(50, "Reading JSON data...");
    const text = await file.text();
    const parsed = JSON.parse(text);
    const students: ExtractedStudentRow[] = (parsed.students || []).map((s: any, idx: number) => {
      const matched = matchStudent(s.rollNumber || "", s.studentName || s.name || "", classStudents);
      const subs: ExtractedSubjectMark[] = (s.subjects || []).map((sub: any) => {
        const scoreVal: number | "" = sub.score !== "" && sub.score !== undefined && !isNaN(Number(sub.score)) ? Number(sub.score) : "";
        const maxScoreVal = Number(sub.maxScore) || defaultMaxMarks;
        const passMarksVal = Number(sub.passMarks) || defaultPassMarks;
        const isNum = typeof scoreVal === "number";
        const gradeVal = sub.grade || (isNum ? calculateReportCardGrade((scoreVal / maxScoreVal) * 100) : "-");
        const statusVal = sub.status || (isNum ? (scoreVal >= passMarksVal ? "PASS" : "FAIL") : "NEEDS_REVIEW");

        return {
          subjectName: sub.subjectName || sub.name,
          matchedSubjectId: sub.subjectId,
          score: scoreVal,
          maxScore: maxScoreVal,
          passMarks: passMarksVal,
          grade: gradeVal,
          status: statusVal,
          remarks: sub.remarks || "",
          confidence: "HIGH" as const,
          rawText: String(sub.score || ""),
          isInvalid: !isNum
        };
      });
      const totals = calculateStudentTotals(subs);
      return {
        rowIndex: idx + 1,
        rawRollNumber: s.rollNumber || "",
        rawName: s.studentName || s.name || "",
        matchedStudentId: matched.studentId,
        matchedStudentName: matched.studentName || s.studentName,
        matchedRollNumber: matched.rollNumber || s.rollNumber,
        matchType: matched.matchType,
        confidence: matched.confidence,
        subjects: subs,
        totalMarks: totals.totalMarks,
        maxTotalMarks: totals.maxTotalMarks,
        percentage: totals.percentage,
        grade: totals.grade,
        resultStatus: totals.resultStatus,
        attendance: s.attendance || "",
        generalRemarks: s.remarks || ""
      };
    });

    return {
      success: true,
      fileDetails: { name: file.name, type: "JSON", size: file.size },
      examName: parsed.examName || "Midterm Examination",
      examDate: parsed.examDate || new Date().toISOString().split("T")[0],
      isClassSheet: students.length > 1,
      detectedSubjects: classSubjects.map(s => s.name),
      students
    };
  }

  throw new Error(`Unsupported document extension (.${ext}). Supported: .xlsx, .xls, .csv, .pdf, .jpg, .jpeg, .png, .webp, .json`);
}
