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

// Flexible column value extractor that checks direct and partial header aliases
export function getNormalizedValue(normRow: Record<string, any>, candidateKeys: string[]): string {
  // 1. Direct match on normalized keys
  for (const cand of candidateKeys) {
    const val = normRow[cand];
    if (val !== undefined && val !== null && String(val).trim() !== "") {
      return String(val).trim();
    }
  }
  // 2. Substring match: the column header in the file contains the candidate keyword
  // E.g. header "fatherphonenumber" contains candidate "phone" or "mobile"
  // Require minimum 4 characters to prevent false substring collisions (e.g. "sid" in "residence")
  const allKeys = Object.keys(normRow);
  for (const cand of candidateKeys) {
    if (cand.length < 4) continue; // Minimum 4 characters for substring search
    for (const key of allKeys) {
      if (key.includes(cand)) {
        const val = normRow[key];
        if (val !== undefined && val !== null && String(val).trim() !== "") {
          return String(val).trim();
        }
      }
    }
  }
  return "";
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

  // If the parsed sheet has only 1 string cell with words and no delimiters, it's not a valid spreadsheet
  if (
    headerRow.length === 1 && 
    headerRow[0].split(/\s+/).length >= 4 && 
    !headerRow[0].includes(",") && 
    !headerRow[0].includes(";") &&
    !headerRow[0].includes("\t")
  ) {
    return {
      isValidWorkbook: false,
      detectedTemplate: "UNKNOWN",
      headersFound: headerRow,
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
      fileError: "File does not appear to be a valid spreadsheet or CSV file."
    };
  }

  // Check if unmistakable template mismatch across roles
  const hasTeacherColumns = normalizedFound.some(h => 
    h.includes("qualification") || h.includes("classteacher") || h.includes("subjects") || h.includes("joining")
  );
  const hasStudentColumns = normalizedFound.some(h =>
    h.includes("student") || h.includes("roll") || h.includes("parent") || h.includes("father") || h.includes("mother") || h.includes("child") || h.includes("pupil")
  );

  if (expectedType === "STUDENT_PARENT" && hasTeacherColumns && !hasStudentColumns) {
    return {
      isValidWorkbook: false,
      detectedTemplate: "TEACHER",
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
      fileError: "Template mismatch: Uploaded file contains Teacher data, but this upload is for Student & Parent accounts. Please use the Student-Parent template."
    };
  }

  if (expectedType === "TEACHER" && hasStudentColumns && !hasTeacherColumns) {
    return {
      isValidWorkbook: false,
      detectedTemplate: "STUDENT_PARENT",
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
      fileError: "Template mismatch: Uploaded file contains Student data, but this upload is for Teacher accounts. Please use the Teacher template."
    };
  }

  const detectedTemplate: "STUDENT_PARENT" | "TEACHER" | "ADMIN" = expectedType;
  const missingHeaders: string[] = [];

  // Check if completely missing essential parent information when uploading student & parent data
  if (expectedType === "STUDENT_PARENT") {
    const hasParentInfo = normalizedFound.some(h => 
      h.includes("parent") || h.includes("father") || h.includes("mother") || h.includes("guardian") || 
      h.includes("phone") || h.includes("mobile") || h.includes("contact") || h.includes("email") || h.includes("mail")
    );
    if (!hasParentInfo) {
      missingHeaders.push("parentFirstName", "parentEmail");
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
        fileError: `Missing required parent columns: ${missingHeaders.join(", ")}. Please include parent name or contact details.`
      };
    }
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
      const hasSeparateParentNames = normalizedFound.some(h => h.includes("parentfirstname") || h.includes("parentname") || h.includes("fathername") || h.includes("mothername"));
      
      let studentFirstName = norm.studentfirstname || norm.studentfirst || "";
      let studentLastName = norm.studentlastname || norm.studentlast || "";
      if (!studentFirstName && !hasSeparateParentNames) {
        studentFirstName = norm.firstname || norm.first || "";
      }
      if (!studentLastName && !hasSeparateParentNames) {
        studentLastName = norm.lastname || norm.last || norm.surname || "";
      }
      
      const hasSeparateStudentNames = normalizedFound.some(h => h.includes("studentfirstname") || (!hasSeparateParentNames && (h.includes("firstname") || h === "first")));
      const rawStudentName = !hasSeparateStudentNames ? getNormalizedValue(norm, ["studentfullname", "studentname", "childname", "pupilname", "fullname", "name"]) : "";

      if ((!studentFirstName || !studentLastName) && rawStudentName) {
        const parts = rawStudentName.split(/\s+/).filter(Boolean);
        if (parts.length === 1) {
          studentFirstName = parts[0];
          studentLastName = studentLastName || ".";
        } else {
          studentFirstName = studentFirstName || parts[0];
          studentLastName = studentLastName || parts.slice(1).join(" ");
        }
      }
      if (studentFirstName && !studentLastName) {
        studentLastName = ".";
      }

      let studentRollNo = getNormalizedValue(norm, [
        "studentrollno", "rollnumber", "rollno", "roll", 
        "registerno", "regno", "registrationno", "registernumber", "registrationnumber", 
        "studentid", "studentidno", "idno", "serialno"
      ]);

      const rawAdm = getNormalizedValue(norm, [
        "admissionno", "admno", "admissionnumber", "admnumber", "admission", "adm", "applicationno", "appno"
      ]);

      // If roll number column was NOT in sheet at all, fallback to rawAdm or R<row>
      const hasRollInSheet = normalizedFound.some(h => h.includes("roll") || h.includes("reg") || h.includes("id") || h.includes("sno") || h.includes("slno"));
      if (!hasRollInSheet && !studentRollNo) {
        studentRollNo = rawAdm || `R${excelRowNumber}`;
      }
      const admissionNo = rawAdm || (studentRollNo ? `ADM${studentRollNo}` : `ADM${excelRowNumber}`);

      const rawDob = getNormalizedValue(norm, [
        "studentdob", "dob", "dateofbirth", "birthdate", "studentdateofbirth", "bday", "birthday"
      ]) || norm.studentdob;

      let rawClass = getNormalizedValue(norm, [
        "class", "classname", "standard", "std", "grade", "classsection", "classandsection", "division"
      ]);
      const rawSection = getNormalizedValue(norm, ["section", "sec"]);
      if (rawClass && rawSection && !rawClass.toLowerCase().includes(rawSection.toLowerCase())) {
        rawClass = `${rawClass} - ${rawSection}`;
      } else if (!rawClass && rawSection) {
        rawClass = rawSection;
      }

      let matchedClass = resolveClass(rawClass, availableClasses);
      if (!matchedClass && !rawClass && availableClasses.length === 1) {
        matchedClass = availableClasses[0];
      }

      const rawResVal = getNormalizedValue(norm, [
        "residencetype", "residence", "hostelordayscholar", "dayscholarorhostel", "accommodation", "hostel", "type"
      ]);
      // If residence was not in sheet at all, default to DAYSCHOLAR
      const rawResidence = rawResVal || "DAYSCHOLAR";

      let parentFirstName = norm.parentfirstname || norm.parentfirst || norm.fatherfirstname || norm.motherfirstname || "";
      let parentLastName = norm.parentlastname || norm.parentlast || norm.fatherlastname || norm.motherlastname || "";
      
      const hasSeparateParentCols = normalizedFound.some(h => h.includes("parentfirstname"));
      const rawParentName = !hasSeparateParentCols ? getNormalizedValue(norm, [
        "parentfullname", "parentname", "fathername", "father", "mothername", "mother", 
        "guardianname", "guardian", "parentsname", "fatherfullname", "motherfullname"
      ]) : "";

      if ((!parentFirstName || !parentLastName) && rawParentName) {
        const pParts = rawParentName.split(/\s+/).filter(Boolean);
        if (pParts.length === 1) {
          parentFirstName = pParts[0];
          parentLastName = parentLastName || ".";
        } else {
          parentFirstName = parentFirstName || pParts[0];
          parentLastName = parentLastName || pParts.slice(1).join(" ");
        }
      }
      if (parentFirstName && !parentLastName) {
        parentLastName = ".";
      }

      let parentEmail = getNormalizedValue(norm, [
        "parentemail", "parentmail", "parentmailid", "parentemailid", 
        "email", "mail", "mailid", "emailid", "gmail", "googleemail", "useremail", "userid"
      ]).toLowerCase();

      // Only auto-generate parent portal email if email column was NOT in the file at all
      const hasEmailInSheet = normalizedFound.some(h => h.includes("email") || h.includes("mail") || h.includes("userid"));
      if (!hasEmailInSheet && !parentEmail) {
        const cleanRoll = (studentRollNo || `s${excelRowNumber}`).replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
        parentEmail = `parent.${cleanRoll}@school.portal`;
      }

      const parentPassword = getNormalizedValue(norm, ["parentpassword", "password", "pwd", "pass"]) || "Parent@123";

      const parentPhone = getNormalizedValue(norm, [
        "parentphone", "parentmobile", "parentcontact", "parentcontactno", "parentphonenumber", 
        "phone", "mobile", "contact", "phoneno", "mobileno", "contactno", "cell", "whatsapp", "telephone"
      ]);

      const parentAddress = getNormalizedValue(norm, [
        "parentaddress", "address", "residentialaddress", "place", "city", "location", "addr"
      ]);

      return {
        excelRowNumber,
        studentFirstName,
        studentLastName,
        studentRollNo,
        admissionNo,
        studentDob: rawDob,
        class: rawClass,
        classId: matchedClass?.id || "",
        classNameResolved: matchedClass ? `${matchedClass.name} - ${matchedClass.section}` : rawClass,
        residenceType: rawResidence,
        parentFirstName,
        parentLastName,
        parentEmail,
        parentPassword,
        parentPhone,
        parentAddress
      };
    } else if (expectedType === "TEACHER") {
      let firstName = getNormalizedValue(norm, ["firstname", "first"]);
      let lastName = getNormalizedValue(norm, ["lastname", "last", "surname"]);
      const hasSeparateTeacherNames = normalizedFound.some(h => h.includes("firstname") || h === "first");
      const rawFullName = !hasSeparateTeacherNames ? getNormalizedValue(norm, ["fullname", "teachername", "staffname", "facultyname", "teacher"]) : "";

      if ((!firstName || !lastName) && rawFullName) {
        const parts = rawFullName.split(/\s+/).filter(Boolean);
        if (parts.length === 1) {
          firstName = parts[0];
          lastName = lastName || ".";
        } else {
          firstName = firstName || parts[0];
          lastName = lastName || parts.slice(1).join(" ");
        }
      }
      if (firstName && !lastName) {
        lastName = ".";
      }

      let email = getNormalizedValue(norm, [
        "email", "userid", "username", "signinwithgooglemailid", "googlemailid", "googleemail", "useremail", "mail", "mailid", "emailid", "gmail"
      ]).toLowerCase();

      const hasEmailInSheet = normalizedFound.some(h => h.includes("email") || h.includes("mail") || h.includes("userid") || h.includes("user"));
      if (!hasEmailInSheet && !email && firstName) {
        const cleanName = firstName.toLowerCase().replace(/[^a-z0-9]/g, "") || `teacher${excelRowNumber}`;
        email = `teacher.${cleanName}${excelRowNumber}@school.portal`;
      }

      const googleEmail = getNormalizedValue(norm, ["signinwithgooglemailid", "googlemailid", "googleemail"]).toLowerCase() || 
        (email.endsWith("@gmail.com") || email.endsWith("@googlemail.com") ? email : "");

      const hasPasswordInSheet = normalizedFound.some(h => h.includes("password") || h.includes("pass") || h.includes("pwd"));
      const password = getNormalizedValue(norm, ["password", "pwd", "pass"]) || (hasPasswordInSheet ? "" : "Teacher@123");

      const phone = getNormalizedValue(norm, ["phone", "phonenumber", "mobile", "contact", "contactno", "mobileno", "cell"]);
      const joiningDate = getNormalizedValue(norm, ["joiningdate", "doj", "dateofjoining", "join", "joining"]) || new Date().toISOString().split("T")[0];

      const hasQualInSheet = normalizedFound.some(h => h.includes("qualification") || h.includes("qual") || h.includes("degree") || h.includes("education"));
      const qualification = getNormalizedValue(norm, ["qualification", "degree", "qual", "education", "highestqualification"]) || (hasQualInSheet ? "" : "Teacher");
      const gender = getNormalizedValue(norm, ["gender", "sex"]);
      const subjects = getNormalizedValue(norm, ["subjects", "subject", "handledsubjects", "teaching", "department"]);

      const rawClassTeacher = getNormalizedValue(norm, ["classteacher", "classteacherof", "assignedclass", "class", "standard", "grade"]);
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
      const name = getNormalizedValue(norm, ["name", "adminname", "fullname", "firstname", "username", "admin"]) || `Admin ${excelRowNumber}`;
      const email = getNormalizedValue(norm, ["email", "adminemail", "gmail", "googleemail", "signinwithgooglemailid", "mail"]).toLowerCase();

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
        row.studentLastName = ".";
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

      // 4. Admission Number (Auto-generate ADM<roll> if not specified)
      let adm = String(row.admissionNo || "").trim();
      if (!adm) {
        adm = `ADM${roll || excelRow}`;
        row.admissionNo = adm;
      }

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

      // 5. Date of Birth (Optional in school records)
      if (row.studentDob && String(row.studentDob).trim()) {
        const dobResult = parseDateSafe(row.studentDob);
        if (!dobResult.isValid) {
          fieldErrors.studentDob = "Invalid date of birth. Enter valid date (YYYY-MM-DD or DD/MM/YYYY).";
          invalidFields.push("studentDob");
        } else {
          row.studentDob = dobResult.isoDate;
        }
      } else {
        row.studentDob = null;
      }

      // 6. Class resolution
      const rawClass = String(row.class || "").trim();
      let resolved = resolveClass(rawClass, classes);
      if (!resolved && classes.length === 1) {
        resolved = classes[0];
      }
      if (resolved) {
        row.classId = resolved.id;
        row.classNameResolved = `${resolved.name} - ${resolved.section}`;
      } else if (classes.length > 0) {
        fieldErrors.class = rawClass 
          ? `Class '${rawClass}' not found in active classes.` 
          : "Class assignment is required.";
        invalidFields.push("class");
      }

      // 7. Residence Type (Defaults to DAYSCHOLAR)
      const resRaw = String(row.residenceType || "").trim().toUpperCase();
      if (!resRaw || resRaw === "DAYSCHOLAR") {
        row.residenceType = "DAYSCHOLAR";
      } else if (resRaw === "HOSTEL" || (resRaw.includes("HOSTEL") && !resRaw.includes("DAY"))) {
        row.residenceType = "HOSTEL";
      } else if (resRaw.includes("HOSTEL") && resRaw.includes("DAY")) {
        fieldErrors.residenceType = "Unclear option: 'Dayscholar (or Hostel)'. Please update detail to Dayscholar or Hostel.";
        invalidFields.push("residenceType");
      } else if (resRaw.includes("DAY")) {
        row.residenceType = "DAYSCHOLAR";
      } else {
        fieldErrors.residenceType = `Invalid residence type '${resRaw}'. Must be DAYSCHOLAR or HOSTEL.`;
        invalidFields.push("residenceType");
      }

      // 8. Parent First Name & Last Name
      if (!row.parentFirstName || !String(row.parentFirstName).trim()) {
        fieldErrors.parentFirstName = "Parent first name is required.";
        missingFields.push("parentFirstName");
      }
      if (!row.parentLastName || !String(row.parentLastName).trim()) {
        row.parentLastName = ".";
      }

      // 9. Parent Email & Relationship Check
      let pEmail = String(row.parentEmail || "").trim().toLowerCase();
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
            row.isExistingParent = true;
          } else {
            fieldErrors.parentEmail = `Email '${pEmail}' is already registered as a ${existing.role} account.`;
            conflictWarnings.push(`Email already in use by a ${existing.role} user.`);
          }
        }
      }

      // 10. Parent Password (Default to Parent@123)
      if (!row.parentPassword || !String(row.parentPassword).trim()) {
        row.parentPassword = "Parent@123";
      }

      // 11. Parent Phone (Optional, format check only if provided)
      if (row.parentPhone && !isValidPhone(String(row.parentPhone).trim())) {
        fieldErrors.parentPhone = "Invalid phone number format (must contain 7-15 digits).";
        invalidFields.push("parentPhone");
      }

    } else if (type === "TEACHER") {
      // TEACHER VALIDATION
      // 1. First Name & Last Name
      if (!row.firstName || !String(row.firstName).trim()) {
        fieldErrors.firstName = "Teacher first name is required.";
        missingFields.push("firstName");
      }
      if (!row.lastName || !String(row.lastName).trim()) {
        row.lastName = ".";
      }

      // 2. User ID / Email
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
          if (existing?.role === "TEACHER") {
            row.isExistingTeacher = true;
          } else {
            fieldErrors.email = `Email '${email}' already exists in database (${existing?.role} account).`;
            conflictWarnings.push(`Account with email '${email}' already exists in database as ${existing?.role}.`);
          }
        }
      }

      // 3. Password
      if (!row.password || !String(row.password).trim()) {
        fieldErrors.password = "Initial password is required.";
        missingFields.push("password");
      }

      // 4. Phone (Optional, format check only if provided)
      if (row.phone && !isValidPhone(String(row.phone).trim())) {
        fieldErrors.phone = "Invalid phone number format.";
        invalidFields.push("phone");
      }

      // 5. Joining Date
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

      // 6. Qualification
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

  // Pre-fetch classes once outside row loop to avoid duplicate queries inside transactions
  const allDbClasses = await prisma.class.findMany({
    where: { isActive: true },
    select: { id: true, name: true, section: true }
  });

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

          // Compute hashed password and string values outside database transaction
          const hashedPass = await hash(String(parentPassword || "Parent@123"), 10);
          const rollStr = String(studentRollNo).trim();
          const admStr = String(admissionNo || `ADM${rollStr}`).trim();
          const cleanParentEmail = String(parentEmail).trim().toLowerCase();
          const dobDate = studentDob ? new Date(studentDob) : null;
          const resType = residenceType === "HOSTEL" ? "HOSTEL" : "DAYSCHOLAR";
          const studentFullName = `${studentFirstName} ${studentLastName || ""}`.trim();
          const parentFullName = `${parentFirstName} ${parentLastName || ""}`.trim();

          let accountToPushParent: { role: string; identifier: string; name: string } | null = null;
          let accountToPushStudent: { role: string; identifier: string; name: string } | null = null;

          // Wrap single student+parent pair in atomic transaction with generous timeout
          await prisma.$transaction(async (tx) => {
            // Check student uniqueness
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
            let parentUser = await tx.user.findUnique({
              where: { email: cleanParentEmail },
              include: { parent: true }
            });

            let parentId: string;

            if (!parentUser) {
              // Create new Parent user account
              parentUser = await tx.user.create({
                data: {
                  email: cleanParentEmail,
                  name: parentFullName,
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
              accountToPushParent = {
                role: "PARENT",
                identifier: cleanParentEmail,
                name: parentFullName
              };
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
            await tx.student.create({
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

            accountToPushStudent = {
              role: "STUDENT",
              identifier: rollStr,
              name: studentFullName
            };
          }, {
            maxWait: 15000,
            timeout: 30000
          });

          // Only record success after database transaction successfully commits
          if (accountToPushParent) {
            result.createdAccounts.push(accountToPushParent);
          }
          if (accountToPushStudent) {
            result.createdAccounts.push(accountToPushStudent);
            result.importedCount++;
          }

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

          const cleanEmail = String(email).trim().toLowerCase();
          const cleanGoogleEmail = googleEmail 
            ? String(googleEmail).trim().toLowerCase() 
            : (cleanEmail.endsWith("@gmail.com") || cleanEmail.endsWith("@googlemail.com") ? cleanEmail : null);

          // Compute password hash and class target outside database transaction
          const hashedPass = await hash(String(password || "Teacher@123").trim(), 10);
          const teacherFullName = `${firstName} ${lastName || ""}`.trim();
          const joinDate = joiningDate ? new Date(joiningDate) : new Date();

          let targetClassId = classTeacherClassId;
          if (!targetClassId && classTeacherRaw) {
            const resolved = resolveClass(classTeacherRaw, allDbClasses);
            if (resolved) targetClassId = resolved.id;
          }

          const rawSubjects = row.subjects;
          let accountToPushTeacher: { role: string; identifier: string; name: string } | null = null;

          await prisma.$transaction(async (tx) => {
            const existing = await tx.user.findUnique({
              where: { email: cleanEmail },
              include: { teacher: true }
            });

            let teacherId: string;

            if (existing) {
              if (existing.role !== "TEACHER") {
                throw new Error(`Email '${cleanEmail}' is already registered in the system as a ${existing.role} account.`);
              }

              // Existing teacher account - update profile idempotently
              const existingTeacher = existing.teacher || await tx.teacher.findUnique({ where: { userId: existing.id } });
              if (!existingTeacher) {
                const createdTeacher = await tx.teacher.create({
                  data: {
                    userId: existing.id,
                    phone: phone ? String(phone).trim() : null,
                    qualification: qualification ? String(qualification).trim() : null,
                    joinDate,
                    isActive: true
                  }
                });
                teacherId = createdTeacher.id;
              } else {
                teacherId = existingTeacher.id;
                await tx.teacher.update({
                  where: { id: teacherId },
                  data: {
                    ...(phone ? { phone: String(phone).trim() } : {}),
                    ...(qualification ? { qualification: String(qualification).trim() } : {}),
                    isActive: true
                  }
                });
              }

              await tx.user.update({
                where: { id: existing.id },
                data: {
                  name: teacherFullName,
                  ...(cleanGoogleEmail ? { googleEmail: cleanGoogleEmail, googleEmailVerified: true } : {})
                }
              });
            } else {
              // Create new teacher
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
                      isActive: true
                    }
                  }
                },
                include: { teacher: true }
              });
              teacherId = createdUser.teacher!.id;
            }

            // Handle Class Teacher Assignment
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

            accountToPushTeacher = {
              role: "TEACHER",
              identifier: cleanEmail,
              name: teacherFullName
            };
          }, {
            maxWait: 15000,
            timeout: 30000
          });

          // Only record success after database transaction successfully commits
          if (accountToPushTeacher) {
            result.createdAccounts.push(accountToPushTeacher);
            result.importedCount++;
          }

        } else {
          // ADMIN IMPORT
          const { name, email } = row;
          const cleanEmail = String(email).trim().toLowerCase();
          const adminFullName = String(name).trim();

          let accountToPushAdmin: { role: string; identifier: string; name: string } | null = null;

          await prisma.$transaction(async (tx) => {
            const existing = await tx.user.findUnique({
              where: { email: cleanEmail }
            });

            if (existing) {
              if (existing.role === "ADMIN") {
                await tx.user.update({
                  where: { id: existing.id },
                  data: {
                    name: adminFullName,
                    status: "ACTIVE",
                    googleEmail: cleanEmail,
                    googleEmailVerified: true
                  }
                });
              } else {
                throw new Error(`Email '${cleanEmail}' is already registered in the system (${existing.role} account).`);
              }
            } else {
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
            }

            accountToPushAdmin = {
              role: "ADMIN",
              identifier: cleanEmail,
              name: adminFullName
            };
          }, {
            maxWait: 15000,
            timeout: 30000
          });

          // Only record success after database transaction successfully commits
          if (accountToPushAdmin) {
            result.createdAccounts.push(accountToPushAdmin);
            result.importedCount++;
          }
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
