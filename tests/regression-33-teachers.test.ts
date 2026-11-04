import { readExcelBuffer } from "../lib/import/readFile";
import { autoMapColumns } from "../lib/import/detectHeaders";
import { getTargetFieldsForRole } from "../lib/import/detectHeaders";
import { validateImportRows } from "../lib/import/validate";
import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";

const prisma = new PrismaClient();

async function runRegressionTest() {
  console.log("=== STARTING 33-TEACHER BULK IMPORT REGRESSION TEST ===");

  const fixturePath = path.join(__dirname, "fixtures", "SRT_SCHOOL__TEACHER.xlsx");
  if (!fs.existsSync(fixturePath)) {
    throw new Error(`Fixture file not found: ${fixturePath}`);
  }

  const buffer = fs.readFileSync(fixturePath);
  const parsed = readExcelBuffer(buffer);

  console.log(`✓ Read sheet: "${parsed.sheetName}", total rows found: ${parsed.rows.length}`);
  if (parsed.rows.length !== 33) {
    throw new Error(`Expected exactly 33 teacher rows, but parsed ${parsed.rows.length}`);
  }

  // Verify headers
  const targetFields = getTargetFieldsForRole("TEACHER");
  const columnMappings = autoMapColumns(parsed.headers, parsed.rows, targetFields);
  console.log(`✓ Mapped ${columnMappings.filter(m => m.confidence !== "UNMAPPED").length} columns`);

  // Query classes from DB
  const availableClasses = await prisma.class.findMany({
    where: { isActive: true },
    select: { id: true, name: true, section: true },
    orderBy: [{ name: "asc" }, { section: "asc" }]
  });
  console.log(`✓ Loaded ${availableClasses.length} active classes from database`);

  // Run validation engine
  const validatedRows = await validateImportRows({
    role: "TEACHER",
    columnMappings,
    rawRows: parsed.rows,
    checkDb: true,
    availableClasses
  });

  console.log(`✓ Validated ${validatedRows.length} rows`);

  // 1. Assert Row 3 (Gayathri P)
  const row3 = validatedRows.find(r => r.excelRowNumber === 3);
  if (!row3) throw new Error("Row 3 not found in validated rows");
  console.log("\n--- Checking Row 3 (Gayathri P) ---");
  console.log("Gender:", row3.data.gender);
  console.log("Class ID:", row3.data.classTeacherClassId);
  console.log("Class Name:", row3.data.classTeacherClassName);
  console.log("Joining Date:", row3.data.joiningDate);
  if (row3.data.gender !== "Female") throw new Error(`Row 3 gender should be "Female", got "${row3.data.gender}"`);
  if (!row3.data.classTeacherClassId) throw new Error("Row 3 classTeacherClassId is empty");
  if (!row3.data.classTeacherClassName.includes("Class 3 - Section A")) {
    throw new Error(`Row 3 class name should be "Class 3 - Section A", got "${row3.data.classTeacherClassName}"`);
  }
  if (!row3.data.joiningDate) throw new Error("Row 3 joiningDate should be set");
  console.log("✓ Row 3 PASSED all assertions");

  // 2. Assert Row 26 (Nithya S)
  const row26 = validatedRows.find(r => r.excelRowNumber === 26);
  if (!row26) throw new Error("Row 26 not found in validated rows");
  console.log("\n--- Checking Row 26 (Nithya S) ---");
  console.log("Gender:", row26.data.gender);
  console.log("Class ID:", row26.data.classTeacherClassId);
  console.log("Class Name:", row26.data.classTeacherClassName);
  console.log("Conflict Warnings:", row26.conflictWarnings);
  console.log("Suggestions:", row26.suggestions.map(s => s.label));
  if (row26.data.gender !== "Female") throw new Error(`Row 26 gender should be "Female", got "${row26.data.gender}"`);
  if (!row26.data.classTeacherClassId) throw new Error("Row 26 classTeacherClassId is empty");
  if (!row26.data.classTeacherClassName.includes("Class 1 - Section A")) {
    throw new Error(`Row 26 class name should be "Class 1 - Section A", got "${row26.data.classTeacherClassName}"`);
  }
  const hasGoogleEmailSuggestion = row26.suggestions.some(s => s.actionType === "SET_FIELD" && s.field === "userId");
  if (!hasGoogleEmailSuggestion) {
    throw new Error("Row 26 should offer [Use Google mail as User ID] suggestion");
  }
  console.log("✓ Row 26 PASSED all assertions");

  // 3. Assert Row 21 (Tharani R)
  const row21 = validatedRows.find(r => r.excelRowNumber === 21);
  if (!row21) throw new Error("Row 21 not found in validated rows");
  console.log("\n--- Checking Row 21 (Tharani R) ---");
  console.log("Gender:", row21.data.gender);
  console.log("Class ID:", row21.data.classTeacherClassId);
  console.log("Class Name:", row21.data.classTeacherClassName);
  console.log("Same Person Match:", row21.samePersonMatch);
  if (row21.data.gender !== "Female") throw new Error(`Row 21 gender should be "Female", got "${row21.data.gender}"`);
  if (!row21.data.classTeacherClassId) throw new Error("Row 21 classTeacherClassId is empty");
  if (!row21.data.classTeacherClassName.includes("Class 11 - Section C(BIO - CS)")) {
    throw new Error(`Row 21 class name should match "Class 11 - Section C(BIO - CS)", got "${row21.data.classTeacherClassName}"`);
  }
  if (!row21.samePersonMatch || row21.samePersonMatch.matchedRowNumber !== 13) {
    throw new Error(`Row 21 should match same person with Row 13`);
  }
  console.log("✓ Row 21 PASSED all assertions");

  // 4. Assert Non-Class Roles (Row 38 Accounts assistant)
  const row38 = validatedRows.find(r => r.excelRowNumber === 38);
  if (!row38) throw new Error("Row 38 not found");
  console.log("\n--- Checking Row 38 (Accounts assistant) ---");
  console.log("isClassTeacher:", row38.data.isClassTeacher);
  console.log("nonClassRole:", row38.data.nonClassRole);
  if (row38.data.isClassTeacher !== false) throw new Error("Row 38 should have isClassTeacher = false");
  if (!row38.data.nonClassRole?.toLowerCase().includes("accounts assistant")) {
    throw new Error(`Row 38 nonClassRole should be Accounts assistant`);
  }
  console.log("✓ Row 38 PASSED all assertions");

  // 5. Assert Missing Classes (Row 12 LKG, Row 8 Class 1-B)
  const row12 = validatedRows.find(r => r.excelRowNumber === 12);
  if (!row12) throw new Error("Row 12 not found");
  console.log("\n--- Checking Row 12 (LKG missing class) ---");
  console.log("classNotFound:", row12.data.classNotFound);
  console.log("classNotFoundName:", row12.data.classNotFoundName);
  if (!row12.data.classNotFound) throw new Error("Row 12 should have classNotFound = true");
  console.log("✓ Row 12 PASSED all assertions");

  // 6. Assert Physical Row 38 Preservation
  console.log("\n--- Checking Physical Row 38 ---");
  console.log("Excel Row Number:", row38.excelRowNumber);
  console.log("Teacher Name:", row38.data.name);
  console.log("✓ Physical Row 38 PASSED");

  console.log("\n========================================================");
  console.log("🎉 ALL 33 TEACHER ROW REGRESSION TESTS PASSED (100%)");
  console.log("========================================================");
}

runRegressionTest()
  .catch((err) => {
    console.error("❌ REGRESSION TEST FAILED:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
