import { prisma } from "../backend/db/prisma";
import { readExcelBuffer } from "../lib/import";

// Smart class resolver supporting parenthesized stream descriptions (e.g. "C(BIO - CS)")
export function resolveClassSmart(
  rawClass: string | undefined,
  classes: { id: string; name: string; section: string }[]
): { id: string; name: string; section: string; canonicalName: string } | null {
  if (!rawClass) return null;
  const str = rawClass.trim();
  if (!str) return null;

  // Ignore non-class roles like "Accounts assistant", "-", "None"
  const lower = str.toLowerCase();
  if (
    lower.includes("account") ||
    lower.includes("office") ||
    lower.includes("clerk") ||
    lower === "none" ||
    lower === "no" ||
    lower === "-" ||
    lower === "nil" ||
    lower === "na" ||
    lower === "n/a"
  ) {
    return null;
  }

  // 1. Exact ID match
  const byId = classes.find(c => c.id === str);
  if (byId) return { ...byId, canonicalName: `${byId.name} - Section ${byId.section}` };

  // 2. Extract class number/name and section letter
  // Matches "Class 11 - Section C", "Class 1-section B", "1-A", "Class 12 C", "Grade 2 A", "Class 11 section C"
  const classSecMatch = str.match(
    /(?:(?:class|grade|std|standard)\s*)?(\d{1,2}|ukg|lkg|pre-kg)\s*[-–/]?\s*(?:(?:section|sec)\s*)?([a-zA-Z0-9()\- ]+)/i
  );

  let targetClassNum = "";
  let targetSec = "";

  if (classSecMatch) {
    targetClassNum = classSecMatch[1].trim();
    targetSec = classSecMatch[2].trim();
  } else {
    // If just "LKG" or "UKG"
    const singleMatch = str.match(/^(lkg|ukg|pre-kg)$/i);
    if (singleMatch) {
      targetClassNum = singleMatch[1].toUpperCase();
    }
  }

  // 3. Try exact match on name & section
  for (const c of classes) {
    const cNameClean = c.name.toLowerCase().replace(/[^a-z0-9]/g, "");
    const cSecClean = c.section.toLowerCase().replace(/[^a-z0-9]/g, "");
    const targetClean = str.toLowerCase().replace(/[^a-z0-9]/g, "").replace(/section/g, "");

    if (`${cNameClean}${cSecClean}` === targetClean) {
      return { ...c, canonicalName: `${c.name} - Section ${c.section}` };
    }
  }

  // 4. Try prefix match on section letter if high school stream (e.g. target "C" matches "C(BIO - CS)")
  if (targetClassNum && targetSec) {
    const targetSecLetter = targetSec.charAt(0).toUpperCase();
    const targetClassClean = targetClassNum.toLowerCase().replace(/[^a-z0-9]/g, "");

    for (const c of classes) {
      const cClassNum = c.name.toLowerCase().replace(/[^a-z0-9]/g, "").replace(/class/g, "");
      const cSecLetter = c.section.trim().charAt(0).toUpperCase();

      // Only match if class number matches AND section starts with the exact section letter
      if (cClassNum === targetClassClean && cSecLetter === targetSecLetter) {
        // If the DB section is simple (e.g. "A") and target is "B", cSecLetter !== targetSecLetter, so NO MATCH.
        // If DB section is "C(BIO - CS)" and target is "C", cSecLetter === "C" === targetSecLetter, MATCH!
        return { ...c, canonicalName: `${c.name} - Section ${c.section}` };
      }
    }
  }

  // Do NOT fall back to Section A if section was specified!
  // If target did NOT have a section (e.g. just "LKG" or "Class 1"), only then match single section:
  if (targetClassNum && !targetSec) {
    const targetClassClean = targetClassNum.toLowerCase().replace(/[^a-z0-9]/g, "");
    for (const c of classes) {
      const cNameClean = c.name.toLowerCase().replace(/[^a-z0-9]/g, "").replace(/class/g, "");
      if (cNameClean === targetClassClean) {
        return { ...c, canonicalName: `${c.name} - Section ${c.section}` };
      }
    }
  }

  return null;
}

async function testAllClasses() {
  const wb = readExcelBuffer(require("fs").readFileSync("tests/fixtures/SRT_SCHOOL__TEACHER.xlsx"));
  const classes = await prisma.class.findMany({ select: { id: true, name: true, section: true } });

  console.log("=== Testing Class Matching for all 33 rows ===");
  wb.rows.forEach(r => {
    const rawClass = r.cells["Class Teacher"] || "";
    const matched = resolveClassSmart(rawClass, classes);
    const status = matched 
      ? `✅ Matched -> "${matched.canonicalName}" (ID: ${matched.id})`
      : rawClass.toLowerCase().includes("account") || !rawClass
      ? `ℹ️ Non-class / None`
      : `❌ NOT FOUND in DB -> "${rawClass}"`;

    console.log(`Row #${r.excelRowNumber} (${r.cells['NAME']}): Raw="${rawClass}" | ${status}`);
  });
}

testAllClasses().catch(console.error).finally(() => prisma.$disconnect());
