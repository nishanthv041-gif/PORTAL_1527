import * as XLSX from "xlsx";
import { 
  parseAndScanWorkbook, 
  validateAndCorrelateBatch, 
  executeImportTransaction, 
  generateErrorReportCsv, 
  sanitizeForSpreadsheet,
  isValidEmail,
  isValidPhone,
  parseDateSafe
} from "../backend/lib/services/excelImportEngine";
import { prisma } from "../backend/db/prisma";

// Utility to create in-memory workbook buffers
function createWorkbookBuffer(sheetName: string, headers: string[], rows: any[][]): Buffer {
  const wsData = [headers, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return buf as Buffer;
}

async function runTestSuite() {
  console.log("==========================================================");
  console.log("INTELLIGENT EXCEL IMPORT SYSTEM: COMPREHENSIVE TEST SUITE");
  console.log("==========================================================");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testId: string, testName: string, details?: string) {
    if (condition) {
      console.log(`[PASS] Test ${testId}: ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] Test ${testId}: ${testName}${details ? ` -> ${details}` : ""}`);
      failed++;
    }
  }

  // Pre-requisite: ensure a test class exists
  let testClass = await prisma.class.findFirst({ where: { isActive: true } });
  if (!testClass) {
    testClass = await prisma.class.create({
      data: {
        name: "Test Class",
        section: "A",
        isActive: true
      }
    });
  }

  const studentHeaders = [
    "studentFirstName", "studentLastName", "studentRollNo", "admissionNo",
    "studentDob", "class", "residenceType", "parentFirstName",
    "parentLastName", "parentEmail", "parentPassword", "parentPhone"
  ];

  const teacherHeaders = [
    "firstName", "lastName", "email", "password", "phone", "joiningDate", "qualification"
  ];

  // ----------------------------------------------------
  // Test A: Valid student-parent workbook
  // ----------------------------------------------------
  const uniqueRollA = `TEST_ROLL_${Date.now()}`;
  const uniqueAdmA = `TEST_ADM_${Date.now()}`;
  const uniqueParentEmailA = `parent_test_a_${Date.now()}@schooltest.internal`;

  const bufA = createWorkbookBuffer("Students", studentHeaders, [
    ["Alice", "Smith", uniqueRollA, uniqueAdmA, "2012-05-20", `${testClass.name} - ${testClass.section}`, "DAYSCHOLAR", "Bob", "Smith", uniqueParentEmailA, "Secret@123", "9876543210"]
  ]);

  const scanA = await parseAndScanWorkbook(bufA, "STUDENT_PARENT");
  assert(scanA.isValidWorkbook && scanA.readyToImportCount === 1, "A", "Valid student-parent workbook parsed and validated successfully");

  // ----------------------------------------------------
  // Test B: Valid teacher workbook
  // ----------------------------------------------------
  const uniqueTeacherEmailB = `teacher_test_b_${Date.now()}@schooltest.internal`;
  const bufB = createWorkbookBuffer("Teachers", teacherHeaders, [
    ["Clara", "Oswald", uniqueTeacherEmailB, "Teacher@Secure99", "9123456789", "2024-01-15", "M.Ed., B.Sc."]
  ]);

  const scanB = await parseAndScanWorkbook(bufB, "TEACHER");
  assert(scanB.isValidWorkbook && scanB.readyToImportCount === 1, "B", "Valid teacher workbook parsed and validated successfully");

  // ----------------------------------------------------
  // Test C: Missing required columns
  // ----------------------------------------------------
  const incompleteHeaders = ["studentFirstName", "studentRollNo"];
  const bufC = createWorkbookBuffer("Incomplete", incompleteHeaders, [
    ["Alice", "1001"]
  ]);

  const scanC = await parseAndScanWorkbook(bufC, "STUDENT_PARENT");
  assert(!scanC.isValidWorkbook && scanC.missingHeaders.length > 0, "C", "Missing required column headers detected and rejected", `Missing: ${scanC.missingHeaders.join(", ")}`);

  // ----------------------------------------------------
  // Test D: Empty workbook
  // ----------------------------------------------------
  const bufD = createWorkbookBuffer("Empty", studentHeaders, []);
  const scanD = await parseAndScanWorkbook(bufD, "STUDENT_PARENT");
  assert(scanD.totalRows === 0 && scanD.readyToImportCount === 0, "D", "Empty workbook with headers recognized with 0 rows");

  // ----------------------------------------------------
  // Test E: Missing student details
  // ----------------------------------------------------
  const bufE = createWorkbookBuffer("MissingStudent", studentHeaders, [
    ["", "Smith", "", "ADM_X", "2012-05-20", `${testClass.name} - ${testClass.section}`, "DAYSCHOLAR", "Bob", "Smith", "parentE@test.com", "Pass@123", "9876543210"]
  ]);
  const scanE = await parseAndScanWorkbook(bufE, "STUDENT_PARENT");
  const rowE = scanE.rows[0];
  assert(
    rowE && !rowE.isReadyToImport && rowE.missingFields.includes("studentFirstName") && rowE.missingFields.includes("studentRollNo"),
    "E",
    "Missing student first name and roll number identified as required field errors"
  );

  // ----------------------------------------------------
  // Test F: Missing parent details
  // ----------------------------------------------------
  const bufF = createWorkbookBuffer("MissingParent", studentHeaders, [
    ["David", "Miller", `ROLL_F_${Date.now()}`, `ADM_F_${Date.now()}`, "2012-05-20", `${testClass.name} - ${testClass.section}`, "DAYSCHOLAR", "", "", "", "Pass@123", ""]
  ]);
  const scanF = await parseAndScanWorkbook(bufF, "STUDENT_PARENT");
  const rowF = scanF.rows[0];
  assert(
    rowF && !rowF.isReadyToImport && rowF.missingFields.includes("parentFirstName") && rowF.missingFields.includes("parentEmail"),
    "F",
    "Missing parent first name and parent email identified as errors"
  );

  // ----------------------------------------------------
  // Test G: Missing teacher details
  // ----------------------------------------------------
  const bufG = createWorkbookBuffer("MissingTeacher", teacherHeaders, [
    ["", "Doe", "", "", "9876543210", "2024-01-15", ""]
  ]);
  const scanG = await parseAndScanWorkbook(bufG, "TEACHER");
  const rowG = scanG.rows[0];
  assert(
    rowG && !rowG.isReadyToImport && rowG.missingFields.includes("firstName") && rowG.missingFields.includes("email") && rowG.missingFields.includes("password") && rowG.missingFields.includes("qualification"),
    "G",
    "Missing teacher firstName, email, password, and qualification properly flagged"
  );

  // ----------------------------------------------------
  // Test H: Invalid dates
  // ----------------------------------------------------
  const dateResult1 = parseDateSafe("invalid-date-string");
  const dateResult2 = parseDateSafe("32/13/2020");
  const dateResult3 = parseDateSafe("2015-06-12");
  assert(
    !dateResult1.isValid && !dateResult2.isValid && dateResult3.isValid,
    "H",
    "Date parsing validates format and calendar correctness, rejecting invalid dates"
  );

  // ----------------------------------------------------
  // Test I: Invalid email addresses
  // ----------------------------------------------------
  assert(!isValidEmail("not-an-email"), "I1", "Rejects email without domain: not-an-email");
  assert(!isValidEmail("user@com"), "I2", "Rejects email without top level domain: user@com");
  assert(isValidEmail("valid.parent@school.org"), "I3", "Accepts standard valid email format");

  // ----------------------------------------------------
  // Test J: Invalid residence types
  // ----------------------------------------------------
  const bufJ = createWorkbookBuffer("Residence", studentHeaders, [
    ["Eva", "Green", `ROLL_J_${Date.now()}`, `ADM_J_${Date.now()}`, "2013-04-10", `${testClass.name} - ${testClass.section}`, "FOREIGN_EXCHANGE", "Parent", "Green", "parentJ@test.com", "Pass@123", "9876543210"]
  ]);
  const scanJ = await parseAndScanWorkbook(bufJ, "STUDENT_PARENT");
  const rowJ = scanJ.rows[0];
  assert(
    rowJ && rowJ.invalidFields.includes("residenceType"),
    "J",
    "Invalid residence type rejected (only DAYSCHOLAR or HOSTEL permitted)"
  );

  // ----------------------------------------------------
  // Test K: Duplicate records within workbook
  // ----------------------------------------------------
  const dupRoll = `DUP_ROLL_${Date.now()}`;
  const bufK = createWorkbookBuffer("Duplicates", studentHeaders, [
    ["StudentOne", "Test", dupRoll, `ADM_K1_${Date.now()}`, "2012-01-01", `${testClass.name} - ${testClass.section}`, "DAYSCHOLAR", "P1", "Test", "p1@test.com", "Pass@123", "9876543210"],
    ["StudentTwo", "Test", dupRoll, `ADM_K2_${Date.now()}`, "2012-01-01", `${testClass.name} - ${testClass.section}`, "DAYSCHOLAR", "P2", "Test", "p2@test.com", "Pass@123", "9876543210"]
  ]);
  const scanK = await parseAndScanWorkbook(bufK, "STUDENT_PARENT");
  assert(
    scanK.duplicateRowsCount > 0 && scanK.rows[1].status === "DUPLICATE_IN_FILE",
    "K",
    "Duplicate roll number within workbook detected and flagged"
  );

  // ----------------------------------------------------
  // Test L: Existing database conflicts
  // ----------------------------------------------------
  // Use existing student or teacher from database
  const existingStudent = await prisma.student.findFirst();
  if (existingStudent) {
    const bufL = createWorkbookBuffer("Conflict", studentHeaders, [
      ["ConflictStudent", "Test", existingStudent.rollNumber, `ADM_L_${Date.now()}`, "2012-01-01", `${testClass.name} - ${testClass.section}`, "DAYSCHOLAR", "ParentL", "Test", "parentL@test.com", "Pass@123", "9876543210"]
    ]);
    const scanL = await parseAndScanWorkbook(bufL, "STUDENT_PARENT");
    assert(
      scanL.conflictRowsCount > 0 && scanL.rows[0].status === "CONFLICT_DB",
      "L",
      "Database conflict detected for existing student roll number in PostgreSQL"
    );
  } else {
    assert(true, "L", "Skipping L (no existing student in DB)");
  }

  // ----------------------------------------------------
  // Test M: Inline correction followed by successful revalidation
  // ----------------------------------------------------
  const uncorrectedRow = {
    excelRowNumber: 2,
    studentFirstName: "",
    studentLastName: "Brown",
    studentRollNo: "",
    admissionNo: "",
    studentDob: "invalid-date",
    class: `${testClass.name} - ${testClass.section}`,
    residenceType: "UNKNOWN",
    parentFirstName: "Peter",
    parentLastName: "Brown",
    parentEmail: "invalid-email",
    parentPassword: "Password@123",
    parentPhone: "9876543210"
  };

  const initialValidation = await validateAndCorrelateBatch("STUDENT_PARENT", [uncorrectedRow], [testClass]);
  assert(initialValidation.readyToImportCount === 0 && initialValidation.errorRowsCount === 1, "M1", "Uncorrected row fails validation");

  // Correct the row
  const correctedRow = {
    ...uncorrectedRow,
    studentFirstName: "Charlie",
    studentRollNo: `ROLL_M_${Date.now()}`,
    admissionNo: `ADM_M_${Date.now()}`,
    studentDob: "2011-09-18",
    residenceType: "HOSTEL",
    parentEmail: `parent_m_${Date.now()}@school.org`
  };

  const revalidated = await validateAndCorrelateBatch("STUDENT_PARENT", [correctedRow], [testClass]);
  assert(revalidated.readyToImportCount === 1 && revalidated.errorRowsCount === 0, "M2", "Corrected row passes revalidation and is Ready to Import");

  // ----------------------------------------------------
  // Test N: Template mismatch protection
  // ----------------------------------------------------
  // Upload Teacher workbook to Student scan
  const scanN = await parseAndScanWorkbook(bufB, "STUDENT_PARENT");
  assert(!scanN.isValidWorkbook && scanN.fileError?.includes("Template mismatch"), "N", "Template mismatch caught (Teacher uploaded to Student workflow)");

  // ----------------------------------------------------
  // Test O: Transaction execution & account creation integrity
  // ----------------------------------------------------
  const rollO = `ROLL_TX_${Date.now()}`;
  const admO = `ADM_TX_${Date.now()}`;
  const pEmailO = `parent_tx_${Date.now()}@schooltest.internal`;

  const commitData = [{
    excelRowNumber: 2,
    studentFirstName: "Timothy",
    studentLastName: "Drake",
    studentRollNo: rollO,
    admissionNo: admO,
    studentDob: "2013-02-14",
    classId: testClass.id,
    residenceType: "DAYSCHOLAR",
    parentFirstName: "Bruce",
    parentLastName: "Wayne",
    parentEmail: pEmailO,
    parentPassword: "BatPassword@123",
    parentPhone: "9876543210",
    parentAddress: "100 Gotham Way"
  }];

  const commitRes = await executeImportTransaction(
    "STUDENT_PARENT",
    commitData,
    { email: "admin@school.internal" },
    "test_tx.xlsx",
    1024
  );

  assert(commitRes.success && commitRes.importedCount === 1, "O1", "Database transaction committed student + parent atomically");

  // Verify created records in database
  const createdStudent = await prisma.student.findUnique({
    where: { rollNumber: rollO },
    include: { parents: { include: { parent: { include: { user: true } } } } }
  });

  assert(
    !!createdStudent && createdStudent.parents.length > 0 && createdStudent.parents[0].parent.user.email === pEmailO,
    "O2",
    "Student correctly associated with parent via ParentStudent link"
  );

  // ----------------------------------------------------
  // Test P: Password security (never stored in plaintext)
  // ----------------------------------------------------
  const parentUser = createdStudent?.parents[0]?.parent?.user;
  assert(
    !!parentUser && !!parentUser.password && !parentUser.password.includes("BatPassword@123") && parentUser.password.startsWith("$2"),
    "P",
    "Passwords are cryptographically hashed using bcrypt (never plaintext)"
  );

  // ----------------------------------------------------
  // Test Q: Parent account reuse for siblings
  // ----------------------------------------------------
  // Import a second student with the SAME parent email
  const rollQ = `ROLL_SIBLING_${Date.now()}`;
  const admQ = `ADM_SIBLING_${Date.now()}`;
  const siblingData = [{
    excelRowNumber: 3,
    studentFirstName: "Damian",
    studentLastName: "Wayne",
    studentRollNo: rollQ,
    admissionNo: admQ,
    studentDob: "2015-08-20",
    classId: testClass.id,
    residenceType: "HOSTEL",
    parentFirstName: "Bruce",
    parentLastName: "Wayne",
    parentEmail: pEmailO, // Same parent email
    parentPassword: "AnyPassword",
    parentPhone: "9876543210"
  }];

  const siblingCommit = await executeImportTransaction(
    "STUDENT_PARENT",
    siblingData,
    { email: "admin@school.internal" },
    "sibling_test.xlsx",
    1024
  );

  assert(siblingCommit.success && siblingCommit.importedCount === 1, "Q1", "Sibling student imported successfully");

  // Verify parent was reused and NOT duplicated
  const parentUserCount = await prisma.user.count({ where: { email: pEmailO } });
  const siblingStudent = await prisma.student.findUnique({
    where: { rollNumber: rollQ },
    include: { parents: true }
  });

  assert(
    parentUserCount === 1 && !!siblingStudent && siblingStudent.parents[0].parentId === createdStudent?.parents[0]?.parentId,
    "Q2",
    "Parent account reused for sibling without creating duplicate user"
  );

  // ----------------------------------------------------
  // Test R: Teacher account creation & role constraint
  // ----------------------------------------------------
  const teacherEmailR = `teacher_role_${Date.now()}@schooltest.internal`;
  const teacherData = [{
    excelRowNumber: 2,
    firstName: "Minerva",
    lastName: "McGonagall",
    email: teacherEmailR,
    password: "SpellPassword@123",
    phone: "9876543210",
    joiningDate: "2023-08-01",
    qualification: "Ph.D. in Education"
  }];

  const teacherCommit = await executeImportTransaction(
    "TEACHER",
    teacherData,
    { email: "admin@school.internal" },
    "teacher_test.xlsx",
    1024
  );

  assert(teacherCommit.success && teacherCommit.importedCount === 1, "R1", "Teacher account created atomically");

  const createdTeacherUser = await prisma.user.findUnique({
    where: { email: teacherEmailR },
    include: { teacher: true }
  });

  assert(
    !!createdTeacherUser && createdTeacherUser.role === "TEACHER" && !!createdTeacherUser.teacher,
    "R2",
    "Teacher strictly assigned TEACHER role and linked to teacher profile"
  );

  // ----------------------------------------------------
  // Test S: Malformed Excel buffer handling
  // ----------------------------------------------------
  const corruptedBuffer = Buffer.from("THIS IS NOT A VALID EXCEL FILE OR ZIP ARCHIVE");
  const scanS = await parseAndScanWorkbook(corruptedBuffer, "STUDENT_PARENT");
  assert(
    !scanS.isValidWorkbook && !!scanS.fileError,
    "S",
    "Corrupted or malformed Excel file caught safely without unhandled exception"
  );

  // ----------------------------------------------------
  // Test T: Spreadsheet formula injection defense in error reports
  // ----------------------------------------------------
  const dangerousValues = [
    "=1+1",
    "+cmd|' /C calc'!A0",
    "-2+3",
    "@SUM(1,2)",
    "\tmalicious_tab",
    "\rmalicious_cr"
  ];

  let sanitizedAll = true;
  for (const v of dangerousValues) {
    const sanitized = sanitizeForSpreadsheet(v);
    if (!sanitized.startsWith("'")) {
      sanitizedAll = false;
    }
  }

  // Also test full CSV generation
  const mockErrorRows = [{
    rowId: "test-err-1",
    excelRowNumber: 4,
    status: "NEEDS_CORRECTION" as const,
    isReadyToImport: false,
    isSampleRow: false,
    fieldErrors: { roll: "=HYPERLINK(\"http://evil.com\")" },
    missingFields: ["roll"],
    invalidFields: [],
    duplicateWarnings: [],
    conflictWarnings: [],
    data: { studentRollNo: "=2+5", studentFirstName: "+FormulaName" }
  }];

  const csv = generateErrorReportCsv(mockErrorRows);
  const csvSafe = !csv.includes("\"=2+5\"") && csv.includes("\"'=2+5\"");

  assert(
    sanitizedAll && csvSafe,
    "T",
    "OWASP formula injection defense prepends single quote to dangerous formula triggers in error reports"
  );

  // Cleanup test records from database so production DB is never polluted
  try {
    await prisma.parentStudent.deleteMany({ where: { student: { rollNumber: { startsWith: 'ROLL_' } } } });
    await prisma.student.deleteMany({ where: { rollNumber: { startsWith: 'ROLL_' } } });
    await prisma.teacher.deleteMany({ where: { user: { email: { contains: 'schooltest.internal' } } } });
    await prisma.parent.deleteMany({ where: { user: { email: { contains: 'schooltest.internal' } } } });
    await prisma.user.deleteMany({ where: { email: { contains: 'schooltest.internal' } } });
  } catch (cleanErr) {
    // Ignore cleanup warnings
  }

  console.log("==========================================================");
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log("==========================================================");

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTestSuite().catch(err => {
  console.error("Test execution fatal error:", err);
  process.exit(1);
});

