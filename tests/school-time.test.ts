import {
  SCHOOL_TIMEZONE,
  getSchoolNow,
  getSchoolToday,
  getSchoolWeekday,
  formatSchoolDate,
  startOfSchoolDay,
  endOfSchoolDay,
  msUntilNextSchoolMidnight,
  isSameSchoolDay,
  isSchoolToday,
  getNextSchoolDay,
} from "../lib/time";

console.log("=== RUNNING SCHOOL TIME UNIT TESTS ===");

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${msg}`);
    process.exit(1);
  } else {
    console.log(`✅ PASSED: ${msg}`);
  }
}

// 1. Clock Test 1: 2026-11-03 23:30 UTC (= Wed 05:00 IST) -> WEDNESDAY / 2026-11-04
{
  const testDate = new Date("2026-11-03T23:30:00.000Z");
  const today = getSchoolToday(testDate);
  const weekday = getSchoolWeekday(testDate);
  assert(today === "2026-11-04", `Expected 2026-11-04, got ${today}`);
  assert(weekday.name === "WEDNESDAY", `Expected WEDNESDAY, got ${weekday.name}`);
  assert(weekday.isoDay === 3, `Expected ISO day 3, got ${weekday.isoDay}`);
}

// 2. Clock Test 2: 2026-11-04 18:29 UTC (= Wed 23:59 IST) -> WEDNESDAY / 2026-11-04
{
  const testDate = new Date("2026-11-04T18:29:00.000Z");
  const today = getSchoolToday(testDate);
  const weekday = getSchoolWeekday(testDate);
  assert(today === "2026-11-04", `Expected 2026-11-04, got ${today}`);
  assert(weekday.name === "WEDNESDAY", `Expected WEDNESDAY, got ${weekday.name}`);
}

// 3. Clock Test 3: 2026-11-04 18:30 UTC (= Thu 00:00 IST) -> THURSDAY / 2026-11-05
{
  const testDate = new Date("2026-11-04T18:30:00.000Z");
  const today = getSchoolToday(testDate);
  const weekday = getSchoolWeekday(testDate);
  assert(today === "2026-11-05", `Expected 2026-11-05, got ${today}`);
  assert(weekday.name === "THURSDAY", `Expected THURSDAY, got ${weekday.name}`);
  assert(weekday.isoDay === 4, `Expected ISO day 4, got ${weekday.isoDay}`);
}

// 4. Month end transition: 2026-10-31 18:30 UTC (= Nov 1 00:00 IST)
{
  const testDate = new Date("2026-10-31T18:30:00.000Z");
  const today = getSchoolToday(testDate);
  const weekday = getSchoolWeekday(testDate);
  assert(today === "2026-11-01", `Expected 2026-11-01, got ${today}`);
  assert(weekday.name === "SUNDAY", `Expected SUNDAY, got ${weekday.name}`);
}

// 5. Year end transition: 2026-12-31 18:30 UTC (= Jan 1 2027 00:00 IST)
{
  const testDate = new Date("2026-12-31T18:30:00.000Z");
  const today = getSchoolToday(testDate);
  const weekday = getSchoolWeekday(testDate);
  assert(today === "2027-01-01", `Expected 2027-01-01, got ${today}`);
  assert(weekday.name === "FRIDAY", `Expected FRIDAY, got ${weekday.name}`);
}

// 6. Sunday check: 2026-11-08 06:00 UTC (= 11:30 AM IST)
{
  const testDate = new Date("2026-11-08T06:00:00.000Z");
  const weekday = getSchoolWeekday(testDate);
  assert(weekday.name === "SUNDAY", `Expected SUNDAY, got ${weekday.name}`);
  assert(weekday.sundayZero === 0, `Expected sundayZero 0, got ${weekday.sundayZero}`);
  const nextDay = getNextSchoolDay(testDate, ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"]);
  assert(nextDay.name === "MONDAY", `Expected next school day after Sunday to be MONDAY, got ${nextDay.name}`);
  assert(nextDay.dateStr === "2026-11-09", `Expected next school day date to be 2026-11-09, got ${nextDay.dateStr}`);
}

// 7. Database range queries: startOfSchoolDay and endOfSchoolDay
{
  const start = startOfSchoolDay("2026-11-04");
  const end = endOfSchoolDay("2026-11-04");
  assert(start.toISOString() === "2026-11-03T18:30:00.000Z", `startOfSchoolDay UTC mismatch: ${start.toISOString()}`);
  assert(end.toISOString() === "2026-11-04T18:29:59.999Z", `endOfSchoolDay UTC mismatch: ${end.toISOString()}`);
}

// 8. Midnight countdown test
{
  // 1 minute before midnight in IST: 2026-11-04 18:29:00 UTC
  const testDate = new Date("2026-11-04T18:29:00.000Z");
  const ms = msUntilNextSchoolMidnight(testDate);
  assert(ms === 60000, `Expected exactly 60000ms until midnight, got ${ms}`);
}

// 9. Format test
{
  const formatted = formatSchoolDate(new Date("2026-11-03T23:30:00.000Z"));
  assert(formatted.includes("4 Nov 2026") || formatted.includes("04 Nov 2026"), `Expected 4 Nov 2026, got ${formatted}`);
}

console.log("🎉 ALL TIME ENGINE TESTS PASSED PERFECTLY!");
