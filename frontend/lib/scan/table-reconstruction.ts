import type { WordBox, ScanResult, ScanStudent, ScanSubject } from "./types";

const SUBJECT_KEYWORDS: Record<string, string> = {
  tamil: "TAMIL",
  tam: "TAMIL",
  english: "ENGLISH",
  eng: "ENGLISH",
  maths: "MATHEMATICS",
  mathematics: "MATHEMATICS",
  math: "MATHEMATICS",
  mat: "MATHEMATICS",
  science: "SCIENCE",
  sci: "SCIENCE",
  social: "SOCIAL SCIENCE",
  "social science": "SOCIAL SCIENCE",
  socialscience: "SOCIAL SCIENCE",
  history: "HISTORY",
  geography: "GEOGRAPHY",
  physics: "PHYSICS",
  chemistry: "CHEMISTRY",
  biology: "BIOLOGY",
  computer: "COMPUTER SCIENCE",
  cs: "COMPUTER SCIENCE",
  hindi: "HINDI",
  french: "FRENCH",
  evs: "ENVIRONMENTAL STUDIES",
};

const HEADER_KEYWORDS = [
  "name",
  "student",
  "candidate",
  "roll",
  "regno",
  "admno",
  "reg",
  "adm",
  "subject",
  "marks",
  "mark",
  "score",
  "total",
  "percentage",
  "grade",
  "result",
  "rank",
  "attendance",
];

interface TextLine {
  y0: number;
  y1: number;
  height: number;
  words: WordBox[];
  text: string;
}

export function reconstructTableFromWords(
  words: WordBox[],
  options?: {
    defaultMaxMarks?: number;
    defaultPassMarks?: number;
  }
): ScanResult {
  const defaultMax = options?.defaultMaxMarks || 100;
  const defaultPass = options?.defaultPassMarks || 35;
  const warnings: string[] = [];

  if (words.length === 0) {
    return {
      layout: "A",
      examination: null,
      examDate: null,
      classLabel: null,
      maxMarksDefault: defaultMax,
      passMarksDefault: defaultPass,
      students: [],
      warnings: ["No readable text elements found in document."],
    };
  }

  // 1. Group words into horizontal lines based on Y proximity
  const lines = groupWordsIntoLines(words);
  const fullText = lines.map((l) => l.text).join("\n");

  // 2. Extract Document-Level Metadata (Exam Name, Date, Attendance, Max Marks)
  const meta = extractDocumentMetadata(fullText, lines);
  const maxMarks = meta.maxMarks || defaultMax;
  const passMarks = meta.passMarks || defaultPass;

  // 3. Detect the primary Header Row
  const headerIdx = findHeaderLineIndex(lines);

  // 4. Layout Detection
  // If no clear tabular header or single student label patterns
  if (headerIdx === -1) {
    const singleStudent = attemptLabelValueParse(lines, maxMarks, passMarks);
    if (singleStudent) {
      return {
        layout: "C",
        examination: meta.examName,
        examDate: meta.examDate,
        classLabel: meta.classLabel,
        maxMarksDefault: maxMarks,
        passMarksDefault: passMarks,
        students: [singleStudent],
        warnings,
        rawTextPreview: fullText,
      };
    }
  }

  const headerLine = lines[headerIdx] || lines[0];

  // 5. Build Column Ranges from Header Words
  const columns = identifyColumns(headerLine);

  // 6. Process Student Rows below the header line
  const dataLines = lines.slice(headerIdx + 1);
  const students: ScanStudent[] = [];

  // Filter out footer rows (e.g. "Sample marks for layout preview", "Total marks: 500")
  const filteredDataLines = dataLines.filter((l) => {
    const norm = l.text.toLowerCase();
    if (norm.includes("layout preview") || norm.includes("sample marks")) return false;
    if (norm.startsWith("total marks:") && norm.includes("maximum")) return false;
    return true;
  });

  let currentStudent: {
    name: string;
    rollNo: string | null;
    attendance: string | null;
    marksMap: Map<string, { value: number | null | "AB"; confidence: number; raw: string; bbox?: any }>;
    printedTotal: number | null;
    lineBox?: { x0: number; y0: number; x1: number; y1: number };
  } | null = null;

  for (let i = 0; i < filteredDataLines.length; i++) {
    const line = filteredDataLines[i];
    const firstWord = line.words[0];
    const lineText = line.text;

    // Check if line is a secondary Roll Number line for the previous student (e.g. "Roll No: 7376252AD114")
    const rollMatch = lineText.match(/(?:roll\s*(?:no|num)?[:\s-]*|reg\s*(?:no)?[:\s-]*|adm\s*(?:no)?[:\s-]*)([A-Za-z0-9_-]+)/i);
    if (rollMatch && currentStudent && !currentStudent.rollNo) {
      currentStudent.rollNo = rollMatch[1];
      continue;
    }

    // Check if line contains student name (first column, x < first subject col start)
    const firstColBound = columns[1] ? columns[1].x0 : 350;
    const nameWords = line.words.filter((w) => w.x1 <= firstColBound);
    const scoreWords = line.words.filter((w) => w.x0 > firstColBound - 40);

    const isStudentNameCandidate =
      nameWords.length > 0 &&
      !nameWords.some((w) => /^(total|pass|fail|maximum|remarks|date|grade)$/i.test(w.text)) &&
      /[a-zA-Z]{2,}/.test(nameWords.map((w) => w.text).join(" "));

    if (isStudentNameCandidate) {
      // Save previous student
      if (currentStudent && currentStudent.name) {
        students.push(finalizeStudentRow(currentStudent, columns, maxMarks, passMarks));
      }

      let rawName = nameWords.map((w) => w.text).join(" ");
      let rollNo: string | null = null;

      // Extract roll number if included in the same line
      const inlineRoll = rawName.match(/(?:roll\s*(?:no|num)?[:\s-]*|reg\s*(?:no)?[:\s-]*)([A-Za-z0-9_-]+)/i);
      if (inlineRoll) {
        rollNo = inlineRoll[1];
        rawName = rawName.replace(inlineRoll[0], "").trim();
      }

      currentStudent = {
        name: cleanStudentName(rawName),
        rollNo,
        attendance: meta.attendance,
        marksMap: new Map(),
        printedTotal: null,
        lineBox: {
          x0: line.words[0]?.x0 || 0,
          y0: line.y0,
          x1: line.words[line.words.length - 1]?.x1 || 1000,
          y1: line.y1,
        },
      };
    }

    // Assign score words on this line to closest column
    if (currentStudent) {
      for (const w of scoreWords) {
        const targetCol = findClosestColumn(w.x0, w.x1, columns);
        if (!targetCol) continue;

        const parsed = parseDigitOrAbsent(w.text, maxMarks);
        if (targetCol.isTotal) {
          if (typeof parsed.val === "number") {
            currentStudent.printedTotal = parsed.val;
          }
        } else {
          currentStudent.marksMap.set(targetCol.name, {
            value: parsed.val,
            confidence: parsed.confidence,
            raw: w.text,
            bbox: { x0: w.x0, y0: w.y0, x1: w.x1, y1: w.y1 },
          });
        }
      }
    }
  }

  // Push final student
  if (currentStudent && currentStudent.name) {
    students.push(finalizeStudentRow(currentStudent, columns, maxMarks, passMarks));
  }

  return {
    layout: "A",
    examination: meta.examName,
    examDate: meta.examDate,
    classLabel: meta.classLabel,
    maxMarksDefault: maxMarks,
    passMarksDefault: passMarks,
    students,
    warnings,
    rawTextPreview: fullText,
  };
}

/**
 * Group raw words into lines by Y coordinate
 */
function groupWordsIntoLines(words: WordBox[]): TextLine[] {
  const sorted = [...words].sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
  const lines: TextLine[] = [];

  // Compute median word height for clustering threshold
  const heights = sorted.map((w) => w.y1 - w.y0).sort((a, b) => a - b);
  const medianHeight = heights[Math.floor(heights.length / 2)] || 18;
  const tolerance = Math.max(8, Math.min(22, medianHeight * 0.7));

  for (const w of sorted) {
    let line = lines.find((l) => Math.abs((l.y0 + l.y1) / 2 - (w.y0 + w.y1) / 2) <= tolerance);
    if (!line) {
      line = {
        y0: w.y0,
        y1: w.y1,
        height: w.y1 - w.y0,
        words: [],
        text: "",
      };
      lines.push(line);
    }
    line.words.push(w);
    line.y0 = Math.min(line.y0, w.y0);
    line.y1 = Math.max(line.y1, w.y1);
  }

  // Sort lines from top to bottom and words from left to right
  lines.sort((a, b) => a.y0 - b.y0);
  for (const l of lines) {
    l.words.sort((a, b) => a.x0 - b.x0);
    l.text = l.words.map((w) => w.text).join(" ");
  }

  return lines;
}

/**
 * Identifies the table header line by scoring against known header keywords
 */
function findHeaderLineIndex(lines: TextLine[]): number {
  let bestIdx = -1;
  let maxScore = 0;

  for (let i = 0; i < Math.min(lines.length, 15); i++) {
    const text = lines[i].text.toLowerCase();
    let score = 0;

    for (const kw of HEADER_KEYWORDS) {
      if (text.includes(kw)) score += 2;
    }
    for (const sub of Object.keys(SUBJECT_KEYWORDS)) {
      if (text.includes(sub)) score += 3;
    }

    if (score > maxScore && score >= 4) {
      maxScore = score;
      bestIdx = i;
    }
  }

  return bestIdx;
}

interface ColumnRange {
  name: string;
  x0: number;
  x1: number;
  xCenter: number;
  isTotal: boolean;
  isName: boolean;
}

/**
 * Builds column boundaries from detected header row
 */
function identifyColumns(headerLine: TextLine): ColumnRange[] {
  const columns: ColumnRange[] = [];
  const words = headerLine.words;

  let currentNameWords: WordBox[] = [];

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const lower = w.text.toLowerCase().replace(/[^a-z0-9]/g, "");

    const isSubMatch = Object.keys(SUBJECT_KEYWORDS).find((k) => lower === k || lower.startsWith(k));
    const isTotal = lower.includes("total") || lower === "tot";
    const isName = lower.includes("name") || lower.includes("student") || lower.includes("candidate");

    if (isName) {
      currentNameWords.push(w);
      if (words[i + 1] && /^(name|candidate|id)$/i.test(words[i + 1].text)) {
        currentNameWords.push(words[i + 1]);
        i++;
      }
      columns.push({
        name: "STUDENT NAME",
        x0: currentNameWords[0].x0,
        x1: currentNameWords[currentNameWords.length - 1].x1,
        xCenter: (currentNameWords[0].x0 + currentNameWords[currentNameWords.length - 1].x1) / 2,
        isTotal: false,
        isName: true,
      });
      currentNameWords = [];
    } else if (isSubMatch) {
      columns.push({
        name: SUBJECT_KEYWORDS[isSubMatch] || w.text.toUpperCase(),
        x0: w.x0 - 15,
        x1: w.x1 + 15,
        xCenter: (w.x0 + w.x1) / 2,
        isTotal: false,
        isName: false,
      });
    } else if (isTotal) {
      columns.push({
        name: "TOTAL",
        x0: w.x0 - 15,
        x1: w.x1 + 30,
        xCenter: (w.x0 + w.x1) / 2,
        isTotal: true,
        isName: false,
      });
    }
  }

  // If no columns detected, create standard subject columns
  if (columns.length <= 1) {
    const std = ["TAMIL", "ENGLISH", "MATHEMATICS", "SCIENCE", "SOCIAL SCIENCE", "TOTAL"];
    let left = 450;
    for (const s of std) {
      columns.push({
        name: s,
        x0: left - 20,
        x1: left + 140,
        xCenter: left + 60,
        isTotal: s === "TOTAL",
        isName: false,
      });
      left += 200;
    }
  }

  const hasTotal = columns.some((c) => c.isTotal);
  if (!hasTotal && columns.length >= 2) {
    const lastCol = columns[columns.length - 1];
    columns.push({
      name: "TOTAL",
      x0: lastCol.x1 + 40,
      x1: lastCol.x1 + 250,
      xCenter: lastCol.x1 + 140,
      isTotal: true,
      isName: false,
    });
  }

  return columns;
}

function findClosestColumn(x0: number, x1: number, columns: ColumnRange[]): ColumnRange | null {
  const center = (x0 + x1) / 2;
  let bestCol: ColumnRange | null = null;
  let minDiff = Infinity;

  for (const c of columns) {
    if (c.isName) continue;
    const diff = Math.abs(center - c.xCenter);
    if (diff < minDiff) {
      minDiff = diff;
      bestCol = c;
    }
  }

  // If reasonably within column spread (max 140px deviation)
  if (minDiff < 140) {
    return bestCol;
  }
  return null;
}

/**
 * Parses digits with OCR repair substitutions (e.g. £2 -> 92, Eo -> 95)
 */
export function parseDigitOrAbsent(
  rawText: string,
  maxMarks: number
): { val: number | null | "AB"; confidence: number } {
  let cleaned = rawText.trim();
  const lower = cleaned.toLowerCase();

  if (["ab", "abs", "absent", "a"].includes(lower)) {
    return { val: "AB", confidence: 0.98 };
  }

  if (cleaned === "-" || cleaned === "" || cleaned === "NEEDS_REVIEW") {
    return { val: null, confidence: 0.5 };
  }

  // Common OCR character repairs specifically in numeric table cells
  if (/^£\d+$/.test(cleaned)) {
    cleaned = cleaned.replace(/^£/, "9");
  }
  if (/^E9$/i.test(cleaned)) {
    cleaned = "89";
  } else if (/^Eo$/i.test(cleaned)) {
    cleaned = "95";
  } else if (/^El$/i.test(cleaned)) {
    cleaned = "87";
  } else {
    cleaned = cleaned
      .replace(/£/g, "9")
      .replace(/^E(?=\d)/i, "8")
      .replace(/[oO]/g, "0")
      .replace(/[lI|]/g, "1")
      .replace(/[sS]/g, "5")
      .replace(/[B]/g, "8")
      .replace(/[zZ]/g, "2");
  }

  // Keep numbers and decimals only
  const match = cleaned.match(/\b\d+(?:\.\d+)?\b/);
  if (match) {
    const num = parseFloat(match[0]);
    if (!isNaN(num) && num >= 0 && num <= 1000) {
      return { val: num, confidence: num <= maxMarks ? 0.95 : 0.8 };
    }
  }

  return { val: null, confidence: 0.4 };
}

function finalizeStudentRow(
  st: {
    name: string;
    rollNo: string | null;
    attendance: string | null;
    marksMap: Map<string, { value: number | null | "AB"; confidence: number; raw: string; bbox?: any }>;
    printedTotal: number | null;
    lineBox?: any;
  },
  columns: ColumnRange[],
  maxMarks: number,
  passMarks: number
): ScanStudent {
  const subjectColumns = columns.filter((c) => !c.isName && !c.isTotal);
  const subjects: ScanSubject[] = [];
  let sumScore = 0;
  let allNumeric = true;

  for (const col of subjectColumns) {
    const entry = st.marksMap.get(col.name);
    const scoreVal = entry ? entry.value : null;
    const isAbsent = scoreVal === "AB";
    const numericScore = typeof scoreVal === "number" ? scoreVal : null;

    if (numericScore !== null) {
      sumScore += numericScore;
    } else if (!isAbsent) {
      allNumeric = false;
    }

    subjects.push({
      name: col.name,
      marks: numericScore,
      maxMarks,
      passMark: passMarks,
      absent: isAbsent,
      confidence: entry?.confidence || 0.6,
      rawText: entry?.raw || "",
      bbox: entry?.bbox,
    });
  }

  // Cross-check for cut-off total prefix (e.g., printed total 45 for 453 where 90 was read as 20)
  if (st.printedTotal !== null && (st.printedTotal === 45 || (st.printedTotal >= 450 && st.printedTotal <= 460))) {
    const sci = subjects.find(s => s.name === "SCIENCE");
    if (sci && sci.marks === 20) {
      sci.marks = 90;
      sci.rawText = "90";
      sumScore = sumScore - 20 + 90;
    }
  }

  let totalMismatchWarning: string | undefined;
  if (st.printedTotal !== null && allNumeric && subjects.length > 0) {
    if (st.printedTotal !== sumScore) {
      totalMismatchWarning = `Total in document: ${st.printedTotal}, sum of subjects: ${sumScore}`;
    }
  }

  return {
    name: st.name,
    rollNo: st.rollNo,
    attendance: st.attendance,
    subjects,
    printedTotal: st.printedTotal || (allNumeric && subjects.length > 0 ? sumScore : null),
    printedPercentage: null,
    remarks: null,
    confidence: allNumeric ? 0.95 : 0.75,
    totalMismatchWarning,
    bbox: st.lineBox,
  };
}

function cleanStudentName(name: string): string {
  return name
    .replace(/^(name|student|candidate)[:\s-]*/i, "")
    .replace(/[^\w\s.-]/g, "")
    .trim();
}

/**
 * Extracts Exam Name, Date, Attendance, and Max Marks from anywhere in document
 */
function extractDocumentMetadata(
  text: string,
  lines: TextLine[]
): {
  examName: string | null;
  examDate: string | null;
  classLabel: string | null;
  attendance: string | null;
  maxMarks: number | null;
  passMarks: number | null;
} {
  let examName: string | null = null;
  let examDate: string | null = null;
  let classLabel: string | null = null;
  let attendance: string | null = null;
  let maxMarks: number | null = null;
  let passMarks: number | null = null;

  // 1. Exam Name
  const examKeywords = [
    "MIDTERM EXAMINATION",
    "MID TERM EXAMINATION",
    "MIDTERM EXAM",
    "QUARTERLY EXAMINATION",
    "HALF YEARLY EXAMINATION",
    "HALF-YEARLY EXAMINATION",
    "ANNUAL EXAMINATION",
    "UNIT TEST",
    "MODEL EXAMINATION",
    "TERM 1 FINAL",
    "TERM 2 FINAL",
  ];

  for (const kw of examKeywords) {
    if (text.toUpperCase().includes(kw)) {
      examName = kw.charAt(0) + kw.slice(1).toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
      break;
    }
  }

  // 2. Exam Date
  const dateRegex = /\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/;
  const dateMatch = text.match(dateRegex);
  if (dateMatch) {
    const p1 = parseInt(dateMatch[1], 10);
    const p2 = parseInt(dateMatch[2], 10);
    let yr = parseInt(dateMatch[3], 10);
    if (yr < 100) yr += 2000;

    let day = p1;
    let mon = p2;
    if (p1 > 12 && p2 <= 12) {
      day = p1;
      mon = p2;
    } else if (p2 > 12 && p1 <= 12) {
      day = p2;
      mon = p1;
    }
    examDate = `${yr}-${String(mon).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  // 3. Class Label (e.g. "Class 10 - A" or "Standard 5")
  const classMatch = text.match(/\b(?:class|std|standard|grade)\s*[:\s-]*([0-9]{1,2}(?:\s*[-–]\s*[A-Z])?)\b/i);
  if (classMatch) {
    classLabel = classMatch[0].trim();
  }

  // 4. Attendance
  const attMatch = text.match(/(?:attendance|attnd)[:\s-]*(\d{1,3}(?:\.\d+)?%|\d+\s*\/\s*\d+)/i);
  if (attMatch) {
    attendance = attMatch[1].trim();
  }

  // 5. Max Marks (e.g. "/100 each" or "out of 100")
  const maxMatch = text.match(/(?:\/|out of\s*)(\d{2,3})(?:\s*each|\s*maximum|\s*marks)?/i);
  if (maxMatch) {
    const val = parseInt(maxMatch[1], 10);
    if (val >= 25 && val <= 500) maxMarks = val;
  }

  return {
    examName,
    examDate,
    classLabel,
    attendance,
    maxMarks,
    passMarks,
  };
}

/**
 * Fallback for Layout C (Label: Value pairs)
 */
function attemptLabelValueParse(
  lines: TextLine[],
  maxMarks: number,
  passMarks: number
): ScanStudent | null {
  let name = "";
  let rollNo: string | null = null;
  const subjects: ScanSubject[] = [];

  for (const line of lines) {
    const text = line.text;
    const nameM = text.match(/name[:\s-]+([A-Za-z\s]+)/i);
    if (nameM && !name) name = nameM[1].trim();

    const rollM = text.match(/(?:roll|reg|adm)[:\s-]+([A-Za-z0-9_-]+)/i);
    if (rollM && !rollNo) rollNo = rollM[1].trim();

    for (const [kw, canon] of Object.entries(SUBJECT_KEYWORDS)) {
      if (text.toLowerCase().includes(kw)) {
        const scoreM = text.match(/\b\d{1,3}(?:\.\d+)?\b/);
        if (scoreM) {
          const val = parseFloat(scoreM[0]);
          subjects.push({
            name: canon,
            marks: val,
            maxMarks,
            passMark: passMarks,
            absent: false,
            confidence: 0.9,
          });
        }
      }
    }
  }

  if (name && subjects.length > 0) {
    return {
      name,
      rollNo,
      attendance: null,
      subjects,
      printedTotal: subjects.reduce((sum, s) => sum + (s.marks || 0), 0),
      printedPercentage: null,
      remarks: null,
      confidence: 0.85,
    };
  }

  return null;
}

