import * as XLSX from "xlsx";
import { parseAndScanWorkbook } from "../backend/lib/services/excelImportEngine";

async function testUserTemplate() {
  const headers = [
    "Full Name", "Gender", "Phone", "Qualification", "Subjects", 
    "Class Teacher", "User ID", "Password", "Sign In with Google Mail ID"
  ];

  const rows = [
    ["VIVIN KG", "Male", "9940943400", "B.com", "Social Science", "class 2 - section A", "kgvivin@gmail.com", "124", "kgvivin@gmail.com"],
    ["MOUNITHA V", "Female", "8015519276", "B.Tech(AIDS)", "Mathematics", "class 1 - section A", "mounithavenkatesan@gmail.com", "Mouni@#$2008", "mounithavenkatesan@gmail.com"],
    ["Deepika V", "Female", "9047565974", "Class teacher", "Science", "class 3 - section A", "deepikaviswanathan2007@gmail.com", "vis2ka@7", "deepikaviswanathan2007@gmail.com"]
  ];

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Teachers");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

  console.log("Parsing user's teacher Excel file...");
  const result = await parseAndScanWorkbook(buf, "TEACHER");

  console.log("isValidWorkbook:", result.isValidWorkbook);
  console.log("detectedTemplate:", result.detectedTemplate);
  console.log("totalRows:", result.totalRows);
  console.log("validRowsCount:", result.validRowsCount);
  console.log("errorRowsCount:", result.errorRowsCount);
  console.log("readyToImportCount:", result.readyToImportCount);
  console.log("missingHeaders:", result.missingHeaders);
  console.log("fileError:", result.fileError);

  for (const r of result.rows) {
    console.log(`\nRow #${r.excelRowNumber}: Status: ${r.status}, Ready: ${r.isReadyToImport}`);
    console.log("Data:", JSON.stringify(r.data, null, 2));
    if (Object.keys(r.fieldErrors).length > 0) {
      console.log("Field Errors:", r.fieldErrors);
    }
  }

  if (result.isValidWorkbook && result.readyToImportCount === 3 && result.errorRowsCount === 0) {
    console.log("\n>>> SUCCESS: All 3 rows scanned, parsed, and validated perfectly without issues! <<<");
  } else {
    console.error("\n>>> FAILED: Check errors above <<<");
    process.exit(1);
  }

  console.log("\n--- Executing Import Transaction for all 3 teachers ---");
  const importRows = result.rows.map(r => r.data);
  const commitRes = await executeImportTransaction(
    "TEACHER",
    importRows,
    { email: "admin@test.internal" },
    "Teachers.xlsx",
    buf.length
  );

  console.log("commitRes:", {
    success: commitRes.success,
    importedCount: commitRes.importedCount,
    failedCount: commitRes.failedCount,
    skippedCount: commitRes.skippedCount,
    errors: commitRes.errors,
    createdAccounts: commitRes.createdAccounts
  });

  if (!commitRes.success || commitRes.importedCount !== 3 || commitRes.failedCount !== 0) {
    console.error("\n>>> TRANSACTION FAILED! <<<");
    process.exit(1);
  }

  // Verify all 3 teachers are in the database
  const emails = ["kgvivin@gmail.com", "mounithavenkatesan@gmail.com", "deepikaviswanathan2007@gmail.com"];
  const dbUsers = await prisma.user.findMany({
    where: { email: { in: emails } },
    include: { teacher: true }
  });

  console.log("\nFound in DB:", dbUsers.map(u => ({ email: u.email, name: u.name, role: u.role, teacherId: u.teacher?.id })));

  if (dbUsers.length === 3 && dbUsers.every(u => u.role === "TEACHER" && !!u.teacher)) {
    console.log("\n>>> VERIFIED: All 3 teachers exist in DB with TEACHER role and valid teacher profile! <<<");
  } else {
    console.error("\n>>> DATABASE VERIFICATION FAILED! <<<");
    process.exit(1);
  }
}

import { executeImportTransaction } from "../backend/lib/services/excelImportEngine";

import { prisma } from "../backend/db/prisma";

testUserTemplate()
  .catch(err => {
    console.error("Test execution failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
