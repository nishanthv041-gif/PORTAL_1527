import type { ScanStudent, ScanResult } from "./types";
import type { ClassStudent, ClassSubject } from "@/frontend/components/ReportCards/TeacherReportCardsClient";
import type { DetectedStudentEntry } from "@/backend/api/actions/dashboard/teacher/report-cards/scanReportCardTypes";
import { calculateReportCardGrade } from "@/frontend/lib/constants";

const SUBJECT_NAME_ALIASES: Record<string, string[]> = {
  TAMIL: ["tamil", "tam", "lang 1"],
  ENGLISH: ["english", "eng", "lang 2"],
  MATHEMATICS: ["mathematics", "maths", "math", "mat"],
  SCIENCE: ["science", "sci", "general science"],
  "SOCIAL SCIENCE": ["social science", "social", "soc sci", "history", "geography"],
  "COMPUTER SCIENCE": ["computer science", "cs", "computer", "ip"],
  HINDI: ["hindi", "hin"],
  FRENCH: ["french", "fre"],
  "ENVIRONMENTAL STUDIES": ["environmental studies", "evs"],
};

export function matchScanResultToDatabase(
  scanResult: ScanResult,
  classStudents: ClassStudent[],
  classSubjects: ClassSubject[],
  className?: string | null
): DetectedStudentEntry[] {
  return scanResult.students.map((st: ScanStudent, idx: number) => {
    // 1. Match student to real DB student
    const matched = findBestStudentMatch(st, classStudents);

    // 2. Map subjects to class subjects
    const subjects = st.subjects.map((sub, sIdx) => {
      const matchedSub = findBestSubjectMatch(sub.name, classSubjects);
      const scoreVal: number | "" | "AB" = sub.marks !== null ? sub.marks : sub.absent ? "AB" : "";
      const maxScore = sub.maxMarks || matchedSub?.maxMarks || scanResult.maxMarksDefault || 100;
      const passMarks = sub.passMark || matchedSub?.passMarks || scanResult.passMarksDefault || 35;

      const isNum = typeof sub.marks === "number";
      const isInvalid = isNum && (sub.marks! < 0 || sub.marks! > maxScore);
      const grade = isNum ? calculateReportCardGrade((sub.marks! / maxScore) * 100) : sub.absent ? "F" : "-";
      const status = sub.absent ? "ABSENT" : isNum ? (sub.marks! >= passMarks ? "PASS" : "FAIL") : "NEEDS_REVIEW";

      return {
        id: `sub-st-${idx}-${sIdx}`,
        subjectId: matchedSub?.id || "",
        subjectName: matchedSub?.name || sub.name,
        score: scoreVal,
        maxScore,
        passMarks,
        grade,
        status: status as any,
        remarks: "",
        confidence: (sub.confidence >= 0.85 ? "HIGH" : "LOW") as "HIGH" | "LOW",
        originalExtractedValue: sub.rawText || (isNum ? String(sub.marks) : ""),
        isInvalid,
        bbox: sub.bbox,
      };
    });

    // 3. Compute Totals
    let totalMarks = 0;
    let maxTotal = 0;
    let hasFail = false;
    let hasMissing = false;

    subjects.forEach((s) => {
      maxTotal += s.maxScore;
      if (typeof s.score === "number") {
        totalMarks += s.score;
        if (s.score < s.passMarks) hasFail = true;
      } else if (s.score === "AB") {
        hasFail = true;
      } else {
        hasMissing = true;
      }
    });

    const percentage = maxTotal > 0 && !hasMissing ? parseFloat(((totalMarks / maxTotal) * 100).toFixed(1)) : 0;
    const grade = hasMissing ? "-" : calculateReportCardGrade(percentage, hasFail);

    return {
      studentId: matched?.id || (classStudents[idx]?.id || ""),
      studentName: matched?.name || st.name || `Student ${idx + 1}`,
      rollNumber: matched?.rollNumber || st.rollNo || "",
      extractedName: st.name,
      className: className || null,
      attendance: st.attendance || null,
      subjects,
      totalMarks: hasMissing ? 0 : totalMarks,
      maxTotal: maxTotal || (subjects.length * 100),
      percentage,
      grade,
      remarks: st.remarks || undefined,
      confidence: matched ? (st.confidence >= 0.85 ? "HIGH" : "MEDIUM") : "LOW",
      printedTotal: st.printedTotal || undefined,
      totalMismatchWarning: st.totalMismatchWarning,
    };
  });
}

function findBestStudentMatch(
  scanStudent: ScanStudent,
  classStudents: ClassStudent[]
): ClassStudent | null {
  if (classStudents.length === 0) return null;

  const targetRoll = (scanStudent.rollNo || "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  const targetName = scanStudent.name.toLowerCase().trim();

  // 1. Exact roll number match
  if (targetRoll) {
    const rollMatch = classStudents.find(
      (s) => s.rollNumber && s.rollNumber.replace(/[^a-zA-Z0-9]/g, "").toUpperCase() === targetRoll
    );
    if (rollMatch) return rollMatch;
  }

  // 2. Exact name match
  const exactNameMatch = classStudents.find(
    (s) => s.name.toLowerCase().trim() === targetName
  );
  if (exactNameMatch) return exactNameMatch;

  // 3. Fuzzy name match within class
  const normalizedTargetWords = targetName.split(/\s+/).filter((w) => w.length > 1);
  let bestCandidate: ClassStudent | null = null;
  let maxMatchedWords = 0;

  for (const st of classStudents) {
    const candidateWords = st.name.toLowerCase().trim().split(/\s+/).filter((w) => w.length > 1);
    let matchedWords = 0;

    for (const tw of normalizedTargetWords) {
      if (candidateWords.some((cw) => cw === tw || cw.startsWith(tw) || tw.startsWith(cw))) {
        matchedWords++;
      }
    }

    if (matchedWords > maxMatchedWords && matchedWords >= 1) {
      maxMatchedWords = matchedWords;
      bestCandidate = st;
    }
  }

  return bestCandidate;
}

export function findBestSubjectMatch(
  scannedSubjectName: string,
  classSubjects: ClassSubject[]
): ClassSubject | null {
  if (!scannedSubjectName || classSubjects.length === 0) return null;
  const rawNorm = scannedSubjectName.trim().toLowerCase().replace(/[^a-z0-9]/g, "");

  // 1. Direct exact match (e.g. "science" === "science", "socialscience" === "socialscience")
  const direct = classSubjects.find(
    (s) => s.name.toLowerCase().replace(/[^a-z0-9]/g, "") === rawNorm
  );
  if (direct) return direct;

  // 2. Exact alias mapping (Strictly separated: Science != Social Science)
  for (const [canonical, aliases] of Object.entries(SUBJECT_NAME_ALIASES)) {
    const isAliasMatch = aliases.some((a) => {
      const aNorm = a.toLowerCase().replace(/[^a-z0-9]/g, "");
      return rawNorm === aNorm;
    });

    if (isAliasMatch) {
      // Find class subject matching this exact canonical name
      const canonicalMatch = classSubjects.find(
        (s) => s.name.trim().toUpperCase() === canonical
      );
      if (canonicalMatch) return canonicalMatch;
    }
  }

  // 3. Normalized prefix match with strict boundary guard (prevent "science" matching "social science")
  if (rawNorm === "sci" || rawNorm === "science") {
    return (
      classSubjects.find((s) => s.name.trim().toUpperCase() === "SCIENCE") || null
    );
  }
  if (rawNorm === "soc" || rawNorm === "social" || rawNorm === "sst") {
    return (
      classSubjects.find((s) => s.name.trim().toUpperCase() === "SOCIAL SCIENCE") || null
    );
  }
  if (rawNorm === "math" || rawNorm === "maths" || rawNorm === "mat") {
    return (
      classSubjects.find((s) => s.name.trim().toUpperCase() === "MATHEMATICS") || null
    );
  }
  if (rawNorm === "tam" || rawNorm === "tamil") {
    return (
      classSubjects.find((s) => s.name.trim().toUpperCase() === "TAMIL") || null
    );
  }
  if (rawNorm === "eng" || rawNorm === "english") {
    return (
      classSubjects.find((s) => s.name.trim().toUpperCase() === "ENGLISH") || null
    );
  }

  // 4. Safe fallback for other subjects (strictly avoid Science/Social cross-matches)
  return (
    classSubjects.find((s) => {
      const sNorm = s.name.toLowerCase().replace(/[^a-z0-9]/g, "");
      // Guard against substring confusion
      if (sNorm === "socialscience" && rawNorm.includes("sci") && !rawNorm.includes("soc")) {
        return false;
      }
      if (sNorm === "science" && rawNorm.includes("soc")) {
        return false;
      }
      return sNorm.includes(rawNorm) || rawNorm.includes(sNorm);
    }) || null
  );
}

