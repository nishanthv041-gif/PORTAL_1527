import * as XLSX from "xlsx";
import { parseAndScanWorkbook } from "../backend/lib/services/excelImportEngine";
import { prisma } from "../backend/db/prisma";

async function testParentScan() {
  console.log("=== Testing Arbitrary Format Excel Scan (parent & student details.xlsx) ===");

  // Simulate user's real-world spreadsheet with non-template columns (e.g., 7 rows)
  const headers = [
    "Student Name", "Roll No", "Father Name", "Phone", "Class"
  ];

  const rows = [
    ["Aarav Sharma", "101", "Rajesh Sharma", "9876543211", "Class 1 - Section A"],
    ["Diya Patel", "102", "Suresh Patel", "9876543212", "Class 1 - Section A"],
    ["Ishaan Gupta", "103", "Anil Gupta", "9876543213", "Class 1 - Section A"],
    ["Ananya Verma", "104", "Vikram Verma", "9876543214", "Class 1 - Section A"],
    ["Rohan Kumar", "105", "Manoj Kumar", "9876543215", "Class 1 - Section A"],
    ["Pooja Reddy", "106", "Ramesh Reddy", "9876543216", "Class 1 - Section A"],
    ["Karthik Nair", "107", "Gopal Nair", "9876543217", "Class 1 - Section A"]
  ];

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

  const result = await parseAndScanWorkbook(buf, "STUDENT_PARENT");

  console.log("Scan Result Summary:");
  console.log("  isValidWorkbook:", result.isValidWorkbook);
  console.log("  detectedTemplate:", result.detectedTemplate);
  console.log("  totalRows:", result.totalRows);
  console.log("  validRowsCount:", result.validRowsCount);
  console.log("  errorRowsCount:", result.errorRowsCount);
  console.log("  readyToImportCount:", result.readyToImportCount);
  console.log("  fileError:", result.fileError);

  if (!result.isValidWorkbook) {
    throw new Error(`Workbook scan failed with fileError: ${result.fileError}`);
  }

  if (result.totalRows !== 7) {
    throw new Error(`Expected 7 rows, got ${result.totalRows}`);
  }

  if (result.rows.length !== 7) {
    throw new Error(`Expected 7 scanned rows in table, got ${result.rows.length}`);
  }

  // Verify first row data extraction
  const firstRow = result.rows[0];
  console.log("\nFirst row sample data:", firstRow.data);
  if (firstRow.data.studentFirstName !== "Aarav" || firstRow.data.studentLastName !== "Sharma") {
    throw new Error(`Student name extraction failed: ${firstRow.data.studentFirstName} ${firstRow.data.studentLastName}`);
  }

  if (firstRow.data.studentRollNo !== "101") {
    throw new Error(`Roll number extraction failed: ${firstRow.data.studentRollNo}`);
  }

  if (firstRow.data.admissionNo !== "ADM101") {
    throw new Error(`Admission number auto-default failed: ${firstRow.data.admissionNo}`);
  }

  if (firstRow.data.residenceType !== "DAYSCHOLAR") {
    throw new Error(`Residence auto-default failed: ${firstRow.data.residenceType}`);
  }

  if (!firstRow.data.parentEmail.includes("parent.101@")) {
    throw new Error(`Parent email auto-default failed: ${firstRow.data.parentEmail}`);
  }

  console.log("\n>>> SUCCESS: All 7 rows scanned, extracted, and populated cleanly into the preview table! <<<");
}

testParentScan()
  .catch(err => {
    console.error("Test failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
