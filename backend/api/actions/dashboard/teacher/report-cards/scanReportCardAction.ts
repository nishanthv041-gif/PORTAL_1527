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
  "social studies": ["social", "sst", "history", "civics", "geography", "evs", "social science"],
  "social science": ["social science", "soc sci", "social", "sst", "history", "civics", "geography"],
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

const NON_SUBJECT_KEYWORDS = [
  "total", "percentage", "sno", "s.no", "rollno", "roll no",
  "student name", "studentname", "result", "rank", "attendance", "average", "avg"
];

function cleanString(str: string): string {
  return (str || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function computeGrade(score: number, max: number): string {
  if (max <= 0) return "-";
  const pct = (score / max) * 100;
  if (pct >= 90) return "A+";
  if (pct >= 80) return "A";
  if (pct >= 70) return "B";
  if (pct >= 60) return "C";
  if (pct >= 50) return "D";
  return "F";
}

/**
 * Match a raw subject name against class subjects and standard synonyms
 */
function matchSubject(
  rawName: string,
  classSubjects: Array<{ id: string; name: string; maxMarks?: number; passMarks?: number }>
): { subjectId: string; subjectName: string; maxMarks: number; passMarks: number } | null {
  const norm = (rawName || "").toLowerCase().replace(/\s*[\/\(]\s*\d+\s*[\)]?/g, "").trim();
  const cleanRaw = cleanString(norm);

  if (!cleanRaw || NON_SUBJECT_KEYWORDS.some(k => cleanRaw === cleanString(k))) {
    return null;
  }

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

  return null;
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
  classSubjects: Array<{ id: string; name: string; maxMarks?: number; passMarks?: number }>,
  customDefaults?: {
    defaultMaxMarks?: number;
    defaultPassMarks?: number;
    examDate?: string;
    examName?: string;
  }
): {
  student: { studentId: string; studentName: string; rollNumber: string; confidence: "HIGH" | "MEDIUM" | "LOW" | "NONE" };
  className?: string | null;
  academicYear?: string | null;
  attendance?: number | string | null;
  examName: string;
  examDate: string;
  defaultMaxMarks: number;
  defaultPassMarks: number;
  generalRemarks: string;
  subjects: ScannedReportCardSubject[];
  allDetectedStudents?: DetectedStudentEntry[];
  originalExtractedValues?: {
    student?: string;
    rollNumber?: string;
    exam?: string;
    date?: string;
    attendance?: string;
    marks?: Record<string, string>;
  };
} {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  let detectedStudent: {
    studentId: string;
    studentName: string;
    rollNumber: string;
    confidence: "HIGH" | "MEDIUM" | "LOW" | "NONE";
  } = { studentId: "", studentName: "", rollNumber: "", confidence: "NONE" };
  let detectedExamName = customDefaults?.examName?.trim() || "Midterm Examination";
  let detectedExamDate = customDefaults?.examDate?.trim() || new Date().toISOString().split("T")[0];
  let detectedClassName: string | null = null;
  let detectedAcademicYear: string | null = null;
  let detectedAttendance: string | null = null;
  let defaultMaxMarks = customDefaults?.defaultMaxMarks || 100;
  let defaultPassMarks = customDefaults?.defaultPassMarks || 35;
  let generalRemarks = "";
  const scannedSubjects: ScannedReportCardSubject[] = [];
  const originalMarksMap: Record<string, string> = {};

  // Regex patterns
  const studentNamePattern = /(?:student(?:\s*name)?|name|candidate)\s*[:=\-]\s*([A-Za-z\s.'-]+)/i;
  const rollPattern = /(?:roll(?:\s*no|\s*number)?|reg(?:\s*no)?|id|admission(?:\s*no)?)\s*[:=\-]\s*([A-Za-z0-9_-]+)/i;
  const examPattern = /(?:exam(?:\s*name)?|examination|test|term)\s*[:=\-]\s*([A-Za-z0-9\s-]+)/i;
  const datePattern = /(?:date|conducted\s*on)\s*[:=\-]\s*(\d{1,4}[-/\.]\d{1,2}[-/\.]\d{1,4})/i;
  const remarksPattern = /(?:remarks?|feedback|comments?|teacher'?s?\s*remarks?)\s*[:=\-]\s*(.+)/i;
  const attendancePattern = /(?:attendance|present(?:\s*days)?|working\s*days|att(?:endance)?)\s*[:=\-]\s*(\d+(?:\.\d+)?%?)/i;
  const academicYearPattern = /(?:academic\s*year|session|year)\s*[:=\-]\s*(\d{4}(?:\s*[-/]\s*\d{2,4})?)/i;
  const classPattern = /(?:class|grade|standard|sec(?:tion)?)\s*[:=\-]\s*([A-Za-z0-9\s-]+)/i;

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

    // Attendance match
    const attMatch = line.match(attendancePattern);
    if (attMatch && !detectedAttendance) {
      detectedAttendance = attMatch[1].trim();
    }

    // Academic Year match
    const yearMatch = line.match(academicYearPattern);
    if (yearMatch && !detectedAcademicYear) {
      detectedAcademicYear = yearMatch[1].trim();
    }

    // Class match
    const classMatch = line.match(classPattern);
    if (classMatch && !detectedClassName) {
      detectedClassName = classMatch[1].trim();
    }
  }

  // Sort subjects longest-first so "Social Science" matches before "Science"
  const sortedClassSubjects = [...classSubjects].sort((a, b) => b.name.length - a.name.length);

  // Pass 1.5: Detect Multi-Student / Bulk Gradebook Matrix (e.g. S.No | Student Name | Roll No | Tamil | English | Maths...)
  const allDetectedStudents: DetectedStudentEntry[] = [];
  let matrixHeaderLineIndex = -1;
  const matrixSubjectCols: Array<{
    subjectId: string;
    subjectName: string;
    maxMarks: number;
    passMarks: number;
    subPos: number;
  }> = [];

  for (let lIdx = 0; lIdx < Math.min(15, lines.length); lIdx++) {
    const l = lines[lIdx];

    // Match all subjects in this line
    const foundSubs: typeof matrixSubjectCols = [];
    for (const sub of sortedClassSubjects) {
      const subName = sub.name.toLowerCase();
      const regex = new RegExp(`\\b${subName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, "i");
      const match = regex.exec(l);
      if (match) {
        foundSubs.push({
          subjectId: sub.id,
          subjectName: sub.name,
          maxMarks: customDefaults?.defaultMaxMarks || sub.maxMarks || 100,
          passMarks: customDefaults?.defaultPassMarks || sub.passMarks || 35,
          subPos: match.index
        });
      }
    }

    for (const [canonical, aliases] of Object.entries(SUBJECT_ALIASES)) {
      if (foundSubs.some(s => cleanString(s.subjectName) === cleanString(canonical))) continue;
      for (const alias of aliases) {
        const regex = new RegExp(`\\b${alias.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, "i");
        const match = regex.exec(l);
        if (match) {
          const matched = matchSubject(canonical, classSubjects);
          if (matched) {
            foundSubs.push({
              subjectId: matched.subjectId,
              subjectName: matched.subjectName,
              maxMarks: customDefaults?.defaultMaxMarks || matched.maxMarks || 100,
              passMarks: customDefaults?.defaultPassMarks || matched.passMarks || 35,
              subPos: match.index
            });
            break;
          }
        }
      }
    }

    // If 2 or more subjects are found on this header line, it is a multi-student gradebook matrix!
    if (foundSubs.length >= 2) {
      matrixHeaderLineIndex = lIdx;
      matrixSubjectCols.push(...foundSubs.sort((a, b) => a.subPos - b.subPos));
      break;
    }
  }

  // If a multi-student gradebook header was found, parse each student row
  if (matrixHeaderLineIndex !== -1 && matrixSubjectCols.length >= 2) {
    for (let rIdx = matrixHeaderLineIndex + 1; rIdx < lines.length; rIdx++) {
      const rowLine = lines[rIdx].trim();
      if (!rowLine) continue;

      if (
        /^(?:total|grand\s*total|average|avg|result|percentage|note|illustrative)\b/i.test(rowLine) ||
        /\b(?:student\s*name|roll\s*no|maximum\s*marks|marks\s*obtained|s\.?no)\b/i.test(rowLine) ||
        /^\s*(?:s\.?no|sno|#)\b/i.test(rowLine)
      ) {
        continue;
      }

      const allNumsWithIndex = Array.from(rowLine.matchAll(/\b\d+(?:\.\d+)?\b/g));
      if (allNumsWithIndex.length < 2) continue;

      let matchedStud = matchStudent(rowLine, classStudents);
      let studentName = matchedStud.studentName;
      let rollNumber = matchedStud.rollNumber;
      let studentId = matchedStud.studentId;

      if (!rollNumber) {
        const rollPatternMatch = rowLine.match(/\b([0-9]{4,}[A-Za-z0-9_-]*)\b/);
        if (rollPatternMatch) {
          rollNumber = rollPatternMatch[1];
          if (!studentId) {
            const byRoll = matchStudent(rollNumber, classStudents);
            if (byRoll.studentId) {
              studentId = byRoll.studentId;
              studentName = byRoll.studentName;
            }
          }
        }
      }

      if (!studentName) {
        const textWithoutSno = rowLine.replace(/^\s*\d+\s+/, "");
        const nameCandidate = textWithoutSno.split(/\s{2,}|\b[0-9]{4,}|\b\d+(?:\.\d+)?/)[0]?.trim();
        if (nameCandidate && nameCandidate.length >= 2 && !/^(total|avg|grade|rank)/i.test(nameCandidate)) {
          studentName = nameCandidate;
          if (!studentId) {
            const byName = matchStudent(studentName, classStudents);
            if (byName.studentId) studentId = byName.studentId;
          }
        }
      }

      // Prepare line for extracting pure subject marks by removing roll number, name, and leading serial number
      let lineForMarks = rowLine;
      if (rollNumber) {
        lineForMarks = lineForMarks.replace(rollNumber, " ");
      }
      if (studentName) {
        lineForMarks = lineForMarks.replace(studentName, " ");
      }
      // Remove leading serial number (e.g. "1 " or "2 ")
      lineForMarks = lineForMarks.replace(/^\s*\d+\s+/, " ");

      // Extract all numeric candidates from the sanitized marks line
      const matchedNums = Array.from(lineForMarks.matchAll(/\b\d+(?:\.\d+)?\b/g)).map(m => parseFloat(m[0]));
      // Exclude numbers that are clearly student roll numbers/IDs or grand totals (>= 250)
      let numValues = matchedNums.filter(n => n <= 200 || n <= (customDefaults?.defaultMaxMarks || 100) * 1.5);

      // If the row has extra trailing columns (like Total or Percentage), take only the first N for subjects
      if (numValues.length > matrixSubjectCols.length) {
        numValues = numValues.slice(0, matrixSubjectCols.length);
      }

      const studentSubs: ScannedReportCardSubject[] = [];
      let total = 0;
      let maxTotal = 0;

      matrixSubjectCols.forEach((col, cIdx) => {
        const rawScore = numValues[cIdx];
        const numScore = rawScore !== undefined && !isNaN(rawScore) ? rawScore : "";
        const maxScore = col.maxMarks;
        const passMarks = col.passMarks;

        let status: "PASS" | "FAIL" | "NEEDS_REVIEW" = "NEEDS_REVIEW";
        let isInvalid = false;
        let validationError = "";

        if (numScore === "") {
          isInvalid = true;
          validationError = "Score required";
        } else if (numScore < 0 || numScore > maxScore) {
          isInvalid = true;
          validationError = `Between 0 and ${maxScore}`;
        } else {
          total += numScore;
          maxTotal += maxScore;
          status = numScore >= passMarks ? "PASS" : "FAIL";
        }

        const grade = computeGrade(Number(numScore) || 0, maxScore);

        studentSubs.push({
          id: `matrix-stud-${rIdx}-sub-${cIdx}`,
          subjectId: col.subjectId,
          subjectName: col.subjectName,
          score: numScore,
          maxScore,
          passMarks,
          remarks: "",
          grade,
          status,
          originalExtractedValue: String(numScore),
          isInvalid,
          validationError
        });
      });

      const percentage = maxTotal > 0 ? parseFloat(((total / maxTotal) * 100).toFixed(1)) : 0;
      let grade = computeGrade(percentage, 100);

      allDetectedStudents.push({
        studentId: studentId || "",
        studentName: studentName || `Student ${allDetectedStudents.length + 1}`,
        rollNumber: rollNumber || "-",
        subjects: studentSubs,
        totalMarks: total,
        percentage,
        grade
      });
    }
  }

  // If a multi-student matrix was found with detected students, return immediately
  if (allDetectedStudents.length > 0) {
    const first = allDetectedStudents[0];
    return {
      student: {
        studentId: first.studentId,
        studentName: first.studentName,
        rollNumber: first.rollNumber,
        confidence: first.studentId ? "HIGH" : "LOW"
      },
      className: detectedClassName,
      academicYear: detectedAcademicYear,
      attendance: detectedAttendance,
      examName: detectedExamName,
      examDate: detectedExamDate,
      defaultMaxMarks,
      defaultPassMarks,
      generalRemarks: generalRemarks || "Bulk student marks extracted from marksheet.",
      subjects: first.subjects,
      allDetectedStudents,
      originalExtractedValues: {
        student: first.studentName,
        rollNumber: first.rollNumber,
        exam: detectedExamName,
        date: detectedExamDate
      }
    };
  }

  // Pass 2: Extract Subjects and Marks
  const processedSubjectNames = new Set<string>();

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];

    // Skip summary / total rows
    if (/^(?:total|grand\s*total|average|avg|result|percentage|note)\b/i.test(line.trim())) {
      continue;
    }

    // Check if line contains a subject
    let matchedSubInfo: ReturnType<typeof matchSubject> | null = null;
    let matchedKeyword = "";

    // 1. Check class subjects (longest first)
    for (const sub of sortedClassSubjects) {
      const subName = sub.name.toLowerCase();
      const regex = new RegExp(`\\b${subName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, "i");
      if (regex.test(line) || line.toLowerCase().includes(subName)) {
        matchedSubInfo = {
          subjectId: sub.id,
          subjectName: sub.name,
          maxMarks: sub.maxMarks || 100,
          passMarks: sub.passMarks || 35
        };
        matchedKeyword = subName;
        break;
      }
    }

    // 2. Check aliases (longest first)
    if (!matchedSubInfo) {
      const aliasEntries = Object.entries(SUBJECT_ALIASES).sort(
        ([a], [b]) => b.length - a.length
      );
      for (const [canonical, aliases] of aliasEntries) {
        const sortedAliases = [...aliases, canonical].sort((a, b) => b.length - a.length);
        for (const w of sortedAliases) {
          const regex = new RegExp(`\\b${w.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, "i");
          if (regex.test(line)) {
            const res = matchSubject(canonical, classSubjects);
            if (res) {
              matchedSubInfo = res;
              matchedKeyword = w.toLowerCase();
              break;
            }
          }
        }
        if (matchedSubInfo) break;
      }
    }

    if (matchedSubInfo && !processedSubjectNames.has(matchedSubInfo.subjectName.toLowerCase())) {
      processedSubjectNames.add(matchedSubInfo.subjectName.toLowerCase());

      // Find position of the subject name in the line
      let subPos = matchedKeyword ? line.toLowerCase().indexOf(matchedKeyword) : line.toLowerCase().indexOf(matchedSubInfo.subjectName.toLowerCase());

      // Extract all numbers with their string indices
      const allMatchesWithIndex = Array.from(line.matchAll(/\b\d+(?:\.\d+)?\b/g));

      // Separate numbers appearing AFTER the subject name from numbers appearing before (e.g. S.No.)
      let numberMatches: number[] = [];
      if (subPos !== -1) {
        const afterSubjectMatches = allMatchesWithIndex.filter(m => (m.index ?? 0) >= subPos);
        if (afterSubjectMatches.length > 0) {
          numberMatches = afterSubjectMatches.map(m => parseFloat(m[0]));
        }
      }

      // If no numbers appeared after the subject, fall back to all numbers, dropping leading serial number (e.g. 1, 2, 3...)
      if (numberMatches.length === 0) {
        const allNums = allMatchesWithIndex.map(m => parseFloat(m[0]));
        if (allNums.length >= 2 && allNums[0] <= 30 && Number.isInteger(allNums[0])) {
          numberMatches = allNums.slice(1);
        } else {
          numberMatches = allNums;
        }
      }

      // Fallback: Check adjacent line if no number found on the subject line
      if (numberMatches.length === 0 && idx + 1 < lines.length) {
        const nextLineNumbers = Array.from(lines[idx + 1].matchAll(/\b\d+(?:\.\d+)?\b/g)).map(m => parseFloat(m[0]));
        if (nextLineNumbers.length > 0) {
          numberMatches.push(...nextLineNumbers);
        }
      }

      let score: number | "" = "";
      let maxScore = customDefaults?.defaultMaxMarks || matchedSubInfo.maxMarks || 100;
      let passMarks = customDefaults?.defaultPassMarks || matchedSubInfo.passMarks || 35; // Standard pass mark criteria
      let remarks = "";
      let isInvalid = false;
      let validationError = "";

      const standardMaxBases = [100, 200, 75, 80, 50, 40, 30, 25, 20];

      if (numberMatches.length === 1) {
        score = numberMatches[0];
      } else if (numberMatches.length >= 2) {
        const n1 = numberMatches[0];
        const n2 = numberMatches[1];

        // Intelligently identify Max Marks vs Marks Obtained:
        // E.g. [100, 85] (Max then Obtained) or [85, 100] (Obtained then Max)
        if (standardMaxBases.includes(n1) && !standardMaxBases.includes(n2)) {
          maxScore = n1;
          score = n2;
        } else if (standardMaxBases.includes(n2) && !standardMaxBases.includes(n1)) {
          maxScore = n2;
          score = n1;
        } else if (n1 > n2 && standardMaxBases.includes(n1)) {
          maxScore = n1;
          score = n2;
        } else if (n2 > n1 && standardMaxBases.includes(n2)) {
          maxScore = n2;
          score = n1;
        } else {
          if (n1 <= n2) {
            score = n1;
            maxScore = n2;
          } else {
            maxScore = n1;
            score = n2;
          }
        }

        // Only override passMarks if there is an explicit 3rd number (e.g. 35, 40)
        if (numberMatches.length >= 3) {
          const n3 = numberMatches[2];
          if (n3 <= 50 && n3 < maxScore && n3 !== score) {
            passMarks = n3;
          }
        }
      }

      // Guarantee passMarks is never mistakenly equal to the student's obtained score!
      if (passMarks === score || passMarks > maxScore) {
        passMarks = customDefaults?.defaultPassMarks || matchedSubInfo.passMarks || 35;
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

      let status: "PASS" | "FAIL" | "NEEDS_REVIEW" = "NEEDS_REVIEW";
      let grade = "-";
      if (score !== "") {
        if (score >= passMarks) {
          status = "PASS";
        } else {
          status = "FAIL";
        }
        const pct = (Number(score) / maxScore) * 100;
        if (pct >= 90) grade = "A+";
        else if (pct >= 80) grade = "A";
        else if (pct >= 70) grade = "B";
        else if (pct >= 60) grade = "C";
        else if (pct >= 50) grade = "D";
        else grade = "F";
      }

      originalMarksMap[matchedSubInfo.subjectName] = line.trim();

      scannedSubjects.push({
        id: `scanned-${idx}-${Math.random().toString(36).substring(2, 7)}`,
        subjectId: matchedSubInfo.subjectId,
        subjectName: matchedSubInfo.subjectName,
        score,
        maxScore,
        passMarks,
        remarks,
        grade,
        status,
        originalExtractedValue: line.trim(),
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
        grade: "-",
        status: "NEEDS_REVIEW",
        originalExtractedValue: "Not detected in document",
        isInvalid: true,
        validationError: "Enter score for this subject"
      });
    });
  }

  return {
    student: detectedStudent,
    className: detectedClassName,
    academicYear: detectedAcademicYear,
    attendance: detectedAttendance,
    examName: detectedExamName,
    examDate: detectedExamDate,
    defaultMaxMarks,
    defaultPassMarks,
    generalRemarks,
    subjects: scannedSubjects,
    originalExtractedValues: {
      student: detectedStudent.studentName,
      rollNumber: detectedStudent.rollNumber,
      exam: detectedExamName,
      date: detectedExamDate,
      attendance: detectedAttendance || undefined,
      marks: originalMarksMap
    }
  };
}

/**
 * Parse Excel sheet rows into report card entries
 * Handles both single student sheet and class gradebook matrix
 */
function parseExcelToReportCard(
  buffer: ArrayBuffer,
  classStudents: Array<{ id: string; rollNumber: string; firstName: string; lastName: string }>,
  classSubjects: Array<{ id: string; name: string; maxMarks?: number; passMarks?: number }>,
  customDefaults?: {
    defaultMaxMarks?: number;
    defaultPassMarks?: number;
    examDate?: string;
    examName?: string;
  }
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
    rowStrings.forEach((c) => {
      const match = matchSubject(c, classSubjects);
      if (match && (match.subjectId || Object.keys(SUBJECT_ALIASES).includes(cleanString(c)))) {
        subjectsFoundInRow++;
      }
    });

    if (hasStudentOrRoll && subjectsFoundInRow >= 1) {
      headerRowIndex = r;
      rollCol = rowStrings.findIndex(c => c.includes("roll") || c.includes("reg") || c.includes("id") || c.includes("admission"));
      nameCol = rowStrings.findIndex(c => c.includes("name") || c.includes("student"));
      const attCol = rowStrings.findIndex(c => c.includes("att") || c.includes("present"));

      rowStrings.forEach((c, colIdx) => {
        if (colIdx !== rollCol && colIdx !== nameCol && colIdx !== attCol) {
          const match = matchSubject(c, classSubjects);
          if (match && (match.subjectId || Object.keys(SUBJECT_ALIASES).includes(cleanString(c)))) {
            subjectColMap.push({
              colIndex: colIdx,
              subjectId: match.subjectId,
              subjectName: match.subjectName,
              maxMarks: customDefaults?.defaultMaxMarks || match.maxMarks || 100,
              passMarks: customDefaults?.defaultPassMarks || match.passMarks || 35
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
    const attCol = rollCol !== -1 && headerRowIndex !== -1
      ? rows[headerRowIndex].map((c: any) => String(c || "").toLowerCase()).findIndex((c: string) => c.includes("att") || c.includes("present"))
      : -1;

    for (let r = headerRowIndex + 1; r < rows.length; r++) {
      const row = rows[r];
      if (!row || row.length === 0) continue;

      const rawRoll = rollCol !== -1 ? String(row[rollCol] || "").trim() : "";
      const rawName = nameCol !== -1 ? String(row[nameCol] || "").trim() : "";
      const rawAtt = attCol !== -1 && row[attCol] !== undefined ? String(row[attCol]).trim() : undefined;
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

        let status: "PASS" | "FAIL" | "NEEDS_REVIEW" = "NEEDS_REVIEW";
        let grade = "-";
        if (numScore !== "") {
          if (numScore >= subInfo.passMarks) {
            status = "PASS";
          } else {
            status = "FAIL";
          }
          const pct = (Number(numScore) / subInfo.maxMarks) * 100;
          if (pct >= 90) grade = "A+";
          else if (pct >= 80) grade = "A";
          else if (pct >= 70) grade = "B";
          else if (pct >= 60) grade = "C";
          else if (pct >= 50) grade = "D";
          else grade = "F";
        }

        studentSubs.push({
          id: `excel-row-${r}-sub-${subIdx}`,
          subjectId: subInfo.subjectId,
          subjectName: subInfo.subjectName,
          score: numScore,
          maxScore: subInfo.maxMarks,
          passMarks: subInfo.passMarks,
          remarks: "",
          grade,
          status,
          originalExtractedValue: rawScore !== undefined && rawScore !== null ? String(rawScore) : undefined,
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
        attendance: rawAtt || null,
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
    let session = null;
    try {
      session = await getServerSession(getAuthOptions());
    } catch {
      // Allowed in route handlers where authentication is handled by the route
    }

    if (session && session.user.role !== "TEACHER" && session.user.role !== "ADMIN") {
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

    // Fetch class students and subjects for high-accuracy recognition (with timeout protection)
    let classStudents: Array<{ id: string; rollNumber: string; firstName: string; lastName: string }> = [];
    let classSubjects: Array<{ id: string; name: string; maxMarks?: number; passMarks?: number }> = [];

    try {
      const [dbStudents, dbSubjects] = await Promise.all([
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
      classStudents = dbStudents;
      classSubjects = dbSubjects;
    } catch (dbErr) {
      console.warn("Class students/subjects fetch notice:", dbErr);
    }

    const ocrText = (formData.get("ocrText") as string) || "";
    const file = formData.get("file") as File | null;
    const defaultMaxMarksParam = Number(formData.get("defaultMaxMarks")) || 100;
    const defaultPassMarksParam = Number(formData.get("defaultPassMarks")) || 35;
    const examDateParam = (formData.get("examDate") as string) || "";
    const examNameParam = (formData.get("examName") as string) || "";

    const customDefaults = {
      defaultMaxMarks: defaultMaxMarksParam,
      defaultPassMarks: defaultPassMarksParam,
      examDate: examDateParam,
      examName: examNameParam
    };

    let fileName = file?.name || "Uploaded Document";
    let fileSize = file?.size || 0;
    let fileType = file?.type || "Document";
    const ext = fileName.split(".").pop()?.toLowerCase() || "";

    // If client already ran Tesseract OCR on photo/image
    if (ocrText && ocrText.trim().length > 0) {
      const parsed = parseTextToReportCard(ocrText, classStudents, classSubjects, customDefaults);
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
        allDetectedStudents: parsed.allDetectedStudents,
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
      const parsed = parseExcelToReportCard(buffer, classStudents, classSubjects, customDefaults);
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

      const parsed = parseTextToReportCard(text, classStudents, classSubjects, customDefaults);
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
        className: parsed.className || null,
        academicYear: parsed.academicYear || null,
        attendance: parsed.attendance || null,
        examName: parsed.examName,
        examDate: parsed.examDate,
        defaultMaxMarks: parsed.defaultMaxMarks,
        defaultPassMarks: parsed.defaultPassMarks,
        generalRemarks: parsed.generalRemarks,
        subjects: parsed.subjects,
        allDetectedStudents: parsed.allDetectedStudents,
        rawTextPreview: text.substring(0, 500),
        originalExtractedValues: parsed.originalExtractedValues
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

      const parsed = parseTextToReportCard(text, classStudents, classSubjects, customDefaults);
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
        className: parsed.className || null,
        academicYear: parsed.academicYear || null,
        attendance: parsed.attendance || null,
        examName: parsed.examName,
        examDate: parsed.examDate,
        defaultMaxMarks: parsed.defaultMaxMarks,
        defaultPassMarks: parsed.defaultPassMarks,
        generalRemarks: parsed.generalRemarks,
        subjects: parsed.subjects,
        allDetectedStudents: parsed.allDetectedStudents,
        rawTextPreview: text.substring(0, 500),
        originalExtractedValues: parsed.originalExtractedValues
      };
    }

    // 4. Photos and Scanned Images (.jpg, .jpeg, .png, .webp, .bmp)
    if (["jpg", "jpeg", "png", "webp", "bmp"].includes(ext) || fileType.startsWith("image/")) {
      let extractedText = ocrText || "";
      if (!extractedText.trim()) {
        try {
          const os = await import("os");
          const { createWorker } = await import("tesseract.js");
          const worker = await createWorker("eng", 1, { cachePath: os.tmpdir() });
          const ocrPromise = worker.recognize(Buffer.from(buffer));
          const timeoutPromise = new Promise<{ data: { text: string } }>((_, reject) =>
            setTimeout(() => reject(new Error("OCR timeout")), 18000)
          );
          const ret = await Promise.race([ocrPromise, timeoutPromise]);
          await worker.terminate();
          extractedText = ret.data?.text || "";
        } catch (ocrErr) {
          console.warn("Server image OCR notice:", ocrErr);
        }
      }

      const parsed = parseTextToReportCard(extractedText, classStudents, classSubjects, customDefaults);
      return {
        success: true,
        fileDetails: {
          name: fileName,
          type: "Scanned Document / Photo (OCR)",
          size: fileSize
        },
        studentId: parsed.student.studentId,
        studentName: parsed.student.studentName,
        rollNumber: parsed.student.rollNumber,
        studentConfidence: parsed.student.confidence,
        className: parsed.className || null,
        academicYear: parsed.academicYear || null,
        attendance: parsed.attendance || null,
        examName: parsed.examName || customDefaults.examName || "Midterm Examination",
        examDate: parsed.examDate || customDefaults.examDate || new Date().toISOString().split("T")[0],
        defaultMaxMarks: parsed.defaultMaxMarks,
        defaultPassMarks: parsed.defaultPassMarks,
        generalRemarks: parsed.generalRemarks,
        subjects: parsed.subjects,
        allDetectedStudents: parsed.allDetectedStudents,
        rawTextPreview: extractedText ? extractedText.substring(0, 500) : "Image uploaded. You can verify and edit subject marks below.",
        originalExtractedValues: parsed.originalExtractedValues
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
