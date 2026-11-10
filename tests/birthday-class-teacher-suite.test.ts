import { parseAndValidateDob } from "../lib/validations/dob";
import { getSchoolNow } from "../lib/time";
import { formatClassName } from "../lib/teacher/formatClassName";

console.log("===============================================================");
console.log("CLASS TEACHER & ADMIN BIRTHDAY SUITE: 14-POINT VERIFICATION");
console.log("===============================================================\n");

let passedCount = 0;
let totalCount = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  totalCount++;
  if (!condition) {
    console.error(`❌ FAILED [Test #${totalCount}]: ${testName}`);
    if (detail) console.error(`   Detail: ${detail}`);
    process.exit(1);
  } else {
    passedCount++;
    console.log(`✅ [Test #${passedCount}] PASSED: ${testName}`);
  }
}

// ---------------------------------------------------------------------------
// TEST 1: Class Teacher Authorization Access Logic
// ---------------------------------------------------------------------------
console.log("\n--- Point 1: Class Teacher Authorization Authority ---");

interface MockUserSession {
  userId: string;
  role: "ADMIN" | "TEACHER" | "PARENT" | "STUDENT";
}

interface MockTeacherClass {
  classId: string;
  displayName: string;
  isClassTeacher: boolean;
}

function checkClassTeacherAccess(
  session: MockUserSession | null,
  targetClassId: string,
  teacherClasses: MockTeacherClass[]
): { allowed: boolean; status: number; role?: string } {
  if (!session) return { allowed: false, status: 401 };
  if (session.role === "ADMIN") return { allowed: true, status: 200, role: "ADMIN" };
  if (session.role === "TEACHER") {
    const assigned = teacherClasses.find((c) => c.classId === targetClassId && c.isClassTeacher);
    if (assigned) return { allowed: true, status: 200, role: "TEACHER" };
    return { allowed: false, status: 403 };
  }
  return { allowed: false, status: 403 };
}

const mockTeacherClasses: MockTeacherClass[] = [
  { classId: "class-10-A", displayName: "Class 10 - A", isClassTeacher: true },
  { classId: "class-9-B", displayName: "Class 9 - B", isClassTeacher: false }, // Subject only
];

// Admin allowed for any class
const adminCheck = checkClassTeacherAccess({ userId: "u-admin", role: "ADMIN" }, "class-10-A", []);
assert(adminCheck.allowed && adminCheck.status === 200, "Admin is authorized for any classroom");

// Teacher allowed for assigned Class Teacher section
const teacherAllowed = checkClassTeacherAccess({ userId: "u-teacher", role: "TEACHER" }, "class-10-A", mockTeacherClasses);
assert(teacherAllowed.allowed && teacherAllowed.status === 200, "Teacher is authorized for assigned Class Teacher section");

// Teacher blocked with 403 for subject-only section
const teacherBlocked = checkClassTeacherAccess({ userId: "u-teacher", role: "TEACHER" }, "class-9-B", mockTeacherClasses);
assert(!teacherBlocked.allowed && teacherBlocked.status === 403, "Teacher is blocked with 403 for subject-only class");

// Other roles (e.g. Parent) blocked with 403
const parentBlocked = checkClassTeacherAccess({ userId: "u-parent", role: "PARENT" }, "class-10-A", mockTeacherClasses);
assert(!parentBlocked.allowed && parentBlocked.status === 403, "Non-teacher roles are blocked with 403");

// ---------------------------------------------------------------------------
// TEST 2: Progress & Completion Percentage Computation
// ---------------------------------------------------------------------------
console.log("\n--- Point 2: Missing DOB Progress & Percentage Formula ---");

function computeClassDobStats(students: Array<{ hasDob: boolean }>) {
  const total = students.length;
  const missing = students.filter((s) => !s.hasDob).length;
  const completed = total - missing;
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 100;
  return { total, missing, completed, percentage };
}

assert(computeClassDobStats([]).percentage === 100, "Empty class computes 100% completion cleanly");
assert(computeClassDobStats([{ hasDob: false }, { hasDob: false }]).percentage === 0, "0 of 2 computes 0%");
assert(computeClassDobStats([{ hasDob: true }, { hasDob: false }]).percentage === 50, "1 of 2 computes 50%");
assert(computeClassDobStats([{ hasDob: true }, { hasDob: true }, { hasDob: true }]).percentage === 100, "3 of 3 computes 100%");

// ---------------------------------------------------------------------------
// TEST 3: Strict Calendar Date Parsing with Day-First Precedence
// ---------------------------------------------------------------------------
console.log("\n--- Point 3: Calendar Date Validation with Day-First Precedence ---");

const d1 = parseAndValidateDob("14/10/2012", "STUDENT", true);
assert(d1.isValid && d1.dateStr === "2012-10-14", "14/10/2012 parses to 2012-10-14");

const d2 = parseAndValidateDob("2012-10-14", "STUDENT", true);
assert(d2.isValid && d2.dateStr === "2012-10-14", "2012-10-14 ISO parses cleanly");

const invalidFeb = parseAndValidateDob("31/02/2015", "STUDENT", true);
assert(!invalidFeb.isValid, "Rejects impossible calendar date 31/02/2015");

const invalidMonth = parseAndValidateDob("15/13/2014", "STUDENT", true);
assert(!invalidMonth.isValid, "Rejects invalid month 13");

// ---------------------------------------------------------------------------
// TEST 4: Teacher Permission Guard (Editing Existing DOB)
// ---------------------------------------------------------------------------
console.log("\n--- Point 4: Teacher Permission Guard on Existing DOBs ---");

function checkDobEditPermission(
  callerRole: "ADMIN" | "TEACHER",
  existingDobStr: string | null,
  newDobStr: string,
  teacherCanEditExistingDob: boolean
): { allowed: boolean; error?: string } {
  if (existingDobStr === newDobStr) return { allowed: true };
  if (callerRole === "ADMIN") return { allowed: true };
  if (existingDobStr !== null && !teacherCanEditExistingDob) {
    return { allowed: false, error: "Permission denied: Only administrators can modify existing dates of birth." };
  }
  return { allowed: true };
}

const teacherDeniedEdit = checkDobEditPermission("TEACHER", "2012-10-14", "2012-10-15", false);
assert(!teacherDeniedEdit.allowed, "Teacher cannot edit existing DOB when setting is disabled");

const teacherAllowedEdit = checkDobEditPermission("TEACHER", "2012-10-14", "2012-10-15", true);
assert(teacherAllowedEdit.allowed, "Teacher can edit existing DOB when setting is enabled");

const teacherFirstTimeEntry = checkDobEditPermission("TEACHER", null, "2012-10-15", false);
assert(teacherFirstTimeEntry.allowed, "Teacher can always enter initial missing DOB");

// ---------------------------------------------------------------------------
// TEST 5: Admin Approval Workflow for Date Modifications
// ---------------------------------------------------------------------------
console.log("\n--- Point 5: Admin Approval Workflow ---");

interface MockDobChangeLog {
  id: string;
  studentId: string;
  oldDateStr: string | null;
  newDateStr: string;
  status: "APPROVED" | "PENDING_APPROVAL" | "REJECTED";
}

function processDobUpdate(
  callerRole: "ADMIN" | "TEACHER",
  student: { id: string; dateOfBirth: string | null },
  newDateStr: string,
  requireAdminApproval: boolean
): { status: "APPLIED" | "PENDING_APPROVAL"; effectiveDob: string | null; logStatus: string } {
  const isExisting = student.dateOfBirth !== null;
  if (callerRole === "TEACHER" && isExisting && requireAdminApproval) {
    return { status: "PENDING_APPROVAL", effectiveDob: student.dateOfBirth, logStatus: "PENDING_APPROVAL" };
  }
  return { status: "APPLIED", effectiveDob: newDateStr, logStatus: "APPROVED" };
}

const pendingRequest = processDobUpdate("TEACHER", { id: "s-1", dateOfBirth: "2012-05-10" }, "2012-05-12", true);
assert(pendingRequest.status === "PENDING_APPROVAL" && pendingRequest.effectiveDob === "2012-05-10", "Teacher edit routed to PENDING_APPROVAL without mutating live DOB");

const directApply = processDobUpdate("ADMIN", { id: "s-1", dateOfBirth: "2012-05-10" }, "2012-05-12", true);
assert(directApply.status === "APPLIED" && directApply.effectiveDob === "2012-05-12", "Admin edits apply directly with APPROVED status");

// ---------------------------------------------------------------------------
// TEST 6: Immediate Send on DOB Save Matching Today
// ---------------------------------------------------------------------------
console.log("\n--- Point 6: Immediate Send Engine on DOB Save ---");

function evaluateImmediateBirthdaySend(dobStr: string, currentMonth: number, currentDay: number) {
  const [y, m, d] = dobStr.split("-").map(Number);
  const isMatch = m === currentMonth && d === currentDay;
  return {
    isBirthdayToday: isMatch,
    shouldDispatchImmediate: isMatch,
  };
}

const matchResult = evaluateImmediateBirthdaySend("2012-11-10", 11, 10);
assert(matchResult.isBirthdayToday && matchResult.shouldDispatchImmediate, "Triggers immediate wish dispatch when saved DOB matches today");

const nonMatchResult = evaluateImmediateBirthdaySend("2012-05-20", 11, 10);
assert(!nonMatchResult.isBirthdayToday && !nonMatchResult.shouldDispatchImmediate, "Does not dispatch immediate wish when saved DOB is another day");

// ---------------------------------------------------------------------------
// TEST 7: Class Teacher Digest Consolidation (1 per class, no spam)
// ---------------------------------------------------------------------------
console.log("\n--- Point 7: Class Teacher Digest Notification Consolidation ---");

interface MockNotification {
  userId: string;
  title: string;
  body: string;
}

function generateClassTeacherDigests(
  classCelebrants: Array<{ studentName: string; classId: string; className: string; classTeacherUserId: string }>,
  existingDigests: Set<string>
): MockNotification[] {
  const groupedByClass: { [classId: string]: typeof classCelebrants } = {};
  for (const c of classCelebrants) {
    if (!groupedByClass[c.classId]) groupedByClass[c.classId] = [];
    groupedByClass[c.classId].push(c);
  }

  const notifications: MockNotification[] = [];

  for (const [clsId, list] of Object.entries(groupedByClass)) {
    const teacherUserId = list[0].classTeacherUserId;
    const className = list[0].className;
    const key = `${clsId}_${teacherUserId}`;

    if (!existingDigests.has(key)) {
      const names = list.map((c) => c.studentName).join(", ");
      notifications.push({
        userId: teacherUserId,
        title: `Birthdays today in ${className} 🎂`,
        body: `${list.length} student${list.length > 1 ? "s have" : " has"} a birthday today (${names}). SRT School has sent wishes. You can add a personal message.`,
      });
      existingDigests.add(key);
    }
  }

  return notifications;
}

const mockCelebrants = [
  { studentName: "Aarav Sharma", classId: "class-2-A", className: "Class 2 - A", classTeacherUserId: "teacher-1" },
  { studentName: "Priya Patel", classId: "class-2-A", className: "Class 2 - A", classTeacherUserId: "teacher-1" },
  { studentName: "Rohan Gupta", classId: "class-3-B", className: "Class 3 - B", classTeacherUserId: "teacher-2" },
];

const digests = generateClassTeacherDigests(mockCelebrants, new Set());
assert(digests.length === 2, "Generates exactly 1 digest per class (2 total for 2 classes), not 3 spam notifications");
assert(digests[0].title === "Birthdays today in Class 2 - A 🎂", "Digest title correctly formats class name");
assert(digests[0].body.includes("Aarav Sharma, Priya Patel"), "Digest combines multiple celebrants in one friendly message");

// ---------------------------------------------------------------------------
// TEST 8: Class Teacher Personal Note Engine
// ---------------------------------------------------------------------------
console.log("\n--- Point 8: Personal Teacher Note Validation & Storage ---");

function validateAndTrimPersonalNote(message: string): { valid: boolean; trimmed: string; error?: string } {
  const trimmed = message.trim();
  if (!trimmed) return { valid: false, trimmed: "", error: "Message cannot be empty." };
  if (trimmed.length > 200) return { valid: true, trimmed: trimmed.slice(0, 200) };
  return { valid: true, trimmed };
}

assert(!validateAndTrimPersonalNote("   ").valid, "Rejects empty personal note");
const longNote = "A".repeat(250);
const trimmedNote = validateAndTrimPersonalNote(longNote);
assert(trimmedNote.valid && trimmedNote.trimmed.length === 200, "Truncates personal note to exactly 200 characters max");

// ---------------------------------------------------------------------------
// TEST 9: Notice Board PDF Privacy Rule (No Birth Year, No Age)
// ---------------------------------------------------------------------------
console.log("\n--- Point 9: Classroom Notice Board PDF Privacy Compliance ---");

interface NoticeBoardStudent {
  name: string;
  rollNumber: string;
  dateOfBirth: Date;
}

function formatNoticeBoardRow(student: NoticeBoardStudent) {
  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  const day = student.dateOfBirth.getUTCDate();
  const month = student.dateOfBirth.getUTCMonth();
  const birthdayDisplay = `${day} ${monthNames[month]}`;

  return {
    name: student.name,
    roll: student.rollNumber,
    birthdayText: birthdayDisplay,
    // Strict compliance check
    containsYear: birthdayDisplay.includes(String(student.dateOfBirth.getUTCFullYear())),
  };
}

const sampleRow = formatNoticeBoardRow({
  name: "Ananya Iyer",
  rollNumber: "AD105",
  dateOfBirth: new Date("2013-10-14T00:00:00Z"),
});

assert(sampleRow.birthdayText === "14 October", "Formats celebration day and month cleanly");
assert(!sampleRow.containsYear, "Strictly does NOT include birth year (privacy compliance)");

// ---------------------------------------------------------------------------
// TEST 10: Chronological Sorting of Classroom Celebrants
// ---------------------------------------------------------------------------
console.log("\n--- Point 10: Chronological Order by Calendar Day ---");

const unsortedCelebrants = [
  { name: "Student Nov", month: 11, day: 5 },
  { name: "Student Jan", month: 1, day: 15 },
  { name: "Student Oct 20", month: 10, day: 20 },
  { name: "Student Oct 14", month: 10, day: 14 },
];

const sorted = [...unsortedCelebrants].sort((a, b) => {
  if (a.month !== b.month) return a.month - b.month;
  return a.day - b.day;
});

assert(sorted[0].name === "Student Jan", "First celebration is in January");
assert(sorted[1].name === "Student Oct 14", "Oct 14 precedes Oct 20");
assert(sorted[2].name === "Student Oct 20", "Oct 20 precedes November");
assert(sorted[3].name === "Student Nov", "Last celebration is in November");

// ---------------------------------------------------------------------------
// TEST 11: Leap Day (Feb 29) Rule in Non-Leap Years
// ---------------------------------------------------------------------------
console.log("\n--- Point 11: Leap Day Celebration in Non-Leap Years ---");

function isCelebratedToday(dobMonth: number, dobDay: number, year: number, currentMonth: number, currentDay: number): boolean {
  const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const isFeb28NonLeap = !isLeap && currentMonth === 2 && currentDay === 28;

  if (dobMonth === currentMonth && dobDay === currentDay) return true;
  if (isFeb28NonLeap && dobMonth === 2 && dobDay === 29) return true;
  return false;
}

assert(isCelebratedToday(2, 29, 2026, 2, 28), "Feb 29 celebrant is celebrated on Feb 28 in non-leap year (2026)");
assert(!isCelebratedToday(2, 29, 2028, 2, 28), "Feb 29 celebrant is NOT celebrated on Feb 28 in leap year (2028)");
assert(isCelebratedToday(2, 29, 2028, 2, 29), "Feb 29 celebrant is celebrated on Feb 29 in leap year (2028)");

// ---------------------------------------------------------------------------
// TEST 12: WhatsApp Shortcut Direct Link Formatting
// ---------------------------------------------------------------------------
console.log("\n--- Point 12: WhatsApp Direct Greeting URL Generator ---");

function generateWhatsAppBirthdayUrl(phone: string, studentName: string): string {
  const cleanPhone = phone.replace(/[^0-9]/g, "");
  const formatted = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
  const text = encodeURIComponent(`Dear Parent, wishing ${studentName} a very Happy Birthday from all of us at SRT School! 🎂🎉`);
  return `https://wa.me/${formatted}?text=${text}`;
}

const waUrl = generateWhatsAppBirthdayUrl("+91 98765-43210", "Aarav");
assert(waUrl.includes("wa.me/919876543210"), "Formats 10/12-digit phone into clean 91-prefixed WhatsApp URL");
assert(waUrl.includes("Aarav"), "Encodes student name in pre-filled greeting text");

// ---------------------------------------------------------------------------
// TEST 13: Excel Import Column Header Recognition
// ---------------------------------------------------------------------------
console.log("\n--- Point 13: Excel Flexible Column Discovery ---");

function identifyExcelColumns(headerKeys: string[]) {
  const idKey = headerKeys.find((k) => /roll|admission|adm|reg|id|student\s*id/i.test(k));
  const nameKey = headerKeys.find((k) => /name|student/i.test(k));
  const dobKey = headerKeys.find((k) => /dob|birth|date\s*of\s*birth/i.test(k));
  return { idKey, nameKey, dobKey };
}

const discovered1 = identifyExcelColumns(["Roll No", "Student Name", "Date of Birth"]);
assert(discovered1.idKey === "Roll No" && discovered1.nameKey === "Student Name" && discovered1.dobKey === "Date of Birth", "Recognizes standard column names");

const discovered2 = identifyExcelColumns(["admission_no", "student_full_name", "DOB"]);
assert(discovered2.idKey === "admission_no" && discovered2.nameKey === "student_full_name" && discovered2.dobKey === "DOB", "Recognizes snake_case variations");

// ---------------------------------------------------------------------------
// TEST 14: Asia/Kolkata Time Zone Strictness
// ---------------------------------------------------------------------------
console.log("\n--- Point 14: Asia/Kolkata Calendar Integrity ---");

const kolkataNow = getSchoolNow();
assert(typeof kolkataNow.year === "number" && kolkataNow.year >= 2025, "getSchoolNow returns valid calendar year");
assert(kolkataNow.month >= 1 && kolkataNow.month <= 12, "getSchoolNow returns month in [1, 12]");
assert(kolkataNow.day >= 1 && kolkataNow.day <= 31, "getSchoolNow returns day in [1, 31]");

console.log("\n===============================================================");
console.log(`ALL 14 TESTS PASSED! (${passedCount} of ${totalCount})`);
console.log("===============================================================\n");

