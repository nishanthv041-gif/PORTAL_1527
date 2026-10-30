import assert from "node:assert";
import {
  validatePeriodSlots,
  generateQuickPeriodSlots,
  calculateSubjectSummaries,
  calculateTeacherLoads,
  timeToMinutes
} from "../backend/lib/timetable/timetableCalculations";
import { analyzeTimetableConflicts } from "../backend/lib/timetable/timetableConflictEngine";
import { solveTimetableSlots } from "../backend/lib/timetable/timetableSolver";
import type { PeriodSlotData, TimetableSlotEntry } from "../backend/lib/timetable/timetableTypes";

console.log("=== RUNNING TIMETABLE CALCULATION & SCHEDULING ENGINE TESTS ===");

// TEST 1: Period time validation & quick generation
{
  const generatedSlots = generateQuickPeriodSlots({
    startTime: "08:00",
    lessonDurationMinutes: 45,
    totalPeriods: 8,
    breakAfterPeriod: 2,
    breakDurationMinutes: 15, // 09:30 to 09:45
    lunchAfterPeriod: 5,
    lunchDurationMinutes: 45  // 12:00 to 12:45
  });

  assert.strictEqual(generatedSlots.length, 10, "8 lesson periods + 1 break + 1 lunch = 10 slots");
  assert.strictEqual(generatedSlots[0].startTime, "08:00");
  assert.strictEqual(generatedSlots[0].endTime, "08:45");
  assert.strictEqual(generatedSlots[2].type, "BREAK");
  assert.strictEqual(generatedSlots[2].startTime, "09:30");
  assert.strictEqual(generatedSlots[2].endTime, "09:45");
  assert.strictEqual(generatedSlots[6].type, "LUNCH");

  const validation = validatePeriodSlots(generatedSlots);
  assert.strictEqual(validation.valid, true, "Generated slots must be 100% valid");
  assert.strictEqual(validation.errors.length, 0);

  // Test overlapping slots error detection
  const overlappingSlots: PeriodSlotData[] = [
    { order: 1, label: "Period 1", startTime: "08:00", endTime: "09:00", type: "LESSON" },
    { order: 2, label: "Period 2", startTime: "08:45", endTime: "09:30", type: "LESSON" } // overlaps!
  ];
  const invalidVal = validatePeriodSlots(overlappingSlots);
  assert.strictEqual(invalidVal.valid, false);
  assert.strictEqual(invalidVal.errors.length, 1);
  assert.match(invalidVal.errors[0], /overlapping/i);

  // Test end before start error detection
  const backwardsSlots: PeriodSlotData[] = [
    { order: 1, label: "Period 1", startTime: "09:00", endTime: "08:45", type: "LESSON" }
  ];
  const backVal = validatePeriodSlots(backwardsSlots);
  assert.strictEqual(backVal.valid, false);
  assert.match(backVal.errors[0], /strictly after/i);

  console.log("✔ Test 1: Period time validation, ascending order, and quick generation passed");
}

// TEST 2: Required vs scheduled calculation
{
  const mockSubjects = [
    { id: "sub-tamil", name: "Tamil", code: "TAM", requiredPeriodsPerWeek: 5 },
    { id: "sub-english", name: "English", code: "ENG", requiredPeriodsPerWeek: 5 },
    { id: "sub-maths", name: "Mathematics", code: "MAT", requiredPeriodsPerWeek: 6 },
    { id: "sub-science", name: "Science", code: "SCI", requiredPeriodsPerWeek: 5 }
  ];

  const mockSlots: TimetableSlotEntry[] = [
    // Tamil scheduled 5 times (MATCHED)
    { classId: "c1", dayOfWeek: "MONDAY", period: 1, subjectId: "sub-tamil" },
    { classId: "c1", dayOfWeek: "TUESDAY", period: 1, subjectId: "sub-tamil" },
    { classId: "c1", dayOfWeek: "WEDNESDAY", period: 1, subjectId: "sub-tamil" },
    { classId: "c1", dayOfWeek: "THURSDAY", period: 1, subjectId: "sub-tamil" },
    { classId: "c1", dayOfWeek: "FRIDAY", period: 1, subjectId: "sub-tamil" },

    // English scheduled 4 times (DEFICIT 1)
    { classId: "c1", dayOfWeek: "MONDAY", period: 2, subjectId: "sub-english" },
    { classId: "c1", dayOfWeek: "TUESDAY", period: 2, subjectId: "sub-english" },
    { classId: "c1", dayOfWeek: "WEDNESDAY", period: 2, subjectId: "sub-english" },
    { classId: "c1", dayOfWeek: "THURSDAY", period: 2, subjectId: "sub-english" },

    // Mathematics scheduled 7 times (SURPLUS 1)
    { classId: "c1", dayOfWeek: "MONDAY", period: 3, subjectId: "sub-maths" },
    { classId: "c1", dayOfWeek: "TUESDAY", period: 3, subjectId: "sub-maths" },
    { classId: "c1", dayOfWeek: "WEDNESDAY", period: 3, subjectId: "sub-maths" },
    { classId: "c1", dayOfWeek: "THURSDAY", period: 3, subjectId: "sub-maths" },
    { classId: "c1", dayOfWeek: "FRIDAY", period: 3, subjectId: "sub-maths" },
    { classId: "c1", dayOfWeek: "FRIDAY", period: 4, subjectId: "sub-maths" },
    { classId: "c1", dayOfWeek: "SATURDAY", period: 1, subjectId: "sub-maths" }
  ];

  const summaries = calculateSubjectSummaries(mockSubjects, mockSlots);
  const tamil = summaries.find(s => s.subjectId === "sub-tamil");
  assert.strictEqual(tamil?.scheduledPeriodsPerWeek, 5);
  assert.strictEqual(tamil?.difference, 0);
  assert.strictEqual(tamil?.status, "MATCHED");

  const eng = summaries.find(s => s.subjectId === "sub-english");
  assert.strictEqual(eng?.scheduledPeriodsPerWeek, 4);
  assert.strictEqual(eng?.difference, -1);
  assert.strictEqual(eng?.status, "DEFICIT");

  const mat = summaries.find(s => s.subjectId === "sub-maths");
  assert.strictEqual(mat?.scheduledPeriodsPerWeek, 7);
  assert.strictEqual(mat?.difference, 1);
  assert.strictEqual(mat?.status, "SURPLUS");

  console.log("✔ Test 2: Required vs Scheduled periods calculation verified");
}

// TEST 3: Hard conflict detection (Teacher clash, room clash, break clash)
{
  const mockPeriods: PeriodSlotData[] = [
    { order: 1, label: "Period 1", startTime: "08:00", endTime: "08:45", type: "LESSON" },
    { order: 2, label: "Period 2", startTime: "08:45", endTime: "09:30", type: "LESSON" },
    { order: 3, label: "Break", startTime: "09:30", endTime: "09:45", type: "BREAK" }
  ];

  const clashSlots: TimetableSlotEntry[] = [
    // Teacher T1 teaching Class A on Monday Period 1
    {
      id: "slot-1",
      classId: "class-A",
      dayOfWeek: "MONDAY",
      period: 1,
      teacherId: "teacher-1",
      teacherName: "Mr. Sharma",
      subjectId: "sub-maths",
      subjectName: "Mathematics",
      classroom: "Room 101"
    },
    // Same Teacher T1 teaching Class B on Monday Period 1 (CLASH!)
    {
      id: "slot-2",
      classId: "class-B",
      dayOfWeek: "MONDAY",
      period: 1,
      teacherId: "teacher-1",
      teacherName: "Mr. Sharma",
      subjectId: "sub-physics",
      subjectName: "Physics",
      classroom: "Room 102"
    },
    // Lesson placed during Period 3 (Designated Break slot!)
    {
      id: "slot-3",
      classId: "class-A",
      dayOfWeek: "MONDAY",
      period: 3,
      teacherId: "teacher-2",
      teacherName: "Mrs. Lakshmi",
      subjectId: "sub-tamil",
      subjectName: "Tamil",
      isBreak: false,
      slotType: "LESSON"
    }
  ];

  const analysis = analyzeTimetableConflicts({
    allSchoolSlots: clashSlots,
    periodSlots: mockPeriods,
    teacherLoads: [],
    subjectSummaries: []
  });

  assert.strictEqual(analysis.canPublish, false, "Hard conflicts must block publishing");
  assert.strictEqual(analysis.hardConflicts.length, 2);

  const teacherClash = analysis.hardConflicts.find(c => c.category === "TEACHER_CLASH");
  assert.ok(teacherClash, "Must detect teacher double booking");
  assert.match(teacherClash!.message, /double-booked/i);

  const breakClash = analysis.hardConflicts.find(c => c.category === "LESSON_IN_BREAK");
  assert.ok(breakClash, "Must detect lesson placed in break");

  console.log("✔ Test 3: Hard conflict detection (Teacher clash & lesson in break) blocks publishing");
}

// TEST 4: Constraint solver ("Suggest fill")
{
  const classSubjects = [
    { id: "sub-tam", name: "Tamil", code: "TAM", teacherId: "t-1", teacherName: "Mrs. Lakshmi", requiredPeriodsPerWeek: 3 },
    { id: "sub-eng", name: "English", code: "ENG", teacherId: "t-2", teacherName: "Mr. David", requiredPeriodsPerWeek: 3 }
  ];

  const periodSlots: PeriodSlotData[] = [
    { order: 1, label: "P1", startTime: "08:00", endTime: "08:45", type: "LESSON" },
    { order: 2, label: "P2", startTime: "08:45", endTime: "09:30", type: "LESSON" },
    { order: 3, label: "Break", startTime: "09:30", endTime: "09:45", type: "BREAK" },
    { order: 4, label: "P3", startTime: "09:45", endTime: "10:30", type: "LESSON" }
  ];

  // Already 1 Tamil slot on Monday P1
  const existingSlots: TimetableSlotEntry[] = [
    {
      classId: "class-2A",
      dayOfWeek: "MONDAY",
      period: 1,
      subjectId: "sub-tam",
      subjectName: "Tamil",
      teacherId: "t-1"
    }
  ];

  // Teacher t-2 is busy in another class on Monday P2
  const otherClassSlots: TimetableSlotEntry[] = [
    {
      classId: "class-3B",
      dayOfWeek: "MONDAY",
      period: 2,
      teacherId: "t-2"
    }
  ];

  const solution = solveTimetableSlots({
    classId: "class-2A",
    classSubjects,
    existingClassSlots: existingSlots,
    allOtherSchoolSlots: otherClassSlots,
    periodSlots,
    workingDays: ["MONDAY", "TUESDAY", "WEDNESDAY"]
  });

  assert.strictEqual(solution.success, true);
  // Total needed = (3 - 1) + 3 = 5 slots
  assert.strictEqual(solution.suggestedSlots.length, 5);

  // Guarantee: Break slot (P3) is NEVER assigned
  const breakAssigned = solution.suggestedSlots.some(s => s.period === 3);
  assert.strictEqual(breakAssigned, false, "Constraint solver must never assign lesson in break slot");

  // Guarantee: Existing occupied slot (Monday P1) is NEVER overwritten
  const monP1 = solution.suggestedSlots.find(s => s.dayOfWeek === "MONDAY" && s.period === 1);
  assert.strictEqual(monP1, undefined, "Existing slot must not be overwritten");

  // Guarantee: Teacher t-2 is NOT placed on Monday P2 where they are busy
  const t2Clash = solution.suggestedSlots.find(s => s.teacherId === "t-2" && s.dayOfWeek === "MONDAY" && s.period === 2);
  assert.strictEqual(t2Clash, undefined, "Solver must not place teacher where already occupied");

  console.log("✔ Test 4: Constraint solver satisfies all hard rules without overwriting existing cells");
}

console.log("\n=======================================================");
console.log("🎉 ALL TIMETABLE ENGINE & CALCULATION TESTS PASSED! 🎉");
console.log("=======================================================\n");
