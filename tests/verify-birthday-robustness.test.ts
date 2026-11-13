import { prisma } from "../backend/db/prisma";
import {
  getTodayIST,
  isBirthdayToday,
  isBirthdayInPastDays,
  parseDobToParts,
  formatDobDmy,
  isLeapYear,
} from "../lib/birthday";
import { parseAndValidateDob } from "../lib/validations/dob";
import { processUniversalBirthdayWishes, dispatchImmediateBirthdayWishForPerson } from "../app/api/cron/birthdays/route";
import { parseBirthdayCardPayload, getNotificationDisplayText } from "../frontend/components/birthdays/birthdayCardUtils";

async function runTestSuite() {
  console.log("==================================================================");
  console.log("SRT PORTAL - UNIVERSAL BIRTHDAY ENGINE VERIFICATION TEST SUITE");
  console.log("==================================================================");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, msg: string) {
    if (condition) {
      console.log(`✓ [PASS] ${msg}`);
      passed++;
    } else {
      console.error(`✗ [FAIL] ${msg}`);
      failed++;
    }
  }

  // ---------------------------------------------------------------------------
  // TEST 1: Asia/Kolkata (IST) Midnight Boundary Handling (23:59 vs 00:01 IST)
  // ---------------------------------------------------------------------------
  console.log("\n--- TEST 1: Asia/Kolkata Midnight Boundary Calculation ---");
  // 2026-11-13 23:59:00 IST = 2026-11-13 18:29:00 UTC
  const lateNightUtc = new Date(Date.UTC(2026, 10, 13, 18, 29, 0));
  const lateNightIST = getTodayIST(lateNightUtc);
  assert(lateNightIST.year === 2026 && lateNightIST.month === 11 && lateNightIST.day === 13, "23:59 IST is strictly 13 November");

  // 2026-11-14 00:01:00 IST = 2026-11-13 18:31:00 UTC
  const justAfterMidnightUtc = new Date(Date.UTC(2026, 10, 13, 18, 31, 0));
  const justAfterMidnightIST = getTodayIST(justAfterMidnightUtc);
  assert(justAfterMidnightIST.year === 2026 && justAfterMidnightIST.month === 11 && justAfterMidnightIST.day === 14, "00:01 IST has transitioned to 14 November");

  // ---------------------------------------------------------------------------
  // TEST 2: Strict DOB 10-11-2008 Parse & Matching (10 November vs 11 October)
  // ---------------------------------------------------------------------------
  console.log("\n--- TEST 2: Strict DOB Parsing & Indian Date Format Precedence ---");
  const dmy1 = parseDobToParts("10-11-2008");
  assert(dmy1?.day === 10 && dmy1?.month === 11 && dmy1?.year === 2008, "10-11-2008 parses as Day: 10, Month: 11 (November), Year: 2008");

  const dmySlash = parseDobToParts("10/11/2008");
  assert(dmySlash?.day === 10 && dmySlash?.month === 11 && dmySlash?.year === 2008, "10/11/2008 parses as Day: 10, Month: 11, Year: 2008");

  const validationRes = parseAndValidateDob("10-11-2008", "STUDENT", true);
  assert(validationRes.isValid && validationRes.day === 10 && validationRes.month === 11, "Validation utility accepts 10-11-2008 as 10 November");

  // Verify rejection of impossible dates
  const invalidFeb = parseAndValidateDob("31/02/2015", "STUDENT", true);
  assert(!invalidFeb.isValid, "Rejects impossible calendar date (31/02/2015)");

  const invalidMonth = parseAndValidateDob("10/15/2010", "STUDENT", true);
  assert(!invalidMonth.isValid, "Rejects invalid month (15)");

  // Matching check:
  // On 10 November, isBirthdayToday must be TRUE
  const isNov10Match = isBirthdayToday("10-11-2008", { month: 11, day: 10, year: 2026 });
  assert(isNov10Match === true, "10-11-2008 student matches on 10 November");

  // On 11 October, isBirthdayToday must be FALSE
  const isOct11Match = isBirthdayToday("10-11-2008", { month: 10, day: 11, year: 2026 });
  assert(isOct11Match === false, "10-11-2008 student NEVER matches on 11 October");

  // ---------------------------------------------------------------------------
  // TEST 3: Leap Year (Feb 29) Handling
  // ---------------------------------------------------------------------------
  console.log("\n--- TEST 3: Leap Year (Feb 29) Rule ---");
  assert(!isLeapYear(2026), "2026 is non-leap year");
  assert(isLeapYear(2028), "2028 is leap year");

  // In non-leap year 2026, Feb 29 celebrants celebrate on Feb 28
  const leapCelebratesOnFeb28In2026 = isBirthdayToday("2004-02-29", { month: 2, day: 28, year: 2026 });
  assert(leapCelebratesOnFeb28In2026 === true, "Feb 29 celebrant celebrates on Feb 28 in non-leap year 2026");

  // In leap year 2028, Feb 29 celebrants celebrate on Feb 29
  const leapCelebratesOnFeb29In2028 = isBirthdayToday("2004-02-29", { month: 2, day: 29, year: 2028 });
  const leapNotOnFeb28In2028 = isBirthdayToday("2004-02-29", { month: 2, day: 28, year: 2028 });
  assert(leapCelebratesOnFeb29In2028 === true && leapNotOnFeb28In2028 === false, "Feb 29 celebrant celebrates on Feb 29 (not Feb 28) in leap year 2028");

  // ---------------------------------------------------------------------------
  // TEST 4: Missed Day Safety Catch-up (2-day window)
  // ---------------------------------------------------------------------------
  console.log("\n--- TEST 4: Missed Day Safety Catch-up Window ---");
  const todayIST = getTodayIST();
  // Yesterday's date
  const yesterdayInstant = new Date(Date.UTC(todayIST.year, todayIST.month - 1, todayIST.day - 1, 12, 0, 0) - 19800000);
  const yesterdayParts = getTodayIST(yesterdayInstant);
  const yesterdayDob = `2005-${String(yesterdayParts.month).padStart(2, "0")}-${String(yesterdayParts.day).padStart(2, "0")}`;

  const catchupCheck = isBirthdayInPastDays(yesterdayDob, 2);
  assert(catchupCheck !== null && catchupCheck.isLate === true, "Yesterday's birthday detected within 2-day catch-up window as isLate: true");

  // ---------------------------------------------------------------------------
  // TEST 5: Idempotency with BirthdayWishLog
  // ---------------------------------------------------------------------------
  console.log("\n--- TEST 5: BirthdayWishLog Unique Constraint & Idempotency ---");
  const testUserId = `test-idemp-${Date.now()}`;
  const testUser = await prisma.user.create({
    data: {
      id: testUserId,
      email: `test-idemp-${Date.now()}@srtportal.test`,
      name: "Idempotency Test User",
      role: "TEACHER",
    },
  });

  // Create initial log
  const firstLog = await prisma.birthdayWishLog.create({
    data: {
      userId: testUser.id,
      year: 2026,
      status: "SENT",
    },
  });
  assert(Boolean(firstLog.id), "First BirthdayWishLog created successfully for year 2026");

  // Attempt duplicate insert for same user and year
  let caughtDuplicate = false;
  try {
    await prisma.birthdayWishLog.create({
      data: {
        userId: testUser.id,
        year: 2026,
        status: "SENT",
      },
    });
  } catch (err: any) {
    caughtDuplicate = true;
  }
  assert(caughtDuplicate, "Prisma rejects duplicate BirthdayWishLog for (userId, year) via unique constraint");

  // Clean up test user
  await prisma.birthdayWishLog.deleteMany({ where: { userId: testUser.id } }).catch(() => {});
  await prisma.user.delete({ where: { id: testUser.id } }).catch(() => {});

  // ---------------------------------------------------------------------------
  // TEST 6: Live End-to-End Test: Celebrant Wishes Dispatched, Pop-up & Log Verified
  // ---------------------------------------------------------------------------
  console.log("\n--- TEST 6: Live End-to-End Birthday Dispatch, Pop-up Payload & Cleanup ---");
  const liveUserId = `test-live-${Date.now()}`;
  const liveUser = await prisma.user.create({
    data: {
      id: liveUserId,
      email: `celebrant-${Date.now()}@srtportal.test`,
      name: "Pranav Celebrant",
      role: "TEACHER",
      dateOfBirth: new Date(`${todayIST.year}-${String(todayIST.month).padStart(2, "0")}-${String(todayIST.day).padStart(2, "0")}T00:00:00.000Z`),
    },
  });

  const teacherRecord = await prisma.teacher.create({
    data: {
      userId: liveUser.id,
      phone: "9988776655",
      dateOfBirth: liveUser.dateOfBirth,
    },
  });

  // Call processUniversalBirthdayWishes for today
  const runResult = await processUniversalBirthdayWishes(
    { year: todayIST.year, month: todayIST.month, day: todayIST.day },
    "live-test-suite",
    false
  );
  assert(runResult.success, "processUniversalBirthdayWishes completed with status: COMPLETED");

  // Verify in-app notification was created with rich card payload
  const createdNotif = await prisma.notification.findFirst({
    where: {
      userId: liveUser.id,
      category: "BIRTHDAY",
    },
    orderBy: { createdAt: "desc" },
  });
  assert(Boolean(createdNotif), "Universal in-app notification created for celebrant");

  const parsedCard = parseBirthdayCardPayload(createdNotif?.content);
  assert(parsedCard !== null, "Notification content contains serialized CARD_PAYLOAD");
  assert(parsedCard?.senderName === "PRANAV.J", "Card has Correspondent senderName PRANAV.J");
  assert(parsedCard?.ammanPhotoUrl === "/assets/birthday/amman.jpg", "Card has framed Amman photo URL");
  assert(parsedCard?.schoolLogo === "/logo/srt-logo.svg", "Card has circular SRT logo");

  const displayText = getNotificationDisplayText(createdNotif?.content);
  assert(!displayText.startsWith("{") && !displayText.startsWith("CARD_PAYLOAD"), "getNotificationDisplayText decodes card into clean human summary");

  // Verify BirthdayWishLog entry exists
  const wishLog = await prisma.birthdayWishLog.findUnique({
    where: { userId_year: { userId: liveUser.id, year: todayIST.year } },
  });
  assert(Boolean(wishLog), "BirthdayWishLog recorded with status: SENT");

  // Test immediate send upon saving DOB for celebrant
  const immediateRes = await dispatchImmediateBirthdayWishForPerson({
    personType: "teacher",
    personId: teacherRecord.id,
    forceSend: true,
  });
  assert(immediateRes.isBirthdayToday === true, "dispatchImmediateBirthdayWishForPerson accurately identifies today as birthday");

  // Cleanup live test records
  await prisma.notification.deleteMany({ where: { userId: liveUser.id } }).catch(() => {});
  await prisma.birthdayWish.deleteMany({ where: { recipientUserId: liveUser.id } }).catch(() => {});
  await prisma.birthdayWishLog.deleteMany({ where: { userId: liveUser.id } }).catch(() => {});
  await prisma.teacher.delete({ where: { id: teacherRecord.id } }).catch(() => {});
  await prisma.user.delete({ where: { id: liveUser.id } }).catch(() => {});

  console.log("\n==================================================================");
  console.log(`TEST SUMMARY: ${passed} PASSED | ${failed} FAILED`);
  console.log("==================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((e) => {
  console.error("Test execution failed:", e);
  process.exit(1);
});
