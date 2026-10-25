import * as fs from "fs";
import * as path from "path";
import * as XLSX from "xlsx";
import { 
  parseAndScanWorkbook, 
  executeImportTransaction, 
  generateErrorReportCsv 
} from "../backend/lib/services/excelImportEngine";
import { prisma } from "../backend/db/prisma";

async function runTestSuite() {
  console.log("=====================================================================");
  console.log("BULK IMPORT ALL ROLES (STUDENT, TEACHER, ADMIN): COMPREHENSIVE SUITE");
  console.log("=====================================================================");

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

  const templatesDir = path.join(process.cwd(), "public", "templates");

  // -------------------------------------------------------------
  // 1. Template Files Verification (CSV & XLSX Exist and Non-Empty)
  // -------------------------------------------------------------
  const requiredFiles = [
    "student_upload_template.csv",
    "student_upload_template.xlsx",
    "teacher_upload_template.csv",
    "teacher_upload_template.xlsx",
    "admin_upload_template.csv",
    "admin_upload_template.xlsx"
  ];

  for (const fileName of requiredFiles) {
    const filePath = path.join(templatesDir, fileName);
    const exists = fs.existsSync(filePath);
    const size = exists ? fs.statSync(filePath).size : 0;
    assert(exists && size > 0, `FILE-${fileName}`, `Template ${fileName} exists and is non-empty (${size} bytes)`);
  }

  // -------------------------------------------------------------
  // 2. Scan Built-in Student Templates (CSV & XLSX)
  // -------------------------------------------------------------
  const studentCsvBuf = fs.readFileSync(path.join(templatesDir, "student_upload_template.csv"));
  const scanStudentCsv = await parseAndScanWorkbook(studentCsvBuf, "STUDENT_PARENT");
  assert(scanStudentCsv.isValidWorkbook, "SCAN-STUDENT-CSV-1", "Student CSV template is recognized as valid workbook");
  assert(scanStudentCsv.detectedTemplate === "STUDENT_PARENT", "SCAN-STUDENT-CSV-2", `Detected template is STUDENT_PARENT (got ${scanStudentCsv.detectedTemplate})`);
  assert(scanStudentCsv.totalRows >= 1, "SCAN-STUDENT-CSV-3", `Student CSV template contains rows (count: ${scanStudentCsv.totalRows})`);

  const studentXlsxBuf = fs.readFileSync(path.join(templatesDir, "student_upload_template.xlsx"));
  const scanStudentXlsx = await parseAndScanWorkbook(studentXlsxBuf, "STUDENT_PARENT");
  assert(scanStudentXlsx.isValidWorkbook, "SCAN-STUDENT-XLSX-1", "Student XLSX template is recognized as valid workbook");
  assert(scanStudentXlsx.detectedTemplate === "STUDENT_PARENT", "SCAN-STUDENT-XLSX-2", `Detected template is STUDENT_PARENT (got ${scanStudentXlsx.detectedTemplate})`);

  // -------------------------------------------------------------
  // 3. Scan Built-in Teacher Templates (CSV & XLSX)
  // -------------------------------------------------------------
  const teacherCsvBuf = fs.readFileSync(path.join(templatesDir, "teacher_upload_template.csv"));
  const scanTeacherCsv = await parseAndScanWorkbook(teacherCsvBuf, "TEACHER");
  assert(scanTeacherCsv.isValidWorkbook, "SCAN-TEACHER-CSV-1", "Teacher CSV template is recognized as valid workbook");
  assert(scanTeacherCsv.detectedTemplate === "TEACHER", "SCAN-TEACHER-CSV-2", `Detected template is TEACHER (got ${scanTeacherCsv.detectedTemplate})`);

  const teacherXlsxBuf = fs.readFileSync(path.join(templatesDir, "teacher_upload_template.xlsx"));
  const scanTeacherXlsx = await parseAndScanWorkbook(teacherXlsxBuf, "TEACHER");
  assert(scanTeacherXlsx.isValidWorkbook, "SCAN-TEACHER-XLSX-1", "Teacher XLSX template is recognized as valid workbook");
  assert(scanTeacherXlsx.detectedTemplate === "TEACHER", "SCAN-TEACHER-XLSX-2", `Detected template is TEACHER (got ${scanTeacherXlsx.detectedTemplate})`);

  // -------------------------------------------------------------
  // 4. Scan Built-in Admin Templates (CSV & XLSX)
  // -------------------------------------------------------------
  const adminCsvBuf = fs.readFileSync(path.join(templatesDir, "admin_upload_template.csv"));
  const scanAdminCsv = await parseAndScanWorkbook(adminCsvBuf, "ADMIN");
  assert(scanAdminCsv.isValidWorkbook, "SCAN-ADMIN-CSV-1", "Admin CSV template is recognized as valid workbook");
  assert(scanAdminCsv.detectedTemplate === "ADMIN", "SCAN-ADMIN-CSV-2", `Detected template is ADMIN (got ${scanAdminCsv.detectedTemplate})`);

  const adminXlsxBuf = fs.readFileSync(path.join(templatesDir, "admin_upload_template.xlsx"));
  const scanAdminXlsx = await parseAndScanWorkbook(adminXlsxBuf, "ADMIN");
  assert(scanAdminXlsx.isValidWorkbook, "SCAN-ADMIN-XLSX-1", "Admin XLSX template is recognized as valid workbook");
  assert(scanAdminXlsx.detectedTemplate === "ADMIN", "SCAN-ADMIN-XLSX-2", `Detected template is ADMIN (got ${scanAdminXlsx.detectedTemplate})`);

  // -------------------------------------------------------------
  // 5. Template Mismatch Detection across all 3 roles
  // -------------------------------------------------------------
  const mismatch1 = await parseAndScanWorkbook(adminCsvBuf, "TEACHER");
  assert(mismatch1.isTemplateMismatch === true, "MISMATCH-1", "Uploading Admin template on Teacher page flags template mismatch");

  const mismatch2 = await parseAndScanWorkbook(teacherCsvBuf, "ADMIN");
  assert(mismatch2.isTemplateMismatch === true, "MISMATCH-2", "Uploading Teacher template on Admin page flags template mismatch");

  const mismatch3 = await parseAndScanWorkbook(studentCsvBuf, "ADMIN");
  assert(mismatch3.isTemplateMismatch === true, "MISMATCH-3", "Uploading Student template on Admin page flags template mismatch");

  // -------------------------------------------------------------
  // 6. Admin Field Validation & Gmail Enforcement
  // -------------------------------------------------------------
  const timestamp = Date.now();
  const validGmail = `test.admin.${timestamp}@gmail.com`;
  const invalidEmail = `test.admin.${timestamp}@yahoo.com`;
  const duplicateGmail = `test.dup.${timestamp}@gmail.com`;

  const customAdminCsv = [
    "name,email",
    `Valid Admin,${validGmail}`,
    `Invalid Yahoo Admin,${invalidEmail}`,
    `,missingname.${timestamp}@gmail.com`,
    `Dup One,${duplicateGmail}`,
    `Dup Two,${duplicateGmail}`
  ].join("\n");

  const scanCustomAdmin = await parseAndScanWorkbook(Buffer.from(customAdminCsv, "utf-8"), "ADMIN");
  assert(scanCustomAdmin.rows.length === 5, "ADMIN-VAL-1", `Parsed 5 rows from custom Admin CSV (got ${scanCustomAdmin.rows.length})`);

  // Row 1: Valid
  const row1 = scanCustomAdmin.rows[0];
  assert(row1.isReadyToImport && row1.status === "VALID", "ADMIN-VAL-2", "Row 1 with valid Gmail is VALID and READY to import");

  // Row 2: Invalid non-Gmail
  const row2 = scanCustomAdmin.rows[1];
  assert(row2.status === "NEEDS_CORRECTION" && !!row2.fieldErrors.email, "ADMIN-VAL-3", `Row 2 non-Gmail rejected: ${row2.fieldErrors.email}`);

  // Row 3: Missing name
  const row3 = scanCustomAdmin.rows[2];
  assert(row3.status === "NEEDS_CORRECTION" && !!row3.fieldErrors.name, "ADMIN-VAL-4", `Row 3 missing name rejected: ${row3.fieldErrors.name}`);

  // Row 4 & 5: In-file duplicates
  const row4 = scanCustomAdmin.rows[3];
  const row5 = scanCustomAdmin.rows[4];
  assert(row4.status === "DUPLICATE_IN_FILE" || row5.status === "DUPLICATE_IN_FILE", "ADMIN-VAL-5", "In-file duplicate Gmail flagged as DUPLICATE_IN_FILE");

  // -------------------------------------------------------------
  // 7. Atomic Admin Import Database Transaction
  // -------------------------------------------------------------
  const cleanEmail = `bulk.imported.admin.${timestamp}@gmail.com`;
  const commitRows = [
    {
      name: "Bulk Imported SuperAdmin",
      email: cleanEmail
    }
  ];

  const commitResult = await executeImportTransaction(
    "ADMIN",
    commitRows,
    { id: "test-admin", email: "test@school.internal" },
    "test_admin_upload.csv",
    1024
  );

  assert(commitResult.success, "ADMIN-COMMIT-1", `Admin import transaction committed successfully with batchId ${commitResult.batchId}`);
  assert(commitResult.importedCount === 1, "ADMIN-COMMIT-2", `Imported exactly 1 admin record`);

  // Verify created user in PostgreSQL database
  const createdUser = await prisma.user.findFirst({
    where: { googleEmail: cleanEmail }
  });

  assert(!!createdUser, "ADMIN-COMMIT-3", "Created Admin user exists in PostgreSQL database");
  assert(createdUser?.role === "ADMIN", "ADMIN-COMMIT-4", `User role is ADMIN (got ${createdUser?.role})`);
  assert(createdUser?.status === "ACTIVE", "ADMIN-COMMIT-5", `User status is ACTIVE (got ${createdUser?.status})`);
  assert(createdUser?.googleEmailVerified === true, "ADMIN-COMMIT-6", "User googleEmailVerified is true");

  // -------------------------------------------------------------
  // 8. Database Conflict Detection for Admin
  // -------------------------------------------------------------
  const conflictScan = await parseAndScanWorkbook(
    Buffer.from(`name,email\nAnother Admin,${cleanEmail}`, "utf-8"),
    "ADMIN"
  );
  const conflictRow = conflictScan.rows[0];
  assert(conflictRow.status === "CONFLICT_DB", "ADMIN-CONFLICT-1", `Existing Admin email correctly flagged as CONFLICT_DB (${conflictRow.fieldErrors.email})`);

  // Cleanup test user
  if (createdUser) {
    await prisma.user.delete({ where: { id: createdUser.id } });
    console.log(`Cleaned up test admin user ${cleanEmail}`);
  }

  // -------------------------------------------------------------
  // Final Test Summary
  // -------------------------------------------------------------
  console.log("=====================================================================");
  console.log(`SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log("=====================================================================");

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTestSuite().catch((err) => {
  console.error("Test execution threw error:", err);
  process.exit(1);
});
