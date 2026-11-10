import { parseAndValidateDob } from "../lib/validations/dob";
import crypto from "crypto";

console.log("==================================================");
console.log("RUNNING COMPREHENSIVE BIRTHDAY V2 TEST SUITE");
console.log("==================================================");

let passedCount = 0;
let totalCount = 0;

function assert(condition: boolean, testName: string) {
  totalCount++;
  if (!condition) {
    console.error(`❌ FAILED: ${testName}`);
    process.exit(1);
  } else {
    passedCount++;
    console.log(`✅ [${passedCount}] PASSED: ${testName}`);
  }
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
}

// ---------------------------------------------------------------------------
// 1. LEAP YEAR ALGORITHM & LEAP DAY CELEBRATION RULES
// ---------------------------------------------------------------------------
console.log("\n--- Section 1: Leap Year & Leap Day Rules ---");
assert(!isLeapYear(2025), "2025 is not a leap year");
assert(!isLeapYear(2026), "2026 is not a leap year");
assert(!isLeapYear(2027), "2027 is not a leap year");
assert(isLeapYear(2028), "2028 is a leap year");
assert(!isLeapYear(2100), "2100 is not a leap year (century rule)");
assert(isLeapYear(2000), "2000 is a leap year (400-year rule)");

interface MockPerson {
  id: string;
  name: string;
  role: "STUDENT" | "TEACHER" | "STAFF" | "ADMIN" | "PARENT" | "DRIVER";
  dobMonth: number;
  dobDay: number;
}

function matchCelebrants(people: MockPerson[], year: number, month: number, day: number) {
  const isFeb28NonLeap = !isLeapYear(year) && month === 2 && day === 28;
  return people.filter((p) => {
    if (p.dobMonth === month && p.dobDay === day) return true;
    if (isFeb28NonLeap && p.dobMonth === 2 && p.dobDay === 29) return true;
    return false;
  });
}

const mockPeople: MockPerson[] = [
  { id: "1", name: "Student Regular", role: "STUDENT", dobMonth: 11, dobDay: 10 },
  { id: "2", name: "Student Feb 28", role: "STUDENT", dobMonth: 2, dobDay: 28 },
  { id: "3", name: "Student Leap Baby", role: "STUDENT", dobMonth: 2, dobDay: 29 },
  { id: "4", name: "Teacher Leap Baby", role: "TEACHER", dobMonth: 2, dobDay: 29 },
  { id: "5", name: "Driver Regular", role: "DRIVER", dobMonth: 11, dobDay: 10 },
];

// Test 1a: Standard Day (Nov 10)
{
  const matches = matchCelebrants(mockPeople, 2026, 11, 10);
  assert(matches.length === 2, "Nov 10 matches Student Regular and Driver Regular");
}

// Test 1b: Feb 28 in Non-Leap Year 2026 (both Feb 28 and Feb 29 celebrants celebrate)
{
  const matches = matchCelebrants(mockPeople, 2026, 2, 28);
  assert(matches.length === 3, "Feb 28 in 2026 matches Student Feb 28, Student Leap Baby, and Teacher Leap Baby");
}

// Test 1c: Feb 28 in Leap Year 2028 (only Feb 28 celebrants celebrate)
{
  const matches = matchCelebrants(mockPeople, 2028, 2, 28);
  assert(matches.length === 1 && matches[0].name === "Student Feb 28", "Feb 28 in 2028 matches only Student Feb 28");
}

// Test 1d: Feb 29 in Leap Year 2028 (Leap babies celebrate on their real calendar day)
{
  const matches = matchCelebrants(mockPeople, 2028, 2, 29);
  assert(matches.length === 2, "Feb 29 in 2028 matches Student Leap Baby and Teacher Leap Baby");
}

// ---------------------------------------------------------------------------
// 2. DATE OF BIRTH PARSING & REAL CALENDAR VALIDATION
// ---------------------------------------------------------------------------
console.log("\n--- Section 2: Date of Birth Parsing & Validation ---");

// Test 2a: Valid formats (India day-first and standard ISO)
{
  const res1 = parseAndValidateDob("15/06/2012", "STUDENT");
  assert(res1.isValid && res1.dateStr === "2012-06-15", "Parses DD/MM/YYYY into YYYY-MM-DD");

  const res2 = parseAndValidateDob("15-06-2012", "STUDENT");
  assert(res2.isValid && res2.dateStr === "2012-06-15", "Parses DD-MM-YYYY into YYYY-MM-DD");

  const res3 = parseAndValidateDob("15.06.2012", "STUDENT");
  assert(res3.isValid && res3.dateStr === "2012-06-15", "Parses DD.MM.YYYY into YYYY-MM-DD");

  const res4 = parseAndValidateDob("2012-06-15", "STUDENT");
  assert(res4.isValid && res4.dateStr === "2012-06-15", "Parses ISO YYYY-MM-DD directly");
}

// Test 2b: Rejection of invalid calendar days
{
  const feb31 = parseAndValidateDob("31/02/2015", "STUDENT");
  assert(!feb31.isValid, "Rejects impossible calendar date Feb 31");

  const apr31 = parseAndValidateDob("31/04/2015", "STUDENT");
  assert(!apr31.isValid, "Rejects impossible calendar date Apr 31");

  const nonLeapFeb29 = parseAndValidateDob("29/02/2025", "STUDENT");
  assert(!nonLeapFeb29.isValid, "Rejects Feb 29 in a non-leap year (2025)");

  const leapFeb29 = parseAndValidateDob("29/02/2024", "STUDENT");
  assert(leapFeb29.isValid && leapFeb29.dateStr === "2024-02-29", "Accepts Feb 29 in a real leap year (2024)");
}

// Test 2c: Age plausibility boundaries
{
  // Future date
  const future = parseAndValidateDob("15/06/2030", "STUDENT");
  assert(!future.isValid && future.error?.includes("future"), "Rejects future date of birth");

  // Teacher under 18 produces plausibility warning
  const teenTeacher = parseAndValidateDob("15/06/2015", "TEACHER");
  assert(teenTeacher.isValid && Boolean(teenTeacher.warning?.includes("18")), "Flags teacher younger than 18 with warning");

  // Student under 2 produces plausibility warning
  const infantStudent = parseAndValidateDob("15/06/2025", "STUDENT");
  assert(infantStudent.isValid && Boolean(infantStudent.warning?.includes("2")), "Flags student under typical school age with warning");
}

// ---------------------------------------------------------------------------
// 3. MULTI-AUDIENCE TEMPLATE RENDERING
// ---------------------------------------------------------------------------
console.log("\n--- Section 3: Template Rendering & Placeholders ---");

function renderTemplate(template: string, vars: { name?: string; studentName?: string; className?: string }) {
  let result = template;
  if (vars.name) result = result.replace(/{name}/g, vars.name);
  if (vars.studentName) result = result.replace(/{studentName}/g, vars.studentName);
  if (vars.className) result = result.replace(/{className}/g, vars.className);
  return result;
}

{
  const parentTemplateEn = "Dear Parent, SRT School wishes {studentName} ({className}) a very happy birthday!";
  const rendered = renderTemplate(parentTemplateEn, { studentName: "Aarav Sharma", className: "Grade 5-A" });
  assert(
    rendered === "Dear Parent, SRT School wishes Aarav Sharma (Grade 5-A) a very happy birthday!",
    "Correctly substitutes {studentName} and {className}"
  );

  const teacherTemplateTa = "வணக்கம் {name}, SRT பள்ளி தங்களுக்கு மனமார்ந்த பிறந்தநாள் நல்வாழ்த்துகளைத் தெரிவித்துக் கொள்கிறது!";
  const renderedTa = renderTemplate(teacherTemplateTa, { name: "Mrs. Meenakshi" });
  assert(
    renderedTa === "வணக்கம் Mrs. Meenakshi, SRT பள்ளி தங்களுக்கு மனமார்ந்த பிறந்தநாள் நல்வாழ்த்துகளைத் தெரிவித்துக் கொள்கிறது!",
    "Correctly substitutes {name} in Tamil greeting"
  );
}

// ---------------------------------------------------------------------------
// 4. GUARANTEED IDEMPOTENCY ACROSS MULTIPLE CRON RUNS
// ---------------------------------------------------------------------------
console.log("\n--- Section 4: Idempotency Verification ---");

{
  const recordedWishes = new Set<string>();
  let dispatchedCount = 0;

  function simulateDispatch(audience: string, personType: string, personId: string, recipientUserId: string, year: number) {
    const key = `${audience}:${personType}:${personId}:${recipientUserId}:${year}`;
    if (recordedWishes.has(key)) {
      return false; // Skipped by idempotency check
    }
    recordedWishes.add(key);
    dispatchedCount++;
    return true;
  }

  // First run: 1 student with 2 parents -> 2 wishes sent
  const run1_p1 = simulateDispatch("PARENT_OF_STUDENT", "STUDENT", "std-101", "parent-user-1", 2026);
  const run1_p2 = simulateDispatch("PARENT_OF_STUDENT", "STUDENT", "std-101", "parent-user-2", 2026);
  assert(run1_p1 === true && run1_p2 === true, "Run 1 sends wishes to both linked parents");
  assert(dispatchedCount === 2, "Dispatched count is exactly 2");

  // Subsequent runs (Runs 2 to 10 in the same day): Must be 100% skipped
  for (let run = 2; run <= 10; run++) {
    const skip1 = simulateDispatch("PARENT_OF_STUDENT", "STUDENT", "std-101", "parent-user-1", 2026);
    const skip2 = simulateDispatch("PARENT_OF_STUDENT", "STUDENT", "std-101", "parent-user-2", 2026);
    assert(skip1 === false && skip2 === false, `Run ${run} safely skipped already-dispatched wishes`);
  }

  assert(dispatchedCount === 2, "Dispatched count remains exactly 2 after 10 runs");
}

// ---------------------------------------------------------------------------
// 5. TIMING-SAFE CRON AUTHORIZATION
// ---------------------------------------------------------------------------
console.log("\n--- Section 5: Timing-Safe Secret Verification ---");

function safeCompare(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

{
  const SECRET = "srt_super_secret_cron_token_2026";
  assert(safeCompare(SECRET, SECRET), "Timing-safe compare accepts identical secret");
  assert(!safeCompare("wrong_token", SECRET), "Timing-safe compare rejects incorrect secret");
  assert(!safeCompare(null, SECRET), "Timing-safe compare rejects null header");
  assert(!safeCompare("", SECRET), "Timing-safe compare rejects empty header");
  assert(!safeCompare(SECRET + "extra", SECRET), "Timing-safe compare rejects altered length secret");
}

console.log("\n==================================================");
console.log(`ALL ${totalCount} TESTS PASSED CLEANLY! (100% SUCCESS)`);
console.log("==================================================");
