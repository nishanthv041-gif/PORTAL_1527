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
  subjectScores: Record<string, { marksObtained: number | null; isAbsent: boolean }>;
  totalObtained: number;
  percentage: number;
  rank: number;
  result: string;
}

export function exportConsolidatedMarksToExcel(
  examName: string,
  className: string,
  section: string,
  subjects: ConsolidatedExportSubject[],
  students: ConsolidatedExportStudent[]
) {
  const wb = XLSX.utils.book_new();

  // Header rows
  const header: any[] = [
    ["SRT SCHOOL PORTAL - OFFICIAL CONSOLIDATED MARKS SHEET"],
    [`Exam: ${examName}`, `Class: ${className}-${section}`, `Date: ${new Date().toLocaleDateString()}`],
    [],
  ];

  // Column headers
  const colHeaders: string[] = ["Roll No", "Student Name"];
  for (const sub of subjects) {
    colHeaders.push(`${sub.subjectName} (Max: ${sub.maxMarks})`);
  }
  colHeaders.push("Total Marks", "Percentage (%)", "Rank", "Result");
  header.push(colHeaders);

  // Data rows
  const dataRows: any[][] = [];
  for (const s of students) {
    const row: any[] = [s.rollNumber, s.fullName];
    for (const sub of subjects) {
      const entry = s.subjectScores[sub.id];
      if (!entry) {
        row.push("-");
      } else if (entry.isAbsent) {
        row.push("ABSENT");
      } else if (entry.marksObtained !== null && entry.marksObtained !== undefined) {
        row.push(entry.marksObtained);
      } else {
        row.push("-");
      }
    }
    row.push(s.totalObtained, `${s.percentage}%`, s.rank, s.result);
    dataRows.push(row);
  }

  const allRows = [...header, ...dataRows];
  const ws = XLSX.utils.aoa_to_sheet(allRows);

  ws["!cols"] = [
    { wch: 12 }, // Roll
    { wch: 25 }, // Name
    ...subjects.map(() => ({ wch: 20 })),
    { wch: 15 }, // Total
    { wch: 16 }, // Percentage
    { wch: 10 }, // Rank
    { wch: 12 }, // Result
  ];

  XLSX.utils.book_append_sheet(wb, ws, "Consolidated Marks");

  const wbOut = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([wbOut], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Consolidated_Marks_${className}-${section}_${examName}.xlsx`.replace(/\s+/g, "_");
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

