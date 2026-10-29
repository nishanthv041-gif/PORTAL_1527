import type {
  ScannedReportCardSubject,
  DetectedStudentEntry
} from "./scanReportCardTypes";

export const SUBJECT_ALIASES: Record<string, string[]> = {
  tamil: ["tamil", "tam", "regional language", "second language", "language 1", "lang 1"],
  english: ["english", "eng", "first language", "language 2", "lang 2", "eng lit", "general english"],
  mathematics: ["mathematics", "maths", "math", "maths 1", "maths 2", "basic maths", "standard maths", "quant"],
  science: ["science", "sci", "general science", "gen sci", "natural science", "sci & tech"],
  physics: ["physics", "phy", "phys"],
  chemistry: ["chemistry", "chem"],
  biology: ["biology", "bio", "botany", "zoology"],
  socialscience: ["social science", "social", "soc sci", "social studies", "sst", "history & civics", "geography"],
  hindi: ["hindi", "hin", "third language", "lang 3"],
  computerscience: ["computer science", "computer", "cs", "it", "information technology", "coding", "ict"],
  economics: ["economics", "eco"],
  accountancy: ["accountancy", "accounts", "acc"],
  commerce: ["commerce", "comm", "business studies", "bst"]
};

export const EXAM_KEYWORDS = [
  "Unit Test 1",
  "Unit Test 2",
  "Unit Test 3",
  "Unit Test 4",
  "Midterm Examination",
  "Mid Term Examination",
  "Midterm",
  "Quarterly Examination",
  "Quarterly Exam",
  "Quarterly",
  "Half-Yearly Examination",
  "Half Yearly Examination",
  "Half-Yearly",
  "Half Yearly",
  "Term 1 Final",
  "Term 2 Final",
  "Term 1 Examination",
  "Term 2 Examination",
  "Model Examination",
  "Model Exam",
  "Annual Examination",
  "Annual Exam",
  "Final Examination",
  "Final Exam"
];

export const NON_SUBJECT_KEYWORDS = [
  "total", "percentage", "sno", "s.no", "rollno", "roll no", "reg no", "register no",
  "student name", "studentname", "result", "rank", "attendance", "average", "avg",
  "maximum marks", "marks obtained", "max mark", "pass mark", "grade", "remarks"
];

export function cleanString(str: string): string {
  return (str || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Normalizes subject names into standard curriculum names using aliases
 * e.g. Maths/Math -> MATHEMATICS, Social/Social Studies/SS/SST -> SOCIAL SCIENCE
 */
export function normalizeSubjectName(raw: string): string {
  const norm = (raw || "").toLowerCase().replace(/\s*[\/\(]\s*\d+\s*[\)]?/g, "").trim();
  const clean = cleanString(norm);
  if (!clean) return (raw || "").trim().toUpperCase();

  if (clean.includes("math")) return "MATHEMATICS";
  if (clean.includes("social") || clean.includes("sst") || clean === "ss" || clean.includes("socsci") || clean.includes("socstudy")) return "SOCIAL SCIENCE";
  if (clean.includes("comp") || clean.includes("cs") || clean === "it") return "COMPUTER SCIENCE";
  if (clean.includes("tam")) return "TAMIL";
  if (clean.includes("eng")) return "ENGLISH";
  if (clean.includes("sci") && !clean.includes("social") && !clean.includes("comp")) return "SCIENCE";
  if (clean.includes("hin")) return "HINDI";
  if (clean.includes("comp") || clean.includes("cs") || clean.includes("it")) return "COMPUTER SCIENCE";
  if (clean.includes("physics") || clean === "phy") return "PHYSICS";
  if (clean.includes("chem")) return "CHEMISTRY";
  if (clean.includes("bio")) return "BIOLOGY";

  for (const [canonical, aliases] of Object.entries(SUBJECT_ALIASES)) {
    if (clean === canonical || aliases.some(a => cleanString(a) === clean)) {
      if (canonical === "socialscience") return "SOCIAL SCIENCE";
      if (canonical === "computerscience") return "COMPUTER SCIENCE";
      return canonical.toUpperCase();
    }
  }

  return (raw || "").trim().toUpperCase();
}

/**
 * Strips symbols/spaces and extracts numeric score.
 * If non-numeric or unreadable, returns score: null and isNeedsReview: true.
 */
export function parseScoreNumber(val: any): { score: number | null; isNeedsReview: boolean; raw: string } {
  if (val === null || val === undefined || val === "") {
    return { score: null, isNeedsReview: true, raw: "" };
  }
  if (typeof val === "number") {
    if (isNaN(val)) return { score: null, isNeedsReview: true, raw: "" };
    return { score: val, isNeedsReview: false, raw: String(val) };
  }
  const str = String(val).trim();
  // If formatted as "92 / 100" or "85/100", extract part before slash
  const beforeSlash = str.split("/")[0].trim();
  const match = beforeSlash.replace(/[^0-9.-]/g, "").trim();
  if (!match) {
    return { score: null, isNeedsReview: true, raw: str };
  }
  const parsed = parseFloat(match);
  if (isNaN(parsed)) {
    return { score: null, isNeedsReview: true, raw: str };
  }
  return { score: parsed, isNeedsReview: false, raw: str };
}

export function computeGrade(score: number, max: number): string {
  if (isNaN(score) || max <= 0) return "-";
  const pct = (score / max) * 100;
  if (pct >= 90) return "A+";
  if (pct >= 80) return "A";
  if (pct >= 70) return "B";
  if (pct >= 60) return "C";
  if (pct >= 50) return "D";
  return "F";
}

export function levenshteinDistance(s1: string, s2: string): number {
  const m = s1.length;
  const n = s2.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (s1[i - 1] === s2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }
  return dp[m][n];
}

export function stringSimilarity(str1: string, str2: string): number {
  const s1 = cleanString(str1);
  const s2 = cleanString(str2);
  if (!s1 || !s2) return 0;
  if (s1 === s2) return 1;
  const maxLen = Math.max(s1.length, s2.length);
  const dist = levenshteinDistance(s1, s2);
  return 1 - dist / maxLen;
}

export function matchSubject(
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
    const cleanSub = cleanString(s.name);
    if (cleanSub === cleanRaw || cleanRaw.includes(cleanSub) || cleanSub.includes(cleanRaw)) {
      return {
        subjectId: s.id,
        subjectName: s.name,
        maxMarks: s.maxMarks || 100,
        passMarks: s.passMarks || 35
      };
    }
  }

  // 2. Alias lookup
  for (const [canonical, aliases] of Object.entries(SUBJECT_ALIASES)) {
    if (cleanRaw === canonical || aliases.some(a => cleanString(a) === cleanRaw)) {
      const foundInClass = classSubjects.find(s => {
        const c = cleanString(s.name);
        return c === canonical || aliases.some(a => cleanString(a) === c);
      });
      if (foundInClass) {
        return {
          subjectId: foundInClass.id,
          subjectName: foundInClass.name,
          maxMarks: foundInClass.maxMarks || 100,
          passMarks: foundInClass.passMarks || 35
        };
      }
    }
  }

  // 3. Fuzzy similarity
  let bestSubject: { id: string; name: string; maxMarks?: number; passMarks?: number } | null = null;
  let bestScore = 0;
  for (const s of classSubjects) {
    const sim = stringSimilarity(cleanRaw, s.name);
    if (sim > bestScore && sim >= 0.65) {
      bestScore = sim;
      bestSubject = s;
    }
  }

  if (bestSubject) {
    return {
      subjectId: bestSubject.id,
      subjectName: bestSubject.name,
      maxMarks: bestSubject.maxMarks || 100,
      passMarks: bestSubject.passMarks || 35
    };
  }

  return null;
}

export function matchStudent(
  rawText: string,
  classStudents: Array<{ id: string; rollNumber: string; name: string }>
): { studentId: string; studentName: string; rollNumber: string; confidence: "HIGH" | "MEDIUM" | "LOW" | "NONE" } {
  if (!rawText || classStudents.length === 0) {
    return { studentId: "", studentName: "", rollNumber: "", confidence: "NONE" };
  }

  const cleanRaw = cleanString(rawText);
  if (!cleanRaw || cleanRaw.length < 3) {
    return { studentId: "", studentName: "", rollNumber: "", confidence: "NONE" };
  }

  // 1. Match exact Roll Number
  for (const st of classStudents) {
    const cleanRoll = cleanString(st.rollNumber);
    if (cleanRoll && cleanRaw.includes(cleanRoll)) {
      return {
        studentId: st.id,
        studentName: st.name,
        rollNumber: st.rollNumber,
        confidence: "HIGH"
      };
    }
  }

  // 2. Match exact Full Name
  for (const st of classStudents) {
    const cleanName = cleanString(st.name);
    if (cleanName && (cleanRaw.includes(cleanName) || cleanName.includes(cleanRaw))) {
      return {
        studentId: st.id,
        studentName: st.name,
        rollNumber: st.rollNumber,
        confidence: "HIGH"
      };
    }
  }

  // 3. Match individual words / initials (e.g. "Kirithik M" vs "Kirithik")
  for (const st of classStudents) {
    const nameParts = st.name.toLowerCase().split(/\s+/).filter(p => p.length >= 3);
    for (const part of nameParts) {
      if (cleanRaw.includes(cleanString(part))) {
        return {
          studentId: st.id,
          studentName: st.name,
          rollNumber: st.rollNumber,
          confidence: "MEDIUM"
        };
      }
    }
  }

  // 4. Fuzzy Levenshtein match across all student names
  let bestStudent: typeof classStudents[0] | null = null;
  let bestSim = 0;
  for (const st of classStudents) {
    const sim = stringSimilarity(cleanRaw, st.name);
    if (sim > bestSim && sim >= 0.72) {
      bestSim = sim;
      bestStudent = st;
    }
  }

  if (bestStudent) {
    return {
      studentId: bestStudent.id,
      studentName: bestStudent.name,
      rollNumber: bestStudent.rollNumber,
      confidence: "MEDIUM"
    };
  }

  return { studentId: "", studentName: "", rollNumber: "", confidence: "NONE" };
}

/**
 * Text parser for single-student and multi-student marksheets
 */
export function parseTextToReportCard(
  rawText: string,
  classSubjects: Array<{ id: string; name: string; maxMarks?: number; passMarks?: number }>,
  classStudents: Array<{ id: string; rollNumber: string; name: string }>,
  customDefaults?: { defaultMaxMarks?: number; defaultPassMarks?: number }
): {
  studentId: string;
  studentName: string;
  rollNumber: string;
  studentConfidence: "HIGH" | "MEDIUM" | "LOW" | "NONE";
  examName: string;
  examDate: string;
  subjects: ScannedReportCardSubject[];
  allDetectedStudents: DetectedStudentEntry[];
  rawTextPreview: string;
  docTotal?: number;
  docPercentage?: number;
} {
  const lines = rawText.split("\n").map(l => l.trim()).filter(Boolean);

  let detectedExamName = "Midterm Examination";
  for (const kw of EXAM_KEYWORDS) {
    const reg = new RegExp(`\\b${kw.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, "i");
    if (reg.test(rawText)) {
      detectedExamName = kw;
      break;
    }
  }

  let detectedExamDate = new Date().toISOString().split("T")[0];
  const datePatterns = [
    /\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\b/,
    /\b(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})\b/
  ];
  for (const p of datePatterns) {
    const match = rawText.match(p);
    if (match) {
      try {
        if (match[3].length === 4) {
          const d = String(match[1]).padStart(2, "0");
          const m = String(match[2]).padStart(2, "0");
          const y = match[3];
          detectedExamDate = `${y}-${m}-${d}`;
        } else {
          detectedExamDate = `${match[1]}-${String(match[2]).padStart(2, "0")}-${String(match[3]).padStart(2, "0")}`;
        }
        break;
      } catch { }
    }
  }

  // Look for total/percentage printed on document
  let docTotal: number | undefined;
  let docPercentage: number | undefined;

  const totalLine = lines.find(l => /\b(?:total|grand\s*total)\b/i.test(l));
  if (totalLine) {
    const nums = totalLine.match(/\b\d{2,4}\b/g)?.map(n => parseInt(n, 10)) || [];
    if (nums.length >= 2) {
      if (nums[0] % 50 === 0 && nums[1] % 50 !== 0) {
        docTotal = nums[1];
      } else if (nums[1] % 50 === 0 && nums[0] % 50 !== 0) {
        docTotal = nums[0];
      } else {
        docTotal = Math.min(...nums);
      }
    } else if (nums.length === 1) {
      docTotal = nums[0];
    }
  }

  const pctMatch = rawText.match(/\b(?:percentage|average|avg)\b[^\d]*(\d{1,3}(?:\.\d+)?)\s*%/i) ||
    rawText.match(/\b(\d{1,3}(?:\.\d+)?)\s*%\b/i);
  if (pctMatch) {
    const val = parseFloat(pctMatch[1]);
    if (val >= 0 && val <= 100) docPercentage = val;
  }

  // Check for multi-student tabular layout
  // (e.g. Image 9: Student Name, Roll No, Tamil, English, Maths, Science, Social, Total, Percentage)
  const allDetectedStudents: DetectedStudentEntry[] = [];

  // Find header row that contains multiple subject names
  let headerRowIndex = -1;
  let subjectsInHeader: Array<{ subject: { subjectId: string; subjectName: string; maxMarks: number; passMarks: number }; startIdx: number }> = [];

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];
    const occurrences: Array<{ subject: any; startIdx: number }> = [];

    for (const cs of classSubjects) {
      const aliases = SUBJECT_ALIASES[cleanString(cs.name)] || [];
      const searchTerms = [cs.name.toLowerCase(), ...aliases];

      for (const term of searchTerms) {
        const reg = new RegExp(`\\b${term.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, "gi");
        let m: RegExpExecArray | null;
        while ((m = reg.exec(line)) !== null) {
          occurrences.push({
            subject: {
              subjectId: cs.id,
              subjectName: cs.name,
              maxMarks: cs.maxMarks || 100,
              passMarks: cs.passMarks || 35
            },
            startIdx: m.index
          });
        }
      }
    }

    occurrences.sort((a, b) => a.startIdx - b.startIdx);
    const uniqueInLine: typeof subjectsInHeader = [];
    for (const occ of occurrences) {
      if (!uniqueInLine.find(u => u.subject.subjectId === occ.subject.subjectId)) {
        uniqueInLine.push(occ);
      }
    }

    if (uniqueInLine.length > subjectsInHeader.length) {
      headerRowIndex = idx;
      subjectsInHeader = uniqueInLine;
    }
  }

  if (headerRowIndex !== -1 && subjectsInHeader.length >= 2) {
    // Process student rows below header
    for (let r = headerRowIndex + 1; r < lines.length; r++) {
      const row = lines[r].trim();
      if (!row) continue;
      if (/^(?:s\.?no|sno|student|roll|subject|total|average|avg|result|note|illustrative)\b/i.test(row)) continue;
      if (/illustrative\s+marks|verify\s+before|official\s+use|signature|marksheet/i.test(row)) continue;

      // Extract numbers in row
      const numberTokens = row.match(/\b\d{1,3}\b/g)?.map(n => parseInt(n, 10)) || [];
      const stMatch = matchStudent(row, classStudents);
      const hasRollNumber = /\b\d{6,12}[A-Za-z0-9]*\b/i.test(row);

      // Must match a student in roster OR have a roll number OR have at least 2 subject numbers
      if (!stMatch.studentId && !hasRollNumber && numberTokens.length < 2) {
        continue;
      }

      // Filter out obvious S.No (e.g. 1, 2) if it appears at the very beginning
      let filteredNums = [...numberTokens];
      if (filteredNums.length > subjectsInHeader.length && filteredNums[0] <= lines.length) {
        filteredNums.shift(); // remove S.No
      }

      const studentSubjects: ScannedReportCardSubject[] = classSubjects.map((cs, sIdx) => {
        // Map to header column index if available, else positional
        const hIdx = subjectsInHeader.findIndex(h => h.subject.subjectId === cs.id);
        const scoreVal = (hIdx !== -1 && filteredNums[hIdx] !== undefined)
          ? filteredNums[hIdx]
          : (filteredNums[sIdx] !== undefined ? filteredNums[sIdx] : "");

        const maxScore = customDefaults?.defaultMaxMarks || cs.maxMarks || 100;
        const passMarks = customDefaults?.defaultPassMarks || cs.passMarks || 35;
        const grade = scoreVal !== "" ? computeGrade(Number(scoreVal), maxScore) : "-";
        const status = scoreVal === "" ? "NEEDS_REVIEW" : Number(scoreVal) >= passMarks ? "PASS" : "FAIL";

        return {
          id: `subj-${Date.now()}-${sIdx}-${Math.random().toString(36).substr(2, 4)}`,
          subjectId: cs.id,
          subjectName: cs.name,
          score: scoreVal,
          maxScore,
          passMarks,
          remarks: "",
          grade,
          status,
          originalExtractedValue: scoreVal !== "" ? String(scoreVal) : undefined
        };
      });

      // Compute student-specific total if available in numbers, or sum valid scores
      const sumScores = studentSubjects.reduce((acc, s) => acc + (typeof s.score === "number" ? s.score : 0), 0);
      let rowTotal = sumScores > 0 ? sumScores : docTotal;
      if (filteredNums.length >= subjectsInHeader.length + 1 && filteredNums[subjectsInHeader.length] >= sumScores * 0.8) {
        rowTotal = filteredNums[subjectsInHeader.length];
      }
      let rowPct = docPercentage;
      if (rowTotal && studentSubjects.length > 0) {
        const totalMax = studentSubjects.reduce((acc, s) => acc + s.maxScore, 0);
        if (totalMax > 0) {
          rowPct = Math.round((rowTotal / totalMax) * 1000) / 10;
        }
      }

      allDetectedStudents.push({
        studentId: stMatch.studentId,
        studentName: stMatch.studentName || row.match(/[A-Za-z\s.]{3,}/)?.[0]?.trim() || "Student",
        rollNumber: stMatch.rollNumber || row.match(/\b\d{6,12}[A-Za-z0-9]*\b/)?.[0] || "",
        subjects: studentSubjects,
        totalMarks: rowTotal,
        percentage: rowPct
      });
    }
  }

  // If no multi-student rows detected, parse as single student marksheet (Image 3)
  if (allDetectedStudents.length === 0) {
    const singleStudent = matchStudent(rawText, classStudents);
    const subjectsMap = new Map<string, { score: number | ""; maxScore: number; passMarks: number; raw?: string }>();

    // For every class subject, scan text for subject row
    for (const cs of classSubjects) {
      const aliases = SUBJECT_ALIASES[cleanString(cs.name)] || [cs.name.toLowerCase()];
      const searchTerms = [cs.name.toLowerCase(), ...aliases];

      let foundScore: number | "" = "";
      let foundMax = customDefaults?.defaultMaxMarks || cs.maxMarks || 100;
      let foundPass = customDefaults?.defaultPassMarks || cs.passMarks || 35;
      let rawSnippet = "";

      for (const line of lines) {
        // Skip header lines
        if (/^(?:s\.?no|sno|subject|maximum|marks\s*obtained|total|average)\b/i.test(line)) continue;

        const cleanLine = line.toLowerCase();
        const matchesTerm = searchTerms.some(term => {
          const reg = new RegExp(`\\b${term.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, "i");
          return reg.test(cleanLine);
        });

        if (matchesTerm) {
          rawSnippet = line;
          // Extract numbers from line: e.g. "1 Tamil 100 85"
          // Here: 1 is S.No, 100 is Max Marks, 85 is Marks Obtained!
          const nums = line.match(/\b\d{1,3}\b/g)?.map(n => parseInt(n, 10)) || [];
          if (nums.length >= 3) {
            // [S.No (1), Max (100), Marks (85)]
            foundMax = nums[1];
            foundScore = nums[2];
          } else if (nums.length === 2) {
            // Could be [Max (100), Marks (85)] or [S.No (1), Marks (85)]
            if (nums[0] === 100 || nums[0] === 50 || nums[0] === 75 || nums[0] === 25) {
              foundMax = nums[0];
              foundScore = nums[1];
            } else if (nums[0] <= 10 && nums[1] > 10) {
              foundScore = nums[1];
            } else {
              foundScore = nums[1];
            }
          } else if (nums.length === 1) {
            foundScore = nums[0];
          }
          break;
        }
      }

      subjectsMap.set(cs.id, {
        score: foundScore,
        maxScore: foundMax,
        passMarks: foundPass,
        raw: rawSnippet
      });
    }

    const constructedSubjects: ScannedReportCardSubject[] = classSubjects.map((cs, idx) => {
      const data = subjectsMap.get(cs.id) || { score: "", maxScore: 100, passMarks: 35 };
      const score = data.score;
      const maxScore = data.maxScore || 100;
      const passMarks = data.passMarks || 35;
      const grade = score !== "" ? computeGrade(Number(score), maxScore) : "-";
      const status = score === "" ? "NEEDS_REVIEW" : Number(score) >= passMarks ? "PASS" : "FAIL";

      return {
        id: `subj-${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 4)}`,
        subjectId: cs.id,
        subjectName: cs.name,
        score,
        maxScore,
        passMarks,
        remarks: "",
        grade,
        status,
        originalExtractedValue: data.raw || (score !== "" ? String(score) : undefined)
      };
    });

    allDetectedStudents.push({
      studentId: singleStudent.studentId,
      studentName: singleStudent.studentName,
      rollNumber: singleStudent.rollNumber,
      subjects: constructedSubjects,
      totalMarks: docTotal,
      percentage: docPercentage
    });
  }

  const primary = allDetectedStudents[0];

  return {
    studentId: primary?.studentId || "",
    studentName: primary?.studentName || "",
    rollNumber: primary?.rollNumber || "",
    studentConfidence: primary?.studentId ? "HIGH" : "NONE",
    examName: detectedExamName,
    examDate: detectedExamDate,
    subjects: primary?.subjects || [],
    allDetectedStudents,
    rawTextPreview: lines.slice(0, 15).join("\n"),
    docTotal,
    docPercentage
  };
}
