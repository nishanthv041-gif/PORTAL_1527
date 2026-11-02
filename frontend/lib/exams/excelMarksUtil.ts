import * as XLSX from "xlsx";

export interface StudentTemplateData {
  id: string;
  rollNumber: string;
  admissionNo: string;
  fullName: string;
  marksObtained?: number | null;
  isAbsent?: boolean;
  remark?: string;
}

export interface TaskMetadata {
  id: string; // examSubjectId
  examId: string;
  examName: string;
  className: string;
  section: string;
  subjectName: string;
  subjectCode?: string | null;
  maxMarks: number;
  passMark: number;
}

export interface ExcelValidationError {
  row: number;
  rollNumber?: string;
  studentName?: string;
  field: string;
  message: string;
}

export interface ExcelParsedRow {
  rowNumber: number;
  studentId: string;
  rollNumber: string;
  studentName: string;
  marksObtained: number | null;
  isAbsent: boolean;
  remark: string;
  isValid: boolean;
  error?: string;
}

export interface ExcelValidationResult {
  isCompatibleTemplate: boolean;
  templateError?: string;
  errors: ExcelValidationError[];
  rows: ExcelParsedRow[];
  stats: {
    totalRows: number;
    validRows: number;
    errorCount: number;
    absentCount: number;
  };
}

/**
 * Generates an Excel template (.xlsx) for the given exam subject task
 */
export function generateMarksExcelTemplate(
  task: TaskMetadata,
  students: StudentTemplateData[]
): Uint8Array {
  const wb = XLSX.utils.book_new();

  // 1. Prepare Header rows with explicit metadata header for class/subject verification
  const wsData: any[][] = [
    ["SRT SCHOOL PORTAL - OFFICIAL MARKS ENTRY TEMPLATE"],
    ["Exam:", task.examName, "Class:", `${task.className}-${task.section}`],
    ["Subject:", task.subjectName, "Max Marks:", task.maxMarks, "Pass Mark:", task.passMark],
    ["TASK_ID_SYSTEM_VERIFICATION:", task.id], // Hidden/explicit check key
    [], // Blank line
    ["Roll Number", "Student Name", `Marks Obtained (Max: ${task.maxMarks})`, "Absent (Y/N)", "Remarks"],
  ];

  for (const s of students) {
    const absentVal = s.isAbsent ? "Y" : "N";
    const marksVal = s.isAbsent ? "" : (s.marksObtained !== null && s.marksObtained !== undefined ? s.marksObtained : "");
    wsData.push([
      s.rollNumber,
      s.fullName,
      marksVal,
      absentVal,
      s.remark || "",
    ]);
  }

  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Set column widths for readability
  ws["!cols"] = [
    { wch: 15 }, // Roll Number
    { wch: 28 }, // Student Name
    { wch: 30 }, // Marks Obtained
    { wch: 15 }, // Absent (Y/N)
    { wch: 30 }, // Remarks
  ];

  XLSX.utils.book_append_sheet(wb, ws, "Marks Entry");

  const wbOut = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  return new Uint8Array(wbOut);
}

/**
 * Parses and validates an uploaded Excel file against the target exam subject task
 */
export async function parseAndValidateMarksExcel(
  file: File,
  task: TaskMetadata,
  students: StudentTemplateData[]
): Promise<ExcelValidationResult> {
  const data = await file.arrayBuffer();
  const wb = XLSX.read(data, { type: "array" });

  const firstSheetName = wb.SheetNames[0];
  if (!firstSheetName) {
    return {
      isCompatibleTemplate: false,
      templateError: "The uploaded workbook does not contain any sheets.",
      errors: [],
      rows: [],
      stats: { totalRows: 0, validRows: 0, errorCount: 0, absentCount: 0 },
    };
  }

  const ws = wb.Sheets[firstSheetName];
  const rawRows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

  if (rawRows.length < 5) {
    return {
      isCompatibleTemplate: false,
      templateError: "Invalid file format. Please upload the official downloaded template.",
      errors: [],
      rows: [],
      stats: { totalRows: 0, validRows: 0, errorCount: 0, absentCount: 0 },
    };
  }

  // 1. Verify template compatibility: check TASK_ID_SYSTEM_VERIFICATION or Header match
  let foundTaskId: string | null = null;
  for (let r = 0; r < Math.min(6, rawRows.length); r++) {
    const row = rawRows[r] || [];
    if (String(row[0]).trim() === "TASK_ID_SYSTEM_VERIFICATION:" && row[1]) {
      foundTaskId = String(row[1]).trim();
      break;
    }
  }

  if (foundTaskId && foundTaskId !== task.id) {
    return {
      isCompatibleTemplate: false,
      templateError: `Template mismatch: this file belongs to a different subject/exam task (Task ID: ${foundTaskId}). Please upload the template specifically downloaded for ${task.subjectName} (${task.className}-${task.section}).`,
      errors: [],
      rows: [],
      stats: { totalRows: 0, validRows: 0, errorCount: 0, absentCount: 0 },
    };
  }

  // Find header row: look for "Roll Number"
  let dataStartRow = -1;
  for (let r = 0; r < Math.min(10, rawRows.length); r++) {
    const row = rawRows[r] || [];
    const firstCell = String(row[0]).trim().toLowerCase();
    if (firstCell.includes("roll number") || firstCell === "roll no" || firstCell === "roll") {
      dataStartRow = r + 1;
      break;
    }
  }

  if (dataStartRow === -1) {
    return {
      isCompatibleTemplate: false,
      templateError: "Could not find 'Roll Number' column header. Please use the unmodified official Excel template.",
      errors: [],
      rows: [],
      stats: { totalRows: 0, validRows: 0, errorCount: 0, absentCount: 0 },
    };
  }

  // Create student roll number lookup map
  const studentByRoll = new Map<string, StudentTemplateData>();
  for (const s of students) {
    studentByRoll.set(String(s.rollNumber).trim().toLowerCase(), s);
  }

  const errors: ExcelValidationError[] = [];
  const parsedRows: ExcelParsedRow[] = [];
  let absentCount = 0;

  for (let r = dataStartRow; r < rawRows.length; r++) {
    const row = rawRows[r];
    if (!row || row.length === 0 || row.every((c: any) => String(c).trim() === "")) {
      continue; // Skip empty rows
    }

    const rollRaw = String(row[0] || "").trim();
    const nameRaw = String(row[1] || "").trim();
    const marksRaw = String(row[2] ?? "").trim();
    const absentRaw = String(row[3] || "").trim().toUpperCase();
    const remarkRaw = String(row[4] || "").trim();

    if (!rollRaw && !nameRaw && !marksRaw) continue;

    const student = studentByRoll.get(rollRaw.toLowerCase());
    let rowError: string | undefined = undefined;

    if (!student) {
      rowError = `Unknown roll number "${rollRaw}". Student is not enrolled in ${task.className}-${task.section}.`;
      errors.push({
        row: r + 1,
        rollNumber: rollRaw,
        studentName: nameRaw,
        field: "Roll Number",
        message: rowError,
      });
      parsedRows.push({
        rowNumber: r + 1,
        studentId: "",
        rollNumber: rollRaw,
        studentName: nameRaw,
        marksObtained: null,
        isAbsent: false,
        remark: remarkRaw,
        isValid: false,
        error: rowError,
      });
      continue;
    }

    // Determine Absent status
    const isAbsent =
      absentRaw === "Y" ||
      absentRaw === "YES" ||
      absentRaw === "TRUE" ||
      absentRaw === "1" ||
      marksRaw.toUpperCase() === "AB" ||
      marksRaw.toUpperCase() === "ABSENT";

    let marksNum: number | null = null;

    if (isAbsent) {
      absentCount++;
      marksNum = null;
    } else {
      if (marksRaw === "" || marksRaw === null || marksRaw === undefined) {
        // Empty mark is allowed for draft import, but flagged
        marksNum = null;
      } else {
        const parsed = Number(marksRaw);
        if (isNaN(parsed)) {
          rowError = `Invalid marks value "${marksRaw}". Must be a valid number between 0 and ${task.maxMarks}.`;
          errors.push({
            row: r + 1,
            rollNumber: student.rollNumber,
            studentName: student.fullName,
            field: "Marks",
            message: rowError,
          });
        } else if (parsed < 0 || parsed > task.maxMarks) {
          rowError = `Marks ${parsed} out of range. Must be between 0 and ${task.maxMarks}.`;
          errors.push({
            row: r + 1,
            rollNumber: student.rollNumber,
            studentName: student.fullName,
            field: "Marks",
            message: rowError,
          });
        } else {
          marksNum = parsed;
        }
      }
    }

    parsedRows.push({
      rowNumber: r + 1,
      studentId: student.id,
      rollNumber: student.rollNumber,
      studentName: student.fullName,
      marksObtained: marksNum,
      isAbsent,
      remark: remarkRaw,
      isValid: !rowError,
      error: rowError,
    });
  }

  const validRows = parsedRows.filter((p) => p.isValid).length;

  return {
    isCompatibleTemplate: true,
    errors,
    rows: parsedRows,
    stats: {
      totalRows: parsedRows.length,
      validRows,
      errorCount: errors.length,
      absentCount,
    },
  };
}

/**
 * Generates an Excel template (.xlsx) for an entire class report card / marks sheet
 * Pre-filled with real student names, roll numbers, and subject columns.
 */
export function generateClassReportCardExcelTemplate(params: {
  className: string;
  section: string;
  examName: string;
  subjects: Array<{ id: string; name: string; maxMarks?: number; passMarks?: number }>;
  students: Array<{ id: string; rollNumber: string; name: string }>;
}): Uint8Array {
  const wb = XLSX.utils.book_new();

  // Header rows
  const wsData: any[][] = [
    ["SRT UNIVERSAL SCHOOL - CLASS MARKS & REPORT CARD CONSOLIDATED TEMPLATE"],
    ["Class:", `${params.className} - ${params.section}`, "Exam:", params.examName, "Date:", new Date().toISOString().split("T")[0]],
    ["Instructions:", "Enter marks for each subject. Enter 'AB' if student was absent. Leave Remarks blank if none."],
    [], // empty line
  ];

  // Column header row
  const headerRow: string[] = ["Roll Number", "Student Name"];
  params.subjects.forEach(sub => {
    headerRow.push(`${sub.name} (Max: ${sub.maxMarks || 100})`);
  });
  headerRow.push("Attendance (%)");
  headerRow.push("Teacher Remarks");
  wsData.push(headerRow);

  // Student rows pre-filled with real database students
  params.students.forEach(st => {
    const row: any[] = [st.rollNumber, st.name];
    params.subjects.forEach(() => {
      row.push(""); // empty mark slot ready to be filled
    });
    row.push(""); // attendance
    row.push(""); // remarks
    wsData.push(row);
  });

  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Set column widths
  const colWidths = [
    { wch: 18 }, // Roll Number
    { wch: 28 }, // Student Name
  ];
  params.subjects.forEach(() => {
    colWidths.push({ wch: 18 });
  });
  colWidths.push({ wch: 16 }); // Attendance
  colWidths.push({ wch: 30 }); // Remarks
  ws["!cols"] = colWidths;

  XLSX.utils.book_append_sheet(wb, ws, "Class Marks");
  return new Uint8Array(XLSX.write(wb, { bookType: "xlsx", type: "array" }));
}


