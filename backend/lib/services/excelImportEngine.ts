import * as XLSX from "xlsx";
import { prisma } from "@/backend/db/prisma";
import { hash } from "bcryptjs";

// ==========================================
// TYPE DEFINITIONS
// ==========================================

export type ImportType = "STUDENT_PARENT" | "TEACHER";

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
  email: string;
  password?: string;
  phone?: string;
  joiningDate?: string;
  qualification: string;
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
  detectedTemplate: "STUDENT_PARENT" | "TEACHER" | "UNKNOWN";
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
    role: "STUDENT" | "PARENT" | "TEACHER";
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
    const residence = String(row.residenceType || "").toLowerCase();

    if (
      (sName.includes("jimmy doe") || pEmail.includes("parent@example.com")) &&
      (roll === "101" || adm === "ADM101")
    ) {
      return true;
    }
    if (residence.includes("(or hostel)") || residence.includes("dayscholar (or")) {
      return true;
    }
  } else {
    const tName = `${row.firstName || ""} ${row.lastName || ""}`.toLowerCase();
    const email = String(row.email || "").toLowerCase();
    if (
      (tName.includes("john doe") || email.includes("john.teacher@example.com") || email.includes("@example.com")) &&
      String(row.phone || "").includes("9876543210")
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

  return classes.find(c => {
    const idMatch = c.id.toLowerCase() === target;
    const nameSection = `${c.name} - ${c.section}`.toLowerCase();
    const nameSectionNoHyphen = `${c.name} ${c.section}`.toLowerCase();
    const sectionName = `${c.name} - section ${c.section}`.toLowerCase();
    return idMatch || nameSection === target || nameSectionNoHyphen === target || sectionName === target || c.name.toLowerCase() === target;
  }) || null;
}

// ==========================================
// CORE SCANNING & VALIDATION
// ==========================================

export async function parseAndScanWorkbook(
  buffer: Buffer | ArrayBuffer,
  expectedType: ImportType
): Promise<ExcelScanResult> {
  // Safe parsing
  let workbook: XLSX.WorkBook;
  try {
    const uint8 = buffer instanceof Buffer ? buffer : new Uint8Array(buffer);
    workbook = XLSX.read(uint8, { type: "buffer", cellDates: true, cellNF: false, cellText: true });
  } catch (err) {
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
      fileError: `Malformed Excel workbook: ${err instanceof Error ? err.message : String(err)}`
    };
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

  if (!matrix || matrix.length === 0) {
    return {
      isValidWorkbook: false,
      detectedTemplate: "UNKNOWN",
      headersFound: [],
      missingHeaders: expectedType === "STUDENT_PARENT" ? EXPECTED_STUDENT_PARENT_HEADERS : EXPECTED_TEACHER_HEADERS,
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
      fileError: "Excel sheet is completely empty."
    };
  }

  // Row 0 is headers
  const headerRow = (matrix[0] || []).map(h => String(h || "").trim()).filter(Boolean);
  const normalizedFound = headerRow.map(normalizeHeader);

  // Detect which template headers are present
  const isTeacherTemplate = normalizedFound.includes("qualification") || (normalizedFound.includes("joiningdate") && !normalizedFound.includes("studentrollno"));
  const isStudentTemplate = normalizedFound.includes("studentrollno") || normalizedFound.includes("admissionno") || normalizedFound.includes("parentemail");

  const detectedTemplate: "STUDENT_PARENT" | "TEACHER" | "UNKNOWN" = 
    isStudentTemplate ? "STUDENT_PARENT" : (isTeacherTemplate ? "TEACHER" : "UNKNOWN");

  // Validate template match
  if (expectedType === "STUDENT_PARENT" && detectedTemplate === "TEACHER") {
    return {
      isValidWorkbook: false,
      detectedTemplate: "TEACHER",
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
      fileError: "Template mismatch: Uploaded file contains Teacher data, but this upload is for Student & Parent accounts. Please use the Student-Parent template."
    };
  }

  if (expectedType === "TEACHER" && detectedTemplate === "STUDENT_PARENT") {
    return {
      isValidWorkbook: false,
      detectedTemplate: "STUDENT_PARENT",
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
      fileError: "Template mismatch: Uploaded file contains Student & Parent data, but this upload is for Teacher accounts. Please use the Teacher template."
    };
  }

  // Check expected headers
  const expectedList = expectedType === "STUDENT_PARENT" ? EXPECTED_STUDENT_PARENT_HEADERS : EXPECTED_TEACHER_HEADERS;
  const missingHeaders: string[] = [];

  for (const expected of expectedList) {
    const norm = normalizeHeader(expected);
    if (!normalizedFound.includes(norm)) {
      missingHeaders.push(expected);
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
    } else {
      const firstName = String(norm.firstname || "").trim();
      const lastName = String(norm.lastname || "").trim();
      const email = String(norm.email || "").trim().toLowerCase();
      const password = String(norm.password || "").trim();
      const phone = String(norm.phone || "").trim();
      const joiningDate = norm.joiningdate;
      const qualification = String(norm.qualification || "").trim();

      return {
        excelRowNumber,
        firstName,
        lastName,
        email,
        password,
        phone,
        joiningDate,
        qualification
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
      } else if (resRaw.includes("HOSTEL")) {
        row.residenceType = "HOSTEL";
      } else if (resRaw.includes("DAYSCHOLAR") || resRaw.includes("DAY")) {
        row.residenceType = "DAYSCHOLAR";
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

    } else {
      // TEACHER VALIDATION
      // 1. First Name
      if (!row.firstName || !String(row.firstName).trim()) {
        fieldErrors.firstName = "Teacher first name is required.";
        missingFields.push("firstName");
      }

      // 2. Last Name
      if (!row.lastName || !String(row.lastName).trim()) {
        fieldErrors.lastName = "Teacher last name is required.";
        missingFields.push("lastName");
      }

      // 3. Email
      const email = String(row.email || "").trim().toLowerCase();
      if (!email) {
        fieldErrors.email = "Official email address is required.";
        missingFields.push("email");
      } else if (!isValidEmail(email)) {
        fieldErrors.email = "Official email address is invalid.";
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
      } else if (String(row.password).trim().length < 6) {
        fieldErrors.password = "Password must be at least 6 characters long.";
        invalidFields.push("password");
      }

      // 5. Phone
      if (row.phone && !isValidPhone(String(row.phone).trim())) {
        fieldErrors.phone = "Invalid phone number format.";
        invalidFields.push("phone");
      }

      // 6. Joining Date
      const joinResult = parseDateSafe(row.joiningDate);
      if (!joinResult.isValid) {
        fieldErrors.joiningDate = "Joining date is invalid. Enter valid date (YYYY-MM-DD or DD/MM/YYYY).";
        invalidFields.push("joiningDate");
      } else {
        row.joiningDate = joinResult.isoDate;
      }

      // 7. Qualification
      if (!row.qualification || !String(row.qualification).trim()) {
        fieldErrors.qualification = "Teacher qualification is required.";
        missingFields.push("qualification");
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
      : `${r.data.firstName || ""} ${r.data.lastName || ""}`.trim() || "N/A";

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

        } else {
          // TEACHER IMPORT
          const {
            firstName,
            lastName,
            email,
            password,
            phone,
            joiningDate,
            qualification
          } = row;

          await prisma.$transaction(async (tx) => {
            const cleanEmail = String(email).trim().toLowerCase();
            const existing = await tx.user.findUnique({
              where: { email: cleanEmail }
            });

            if (existing) {
              throw new Error(`Email '${cleanEmail}' is already registered in the system.`);
            }

            const hashedPass = await hash(String(password).trim(), 10);
            const teacherFullName = `${firstName} ${lastName || ""}`.trim();
            const joinDate = joiningDate ? new Date(joiningDate) : new Date();

            await tx.user.create({
              data: {
                email: cleanEmail,
                name: teacherFullName,
                password: hashedPass,
                role: "TEACHER",
                status: "ACTIVE",
                teacher: {
                  create: {
                    phone: phone ? String(phone).trim() : null,
                    qualification: qualification ? String(qualification).trim() : null,
                    joinDate,
                    isActive: true
                  }
                }
              }
            });

            result.createdAccounts.push({
              role: "TEACHER",
              identifier: cleanEmail,
              name: teacherFullName
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
