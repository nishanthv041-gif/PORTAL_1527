import * as XLSX from "xlsx";
import { ExtractedSheetResult, ExtractedStudent } from "../types";
import { normalizeSubjectName } from "../normalizer";

/**
 * Extracts student marks from spreadsheet files (.xlsx, .xls, .csv).
 * Handles:
 * - Dynamic subject detection (3 to 12 subjects)
 * - Absent marks ("AB", "ABSENT", "A") preserved as "AB"
 * - Declared total vs detected subject count validation
 * - Arithmetic cross-checks on student totals with automatic discrepancy warning
 */
export function extractFromSpreadsheet(
  buffer: ArrayBuffer | Uint8Array | Buffer
): ExtractedSheetResult {
  const startTime = Date.now();
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const rawRows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

  const warnings: string[] = [];
  let headerRowIdx = -1;
  let testName: string | undefined;
  let className: string | undefined;
  let section: string | undefined;
  let maxMarkPerSubject = 100;
  let maxTotalDeclared: number | undefined;

  // Search header row and metadata across the first 15 rows
  for (let r = 0; r < Math.min(15, rawRows.length); r++) {
    const rowStr = rawRows[r].map((c: any) => String(c).trim()).join(" ").toUpperCase();

    // Check for max marks in title/header
    const eachMatch = rowStr.match(/\/(\d+)\s*EACH/) || rowStr.match(/OUT\s*OF\s*(\d+)/);
    if (eachMatch) maxMarkPerSubject = parseInt(eachMatch[1], 10);

    const maxTotMatch =
      rowStr.match(/TOTAL\s*MARKS?:\s*(\d+)\s*MAXIMUM/) ||
      rowStr.match(/MAXIMUM\s*TOTAL:\s*(\d+)/) ||
      rowStr.match(/MAX\s*TOTAL:\s*(\d+)/);
    if (maxTotMatch) maxTotalDeclared = parseInt(maxTotMatch[1], 10);

    // Look for class/section or exam metadata
    const classMatch = rowStr.match(/(?:CLASS|GRADE|STD)\s*[:\-]?\s*([0-9IVXLCDM]+(?:\s*[A-Z])?)/i);
    if (classMatch && !className) className = classMatch[1].trim();

    if (rowStr.includes("STUDENT NAME") || rowStr.includes("NAME OF STUDENT") || rowStr.includes("CANDIDATE") || (rowStr.includes("NAME") && (rowStr.includes("ROLL") || rowStr.includes("TOTAL")))) {
      headerRowIdx = r;
      break;
    }
  }

  if (headerRowIdx === -1) {
    return {
      maxMarkPerSubject: 100,
      subjects: [],
      students: [],
      warnings: ["Could not locate header row containing student names or roll numbers."],
      providerUsed: "SHEETJS",
      durationMs: Date.now() - startTime
    };
  }

  const headerRow = rawRows[headerRowIdx].map((c: any) => String(c).trim());
  let nameColIdx = -1;
  let rollColIdx = -1;
  let totalColIdx = -1;

  headerRow.forEach((colName, idx) => {
    const up = colName.toUpperCase();
    if (up.includes("ROLL") || up.includes("REG") || up.includes("ADMISSION") || up === "ADM NO") rollColIdx = idx;
    else if (up.includes("STUDENT NAME") || up === "NAME" || up.includes("CANDIDATE")) nameColIdx = idx;
    else if (up === "TOTAL" || up.startsWith("TOTAL MARKS") || up.startsWith("TOTAL")) totalColIdx = idx;
  });

  if (nameColIdx === -1) nameColIdx = 0;

  // Identify subjects: every column between student name/roll and the TOTAL column
  const subjectCols: { name: string; idx: number }[] = [];
  headerRow.forEach((colName, idx) => {
    if (idx === nameColIdx || idx === rollColIdx || idx === totalColIdx) return;
    const up = colName.toUpperCase();
    if (
      up.includes("PERCENT") ||
      up.includes("GRADE") ||
      up.includes("RESULT") ||
      up.includes("RANK") ||
      up.includes("ATTENDANCE") ||
      up.includes("S.NO") ||
      up === "SNO" ||
      up === "#" ||
      up === "ACTION" ||
      up === "REMARKS" ||
      up === "REMARK"
    ) {
      return;
    }
    if (colName.trim()) {
      subjectCols.push({ name: normalizeSubjectName(colName), idx });
    }
  });

  const subjects = subjectCols.map(s => s.name);

  // Validate declared max total vs detected subject count
  if (maxTotalDeclared && subjects.length > 0) {
    const expectedSubjectCount = Math.round(maxTotalDeclared / maxMarkPerSubject);
    if (expectedSubjectCount !== subjects.length) {
      warnings.push(
        `Expected ${expectedSubjectCount} subjects based on declared maximum ${maxTotalDeclared}, but found ${subjects.length}. A column may be missing.`
      );
    }
  }

  // Extract student data
  const students: ExtractedStudent[] = [];

  for (let r = headerRowIdx + 1; r < rawRows.length; r++) {
    const row = rawRows[r];
    const nameVal = String(row[nameColIdx] || "").trim();
    if (
      !nameVal ||
      nameVal.toUpperCase().includes("TOTAL") ||
      nameVal.toUpperCase().includes("AVERAGE") ||
      nameVal.toUpperCase().includes("MAX MARKS")
    ) {
      continue;
    }

    const rollNo = rollColIdx !== -1 ? String(row[rollColIdx] || "").trim() : undefined;
    const marks: Record<string, number | null | "AB"> = {};
    const confidence: Record<string, number> = {};

    let totalFromSheet: number | undefined;
    if (totalColIdx !== -1 && row[totalColIdx] !== undefined && row[totalColIdx] !== "") {
      const parsedTot = parseFloat(String(row[totalColIdx]).replace(/[^0-9.]/g, ""));
      if (!isNaN(parsedTot)) totalFromSheet = parsedTot;
    }

    subjectCols.forEach(sc => {
      const rawCell = row[sc.idx];
      if (rawCell === "" || rawCell === null || rawCell === undefined) {
        marks[sc.name] = null;
        confidence[sc.name] = 0;
      } else {
        const strVal = String(rawCell).trim().toUpperCase();
        if (strVal === "AB" || strVal === "ABSENT" || strVal === "A") {
          marks[sc.name] = "AB";
          confidence[sc.name] = 1.0;
        } else {
          const num = parseFloat(strVal.replace(/[^0-9.]/g, ""));
          if (isNaN(num)) {
            marks[sc.name] = null;
            confidence[sc.name] = 0.3;
          } else {
            marks[sc.name] = num;
            confidence[sc.name] = 1.0;
          }
        }
      }
    });

    // Recalculate total and cross-check
    const calculatedSum = Object.values(marks).reduce<number>(
      (acc, m) => (typeof m === "number" ? acc + m : acc),
      0
    );

    if (totalFromSheet !== undefined && totalFromSheet !== calculatedSum) {
      warnings.push(
        `${nameVal}: sheet total ${totalFromSheet} vs calculated ${calculatedSum}, please check.`
      );
    }

    students.push({
      name: nameVal,
      rollNo,
      marks,
      totalFromSheet,
      confidence
    });
  }

  return {
    testName,
    className,
    section,
    maxMarkPerSubject,
    maxTotalDeclared,
    subjects,
    students,
    warnings,
    providerUsed: "SHEETJS",
    durationMs: Date.now() - startTime
  };
}
