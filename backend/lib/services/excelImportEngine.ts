import * as XLSX from "xlsx";
import { prisma } from "@/backend/db/prisma";
import { hash } from "bcryptjs";

// ==========================================
// TYPE DEFINITIONS
// ==========================================

export type ImportType = "STUDENT_PARENT" | "TEACHER" | "ADMIN";

export interface StudentParentData {
  excelRowNumber: number;
  // Student fields
  studentFirstName: string;
  studentLastName: string;
  studentRollNo: string;
  admissionNo: string;
  studentDob?: string;
  classId?: string;
  classNameRaw?: string;
  residenceType: "HOSTEL" | "DAYSCHOLAR";
  // Parent fields
  parentFirstName: string;
  parentLastName: string;
  parentEmail: string;
  parentPassword?: string;
  parentPhone?: string;
  parentAddress?: string;
  isExistingParent?: boolean;
  [key: string]: unknown;
}

export interface TeacherData {
  excelRowNumber: number;
  firstName: string;
  lastName: string;
  fullName?: string;
  email: string;
  googleEmail?: string;
  password?: string;
  phone?: string;
  joiningDate?: string;
  qualification: string;
  gender?: string;
  subjects?: string;
  classTeacherRaw?: string;
  classTeacherClassId?: string;
  classTeacherClassName?: string;
  [key: string]: unknown;
}

export interface AdminData {
  excelRowNumber: number;
  name: string;
  email: string;
  [key: string]: unknown;
}

export type RowValidationStatus = 
  | "VALID"
  | "NEEDS_CORRECTION"
  | "DUPLICATE_IN_FILE"
  | "CONFLICT_DB"
  | "SAMPLE_ROW";

export interface RowValidationResult {
  rowId: string;
  excelRowNumber: number;
  status: RowValidationStatus;
  isReadyToImport: boolean;
  isSampleRow: boolean;
  fieldErrors: Record<string, string>;
  missingFields: string[];
  invalidFields: string[];
  duplicateWarnings: string[];
  conflictWarnings: string[];
  data: Record<string, any>;
}

export interface ExcelScanResult {
  isValidWorkbook: boolean;
  detectedTemplate: "STUDENT_PARENT" | "TEACHER" | "ADMIN" | "UNKNOWN";
  isTemplateMismatch?: boolean;
  headersFound: string[];
  missingHeaders: string[];
  unexpectedHeaders: string[];
  totalRows: number;
  validRowsCount: number;
  errorRowsCount: number;
  duplicateRowsCount: number;
  conflictRowsCount: number;
  sampleRowsCount: number;
  readyToImportCount: number;
  rows: RowValidationResult[];
  availableClasses: { id: string; name: string; section: string }[];
  fileError?: string;
}

export interface ImportCommitResult {
  success: boolean;
  batchId?: string;
  totalProcessed: number;
  importedCount: number;
  skippedCount: number;
  failedCount: number;
  errors: string[];
  createdAccounts: {
    role: "STUDENT" | "PARENT" | "TEACHER" | "ADMIN";
    identifier: string;
    name: string;
  }[];
}

// Expected headers based on uploaded templates
export const EXPECTED_STUDENT_PARENT_HEADERS = [
  "studentFirstName",
  "studentLastName",
  "studentRollNo",
  "admissionNo",
  "studentDob",
  "class",
  "residenceType",
  "parentFirstName",
  "parentLastName",
  "parentEmail",
  "parentPassword",
  "parentPhone"
];

export const EXPECTED_TEACHER_HEADERS = [
  "firstName",
  "lastName",
  "email",
  "password",
  "phone",
  "joiningDate",
  "qualification"
];

export const EXPECTED_ADMIN_HEADERS = [
  "name",
  "email"
];

// Normalize header for comparison
export function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[\s_\-]+/g, "");
}

// Formula injection escape utility (OWASP spreadsheet formula injection defense)
export function sanitizeForSpreadsheet(val: unknown): string {
  if (val === null || val === undefined) return "";
  const raw = String(val);
  const trimmed = raw.trim();
  // If the cell begins with dangerous formula initiation characters: =, +, -, @, tab, or CR
  if (/^[=+\-@\t\r]/.test(raw) || /^[=+\-@]/.test(trimmed)) {
    return `'${trimmed}`;
  }
  return trimmed;
}

// Email validator
export function isValidEmail(email?: string): boolean {
  if (!email) return false;
  const trimmed = email.trim();
  // RFC 5322 standard compliant basic regex
  return /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/.test(trimmed);
}

// Phone validator: accepts 7 to 15 digits, allows optional leading +, spaces or hyphens
export function isValidPhone(phone?: string): boolean {
  if (!phone) return true; // Optional in some schemas
  const cleaned = phone.replace(/[\s\-\(\)]/g, "");
  return /^\+?[0-9]{7,15}$/.test(cleaned);
}

// Date parser: handles Excel serial numbers, Date instances, and strings (ISO, DD/MM/YYYY, etc.)
export function parseDateSafe(val: unknown): { isValid: boolean; isoDate?: string; originalString?: string } {
  if (!val) return { isValid: false };

  // Excel serial number (e.g. 44197)
  if (typeof val === "number") {
    // Excel epoch begins Dec 30 1899
    const utcDays = Math.floor(val - 25569);
    const utcValue = utcDays * 86400;
    const dateInfo = new Date(utcValue * 1000);
    if (!isNaN(dateInfo.getTime())) {
      return { isValid: true, isoDate: dateInfo.toISOString().split("T")[0] };
    }
  }

  if (val instanceof Date) {
    if (!isNaN(val.getTime())) {
      return { isValid: true, isoDate: val.toISOString().split("T")[0] };
    }
    return { isValid: false };
  }

  const str = String(val).trim();
  if (!str) return { isValid: false };

  // Check ISO format YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const d = new Date(str + "T00:00:00Z");
    if (!isNaN(d.getTime())) {
      return { isValid: true, isoDate: str, originalString: str };
    }
  }

  // Check DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const month = parseInt(dmyMatch[2], 10) - 1;
    const year = parseInt(dmyMatch[3], 10);
    const d = new Date(Date.UTC(year, month, day));
    if (d.getUTCFullYear() === year && d.getUTCMonth() === month && d.getUTCDate() === day) {
      return { isValid: true, isoDate: d.toISOString().split("T")[0], originalString: str };
    }
  }

  // General Date fallback
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    const year = parsed.getFullYear();
    // Sanity check year
    if (year >= 1920 && year <= 2100) {
      return { isValid: true, isoDate: parsed.toISOString().split("T")[0], originalString: str };
    }
  }

  return { isValid: false, originalString: str };
}

// Sample row detection
export function isSampleTemplateRow(type: ImportType, row: Record<string, any>): boolean {
  if (type === "STUDENT_PARENT") {
    const sName = `${row.studentFirstName || ""} ${row.studentLastName || ""}`.toLowerCase();
    const pEmail = String(row.parentEmail || "").toLowerCase();
    const roll = String(row.studentRollNo || "").trim();
    const adm = String(row.admissionNo || "").trim();

    // Strictly detect the official template dummy demo row (Jimmy Doe / parent@example.com with 101/ADM101)
    if (
      (sName.includes("jimmy doe") || pEmail.includes("parent@example.com")) &&
      (roll === "101" || adm.toUpperCase() === "ADM101")
    ) {
      return true;
    }
  } else if (type === "TEACHER") {
    const tName = `${row.firstName || ""} ${row.lastName || ""}`.toLowerCase();
    const email = String(row.email || "").toLowerCase();
    if (
      (tName.includes("john doe") || email.includes("john.teacher@example.com") || email.includes("teacher@example.com")) &&
      String(row.phone || "").includes("9876543210")
    ) {
      return true;
    }
  } else if (type === "ADMIN") {
    const aName = String(row.name || "").toLowerCase();
    const email = String(row.email || "").toLowerCase();
    if (
      (aName.includes("system admin") || aName.includes("admin example") || aName.includes("john doe")) &&
      (email.includes("admin.example@gmail.com") || email.includes("example.com"))
    ) {
      return true;
    }
  }
  return false;
}

// Class matching helper
export function resolveClass(rawClass: string | undefined, classes: { id: string; name: string; section: string }[]) {
  if (!rawClass) return null;
  const target = rawClass.trim().toLowerCase();
  const cleanTarget = target.replace(/[^a-z0-9]/g, "").replace(/section/g, "");

  return classes.find(c => {
    if (c.id.toLowerCase() === target) return true;
    const cName = c.name.toLowerCase();
    const cSec = c.section.toLowerCase();

    const nameSection = `${cName} - ${cSec}`;
    const nameSectionNoHyphen = `${cName} ${cSec}`;
    const sectionName = `${cName} - section ${cSec}`;
    const sectionNameSpaced = `${cName} section ${cSec}`;

    if (
      nameSection === target ||
      nameSectionNoHyphen === target ||
      sectionName === target ||
      sectionNameSpaced === target ||
      cName === target
    ) {
      return true;
    }

    // Compare alphanumeric normalized (e.g. "class2a" vs "class2a")
    const cleanClass = `${cName}${cSec}`.replace(/[^a-z0-9]/g, "").replace(/section/g, "");
    if (cleanClass && cleanTarget && cleanClass === cleanTarget) {
      return true;
    }

    // Also support interchangeability between "class" and "grade" (e.g. "grade 2" vs "class 2")
    const gradeVsClassTarget = cleanTarget.replace(/grade/g, "class");
    const gradeVsClassClass = cleanClass.replace(/grade/g, "class");
    if (gradeVsClassClass && gradeVsClassTarget && gradeVsClassClass === gradeVsClassTarget) {
      return true;
    }

    return false;
  }) || null;
}

// ==========================================
// CORE SCANNING & VALIDATION
// ==========================================

export async function parseAndScanWorkbook(
  buffer: Buffer | ArrayBuffer,
  expectedType: ImportType
): Promise<ExcelScanResult> {
  // Safe parsing - supports both binary (XLSX, XLS) and text CSV
  let workbook: XLSX.WorkBook;
  const uint8 = buffer instanceof Buffer ? buffer : new Uint8Array(buffer);
  try {
    workbook = XLSX.read(uint8, { type: "buffer", cellDates: true, cellNF: false, cellText: true });
  } catch (err) {
    try {
      const text = new TextDecoder("utf-8").decode(uint8);
      workbook = XLSX.read(text, { type: "string", cellDates: true, cellNF: false, cellText: true });
    } catch {
      return {
        isValidWorkbook: false,
        detectedTemplate: "UNKNOWN",
        headersFound: [],
        missingHeaders: [],
        unexpectedHeaders: [],
        totalRows: 0,
        validRowsCount: 0,
        errorRowsCount: 0,
        duplicateRowsCount: 0,
        conflictRowsCount: 0,
        sampleRowsCount: 0,
        readyToImportCount: 0,
        rows: [],
        availableClasses: [],
        fileError: `Malformed CSV or Excel workbook: ${err instanceof Error ? err.message : String(err)}`
      };
    }
  }

  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    return {
      isValidWorkbook: false,
      detectedTemplate: "UNKNOWN",
      headersFound: [],
      missingHeaders: [],
      unexpectedHeaders: [],
      totalRows: 0,
      validRowsCount: 0,
      errorRowsCount: 0,
      duplicateRowsCount: 0,
      conflictRowsCount: 0,
      sampleRowsCount: 0,
      readyToImportCount: 0,
      rows: [],
      availableClasses: [],
      fileError: "Workbook has no sheets."
    };
  }

  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  // Get raw 2D array to inspect headers safely
  const matrix = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false });

  const defaultMissing = expectedType === "STUDENT_PARENT" 
    ? EXPECTED_STUDENT_PARENT_HEADERS 
    : (expectedType === "TEACHER" ? EXPECTED_TEACHER_HEADERS : EXPECTED_ADMIN_HEADERS);

  if (!matrix || matrix.length === 0) {
    return {
      isValidWorkbook: false,
      detectedTemplate: "UNKNOWN",
      headersFound: [],
      missingHeaders: defaultMissing,
      unexpectedHeaders: [],
      totalRows: 0,
      validRowsCount: 0,
      errorRowsCount: 0,
      duplicateRowsCount: 0,
      conflictRowsCount: 0,
      sampleRowsCount: 0,
      readyToImportCount: 0,
      rows: [],
      availableClasses: [],
      fileError: "Spreadsheet is completely empty."
    };
  }

  // Row 0 is headers
  const headerRow = (matrix[0] || []).map(h => String(h || "").trim()).filter(Boolean);
  const normalizedFound = headerRow.map(normalizeHeader);

  // Detect which template headers are present
  const isStudentTemplate = 
    normalizedFound.includes("studentrollno") || 
    normalizedFound.includes("admissionno") || 
    normalizedFound.includes("parentemail") ||
    normalizedFound.includes("studentfirstname") ||
    normalizedFound.includes("residencetype");

  const hasTeacherSpecifics = 
    normalizedFound.includes("qualification") ||
    normalizedFound.includes("classteacher") ||
    normalizedFound.includes("subjects") ||
    normalizedFound.includes("subject") ||
    normalizedFound.includes("teachername") ||
    normalizedFound.includes("joiningdate");

  const isTeacherTemplate = !isStudentTemplate && (
    hasTeacherSpecifics || 
    (expectedType === "TEACHER" && (normalizedFound.includes("userid") || normalizedFound.includes("signinwithgooglemailid")))
  );

  const isAdminTemplate = !isStudentTemplate && !isTeacherTemplate && 
    (normalizedFound.includes("email") || normalizedFound.includes("gmail") || normalizedFound.includes("adminemail")) && 
    (normalizedFound.includes("name") || normalizedFound.includes("adminname") || normalizedFound.includes("fullname") || normalizedFound.includes("firstname"));

  const detectedTemplate: "STUDENT_PARENT" | "TEACHER" | "ADMIN" | "UNKNOWN" = 
    isStudentTemplate ? "STUDENT_PARENT" : (isTeacherTemplate ? "TEACHER" : (isAdminTemplate ? "ADMIN" : "UNKNOWN"));

  // Validate template match
  if (expectedType === "STUDENT_PARENT" && detectedTemplate !== "STUDENT_PARENT" && detectedTemplate !== "UNKNOWN") {
    return {
      isValidWorkbook: false,
      detectedTemplate,
      isTemplateMismatch: true,
      headersFound: headerRow,
      missingHeaders: EXPECTED_STUDENT_PARENT_HEADERS,
      unexpectedHeaders: headerRow,
      totalRows: matrix.length - 1,
      validRowsCount: 0,
      errorRowsCount: 0,
      duplicateRowsCount: 0,
      conflictRowsCount: 0,
      sampleRowsCount: 0,
      readyToImportCount: 0,
      rows: [],
      availableClasses: [],
      fileError: `Template mismatch: Uploaded file contains ${detectedTemplate === "TEACHER" ? "Teacher" : "Admin"} data, but this upload is for Student & Parent accounts. Please use the Student-Parent template.`
    };
  }

  if (expectedType === "TEACHER" && detectedTemplate !== "TEACHER" && detectedTemplate !== "UNKNOWN") {
    return {
      isValidWorkbook: false,
      detectedTemplate,
      isTemplateMismatch: true,
      headersFound: headerRow,
      missingHeaders: EXPECTED_TEACHER_HEADERS,
      unexpectedHeaders: headerRow,
      totalRows: matrix.length - 1,
      validRowsCount: 0,
      errorRowsCount: 0,
      duplicateRowsCount: 0,
      conflictRowsCount: 0,
      sampleRowsCount: 0,
      readyToImportCount: 0,
      rows: [],
      availableClasses: [],
      fileError: `Template mismatch: Uploaded file contains ${detectedTemplate === "STUDENT_PARENT" ? "Student & Parent" : "Admin"} data, but this upload is for Teacher accounts. Please use the Teacher template.`
    };
  }

  if (expectedType === "ADMIN" && detectedTemplate !== "ADMIN" && detectedTemplate !== "UNKNOWN") {
    return {
      isValidWorkbook: false,
      detectedTemplate,
      isTemplateMismatch: true,
      headersFound: headerRow,
      missingHeaders: EXPECTED_ADMIN_HEADERS,
      unexpectedHeaders: headerRow,
      totalRows: matrix.length - 1,
      validRowsCount: 0,
      errorRowsCount: 0,
      duplicateRowsCount: 0,
      conflictRowsCount: 0,
      sampleRowsCount: 0,
      readyToImportCount: 0,
      rows: [],
      availableClasses: [],
      fileError: `Template mismatch: Uploaded file contains ${detectedTemplate === "STUDENT_PARENT" ? "Student & Parent" : "Teacher"} data, but this upload is for Admin accounts. Please use the Admin template.`
    };
  }

  // Check expected headers with intelligent flexibility
  const missingHeaders: string[] = [];

  if (expectedType === "TEACHER") {
    // 1. Name: either (firstName & lastName) OR fullName OR name OR teacherName
    const hasName = (normalizedFound.includes("firstname") && normalizedFound.includes("lastname")) ||
      normalizedFound.includes("fullname") ||
      normalizedFound.includes("name") ||
      normalizedFound.includes("teachername");
    if (!hasName) {
      missingHeaders.push("Full Name (or First Name & Last Name)");
    }

    // 2. Email / User ID
    const hasEmail = normalizedFound.includes("email") ||
      normalizedFound.includes("userid") ||
      normalizedFound.includes("username") ||
      normalizedFound.includes("signinwithgooglemailid") ||
      normalizedFound.includes("googlemailid") ||
      normalizedFound.includes("googleemail") ||
      normalizedFound.includes("useremail");
    if (!hasEmail) {
      missingHeaders.push("User ID / Email");
    }

    // If it's the standard official template with firstName, check standard headers
    if (normalizedFound.includes("firstname")) {
      for (const expected of EXPECTED_TEACHER_HEADERS) {
        if (expected === "firstName" || expected === "lastName" || expected === "email") continue;
        if (expected === "joiningDate") continue; // optional in modern imports
        const norm = normalizeHeader(expected);
        if (!normalizedFound.includes(norm)) {
          if (expected === "qualification" && (normalizedFound.includes("degree") || normalizedFound.includes("qual"))) continue;
          if (expected === "phone" && (normalizedFound.includes("mobile") || normalizedFound.includes("contact"))) continue;
          missingHeaders.push(expected);
        }
      }
    }
  } else if (expectedType === "STUDENT_PARENT") {
    for (const expected of EXPECTED_STUDENT_PARENT_HEADERS) {
      const norm = normalizeHeader(expected);
      if (!normalizedFound.includes(norm)) {
        // Allow flexible aliases
        if (expected === "studentFirstName" && (normalizedFound.includes("studentfullname") || normalizedFound.includes("studentname") || normalizedFound.includes("fullname"))) continue;
        if (expected === "studentLastName" && (normalizedFound.includes("studentfullname") || normalizedFound.includes("studentname") || normalizedFound.includes("fullname"))) continue;
        if (expected === "studentRollNo" && (normalizedFound.includes("rollnumber") || normalizedFound.includes("rollno") || normalizedFound.includes("roll"))) continue;
        if (expected === "parentEmail" && normalizedFound.includes("email")) continue;
        if (expected === "parentFirstName" && (normalizedFound.includes("parentname") || normalizedFound.includes("parentfullname"))) continue;
        if (expected === "parentLastName" && (normalizedFound.includes("parentname") || normalizedFound.includes("parentfullname"))) continue;
        missingHeaders.push(expected);
      }
    }
  } else {
    for (const expected of EXPECTED_ADMIN_HEADERS) {
      const norm = normalizeHeader(expected);
      if (!normalizedFound.includes(norm)) {
        if (expected === "name" && (normalizedFound.includes("fullname") || normalizedFound.includes("adminname"))) continue;
        if (expected === "email" && (normalizedFound.includes("adminemail") || normalizedFound.includes("gmail") || normalizedFound.includes("googleemail") || normalizedFound.includes("signinwithgooglemailid"))) continue;
        missingHeaders.push(expected);
      }
    }
  }

  if (missingHeaders.length > 0) {
    return {
      isValidWorkbook: false,
      detectedTemplate,
      headersFound: headerRow,
      missingHeaders,
      unexpectedHeaders: [],
      totalRows: matrix.length - 1,
      validRowsCount: 0,
      errorRowsCount: 0,
      duplicateRowsCount: 0,
      conflictRowsCount: 0,
      sampleRowsCount: 0,
      readyToImportCount: 0,
      rows: [],
      availableClasses: [],
      fileError: `Missing required template columns: ${missingHeaders.join(", ")}. Please ensure you are using the official Excel template.`
    };
  }

  // Fetch available classes from database
  const availableClasses = await prisma.class.findMany({
    where: { isActive: true },
    select: { id: true, name: true, section: true },
    orderBy: [{ name: "asc" }, { section: "asc" }]
  });

  // Convert sheet to json rows with row mapping
  const rawObjects = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

  if (rawObjects.length === 0) {
    return {
      isValidWorkbook: true,
      detectedTemplate,
      headersFound: headerRow,
      missingHeaders: [],
      unexpectedHeaders: [],
      totalRows: 0,
      validRowsCount: 0,
      errorRowsCount: 0,
      duplicateRowsCount: 0,
      conflictRowsCount: 0,
      sampleRowsCount: 0,
      readyToImportCount: 0,
      rows: [],
      availableClasses,
      fileError: "Workbook contains headers but no data rows."
    };
  }

  // Parse raw rows into structured data with excelRowNumber (row 1 is header, data starts row 2)
  const normalizedRows: Record<string, any>[] = rawObjects.map((raw, idx) => {
    const norm: Record<string, any> = {};
    for (const [k, v] of Object.entries(raw)) {
      norm[normalizeHeader(k)] = v;
    }
    const excelRowNumber = idx + 2;

    if (expectedType === "STUDENT_PARENT") {
      const studentFirstName = String(norm.studentfirstname || "").trim();
      const studentLastName = String(norm.studentlastname || "").trim();
      const studentRollNo = String(norm.studentrollno || "").trim();
      const rawAdm = String(norm.admissionno || "").trim();
      const admissionNo = rawAdm || (studentRollNo ? `ADM${studentRollNo}` : "");
      const rawDob = norm.studentdob;
      const rawClass = String(norm.class || norm.classname || norm.section || "").trim();
      const rawResidence = String(norm.residencetype || "DAYSCHOLAR").trim();
      
      const parentFirstName = String(norm.parentfirstname || "").trim();
      const parentLastName = String(norm.parentlastname || "").trim();
      const parentEmail = String(norm.parentemail || "").trim().toLowerCase();
      const parentPassword = String(norm.parentpassword || "Parent@123").trim();
      const parentPhone = String(norm.parentphone || "").trim();
      const parentAddress = String(norm.parentaddress || "").trim();

      const matchedClass = resolveClass(rawClass, availableClasses);

      return {
        excelRowNumber,
        studentFirstName,
        studentLastName,
        studentRollNo,
        admissionNo,
        studentDob: rawDob,
        class: rawClass,
        classId: matchedClass?.id || "",
        classNameResolved: matchedClass ? `${matchedClass.name} - ${matchedClass.section}` : "",
        residenceType: rawResidence,
        parentFirstName,
        parentLastName,
        parentEmail,
        parentPassword,
        parentPhone,
        parentAddress
      };
    } else if (expectedType === "TEACHER") {
      let firstName = String(norm.firstname || "").trim();
      let lastName = String(norm.lastname || "").trim();
      const rawFullName = String(norm.fullname || norm.name || norm.teachername || "").trim();

      if ((!firstName || !lastName) && rawFullName) {
        const parts = rawFullName.split(/\s+/).filter(Boolean);
        if (parts.length === 1) {
          firstName = parts[0];
          lastName = ".";
        } else {
          firstName = parts[0];
          lastName = parts.slice(1).join(" ");
        }
      }

      const email = String(
        norm.email || 
        norm.userid || 
        norm.username || 
        norm.signinwithgooglemailid || 
        norm.googlemailid || 
        norm.googleemail || 
        norm.useremail || 
        ""
      ).trim().toLowerCase();

      const googleEmail = String(
        norm.signinwithgooglemailid || 
        norm.googlemailid || 
        norm.googleemail || 
        (email.endsWith("@gmail.com") || email.endsWith("@googlemail.com") ? email : "")
      ).trim().toLowerCase();

      const rawPassword = norm.password !== undefined && norm.password !== null ? String(norm.password).trim() : "";
      const password = rawPassword;
      const phone = String(norm.phone || norm.phonenumber || norm.mobile || norm.contact || norm.contactno || "").trim();
      const joiningDate = norm.joiningdate || new Date().toISOString().split("T")[0];
      const qualification = String(norm.qualification || norm.degree || norm.qual || "").trim();
      const gender = String(norm.gender || norm.sex || "").trim();
      const subjects = String(norm.subjects || norm.subject || "").trim();

      const rawClassTeacher = String(norm.classteacher || norm.classteacherof || norm.assignedclass || norm.class || "").trim();
      const matchedClass = resolveClass(rawClassTeacher, availableClasses);

      return {
        excelRowNumber,
        firstName,
        lastName,
        fullName: rawFullName || (firstName ? `${firstName} ${lastName || ""}`.trim() : ""),
        email,
        googleEmail,
        password,
        phone,
        joiningDate,
        qualification,
        gender,
        subjects,
        classTeacherRaw: rawClassTeacher,
        classTeacherClassId: matchedClass?.id || "",
        classTeacherClassName: matchedClass ? `${matchedClass.name} - ${matchedClass.section}` : rawClassTeacher
      };
    } else {
      // ADMIN
      const name = String(norm.name || norm.fullname || norm.adminname || `${norm.firstname || ""} ${norm.lastname || ""}`).trim();
      const email = String(norm.email || norm.gmail || norm.googleemail || "").trim().toLowerCase();

      return {
        excelRowNumber,
        name,
        email
      };
    }
  });

  // Perform full validation and DB conflict check
  return await validateAndCorrelateBatch(expectedType, normalizedRows, availableClasses, headerRow);
}

// ==========================================
// BATCH VALIDATION & DB CONFLICT CORRELATION
// ==========================================

export async function validateAndCorrelateBatch(
  type: ImportType,
  rows: Record<string, any>[],
  classes: { id: string; name: string; section: string }[],
  headersFound: string[] = []
): Promise<ExcelScanResult> {
  // Pre-query database for conflicts in bulk
  const existingRolls = new Set<string>();
  const existingAdmissions = new Set<string>();
  const existingUsersByEmail = new Map<string, { id: string; role: string; name: string }>();

  if (type === "STUDENT_PARENT") {
    const rollsToCheck = rows.map(r => String(r.studentRollNo || "").trim()).filter(Boolean);
    const admissionsToCheck = rows.map(r => String(r.admissionNo || "").trim()).filter(Boolean);
    const emailsToCheck = rows.map(r => String(r.parentEmail || "").trim().toLowerCase()).filter(Boolean);

    const [foundStudents, foundUsers] = await Promise.all([
      prisma.student.findMany({
        where: {
          OR: [
            { rollNumber: { in: rollsToCheck } },
            { admissionNo: { in: admissionsToCheck } }
          ]
        },
        select: { rollNumber: true, admissionNo: true }
      }),
      prisma.user.findMany({
        where: { email: { in: emailsToCheck } },
        select: { id: true, email: true, role: true, name: true }
      })
    ]);

    for (const s of foundStudents) {
      if (s.rollNumber) existingRolls.add(s.rollNumber.toLowerCase());
      if (s.admissionNo) existingAdmissions.add(s.admissionNo.toLowerCase());
    }

    for (const u of foundUsers) {
      existingUsersByEmail.set(u.email.toLowerCase(), u);
    }
  } else {
    const emailsToCheck = rows.map(r => String(r.email || "").trim().toLowerCase()).filter(Boolean);
    const foundUsers = await prisma.user.findMany({
      where: { email: { in: emailsToCheck } },
      select: { id: true, email: true, role: true, name: true }
    });

    for (const u of foundUsers) {
      existingUsersByEmail.set(u.email.toLowerCase(), u);
    }
  }

  // Track in-file duplicates
  const seenRolls = new Map<string, number>(); // roll -> first row number
  const seenAdmissions = new Map<string, number>(); // adm -> first row number
  const seenTeacherEmails = new Map<string, number>(); // email -> first row number
  const seenAdminEmails = new Map<string, number>(); // email -> first row number

  const results: RowValidationResult[] = [];
  let validCount = 0;
  let errorCount = 0;
  let duplicateCount = 0;
  let conflictCount = 0;
  let sampleCount = 0;
  let readyCount = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const excelRow = row.excelRowNumber || (i + 2);
    const rowId = `row-${excelRow}-${i}`;

    const fieldErrors: Record<string, string> = {};
    const missingFields: string[] = [];
    const invalidFields: string[] = [];
    const duplicateWarnings: string[] = [];
    const conflictWarnings: string[] = [];

    // Check if sample row
    const isSample = isSampleTemplateRow(type, row);
    if (isSample) {
      sampleCount++;
      results.push({
        rowId,
        excelRowNumber: excelRow,
        status: "SAMPLE_ROW",
        isReadyToImport: false,
        isSampleRow: true,
        fieldErrors: {},
        missingFields: [],
        invalidFields: [],
        duplicateWarnings: ["Sample template row (will be skipped during import)."],
        conflictWarnings: [],
        data: row
      });
      continue;
    }

    if (type === "STUDENT_PARENT") {
      // 1. Student First Name
      if (!row.studentFirstName || !String(row.studentFirstName).trim()) {
        fieldErrors.studentFirstName = "Student first name is required.";
        missingFields.push("studentFirstName");
      }

      // 2. Student Last Name
      if (!row.studentLastName || !String(row.studentLastName).trim()) {
        fieldErrors.studentLastName = "Student last name is required.";
        missingFields.push("studentLastName");
      }

      // 3. Roll Number
      const roll = String(row.studentRollNo || "").trim();
      if (!roll) {
        fieldErrors.studentRollNo = "Student roll number is required.";
        missingFields.push("studentRollNo");
      } else {
        // In-file duplicate check
        const rollLower = roll.toLowerCase();
        if (seenRolls.has(rollLower)) {
          const firstRow = seenRolls.get(rollLower);
          fieldErrors.studentRollNo = `Roll number '${roll}' is duplicated in row ${firstRow}.`;
          duplicateWarnings.push(`Duplicate roll number in row ${firstRow}.`);
        } else {
          seenRolls.set(rollLower, excelRow);
        }

        // DB conflict check
        if (existingRolls.has(rollLower)) {
          fieldErrors.studentRollNo = `Roll number '${roll}' already exists in database.`;
          conflictWarnings.push(`Student with roll number '${roll}' already exists in school records.`);
        }
      }

      // 4. Admission Number
      const adm = String(row.admissionNo || "").trim();
      if (!adm) {
        fieldErrors.admissionNo = "Admission number is required.";
        missingFields.push("admissionNo");
      } else {
        const admLower = adm.toLowerCase();
        if (seenAdmissions.has(admLower)) {
          const firstRow = seenAdmissions.get(admLower);
          fieldErrors.admissionNo = `Admission number '${adm}' is duplicated in row ${firstRow}.`;
          duplicateWarnings.push(`Duplicate admission number in row ${firstRow}.`);
        } else {
          seenAdmissions.set(admLower, excelRow);
        }

        if (existingAdmissions.has(admLower)) {
          fieldErrors.admissionNo = `Admission number '${adm}' already exists in database.`;
          conflictWarnings.push(`Student with admission number '${adm}' already exists in school records.`);
        }
      }

      // 5. Date of Birth
      const dobResult = parseDateSafe(row.studentDob);
      if (!dobResult.isValid) {
        fieldErrors.studentDob = "Invalid date of birth. Enter valid date (YYYY-MM-DD or DD/MM/YYYY).";
        invalidFields.push("studentDob");
      } else {
        row.studentDob = dobResult.isoDate;
      }

      // 6. Class resolution
      const rawClass = String(row.class || "").trim();
      const resolved = resolveClass(rawClass, classes);
      if (!resolved && classes.length > 0) {
        fieldErrors.class = rawClass 
          ? `Class '${rawClass}' not found in active classes.` 
          : "Class assignment is required.";
        invalidFields.push("class");
      } else if (resolved) {
        row.classId = resolved.id;
        row.classNameResolved = `${resolved.name} - ${resolved.section}`;
      }

      // 7. Residence Type
      const resRaw = String(row.residenceType || "").trim().toUpperCase();
      if (!resRaw) {
        fieldErrors.residenceType = "Residence type is required (DAYSCHOLAR or HOSTEL).";
        missingFields.push("residenceType");
      } else if (resRaw.includes("HOSTEL") && !resRaw.includes("DAYSCHOLAR") && !resRaw.includes("DAY")) {
        row.residenceType = "HOSTEL";
      } else if ((resRaw.includes("DAYSCHOLAR") || resRaw.includes("DAY")) && !resRaw.includes("HOSTEL")) {
        row.residenceType = "DAYSCHOLAR";
      } else if (resRaw.includes("HOSTEL") && (resRaw.includes("DAYSCHOLAR") || resRaw.includes("DAY"))) {
        // Template placeholder text "Dayscholar (or Hostel)" was left in the row
        fieldErrors.residenceType = "Unclear option: 'Dayscholar (or Hostel)'. Please update detail to Dayscholar or Hostel.";
        invalidFields.push("residenceType");
      } else {
        fieldErrors.residenceType = `Invalid residence type '${resRaw}'. Must be DAYSCHOLAR or HOSTEL.`;
        invalidFields.push("residenceType");
      }

      // 8. Parent First Name
      if (!row.parentFirstName || !String(row.parentFirstName).trim()) {
        fieldErrors.parentFirstName = "Parent first name is required.";
        missingFields.push("parentFirstName");
      }

      // 9. Parent Last Name
      if (!row.parentLastName || !String(row.parentLastName).trim()) {
        fieldErrors.parentLastName = "Parent last name is required.";
        missingFields.push("parentLastName");
      }

      // 10. Parent Email & Relationship Check
      const pEmail = String(row.parentEmail || "").trim().toLowerCase();
      if (!pEmail) {
        fieldErrors.parentEmail = "Parent email address is required.";
        missingFields.push("parentEmail");
      } else if (!isValidEmail(pEmail)) {
        fieldErrors.parentEmail = "Parent email format is invalid.";
        invalidFields.push("parentEmail");
      } else {
        // Check DB for existing user
        const existing = existingUsersByEmail.get(pEmail);
        if (existing) {
          if (existing.role === "PARENT") {
            // Valid reuse of existing parent account
            row.isExistingParent = true;
          } else {
            // Non-parent account role conflict
            fieldErrors.parentEmail = `Email '${pEmail}' is already registered as a ${existing.role} account.`;
            conflictWarnings.push(`Email already in use by a ${existing.role} user.`);
          }
        }
      }

      // 11. Parent Phone
      if (row.parentPhone && !isValidPhone(String(row.parentPhone).trim())) {
        fieldErrors.parentPhone = "Invalid phone number format (must contain 7-15 digits).";
        invalidFields.push("parentPhone");
      }

    } else if (type === "TEACHER") {
      // TEACHER VALIDATION
      // 1. First Name
      if (!row.firstName || !String(row.firstName).trim()) {
        fieldErrors.firstName = "Teacher first name is required.";
        missingFields.push("firstName");
      }

      // 2. Last Name
      if (!row.lastName || !String(row.lastName).trim()) {
        row.lastName = ".";
      }

      // 3. User ID / Email
      const email = String(row.email || "").trim().toLowerCase();
      if (!email) {
        fieldErrors.email = "User ID / Email address is required.";
        missingFields.push("email");
      } else if (!isValidEmail(email)) {
        fieldErrors.email = "User ID / Email address is invalid.";
        invalidFields.push("email");
      } else {
        // In-file duplicate check
        if (seenTeacherEmails.has(email)) {
          const firstRow = seenTeacherEmails.get(email);
          fieldErrors.email = `Teacher email '${email}' is duplicated in row ${firstRow}.`;
          duplicateWarnings.push(`Duplicate teacher email in row ${firstRow}.`);
        } else {
          seenTeacherEmails.set(email, excelRow);
        }

        // DB conflict check
        if (existingUsersByEmail.has(email)) {
          const existing = existingUsersByEmail.get(email);
          fieldErrors.email = `Email '${email}' already exists in database (${existing?.role} account).`;
          conflictWarnings.push(`Account with email '${email}' already exists in database.`);
        }
      }

      // 4. Password
      if (!row.password || !String(row.password).trim()) {
        fieldErrors.password = "Initial password is required.";
        missingFields.push("password");
      }

      // 5. Phone
      if (row.phone && !isValidPhone(String(row.phone).trim())) {
        fieldErrors.phone = "Invalid phone number format.";
        invalidFields.push("phone");
      }

      // 6. Joining Date
      if (row.joiningDate) {
        const joinResult = parseDateSafe(row.joiningDate);
        if (!joinResult.isValid) {
          fieldErrors.joiningDate = "Joining date is invalid. Enter valid date (YYYY-MM-DD or DD/MM/YYYY).";
          invalidFields.push("joiningDate");
        } else {
          row.joiningDate = joinResult.isoDate;
        }
      } else {
        row.joiningDate = new Date().toISOString().split("T")[0];
      }

      // 7. Qualification
      if (!row.qualification || !String(row.qualification).trim()) {
        fieldErrors.qualification = "Teacher qualification is required.";
        missingFields.push("qualification");
      }

      // 8. Class Teacher resolution if specified
      if (row.classTeacherRaw && !row.classTeacherClassId) {
        const resClass = resolveClass(row.classTeacherRaw, classes);
        if (resClass) {
          row.classTeacherClassId = resClass.id;
          row.classTeacherClassName = `${resClass.name} - ${resClass.section}`;
        }
      }
    } else {
      // ADMIN VALIDATION
      // 1. Full Name
      const adminName = String(row.name || "").trim();
      if (!adminName) {
        fieldErrors.name = "Admin full name is required.";
        missingFields.push("name");
      }

      // 2. Email (Must be valid Gmail address for Google OAuth)
      const email = String(row.email || "").trim().toLowerCase();
      if (!email) {
        fieldErrors.email = "Admin Gmail address is required.";
        missingFields.push("email");
      } else if (!isValidEmail(email)) {
        fieldErrors.email = "Admin email address is invalid.";
        invalidFields.push("email");
      } else if (!email.endsWith("@gmail.com") && !email.endsWith("@googlemail.com")) {
        fieldErrors.email = "Admin email must be a valid Gmail account ending in @gmail.com (required for Google OAuth).";
        invalidFields.push("email");
      } else {
        // In-file duplicate check
        if (seenAdminEmails.has(email)) {
          const firstRow = seenAdminEmails.get(email);
          fieldErrors.email = `Admin email '${email}' is duplicated in row ${firstRow}.`;
          duplicateWarnings.push(`Duplicate admin email in row ${firstRow}.`);
        } else {
          seenAdminEmails.set(email, excelRow);
        }

        // DB conflict check
        if (existingUsersByEmail.has(email)) {
          const existing = existingUsersByEmail.get(email);
          fieldErrors.email = `Email '${email}' already exists in database (${existing?.role} account).`;
          conflictWarnings.push(`Account with email '${email}' already exists in database.`);
        }
      }
    }

    // Determine status
    let status: RowValidationStatus = "VALID";
    if (duplicateWarnings.length > 0) {
      status = "DUPLICATE_IN_FILE";
      duplicateCount++;
    } else if (conflictWarnings.length > 0) {
      status = "CONFLICT_DB";
      conflictCount++;
    } else if (missingFields.length > 0 || invalidFields.length > 0) {
      status = "NEEDS_CORRECTION";
      errorCount++;
    } else {
      validCount++;
    }

    const isReadyToImport = status === "VALID";
    if (isReadyToImport) readyCount++;

    results.push({
      rowId,
      excelRowNumber: excelRow,
      status,
      isReadyToImport,
      isSampleRow: false,
      fieldErrors,
      missingFields,
      invalidFields,
      duplicateWarnings,
      conflictWarnings,
      data: row
    });
  }

  return {
    isValidWorkbook: true,
    detectedTemplate: type,
    headersFound,
    missingHeaders: [],
    unexpectedHeaders: [],
    totalRows: rows.length,
    validRowsCount: validCount,
    errorRowsCount: errorCount,
    duplicateRowsCount: duplicateCount,
    conflictRowsCount: conflictCount,
    sampleRowsCount: sampleCount,
    readyToImportCount: readyCount,
    rows: results,
    availableClasses: classes
  };
}

// ==========================================
// CSV ERROR REPORT GENERATOR (WITH FORMULA INJECTION DEFENSE)
// ==========================================

export function generateErrorReportCsv(rows: RowValidationResult[]): string {
  const headers = ["Excel Row", "Status", "Identifier", "Name", "Problem Fields", "Errors & Warnings"];
  const lines: string[] = [];

  lines.push(headers.map(h => `"${sanitizeForSpreadsheet(h)}"`).join(","));

  for (const r of rows) {
    if (r.status === "VALID") continue; // only report issues

    const excelRow = r.excelRowNumber;
    const status = r.status;
    const identifier = r.data.studentRollNo || r.data.email || r.data.admissionNo || "N/A";
    const name = r.data.studentFirstName 
      ? `${r.data.studentFirstName} ${r.data.studentLastName || ""}`.trim()
      : (r.data.name || `${r.data.firstName || ""} ${r.data.lastName || ""}`.trim() || "N/A");

    const problemFields = [...r.missingFields, ...r.invalidFields].join("; ");
    const errorMessages = [
      ...Object.values(r.fieldErrors),
      ...r.duplicateWarnings,
      ...r.conflictWarnings
    ].join(" | ");

    const csvRow = [
      String(excelRow),
      status,
      identifier,
      name,
      problemFields,
      errorMessages
    ].map(val => `"${sanitizeForSpreadsheet(val).replace(/"/g, '""')}"`);

    lines.push(csvRow.join(","));
  }

  return lines.join("\r\n");
}

// ==========================================
// SAFE DATABASE TRANSACTION IMPORT EXECUTION
// ==========================================

export async function executeImportTransaction(
  type: ImportType,
  rowsToImport: Record<string, any>[],
  admin: { id?: string; email?: string },
  fileName: string = "uploaded_file.xlsx",
  fileSize: number = 0
): Promise<ImportCommitResult> {
  const result: ImportCommitResult = {
    success: false,
    totalProcessed: rowsToImport.length,
    importedCount: 0,
    skippedCount: 0,
    failedCount: 0,
    errors: [],
    createdAccounts: []
  };

  // Create initial ImportBatch log
  const batch = await prisma.importBatch.create({
    data: {
      templateType: type,
      fileName,
      fileSize,
      adminId: admin.id || null,
      adminEmail: admin.email || null,
      totalRows: rowsToImport.length,
      status: "PROCESSING"
    }
  });

  result.batchId = batch.id;

  // Execute row imports in database transaction
  try {
    for (const row of rowsToImport) {
      const excelRow = row.excelRowNumber || "N/A";

      // Skip sample rows defensively
      if (isSampleTemplateRow(type, row)) {
        result.skippedCount++;
        continue;
      }

      try {
        if (type === "STUDENT_PARENT") {
          const {
            studentFirstName,
            studentLastName,
            studentRollNo,
            admissionNo,
            studentDob,
            classId,
            residenceType,
            parentFirstName,
            parentLastName,
            parentEmail,
            parentPassword,
            parentPhone,
            parentAddress
          } = row;

          // Wrap single student+parent pair in atomic transaction
          await prisma.$transaction(async (tx) => {
            // Check student uniqueness
            const rollStr = String(studentRollNo).trim();
            const admStr = String(admissionNo || `ADM${rollStr}`).trim();

            const existingStudent = await tx.student.findFirst({
              where: {
                OR: [
                  { rollNumber: rollStr },
                  { admissionNo: admStr }
                ]
              }
            });

            if (existingStudent) {
              throw new Error(`Student with Roll '${rollStr}' or Admission '${admStr}' already exists.`);
            }

            // Handle parent
            const cleanParentEmail = String(parentEmail).trim().toLowerCase();
            let parentUser = await tx.user.findUnique({
              where: { email: cleanParentEmail },
              include: { parent: true }
            });

            let parentId: string;

            if (!parentUser) {
              // Create new Parent user account
              const hashedPass = await hash(String(parentPassword || "Parent@123"), 10);
              const fullName = `${parentFirstName} ${parentLastName || ""}`.trim();

              parentUser = await tx.user.create({
                data: {
                  email: cleanParentEmail,
                  name: fullName,
                  password: hashedPass,
                  role: "PARENT",
                  status: "ACTIVE",
                  parent: {
                    create: {
                      phone: parentPhone ? String(parentPhone).trim() : null,
                      occupation: null
                    }
                  }
                },
                include: { parent: true }
              });

              parentId = parentUser.parent!.id;
              result.createdAccounts.push({
                role: "PARENT",
                identifier: cleanParentEmail,
                name: fullName
              });
            } else {
              if (parentUser.role !== "PARENT") {
                throw new Error(`User with email '${cleanParentEmail}' exists but has role '${parentUser.role}'.`);
              }

              if (!parentUser.parent) {
                const newParent = await tx.parent.create({
                  data: {
                    userId: parentUser.id,
                    phone: parentPhone ? String(parentPhone).trim() : null
                  }
                });
                parentId = newParent.id;
              } else {
                parentId = parentUser.parent.id;
              }
            }

            // Create Student
            const dobDate = studentDob ? new Date(studentDob) : null;
            const resType = residenceType === "HOSTEL" ? "HOSTEL" : "DAYSCHOLAR";
            const studentFullName = `${studentFirstName} ${studentLastName || ""}`.trim();

            const createdStudent = await tx.student.create({
              data: {
                firstName: String(studentFirstName).trim(),
                lastName: String(studentLastName || ".").trim(),
                rollNumber: rollStr,
                admissionNo: admStr,
                dateOfBirth: dobDate,
                residenceType: resType,
                address: parentAddress ? String(parentAddress).trim() : null,
                classId: classId || null,
                isActive: true,
                parents: {
                  create: {
                    parentId
                  }
                }
              }
            });

            result.createdAccounts.push({
              role: "STUDENT",
              identifier: rollStr,
              name: studentFullName
            });

            result.importedCount++;
          });

        } else if (type === "TEACHER") {
          // TEACHER IMPORT
          const {
            firstName,
            lastName,
            email,
            googleEmail,
            password,
            phone,
            joiningDate,
            qualification,
            classTeacherClassId,
            classTeacherRaw
          } = row;

          await prisma.$transaction(async (tx) => {
            const cleanEmail = String(email).trim().toLowerCase();
            const existing = await tx.user.findUnique({
              where: { email: cleanEmail }
            });

            if (existing) {
              throw new Error(`Email '${cleanEmail}' is already registered in the system.`);
            }

            const cleanGoogleEmail = googleEmail 
              ? String(googleEmail).trim().toLowerCase() 
              : (cleanEmail.endsWith("@gmail.com") || cleanEmail.endsWith("@googlemail.com") ? cleanEmail : null);

            const hashedPass = await hash(String(password || "Teacher@123").trim(), 10);
            const teacherFullName = `${firstName} ${lastName || ""}`.trim();
            const joinDate = joiningDate ? new Date(joiningDate) : new Date();

            const rawSubjects = row.subjects;
            let matchedSubjectIds: string[] = [];
            if (rawSubjects) {
              const tokens = String(rawSubjects)
                .split(',')
                .map(s => s.trim().toLowerCase())
                .filter(Boolean);
              if (tokens.length > 0) {
                const dbSubjects = await tx.subject.findMany({
                  select: { id: true, name: true, code: true }
                });
                matchedSubjectIds = dbSubjects
                  .filter(s => tokens.includes(s.name.toLowerCase()) || tokens.includes(s.code.toLowerCase()))
                  .map(s => s.id);
              }
            }

            const createdUser = await tx.user.create({
              data: {
                email: cleanEmail,
                name: teacherFullName,
                password: hashedPass,
                role: "TEACHER",
                status: "ACTIVE",
                googleEmail: cleanGoogleEmail,
                googleEmailVerified: Boolean(cleanGoogleEmail),
                teacher: {
                  create: {
                    phone: phone ? String(phone).trim() : null,
                    qualification: qualification ? String(qualification).trim() : null,
                    joinDate,
                    isActive: true,
                    ...(matchedSubjectIds.length > 0 ? {
                      subjects: {
                        connect: matchedSubjectIds.map(id => ({ id }))
                      }
                    } : {})
                  }
                }
              },
              include: { teacher: true }
            });

            const teacherId = createdUser.teacher?.id;

            // Handle Class Teacher Assignment
            let targetClassId = classTeacherClassId;
            if (!targetClassId && classTeacherRaw) {
              const allDbClasses = await tx.class.findMany({
                where: { isActive: true },
                select: { id: true, name: true, section: true }
              });
              const resolved = resolveClass(classTeacherRaw, allDbClasses);
              if (resolved) targetClassId = resolved.id;
            }

            if (targetClassId && teacherId) {
              // Ensure this teacher is not left as classTeacher on an older class
              await tx.class.updateMany({
                where: { classTeacherId: teacherId },
                data: { classTeacherId: null }
              });

              // Assign teacher as classTeacher and teacher of the class
              await tx.class.update({
                where: { id: targetClassId },
                data: {
                  classTeacherId: teacherId,
                  teacherId: teacherId
                }
              });

              // Auto-associate or create subjects for this class if specified
              if (rawSubjects) {
                const subjectTokens = String(rawSubjects)
                  .split(',')
                  .map(s => s.trim())
                  .filter(Boolean);

                for (const subName of subjectTokens) {
                  const existingForClass = await tx.subject.findFirst({
                    where: {
                      classId: targetClassId,
                      name: { equals: subName, mode: "insensitive" }
                    }
                  });

                  if (existingForClass) {
                    await tx.subject.update({
                      where: { id: existingForClass.id },
                      data: { teacherId }
                    });
                  } else {
                    const cleanCode = subName.replace(/[^a-zA-Z0-9]/g, "").slice(0, 4).toUpperCase() || "SUB";
                    const code = `${cleanCode}001`;
                    await tx.subject.create({
                      data: {
                        name: subName.toUpperCase(),
                        code,
                        classId: targetClassId,
                        teacherId
                      }
                    });
                  }
                }
              }
            }

            result.createdAccounts.push({
              role: "TEACHER",
              identifier: cleanEmail,
              name: teacherFullName
            });

            result.importedCount++;
          });
        } else {
          // ADMIN IMPORT
          const { name, email } = row;

          await prisma.$transaction(async (tx) => {
            const cleanEmail = String(email).trim().toLowerCase();
            const existing = await tx.user.findUnique({
              where: { email: cleanEmail }
            });

            if (existing) {
              throw new Error(`Email '${cleanEmail}' is already registered in the system (${existing.role} account).`);
            }

            const adminFullName = String(name).trim();

            await tx.user.create({
              data: {
                email: cleanEmail,
                name: adminFullName,
                role: "ADMIN",
                status: "ACTIVE",
                googleEmail: cleanEmail,
                googleEmailVerified: true
              }
            });

            result.createdAccounts.push({
              role: "ADMIN",
              identifier: cleanEmail,
              name: adminFullName
            });

            result.importedCount++;
          });
        }
      } catch (rowErr) {
        result.failedCount++;
        const errMsg = `Row ${excelRow}: ${rowErr instanceof Error ? rowErr.message : String(rowErr)}`;
        result.errors.push(errMsg);
      }
    }

    result.success = result.failedCount === 0 && result.importedCount > 0;

    // Update ImportBatch record
    await prisma.importBatch.update({
      where: { id: batch.id },
      data: {
        importedRows: result.importedCount,
        failedRows: result.failedCount,
        skippedRows: result.skippedCount,
        validRows: rowsToImport.length,
        status: result.failedCount === 0 ? "COMPLETED" : (result.importedCount > 0 ? "PARTIAL" : "FAILED"),
        errorSummary: result.errors.length > 0 ? JSON.stringify(result.errors.slice(0, 100)) : null,
        completedAt: new Date()
      }
    });

  } catch (fatalErr) {
    result.success = false;
    result.errors.push(`Fatal batch error: ${fatalErr instanceof Error ? fatalErr.message : String(fatalErr)}`);

    await prisma.importBatch.update({
      where: { id: batch.id },
      data: {
        status: "FAILED",
        errorSummary: JSON.stringify(result.errors),
        completedAt: new Date()
      }
    });
  }

  return result;
}
