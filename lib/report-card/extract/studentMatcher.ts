export interface ClassStudentInfo {
  id: string;
  rollNumber?: string;
  name: string;
}

export interface MatchedStudentResult {
  studentId: string;
  studentName: string;
  rollNumber: string;
  extractedName: string;
  confidence: "HIGH" | "MEDIUM" | "NONE";
}

function cleanString(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Dual-stage student matcher:
 * Stage 1: Match by Roll Number or Admission Number
 * Stage 2: Match by Normalized Full Name (handling initial suffixes/prefixes)
 */
export function matchStudentToClass(
  extractedName: string,
  extractedRollNo: string | undefined,
  classStudents: ClassStudentInfo[]
): MatchedStudentResult {
  const normExtractedRoll = extractedRollNo ? cleanString(extractedRollNo) : "";
  const normExtractedName = cleanString(extractedName);

  // 1. Roll Number match
  if (normExtractedRoll) {
    const matchedByRoll = classStudents.find(cs => {
      if (!cs.rollNumber) return false;
      return cleanString(cs.rollNumber) === normExtractedRoll;
    });

    if (matchedByRoll) {
      return {
        studentId: matchedByRoll.id,
        studentName: matchedByRoll.name,
        rollNumber: matchedByRoll.rollNumber || extractedRollNo || "",
        extractedName,
        confidence: "HIGH"
      };
    }
  }

  // 2. Exact name match
  const exactNameMatch = classStudents.find(
    cs => cleanString(cs.name) === normExtractedName
  );
  if (exactNameMatch) {
    return {
      studentId: exactNameMatch.id,
      studentName: exactNameMatch.name,
      rollNumber: exactNameMatch.rollNumber || extractedRollNo || "",
      extractedName,
      confidence: "HIGH"
    };
  }

  // 3. Name containment / initials match
  // e.g. "Anushka S" matches "Anushka", or "Karuppusamy M" matches "M Karuppusamy"
  const tokens = normExtractedName.split(" ").filter(t => t.length > 1);
  const matchedPartial = classStudents.find(cs => {
    const classTokens = cleanString(cs.name).split(" ").filter(t => t.length > 1);
    if (tokens.length > 0 && classTokens.length > 0) {
      const allFound = tokens.every(t => classTokens.includes(t));
      if (allFound) return true;
      const classAllFound = classTokens.every(ct => tokens.includes(ct));
      if (classAllFound) return true;
    }
    return false;
  });

  if (matchedPartial) {
    return {
      studentId: matchedPartial.id,
      studentName: matchedPartial.name,
      rollNumber: matchedPartial.rollNumber || extractedRollNo || "",
      extractedName,
      confidence: "MEDIUM"
    };
  }

  // 4. No match found
  return {
    studentId: "",
    studentName: extractedName,
    rollNumber: extractedRollNo || "",
    extractedName,
    confidence: "NONE"
  };
}

