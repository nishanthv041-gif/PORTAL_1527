"use server";

import { prisma } from "@/backend/db/prisma";
import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import * as XLSX from "xlsx";
import mammoth from "mammoth";
import { extractText } from "unpdf";
import type { 
  ScanReportCardResult, 
  ScannedReportCardSubject, 
  DetectedStudentEntry 
} from "./scanReportCardTypes";

// Common subject aliases for smart matching
const SUBJECT_ALIASES: Record<string, string[]> = {
  "mathematics": ["math", "maths", "algebra", "geometry", "arithmetic", "calc"],
  "english": ["eng", "grammar", "literature", "reading", "first language"],
  "science": ["sci", "general science", "basic science"],
  "physics": ["phy", "ps"],
  "chemistry": ["chem"],
  "biology": ["bio", "botany", "zoology"],
  "social studies": ["social", "sst", "history", "civics", "geography", "evs"],
  "computer science": ["computer", "comp", "cs", "it", "informatics", "coding"],
  "physical education": ["pe", "pet", "sports", "games", "pt"],
  "tamil": ["tam", "second language"],
  "hindi": ["hin", "second language"],
  "arts": ["art", "drawing", "craft", "music"]
};

// Exam name keywords
const EXAM_KEYWORDS = [
  "Midterm Examination",
  "Midterm Exam",
  "Quarterly Exam",
  "Half-Yearly Exam",
  "Half Yearly Exam",
  "Unit Test 1",
  "Unit Test 2",
  "Unit Test 3",
  "Term 1 Final",
  "Term 2 Final",
  "Model Exam",
  "Annual Examination",
  "Final Examination"
];

function cleanString(str: string): string {
  return (str || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Match a raw subject name against class subjects and standard synonyms
 */
function matchSubject(
  rawName: string,
  classSubjects: Array<{ id: string; name: string; maxMarks?: number; passMarks?: number }>
): { subjectId: string; subjectName: string; maxMarks: number; passMarks: number } {
  const cleanRaw = cleanString(rawName);

  // 1. Direct or partial match with class subjects
  for (const s of classSubjects) {
    const sClean = cleanString(s.name);
    if (sClean === cleanRaw || sClean.includes(cleanRaw) || cleanRaw.includes(sClean)) {
      return {
        subjectId: s.id,
        subjectName: s.name,
        maxMarks: s.maxMarks || 100,
        passMarks: s.passMarks || 35
      };
    }
  }

  // 2. Synonym match
  for (const [canonical, aliases] of Object.entries(SUBJECT_ALIASES)) {
    if (cleanRaw === cleanString(canonical) || aliases.some(a => cleanRaw === cleanString(a))) {
      // Find if this class has this canonical subject
      const foundInClass = classSubjects.find(s => {
        const sClean = cleanString(s.name);
        return sClean === cleanString(canonical) || aliases.some(a => sClean === cleanString(a));
      });
      if (foundInClass) {
        return {
          subjectId: foundInClass.id,
          subjectName: foundInClass.name,
          maxMarks: foundInClass.maxMarks || 100,
          passMarks: foundInClass.passMarks || 35
        };
      }
      return {
        subjectId: "",
        subjectName: canonical.charAt(0).toUpperCase() + canonical.slice(1),
        maxMarks: 100,
        passMarks: 35
      };
    }
  }

  // Fallback: return raw name with capitalized title
  const titleName = rawName.trim().replace(/\b\w/g, l => l.toUpperCase());
  return {
    subjectId: "",
    subjectName: titleName,
    maxMarks: 100,
    passMarks: 35
  };
}

/**
 * Match raw student string or roll number against class students
 */
function matchStudent(
  rawText: string,
  classStudents: Array<{ id: string; rollNumber: string; firstName: string; lastName: string }>
): { studentId: string; studentName: string; rollNumber: string; confidence: "HIGH" | "MEDIUM" | "LOW" | "NONE" } {
  if (!rawText) {
    return { studentId: "", studentName: "", rollNumber: "", confidence: "NONE" };
  }

  const cleanQuery = cleanString(rawText);

  // 1. Match by roll number (exact or contains)
  for (const st of classStudents) {
    const cleanRoll = cleanString(st.rollNumber);
    if (cleanRoll && (cleanQuery.includes(cleanRoll) || cleanRoll.includes(cleanQuery))) {
      return {
        studentId: st.id,
        studentName: `${st.firstName} ${st.lastName}`.trim(),
        rollNumber: st.rollNumber,
        confidence: "HIGH"
      };
    }
  }

  // 2. Match by full name
  for (const st of classStudents) {
    const fullName = cleanString(`${st.firstName} ${st.lastName}`);
    if (fullName && (cleanQuery.includes(fullName) || fullName.includes(cleanQuery))) {
      return {
        studentId: st.id,
        studentName: `${st.firstName} ${st.lastName}`.trim(),
        rollNumber: st.rollNumber,
        confidence: "HIGH"
      };
    }
  }

  // 3. Match by first name alone
  for (const st of classStudents) {
    const fName = cleanString(st.firstName);
    if (fName.length >= 3 && cleanQuery.includes(fName)) {
      return {
        studentId: st.id,
        studentName: `${st.firstName} ${st.lastName}`.trim(),
        rollNumber: st.rollNumber,
        confidence: "MEDIUM"
      };
    }
  }

  return {
    studentId: "",
    studentName: rawText.trim(),
    rollNumber: "",
    confidence: "LOW"
  };
}

/**
 * Parse text lines (from OCR, PDF, or Word) into report card entities
 */
function parseTextToReportCard(
  text: string,
  classStudents: Array<{ id: string; rollNumber: string; firstName: string; lastName: string }>,
  classSubjects: Array<{ id: string; name: string; maxMarks?: number; passMarks?: number }>
): {
  student: { studentId: string; studentName: string; rollNumber: string; confidence: "HIGH" | "MEDIUM" | "LOW" | "NONE" };
  examName: string;
  examDate: string;
  defaultMaxMarks: number;
  defaultPassMarks: number;
  generalRemarks: string;
  subjects: ScannedReportCardSubject[];
} {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  let detectedStudent: {
    studentId: string;
    studentName: string;
    rollNumber: string;
    confidence: "HIGH" | "MEDIUM" | "LOW" | "NONE";
  } = { studentId: "", studentName: "", rollNumber: "", confidence: "NONE" };
  let detectedExamName = "Midterm Examination";
  let detectedExamDate = new Date().toISOString().split("T")[0];
  let defaultMaxMarks = 100;
  let defaultPassMarks = 35;
  let generalRemarks = "";
  const scannedSubjects: ScannedReportCardSubject[] = [];

  // Regex patterns
  const studentNamePattern = /(?:student(?:\s*name)?|name|candidate)\s*[:=\-]\s*([A-Za-z\s.'-]+)/i;
  const rollPattern = /(?:roll(?:\s*no|\s*number)?|reg(?:\s*no)?|id)\s*[:=\-]\s*([A-Za-z0-9_-]+)/i;
  const examPattern = /(?:exam(?:\s*name)?|examination|test)\s*[:=\-]\s*([A-Za-z0-9\s-]+)/i;
  const datePattern = /(?:date|conducted\s*on)\s*[:=\-]\s*(\d{1,4}[-/\.]\d{1,2}[-/\.]\d{1,4})/i;
  const remarksPattern = /(?:remarks?|feedback|comments?|teacher'?s?\s*remarks?)\s*[:=\-]\s*(.+)/i;

  // Pass 1: Extract Header Entities
  for (const line of lines) {
    // Student Name match
    const nameMatch = line.match(studentNamePattern);
    if (nameMatch && !detectedStudent.studentId) {
      const candidateName = nameMatch[1].trim();
      const match = matchStudent(candidateName, classStudents);
      if (match.confidence !== "NONE") {
        detectedStudent = match;
      } else if (!detectedStudent.studentName) {
        detectedStudent.studentName = candidateName;
      }
    }

    // Roll number match
    const rollMatch = line.match(rollPattern);
    if (rollMatch && detectedStudent.confidence !== "HIGH") {
      const candidateRoll = rollMatch[1].trim();
      const match = matchStudent(candidateRoll, classStudents);
      if (match.confidence === "HIGH") {
        detectedStudent = match;
      } else if (!detectedStudent.rollNumber) {
        detectedStudent.rollNumber = candidateRoll;
      }
    }

    // Direct student check if line exactly matches a student name
    if (!detectedStudent.studentId) {
      const directMatch = matchStudent(line, classStudents);
      if (directMatch.confidence === "HIGH") {
        detectedStudent = directMatch;
      }
    }

    // Exam Name match
    const examMatch = line.match(examPattern);
    if (examMatch) {
      detectedExamName = examMatch[1].trim();
    } else {
      for (const kw of EXAM_KEYWORDS) {
        if (line.toLowerCase().includes(kw.toLowerCase())) {
          detectedExamName = kw;
          break;
        }
      }
    }

    // Date match
    const dateMatch = line.match(datePattern);
    if (dateMatch) {
      try {
        const rawDate = dateMatch[1].replace(/\./g, "-").replace(/\//g, "-");
        const parsed = new Date(rawDate);
        if (!isNaN(parsed.getTime())) {
          detectedExamDate = parsed.toISOString().split("T")[0];
        }
      } catch {
        // keep default date
      }
    }

    // Remarks match
    const remMatch = line.match(remarksPattern);
    if (remMatch) {
      generalRemarks = remMatch[1].trim();
    }
  }

  // Pass 2: Extract Subjects and Marks
  const processedSubjectNames = new Set<string>();

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];

    // Check if line contains a subject
    let matchedSubInfo: ReturnType<typeof matchSubject> | null = null;

    // Check class subjects
    for (const sub of classSubjects) {
      const subName = sub.name.toLowerCase();
      if (line.toLowerCase().includes(subName)) {
        matchedSubInfo = {
          subjectId: sub.id,
          subjectName: sub.name,
          maxMarks: sub.maxMarks || 100,
          passMarks: sub.passMarks || 35
        };
        break;
      }
    }

    // Check aliases
    if (!matchedSubInfo) {
      for (const [canonical, aliases] of Object.entries(SUBJECT_ALIASES)) {
        const words = [canonical, ...aliases];
        for (const w of words) {
          const regex = new RegExp(`\\b${w}\\b`, "i");
          if (regex.test(line)) {
            matchedSubInfo = matchSubject(canonical, classSubjects);
            break;
          }
        }
        if (matchedSubInfo) break;
      }
    }

    if (matchedSubInfo && !processedSubjectNames.has(matchedSubInfo.subjectName.toLowerCase())) {
      processedSubjectNames.add(matchedSubInfo.subjectName.toLowerCase());

      // Extract numbers from the line
      // E.g. "Maths: 85/100" or "English 92" or "Science | 78 | 100 | 35 | Pass"
      const numberMatches = Array.from(line.matchAll(/\b\d+(?:\.\d+)?\b/g)).map(m => parseFloat(m[0]));

      let score: number | "" = "";
      let maxScore = matchedSubInfo.maxMarks;
      let passMarks = matchedSubInfo.passMarks;
      let remarks = "";
      let isInvalid = false;
      let validationError = "";

      if (numberMatches.length === 1) {
        score = numberMatches[0];
      } else if (numberMatches.length >= 2) {
        // e.g. "85 100" -> score=85, max=100
        score = numberMatches[0];
        if (numberMatches[1] >= 20) {
          maxScore = numberMatches[1];
        }
        if (numberMatches.length >= 3 && numberMatches[2] < maxScore) {
          passMarks = numberMatches[2];
        }
      }

      // Check remarks on the line
      if (line.toLowerCase().includes("absent") || line.toLowerCase().includes("ab")) {
        score = 0;
        remarks = "Absent";
      } else if (line.toLowerCase().includes("excellent")) {
        remarks = "Excellent";
      } else if (line.toLowerCase().includes("good")) {
        remarks = "Good";
      }

      // Invalidation check
      if (score === "") {
        isInvalid = true;
        validationError = "Mark not detected. Please enter score.";
      } else if (score < 0) {
        isInvalid = true;
        validationError = "Score cannot be negative.";
      } else if (score > maxScore) {
        isInvalid = true;
        validationError = `Score (${score}) exceeds maximum marks (${maxScore}).`;
      }

      scannedSubjects.push({
        id: `scanned-${idx}-${Math.random().toString(36).substring(2, 7)}`,
        subjectId: matchedSubInfo.subjectId,
        subjectName: matchedSubInfo.subjectName,
        score,
        maxScore,
        passMarks,
        remarks,
        isInvalid,
        validationError
      });
    }
  }

  // If no subjects were parsed from lines, fill with class subjects so teacher can edit
  if (scannedSubjects.length === 0 && classSubjects.length > 0) {
    classSubjects.forEach((sub, sIdx) => {
      scannedSubjects.push({
        id: `empty-sub-${sIdx}-${Math.random().toString(36).substring(2, 7)}`,
        subjectId: sub.id,
        subjectName: sub.name,
        score: "",
        maxScore: sub.maxMarks || 100,
        passMarks: sub.passMarks || 35,
        remarks: "",
        isInvalid: true,
        validationError: "Enter score for this subject"
      });
    });
  }

  return {
    student: detectedStudent,
    examName: detectedExamName,
    examDate: detectedExamDate,
    defaultMaxMarks,
    defaultPassMarks,
    generalRemarks,
    subjects: scannedSubjects
  };
}

/**
 * Parse Excel sheet rows into report card entries
 * Handles both single student sheet and class gradebook matrix
 */
function parseExcelToReportCard(
  buffer: ArrayBuffer,
  classStudents: Array<{ id: string; rollNumber: string; firstName: string; lastName: string }>,
  classSubjects: Array<{ id: string; name: string; maxMarks?: number; passMarks?: number }>
): {
  student: { studentId: string; studentName: string; rollNumber: string; confidence: "HIGH" | "MEDIUM" | "LOW" | "NONE" };
  examName: string;
  examDate: string;
  defaultMaxMarks: number;
  defaultPassMarks: number;
  generalRemarks: string;
  subjects: ScannedReportCardSubject[];
  allDetectedStudents?: DetectedStudentEntry[];
  rawTextPreview?: string;
} {
  const wb = XLSX.read(buffer, { type: "array" });
  const wsName = wb.SheetNames[0];
  const ws = wb.Sheets[wsName];
  const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

  if (!rows || rows.length === 0) {
    throw new Error("The uploaded spreadsheet contains no readable rows.");
  }

  // Convert entire sheet to string for text fallback
  const rawText = rows.map(r => (r || []).join(" ")).join("\n");

  // Check if this is a Multi-Student Gradebook Matrix:
  // e.g. Headers: [Roll No, Student Name, Maths, English, Science, Total, Grade]
  let headerRowIndex = -1;
  let rollCol = -1;
  let nameCol = -1;
  const subjectColMap: Array<{ colIndex: number; subjectId: string; subjectName: string; maxMarks: number; passMarks: number }> = [];

  for (let r = 0; r < Math.min(10, rows.length); r++) {
    const row = rows[r];
    if (!row || !Array.isArray(row)) continue;

    const rowStrings = row.map(c => String(c || "").trim().toLowerCase());
    const hasStudentOrRoll = rowStrings.some(c => c.includes("roll") || c.includes("student") || c.includes("name"));
    
    // Check if row has at least 2 subjects
    let subjectsFoundInRow = 0;
    rowStrings.forEach((c, idx) => {
      const match = matchSubject(c, classSubjects);
      if (match.subjectId || Object.keys(SUBJECT_ALIASES).includes(cleanString(c))) {
        subjectsFoundInRow++;
      }
    });

    if (hasStudentOrRoll && subjectsFoundInRow >= 1) {
      headerRowIndex = r;
      rollCol = rowStrings.findIndex(c => c.includes("roll") || c.includes("reg") || c.includes("id"));
      nameCol = rowStrings.findIndex(c => c.includes("name") || c.includes("student"));
      
      rowStrings.forEach((c, colIdx) => {
        if (colIdx !== rollCol && colIdx !== nameCol) {
          const match = matchSubject(c, classSubjects);
          if (match.subjectId || Object.keys(SUBJECT_ALIASES).includes(cleanString(c))) {
            subjectColMap.push({
              colIndex: colIdx,
              subjectId: match.subjectId,
              subjectName: match.subjectName,
              maxMarks: match.maxMarks,
              passMarks: match.passMarks
            });
          }
        }
      });
      break;
    }
  }

  // If Gradebook Matrix detected with student rows
  if (headerRowIndex !== -1 && subjectColMap.length > 0) {
    const allDetectedStudents: DetectedStudentEntry[] = [];

    for (let r = headerRowIndex + 1; r < rows.length; r++) {
      const row = rows[r];
      if (!row || row.length === 0) continue;

      const rawRoll = rollCol !== -1 ? String(row[rollCol] || "").trim() : "";
      const rawName = nameCol !== -1 ? String(row[nameCol] || "").trim() : "";
      if (!rawRoll && !rawName) continue;

      const studentMatch = matchStudent(`${rawRoll} ${rawName}`, classStudents);
      const studentSubs: ScannedReportCardSubject[] = [];

      let total = 0;
      let maxTotal = 0;

      subjectColMap.forEach((subInfo, subIdx) => {
        const rawScore = row[subInfo.colIndex];
        const numScore = rawScore !== undefined && rawScore !== null && !isNaN(Number(rawScore)) 
          ? Number(rawScore) 
          : "";

        let isInvalid = false;
        let validationError = "";

        if (numScore === "") {
          isInvalid = true;
          validationError = "Score required";
        } else if (numScore < 0) {
          isInvalid = true;
          validationError = "Cannot be negative";
        } else if (numScore > subInfo.maxMarks) {
          isInvalid = true;
          validationError = `Exceeds max (${subInfo.maxMarks})`;
        } else {
          total += numScore;
          maxTotal += subInfo.maxMarks;
        }

        studentSubs.push({
          id: `excel-row-${r}-sub-${subIdx}`,
          subjectId: subInfo.subjectId,
          subjectName: subInfo.subjectName,
          score: numScore,
          maxScore: subInfo.maxMarks,
          passMarks: subInfo.passMarks,
          remarks: "",
          isInvalid,
          validationError
        });
      });

      const percentage = maxTotal > 0 ? parseFloat(((total / maxTotal) * 100).toFixed(1)) : 0;
      let grade = "F";
      if (percentage >= 90) grade = "A+";
      else if (percentage >= 80) grade = "A";
      else if (percentage >= 70) grade = "B";
      else if (percentage >= 60) grade = "C";
      else if (percentage >= 50) grade = "D";

      allDetectedStudents.push({
        studentId: studentMatch.studentId,
        studentName: studentMatch.studentName || rawName || "Student",
        rollNumber: studentMatch.rollNumber || rawRoll || "-",
        subjects: studentSubs,
        totalMarks: total,
        percentage,
        grade
      });
    }

    if (allDetectedStudents.length > 0) {
      const first = allDetectedStudents[0];
      return {
        student: {
          studentId: first.studentId,
          studentName: first.studentName,
          rollNumber: first.rollNumber,
          confidence: first.studentId ? "HIGH" : "LOW"
        },
        examName: "Midterm Examination",
        examDate: new Date().toISOString().split("T")[0],
        defaultMaxMarks: 100,
        defaultPassMarks: 35,
        generalRemarks: "Gradebook imported from Excel sheet.",
        subjects: first.subjects,
        allDetectedStudents,
        rawTextPreview: rawText.substring(0, 500)
      };
    }
  }

  // Fallback: parse raw text content
  const parsedFromText = parseTextToReportCard(rawText, classStudents, classSubjects);
  return {
    ...parsedFromText,
    rawTextPreview: rawText.substring(0, 500)
  };
}

/**
 * Main Server Action to Scan Report Card Documentation (PDF, Word, Excel, or OCR text)
 */
export async function scanReportCardAction(formData: FormData): Promise<ScanReportCardResult> {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session || (session.user.role !== "TEACHER" && session.user.role !== "ADMIN")) {
      return {
        success: false,
        error: "Unauthorized: Teacher or Admin session required.",
        fileDetails: { name: "", type: "", size: 0 },
        studentId: "",
        studentName: "",
        rollNumber: "",
        studentConfidence: "NONE",
        examName: "",
        examDate: "",
        defaultMaxMarks: 100,
        defaultPassMarks: 35,
        generalRemarks: "",
        subjects: []
      };
    }

    const classId = formData.get("classId") as string;
    if (!classId) {
      return {
        success: false,
        error: "Please select a class to scan report card data for.",
        fileDetails: { name: "", type: "", size: 0 },
        studentId: "",
        studentName: "",
        rollNumber: "",
        studentConfidence: "NONE",
        examName: "",
        examDate: "",
        defaultMaxMarks: 100,
        defaultPassMarks: 35,
        generalRemarks: "",
        subjects: []
      };
    }

    // Fetch class students and subjects for high-accuracy recognition
    const [classStudents, classSubjects] = await Promise.all([
      prisma.student.findMany({
        where: { classId, isActive: true },
        select: { id: true, rollNumber: true, firstName: true, lastName: true },
        orderBy: [{ firstName: "asc" }, { lastName: "asc" }]
      }),
      prisma.subject.findMany({
        where: { classId },
        select: { id: true, name: true, maxMarks: true, passMarks: true },
        orderBy: { name: "asc" }
      })
    ]);

    const ocrText = (formData.get("ocrText") as string) || "";
    const file = formData.get("file") as File | null;

    let fileName = file?.name || "Uploaded Document";
    let fileSize = file?.size || 0;
    let fileType = file?.type || "Document";
    const ext = fileName.split(".").pop()?.toLowerCase() || "";

    // If client already ran Tesseract OCR on photo/image
    if (ocrText && ocrText.trim().length > 0) {
      const parsed = parseTextToReportCard(ocrText, classStudents, classSubjects);
      return {
        success: true,
        fileDetails: {
          name: fileName,
          type: "Photo / Image (Browser OCR)",
          size: fileSize
        },
        studentId: parsed.student.studentId,
        studentName: parsed.student.studentName,
        rollNumber: parsed.student.rollNumber,
        studentConfidence: parsed.student.confidence,
        examName: parsed.examName,
        examDate: parsed.examDate,
        defaultMaxMarks: parsed.defaultMaxMarks,
        defaultPassMarks: parsed.defaultPassMarks,
        generalRemarks: parsed.generalRemarks,
        subjects: parsed.subjects,
        rawTextPreview: ocrText.substring(0, 500)
      };
    }

    if (!file) {
      return {
        success: false,
        error: "No file was provided for scanning.",
        fileDetails: { name: "", type: "", size: 0 },
        studentId: "",
        studentName: "",
        rollNumber: "",
        studentConfidence: "NONE",
        examName: "",
        examDate: "",
        defaultMaxMarks: 100,
        defaultPassMarks: 35,
        generalRemarks: "",
        subjects: []
      };
    }

    const buffer = await file.arrayBuffer();

    // 1. Excel / Spreadsheets (.xlsx, .xls, .csv)
    if (["xlsx", "xls", "csv"].includes(ext)) {
      const parsed = parseExcelToReportCard(buffer, classStudents, classSubjects);
      return {
        success: true,
        fileDetails: {
          name: fileName,
          type: "Excel Spreadsheet / CSV",
          size: fileSize
        },
        studentId: parsed.student.studentId,
        studentName: parsed.student.studentName,
        rollNumber: parsed.student.rollNumber,
        studentConfidence: parsed.student.confidence,
        examName: parsed.examName,
        examDate: parsed.examDate,
        defaultMaxMarks: parsed.defaultMaxMarks,
        defaultPassMarks: parsed.defaultPassMarks,
        generalRemarks: parsed.generalRemarks,
        subjects: parsed.subjects,
        allDetectedStudents: parsed.allDetectedStudents,
        rawTextPreview: parsed.rawTextPreview
      };
    }

    // 2. PDF Documents (.pdf)
    if (ext === "pdf" || fileType === "application/pdf") {
      const pdfTextResult = await extractText(new Uint8Array(buffer));
      const text = Array.isArray(pdfTextResult?.text) ? pdfTextResult.text.join("\n") : String(pdfTextResult?.text || "");
      
      if (!text.trim()) {
        return {
          success: false,
          error: "No text could be extracted from this PDF. If it is a scanned image, please upload it as an image (.png / .jpg) so the OCR engine can read it.",
          fileDetails: { name: fileName, type: "PDF Document", size: fileSize },
          studentId: "",
          studentName: "",
          rollNumber: "",
          studentConfidence: "NONE",
          examName: "",
          examDate: "",
          defaultMaxMarks: 100,
          defaultPassMarks: 35,
          generalRemarks: "",
          subjects: []
        };
      }

      const parsed = parseTextToReportCard(text, classStudents, classSubjects);
      return {
        success: true,
        fileDetails: {
          name: fileName,
          type: "PDF Document",
          size: fileSize
        },
        studentId: parsed.student.studentId,
        studentName: parsed.student.studentName,
        rollNumber: parsed.student.rollNumber,
        studentConfidence: parsed.student.confidence,
        examName: parsed.examName,
        examDate: parsed.examDate,
        defaultMaxMarks: parsed.defaultMaxMarks,
        defaultPassMarks: parsed.defaultPassMarks,
        generalRemarks: parsed.generalRemarks,
        subjects: parsed.subjects,
        rawTextPreview: text.substring(0, 500)
      };
    }

    // 3. Word Documents (.docx, .doc)
    if (["docx", "doc"].includes(ext) || fileType.includes("wordprocessingml") || fileType.includes("msword")) {
      const mammothResult = await mammoth.extractRawText({ buffer: Buffer.from(buffer) });
      const text = mammothResult.value || "";

      if (!text.trim()) {
        return {
          success: false,
          error: "Could not extract text from this Word document. Please ensure it is not password protected.",
          fileDetails: { name: fileName, type: "Word Document", size: fileSize },
          studentId: "",
          studentName: "",
          rollNumber: "",
          studentConfidence: "NONE",
          examName: "",
          examDate: "",
          defaultMaxMarks: 100,
          defaultPassMarks: 35,
          generalRemarks: "",
          subjects: []
        };
      }

      const parsed = parseTextToReportCard(text, classStudents, classSubjects);
      return {
        success: true,
        fileDetails: {
          name: fileName,
          type: "Word Document",
          size: fileSize
        },
        studentId: parsed.student.studentId,
        studentName: parsed.student.studentName,
        rollNumber: parsed.student.rollNumber,
        studentConfidence: parsed.student.confidence,
        examName: parsed.examName,
        examDate: parsed.examDate,
        defaultMaxMarks: parsed.defaultMaxMarks,
        defaultPassMarks: parsed.defaultPassMarks,
        generalRemarks: parsed.generalRemarks,
        subjects: parsed.subjects,
        rawTextPreview: text.substring(0, 500)
      };
    }

    return {
      success: false,
      error: `Unsupported file format (.${ext}). Supported formats: .jpg, .jpeg, .png, .pdf, .xlsx, .xls, .csv, .docx, .doc`,
      fileDetails: { name: fileName, type: fileType, size: fileSize },
      studentId: "",
      studentName: "",
      rollNumber: "",
      studentConfidence: "NONE",
      examName: "",
      examDate: "",
      defaultMaxMarks: 100,
      defaultPassMarks: 35,
      generalRemarks: "",
      subjects: []
    };
  } catch (error) {
    console.error("Error in scanReportCardAction:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to scan report card file.",
      fileDetails: { name: "", type: "", size: 0 },
      studentId: "",
      studentName: "",
      rollNumber: "",
      studentConfidence: "NONE",
      examName: "",
      examDate: "",
      defaultMaxMarks: 100,
      defaultPassMarks: 35,
      generalRemarks: "",
      subjects: []
    };
  }
}
