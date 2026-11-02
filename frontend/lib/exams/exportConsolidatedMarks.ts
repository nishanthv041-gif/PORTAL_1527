import * as XLSX from "xlsx";

export interface ConsolidatedExportSubject {
  id: string;
  subjectName: string;
  maxMarks: number;
  passMark: number;
}

export interface ConsolidatedExportStudent {
  rollNumber: string;
  fullName: string;
  attendance?: string | null;
  subjectScores: Record<string, { marksObtained: number | null; isAbsent: boolean; grade?: string }>;
  totalObtained: number;
  percentage: number;
  grade?: string;
  rank: number;
  result: string;
}

export function exportConsolidatedMarksToExcel(
  examName: string,
  className: string,
  section: string,
  subjects: ConsolidatedExportSubject[],
  students: ConsolidatedExportStudent[],
  academicYear: string = "2025-2026"
) {
  const wb = XLSX.utils.book_new();

  // 1. School Header block (Standardized)
  const header: any[] = [
    ["SRT Universal School"],
    ["Seeing Righteousness & Truth"],
    [
      `Exam / Term: ${examName}`,
      `Class & Section: ${className} - ${section}`,
      `Academic Year: ${academicYear}`,
      `Date of Issue: ${new Date().toLocaleDateString()}`
    ],
    [],
  ];

  // 2. Table Column Headers
  const colHeaders: string[] = ["S.No", "Roll No", "Student Name"];
  for (const sub of subjects) {
    colHeaders.push(`${sub.subjectName} (${sub.maxMarks})`);
  }
  colHeaders.push("Total", "%", "Grade", "Result", "Rank", "Attendance");
  header.push(colHeaders);

  // 3. Data Rows
  const dataRows: any[][] = [];
  let totalScoreSum = 0;
  let highestScore = 0;
  let passedCount = 0;
  let failedCount = 0;
  let appearedCount = 0;

  students.forEach((s, idx) => {
    const row: any[] = [idx + 1, s.rollNumber || "-", s.fullName];
    let studentAppeared = false;

    for (const sub of subjects) {
      const entry = s.subjectScores[sub.id];
      if (!entry) {
        row.push("-");
      } else if (entry.isAbsent) {
        row.push("ABSENT");
      } else if (entry.marksObtained !== null && entry.marksObtained !== undefined) {
        row.push(entry.marksObtained);
        studentAppeared = true;
      } else {
        row.push("-");
      }
    }

    if (studentAppeared) appearedCount++;
    if (s.result === "PASS") passedCount++;
    else failedCount++;

    totalScoreSum += s.totalObtained;
    if (s.totalObtained > highestScore) highestScore = s.totalObtained;

    row.push(
      s.totalObtained,
      Number(s.percentage.toFixed(1)),
      s.grade || "-",
      s.result,
      s.rank > 0 ? s.rank : "-",
      s.attendance || "-"
    );
    dataRows.push(row);
  });

  // 4. Footer Block Statistics
  const passPercent = students.length > 0 ? ((passedCount / students.length) * 100).toFixed(1) + "%" : "0%";
  const classAvg = students.length > 0 ? (totalScoreSum / students.length).toFixed(1) : "0";

  const footer: any[] = [
    [],
    ["--- CLASS PERFORMANCE SUMMARY ---"],
    ["Total Students", students.length],
    ["Appeared", appearedCount],
    ["Passed", passedCount],
    ["Failed", failedCount],
    ["Pass Percentage", passPercent],
    ["Class Highest Score", highestScore],
    ["Class Average Score", classAvg],
  ];

  const allRows = [...header, ...dataRows, ...footer];
  const ws = XLSX.utils.aoa_to_sheet(allRows);

  // Column widths
  ws["!cols"] = [
    { wch: 8 },  // S.No
    { wch: 16 }, // Roll No
    { wch: 28 }, // Student Name
    ...subjects.map(() => ({ wch: 18 })),
    { wch: 12 }, // Total
    { wch: 10 }, // %
    { wch: 10 }, // Grade
    { wch: 12 }, // Result
    { wch: 10 }, // Rank
    { wch: 14 }, // Attendance
  ];

  // Freeze header rows
  ws["!freeze"] = { xSplit: 0, ySplit: 5 };

  XLSX.utils.book_append_sheet(wb, ws, "Class Mark Sheet");

  const wbOut = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([wbOut], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const cleanName = `SRT_${className.replace(/\s+/g, "")}${section.replace(/\s+/g, "")}_${examName.replace(/\s+/g, "")}_MarkSheet.xlsx`;
  a.download = cleanName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

