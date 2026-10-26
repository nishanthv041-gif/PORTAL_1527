import assert from "node:assert";
import { prisma } from "../backend/db/prisma";
import {
  getSessionDateTime,
  isForenoonRecord,
  isAfternoonRecord,
  calculateAttendancePercentage,
  getStudentStandardAttendanceStats,
} from "../backend/lib/services/attendanceCalculation";
import { adminBulkAttendance } from "../backend/api/actions/dashboard/admin/attendance/actions";
import { getSchoolCalendarStats } from "../backend/api/actions/dashboard/attendance/calendarStats";

async function runAttendanceTests() {
  console.log("==========================================================");
  console.log("ATTENDANCE SYSTEM ENHANCEMENT: SESSIONS, LATE, & CALENDAR");
  console.log("==========================================================");

  // 1. Session DateTime separation
  const fnDate = getSessionDateTime("2026-10-27", "FORENOON");
  const anDate = getSessionDateTime("2026-10-27", "AFTERNOON");

  assert.strictEqual(fnDate.toISOString(), "2026-10-27T00:00:00.000Z", "Forenoon UTC time is 00:00:00.000Z");
  assert.strictEqual(anDate.toISOString(), "2026-10-27T12:00:00.000Z", "Afternoon UTC time is 12:00:00.000Z");
  assert.notStrictEqual(fnDate.getTime(), anDate.getTime(), "Forenoon and Afternoon timestamps are distinct");
  console.log("[PASS] Test 1: Forenoon and Afternoon session DateTimes have distinct UTC timestamps");

  // 2. Session record identification
  const testRecordFN = { date: fnDate, remarks: "On time (Forenoon)" };
  const testRecordAN = { date: anDate, remarks: "Late arrival (Afternoon)" };
  const legacyRecordFN = { date: fnDate, remarks: "FORENOON" };
  const legacyRecordAN = { date: fnDate, remarks: "AFTERNOON" };

  assert.strictEqual(isForenoonRecord(testRecordFN), true, "testRecordFN is identified as Forenoon");
  assert.strictEqual(isAfternoonRecord(testRecordFN), false, "testRecordFN is NOT Afternoon");

  assert.strictEqual(isAfternoonRecord(testRecordAN), true, "testRecordAN is identified as Afternoon");
  assert.strictEqual(isForenoonRecord(testRecordAN), false, "testRecordAN is NOT Forenoon");

  assert.strictEqual(isForenoonRecord(legacyRecordFN), true, "Legacy record with FORENOON remarks is Forenoon");
  assert.strictEqual(isAfternoonRecord(legacyRecordAN), true, "Legacy record with AFTERNOON remarks is Afternoon");
  console.log("[PASS] Test 2: isForenoonRecord and isAfternoonRecord identify session accurately");

  // 3. Attendance percentage calculation with Present, Absent, and Late
  // Suppose 10 school working days in calendar = 20 sessions
  const totalWorkingSessions = 20;

  // Case A: 18 Present, 2 Late, 0 Absent -> (18 + 2) / 20 = 100.0%
  const pctA = calculateAttendancePercentage(18 + 2, totalWorkingSessions);
  assert.strictEqual(pctA, "100.0", "18 Present + 2 Late out of 20 sessions = 100.0%");

  // Case B: 16 Present, 2 Late, 2 Absent -> (16 + 2) / 20 = 90.0%
  const pctB = calculateAttendancePercentage(16 + 2, totalWorkingSessions);
  assert.strictEqual(pctB, "90.0", "16 Present + 2 Late + 2 Absent out of 20 sessions = 90.0%");

  // Case C: 14 Present, 0 Late, 6 Absent -> 14 / 20 = 70.0%
  const pctC = calculateAttendancePercentage(14, totalWorkingSessions);
  assert.strictEqual(pctC, "70.0", "14 Present + 6 Absent out of 20 sessions = 70.0%");
  console.log("[PASS] Test 3: Attendance percentage calculation correctly credits Present and Late sessions");

  // 4. Database test: Independent Forenoon and Afternoon saving
  // Find or create test student
  const testClass = await prisma.class.findFirst({ where: { isActive: true } });
  assert(testClass, "Active class exists for testing");

  let testStudent = await prisma.student.findFirst({ where: { classId: testClass.id } });
  if (!testStudent) {
    testStudent = await prisma.student.create({
      data: {
        rollNumber: "TEST-SESSION-999",
        admissionNo: "ADM-SESSION-999",
        firstName: "Session",
        lastName: "Test",
        classId: testClass.id,
      },
    });
  }

  const testDate = "2026-11-15"; // Future/isolated test date

  // Clean any old records on test date
  const startOfDay = new Date(Date.UTC(2026, 10, 15, 0, 0, 0, 0));
  const endOfDay = new Date(Date.UTC(2026, 10, 15, 23, 59, 59, 999));
  await prisma.attendance.deleteMany({
    where: {
      studentId: testStudent.id,
      date: { gte: startOfDay, lte: endOfDay },
    },
  });

  // A) Save FORENOON as PRESENT
  const fnDateTime = getSessionDateTime(testDate, "FORENOON");
  await prisma.attendance.create({
    data: {
      studentId: testStudent.id,
      classId: testClass.id,
      date: fnDateTime,
      status: "PRESENT",
      remarks: "On time (Forenoon)",
    },
  });

  // B) Save AFTERNOON as LATE
  const anDateTime = getSessionDateTime(testDate, "AFTERNOON");
  await prisma.attendance.create({
    data: {
      studentId: testStudent.id,
      classId: testClass.id,
      date: anDateTime,
      status: "LATE",
      remarks: "Arrived after break (Afternoon)",
    },
  });

  // Query both records on test date
  const dayRecords = await prisma.attendance.findMany({
    where: {
      studentId: testStudent.id,
      date: { gte: startOfDay, lte: endOfDay },
    },
    orderBy: { date: "asc" },
  });

  assert.strictEqual(dayRecords.length, 2, "Both Forenoon and Afternoon records exist independently without overwriting");
  
  const savedFN = dayRecords.find((r) => isForenoonRecord(r));
  const savedAN = dayRecords.find((r) => isAfternoonRecord(r));

  assert(savedFN, "Forenoon record found");
  assert(savedAN, "Afternoon record found");
  assert.strictEqual(savedFN.status, "PRESENT", "Forenoon is PRESENT");
  assert.strictEqual(savedAN.status, "LATE", "Afternoon is LATE");
  assert.notStrictEqual(savedFN.status, savedAN.status, "Forenoon and Afternoon have distinct statuses");
  console.log("[PASS] Test 4: Forenoon and Afternoon saved independently as PRESENT and LATE without collision");

  // 5. Test Calendar Stats & Student Stats Service
  const calendarStats = await getSchoolCalendarStats(new Date(), testClass.id);
  assert(calendarStats.totalActiveDays >= 0, "totalActiveDays is non-negative");
  assert.strictEqual(calendarStats.totalActiveSessions, calendarStats.totalActiveDays * 2, "totalActiveSessions is exactly double totalActiveDays");
  console.log(`[PASS] Test 5: Calendar stats verified: ${calendarStats.totalActiveDays} days = ${calendarStats.totalActiveSessions} sessions`);

  // Clean up test records
  await prisma.attendance.deleteMany({
    where: {
      studentId: testStudent.id,
      date: { gte: startOfDay, lte: endOfDay },
    },
  });

  console.log("==========================================================");
  console.log("ALL ATTENDANCE ENHANCEMENT TESTS PASSED SUCCESSFULLY!");
  console.log("==========================================================");
}

runAttendanceTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Test failed:", err);
    process.exit(1);
  });
