import * as XLSX from "xlsx";
import type { ScanResult, ScanStudent, ScanSubject } from "./types";

const SUBJECT_ALIASES: Record<string, string> = {
  tamil: "TAMIL",
  tam: "TAMIL",
  english: "ENGLISH",
  eng: "ENGLISH",
  maths: "MATHEMATICS",
  mathematics: "MATHEMATICS",
  math: "MATHEMATICS",
  science: "SCIENCE",
  sci: "SCIENCE",
  social: "SOCIAL SCIENCE",
  "social science": "SOCIAL SCIENCE",
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

export async function parseExcelOrCsv(
  file: File,
  defaultMaxMarks = 100,
  defaultPassMarks = 35
): Promise<ScanResult> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];

  if (!worksheet) {
    throw new Error(`The spreadsheet "${file.name}" has no readable sheets.`);
  }

  const rawRows: any[][] = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: "",
    blankrows: false,
  });

  if (rawRows.length === 0) {
    throw new Error(`The file "${file.name}" is completely empty.`);
  }

  // Scan first 15 rows to find the Header Row
  let headerRowIdx = -1;
  let rollColIdx = -1;
  let nameColIdx = -1;
  let attendanceColIdx = -1;
  let totalColIdx = -1;
  const subjectCols: Array<{ index: number; name: string }> = [];

  for (let r = 0; r < Math.min(rawRows.length, 15); r++) {
    const row = rawRows[r].map((cell) => String(cell).trim().toLowerCase());
    let score = 0;
    const tempSubjectCols: Array<{ index: number; name: string }> = [];
    let tempRoll = -1;
    let tempName = -1;
    let tempAtt = -1;
    let tempTot = -1;

    row.forEach((cell, idx) => {
      if (!cell) return;
      const clean = cell.replace(/[^a-z0-9]/g, "");

      if (clean.includes("roll") || clean.includes("regno") || clean.includes("admno") || clean === "reg" || clean === "adm") {
        tempRoll = idx;
        score += 2;
      } else if (clean.includes("name") || clean.includes("student") || clean.includes("candidate")) {
        tempName = idx;
        score += 2;
      } else if (clean.includes("attend") || clean === "att") {
        tempAtt = idx;
        score += 1;
      } else if (clean.includes("total") || clean === "tot") {
        tempTot = idx;
        score += 1;
      } else {
        for (const [alias, canonical] of Object.entries(SUBJECT_ALIASES)) {
          if (clean === alias || clean.startsWith(alias)) {
            tempSubjectCols.push({ index: idx, name: canonical });
            score += 3;
            break;
          }
        }
      }
    });

    if (score >= 4 && tempSubjectCols.length > 0) {
      headerRowIdx = r;
      rollColIdx = tempRoll;
      nameColIdx = tempName;
      attendanceColIdx = tempAtt;
      totalColIdx = tempTot;
      subjectCols.push(...tempSubjectCols);
      break;
    }
  }

  if (headerRowIdx === -1 || subjectCols.length === 0) {
    throw new Error(
      `Could not detect a valid student mark table in "${file.name}". Ensure columns have standard headers (Student Name, Roll No, Subject Names).`
    );
  }

  const students: ScanStudent[] = [];

  for (let r = headerRowIdx + 1; r < rawRows.length; r++) {
    const row = rawRows[r];
    if (!row || row.length === 0) continue;

    const rawName = nameColIdx !== -1 ? String(row[nameColIdx] || "").trim() : "";
    const rawRoll = rollColIdx !== -1 ? String(row[rollColIdx] || "").trim() : null;
    const rawAtt = attendanceColIdx !== -1 ? String(row[attendanceColIdx] || "").trim() : null;
    const rawTot = totalColIdx !== -1 ? parseFloat(String(row[totalColIdx])) : null;

    if (!rawName && !rawRoll) continue;
    if (rawName.toLowerCase().includes("total") || rawName.toLowerCase().includes("sample marks")) continue;

    const subjects: ScanSubject[] = [];
    let sumScore = 0;
    let allValid = true;

    for (const sc of subjectCols) {
      const rawCell = row[sc.index];
      const strVal = String(rawCell ?? "").trim();
      const lower = strVal.toLowerCase();

      let parsedScore: number | null = null;
      let isAbsent = false;

      if (["ab", "abs", "absent", "a"].includes(lower)) {
        isAbsent = true;
      } else if (strVal !== "" && !isNaN(Number(strVal))) {
        parsedScore = Number(strVal);
        sumScore += parsedScore;
      } else {
        allValid = false;
      }

      subjects.push({
        name: sc.name,
        marks: parsedScore,
        maxMarks: defaultMaxMarks,
        passMark: defaultPassMarks,
        absent: isAbsent,
        confidence: parsedScore !== null || isAbsent ? 1.0 : 0.5,
        rawText: strVal,
      });
    }

    students.push({
      name: rawName || (rawRoll ? `Student (${rawRoll})` : `Student ${students.length + 1}`),
      rollNo: rawRoll,
      attendance: rawAtt || null,
      subjects,
      printedTotal: !isNaN(Number(rawTot)) && rawTot !== null ? rawTot : (allValid ? sumScore : null),
      printedPercentage: null,
      remarks: null,
      confidence: 0.98,
    });
  }

  return {
    layout: "A",
    examination: null,
    examDate: null,
    classLabel: null,
    maxMarksDefault: defaultMaxMarks,
    passMarksDefault: defaultPassMarks,
    students,
    warnings: [],
    fileDetails: {
      name: file.name,
      size: file.size,
      type: file.type || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    },
  };
}
