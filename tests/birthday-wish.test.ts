import { getSchoolNow } from "../lib/time";

console.log("=== RUNNING STUDENT BIRTHDAY WISH UNIT TESTS ===");

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${msg}`);
    process.exit(1);
  } else {
    console.log(`✅ PASSED: ${msg}`);
  }
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
}

// 1. Leap Year Algorithm Verification
{
  assert(!isLeapYear(2025), "2025 should not be leap year");
  assert(!isLeapYear(2026), "2026 should not be leap year");
  assert(!isLeapYear(2027), "2027 should not be leap year");
  assert(isLeapYear(2028), "2028 should be leap year");
  assert(isLeapYear(2000), "2000 should be leap year (divisible by 400)");
  assert(!isLeapYear(1900), "1900 should not be leap year (century rule)");
}

// 2. Birthday Matcher Simulation with Asia/Kolkata Clocks
interface MockStudent {
  id: string;
  name: string;
  dobMonth: number;
  dobDay: number;
}

function matchBirthdays(students: MockStudent[], year: number, month: number, day: number) {
  const isFeb28NonLeap = !isLeapYear(year) && month === 2 && day === 28;

  return students.filter((s) => {
    if (s.dobMonth === month && s.dobDay === day) return true;
    if (isFeb28NonLeap && s.dobMonth === 2 && s.dobDay === 29) return true;
    return false;
  });
}

const mockStudents: MockStudent[] = [
  { id: "std-1", name: "Aarav", dobMonth: 11, dobDay: 5 },
  { id: "std-2", name: "Diya", dobMonth: 11, dobDay: 6 },
  { id: "std-3", name: "Kavya", dobMonth: 2, dobDay: 28 },
  { id: "std-4", name: "Rohan (Leap Baby)", dobMonth: 2, dobDay: 29 },
];

// Test 2a: Standard Day (Nov 5)
{
  const matches = matchBirthdays(mockStudents, 2026, 11, 5);
  assert(matches.length === 1 && matches[0].name === "Aarav", "Expected Aarav on Nov 5");
}

// Test 2b: Non-Leap Year Feb 28 (both Feb 28 and Feb 29 students receive wishes)
{
  const matches = matchBirthdays(mockStudents, 2026, 2, 28);
  assert(matches.length === 2, "Both Kavya and Rohan should match on Feb 28 in non-leap year 2026");
  const names = matches.map((m) => m.name);
  assert(names.includes("Kavya") && names.includes("Rohan (Leap Baby)"), "Expected both Feb 28 & 29 students");
}

// Test 2c: Leap Year Feb 28 (Only Kavya receives wish on Feb 28, 2028)
{
  const matches = matchBirthdays(mockStudents, 2028, 2, 28);
  assert(matches.length === 1 && matches[0].name === "Kavya", "Only Kavya should match on Feb 28 in leap year 2028");
}

// Test 2d: Leap Year Feb 29 (Rohan receives wish on Feb 29, 2028)
{
  const matches = matchBirthdays(mockStudents, 2028, 2, 29);
  assert(matches.length === 1 && matches[0].name === "Rohan (Leap Baby)", "Rohan should match on Feb 29 in leap year 2028");
}

// 3. Idempotency Simulation: 5 Cron runs in a single day
{
  const wishesDb = new Set<string>(); // composite key: `${studentId}_${year}`
  let totalNotificationsCreated = 0;

  const runCron = (studentId: string, year: number) => {
    const key = `${studentId}_${year}`;
    if (wishesDb.has(key)) {
      return false; // Skipped, already wished
    }
    wishesDb.add(key);
    totalNotificationsCreated++;
    return true;
  };

  // Run 1: Wishes sent
  const run1 = runCron("std-1", 2026);
  assert(run1 === true, "Run 1 should send wish");
  assert(totalNotificationsCreated === 1, "Expected 1 notification created");

  // Runs 2-5: Must be safely skipped (Idempotent)
  for (let i = 2; i <= 5; i++) {
    const runI = runCron("std-1", 2026);
    assert(runI === false, `Run ${i} should skip sending already-wished student`);
  }
  assert(totalNotificationsCreated === 1, "Total notifications created across 5 runs must be exactly 1");

  // Next year (2027): Wish should be sent again
  const nextYearRun = runCron("std-1", 2027);
  assert(nextYearRun === true, "Should send wish again in 2027");
  assert(totalNotificationsCreated === 2, "Expected exactly 2 notifications across 2 years");
}

// 4. Notification Message Template Verification
{
  const student = { firstName: "Ananya", lastName: "Sharma" };
  const studentFullName = `${student.firstName} ${student.lastName}`.trim();
  const title = `Happy Birthday, ${student.firstName}! 🎂`;
  const content = `Dear Parent, SRT School wishes ${studentFullName} a very happy birthday! May this year bring happiness, good health, and abundant success. - SRT Universal School`;

  assert(title.includes("Ananya"), "Title must mention student name");
  assert(title.includes("🎂"), "Title must contain festive icon");
  assert(content.includes("SRT School"), "Message must be from 'SRT School'");
  assert(content.includes("Ananya Sharma"), "Message body must mention full student name");
}

// 5. Asia/Kolkata Clock Verification
{
  const now = getSchoolNow();
  assert(now.year >= 2026, "Current school year should be >= 2026");
  assert(now.month >= 1 && now.month <= 12, "Month must be between 1 and 12");
  assert(now.day >= 1 && now.day <= 31, "Day must be between 1 and 31");
}

console.log("🎉 ALL BIRTHDAY WISH & IDEMPOTENCY UNIT TESTS PASSED!");

