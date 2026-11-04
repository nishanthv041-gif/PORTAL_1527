import * as XLSX from "xlsx";
import { readExcelBuffer } from "../lib/import";
import { prisma } from "../backend/db/prisma";

async function inspectAllRows() {
  const wb = readExcelBuffer(require("fs").readFileSync("tests/fixtures/SRT_SCHOOL__TEACHER.xlsx"));
  const classes = await prisma.class.findMany({ select: { id: true, name: true, section: true } });

  console.log("=== All 33 Teacher Rows: Name, Gender, Class Teacher in Excel ===");
  wb.rows.forEach(r => {
    console.log(`Row #${r.excelRowNumber}: Name="${r.cells['NAME']}", Gender="${r.cells['Gender']}", ClassTeacher="${r.cells['Class Teacher']}", Email="${r.cells['User ID']}"`);
  });

  console.log("\n=== Existing Classes in Portal Database ===");
  classes.forEach(c => console.log(`  [${c.id}] "${c.name} - ${c.section}"`));
}

inspectAllRows().catch(console.error).finally(() => prisma.$disconnect());
