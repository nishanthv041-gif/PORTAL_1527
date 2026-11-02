/**
 * Single source of truth for grading scale, pass/fail results, and grade boundaries.
 * Standard scale: >=90 A+, >=80 A, >=70 B+, >=60 B, >=50 C, >=35 D (Pass), <35 F (Fail).
 */

export interface GradeBoundary {
  minPercentage: number;
  grade: string;
  label: string;
  color: string;
  isPass: boolean;
}

export const DEFAULT_GRADE_BOUNDARIES: GradeBoundary[] = [
  { minPercentage: 90, grade: "A+", label: "Exemplary", color: "#10b981", isPass: true },
  { minPercentage: 80, grade: "A", label: "Excellent", color: "#3b82f6", isPass: true },
  { minPercentage: 70, grade: "B+", label: "Very Good", color: "#06b6d4", isPass: true },
  { minPercentage: 60, grade: "B", label: "Good", color: "#8b5cf6", isPass: true },
  { minPercentage: 50, grade: "C", label: "Satisfactory", color: "#eab308", isPass: true },
  { minPercentage: 35, grade: "D", label: "Pass", color: "#f97316", isPass: true },
  { minPercentage: 0, grade: "F", label: "Needs Remediation", color: "#ef4444", isPass: false },
];

/**
 * Calculates a letter grade from a percentage score.
 * If hasFailSubject is true, the overall result cannot be an A/B/C passing tier.
 */
export function calculateReportCardGrade(
  percentage: number | null | undefined,
  hasFailSubject: boolean = false,
  boundaries: GradeBoundary[] = DEFAULT_GRADE_BOUNDARIES
): string {
  if (percentage === null || percentage === undefined || isNaN(percentage)) {
    return "-";
  }

  if (hasFailSubject) {
    return "F";
  }

  const rounded = Math.round(percentage * 10) / 10;
  for (const b of boundaries) {
    if (rounded >= b.minPercentage) {
      return b.grade;
    }
  }

  return "F";
}

/**
 * Computes whether the student passed or failed.
 * Rule: Result = PASSED if every subject >= passMark, else FAILED.
 */
export function determineExamResult(
  subjects: Array<{ marks: number | null; passMarks?: number; absent?: boolean }>,
  defaultPassMarks: number = 35
): "PASSED" | "FAILED" {
  if (subjects.length === 0) return "FAILED";

  for (const s of subjects) {
    if (s.absent) return "FAILED";
    if (s.marks === null || s.marks === undefined) return "FAILED";
    const passThreshold = s.passMarks ?? defaultPassMarks;
    if (s.marks < passThreshold) return "FAILED";
  }

  return "PASSED";
}

