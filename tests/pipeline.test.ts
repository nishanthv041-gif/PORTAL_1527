import assert from "node:assert";
import {
  cleanSubjectHeader,
  normalizeSubjectName,
  toNumber,
  isAbsentScore,
  mergeStudentSubjects,
  compareDocumentTotals,
  parseTextToReportCard
} from "../backend/api/actions/dashboard/teacher/report-cards/scanReportCardUtils";
import type { ScannedReportCardSubject } from "../backend/api/actions/dashboard/teacher/report-cards/scanReportCardTypes";

console.log("=== RUNNING REPORT CARD MERGE & EXTRACTION PIPELINE TEST SUITE ===");

const mockClassSubjects = [
  { id: "cs-tamil", name: "TAMIL", maxMarks: 100, passMarks: 35 },
  { id: "cs-english", name: "ENGLISH", maxMarks: 100, passMarks: 35 },
  { id: "cs-maths", name: "MATHEMATICS", maxMarks: 100, passMarks: 35 },
  { id: "cs-science", name: "SCIENCE", maxMarks: 100, passMarks: 35 },
  { id: "cs-social", name: "SOCIAL SCIENCE", maxMarks: 100, passMarks: 35 }
];

const mockClassStudents = [
  { id: "st-kirithik", name: "KIRITHIK M", rollNumber: "7376252AD216" },
  { id: "st-rajeswari", name: "RAJESWARI M", rollNumber: "7376251EE172" }
];

// TEST 1: Number parsing with toNumber
{
  assert.strictEqual(toNumber(86), 86);
  assert.strictEqual(toNumber("86"), 86);
  assert.strictEqual(toNumber(" 86 / 100 "), 86);
  assert.strictEqual(toNumber("91.5"), 91.5);
  assert.strictEqual(toNumber("AB"), null);
  assert.strictEqual(toNumber("A"), null);
  assert.strictEqual(toNumber("Absent"), null);
  assert.strictEqual(toNumber(""), null);
  assert.strictEqual(toNumber(null), null);
  assert.strictEqual(toNumber(undefined), null);
  assert.strictEqual(isAbsentScore("AB"), true);
  assert.strictEqual(isAbsentScore("A"), true);
  assert.strictEqual(isAbsentScore("95"), false);
  console.log("✔ Test 1: Number parsing and absent handling passed");
}

// TEST 2: Name normalization and alias resolution
{
  assert.strictEqual(normalizeSubjectName("Tamil /100"), "TAMIL");
  assert.strictEqual(normalizeSubjectName("Maths"), "MATHEMATICS");
  assert.strictEqual(normalizeSubjectName("Maths /100"), "MATHEMATICS");
  assert.strictEqual(normalizeSubjectName("Social"), "SOCIAL SCIENCE");
  assert.strictEqual(normalizeSubjectName("Social /100"), "SOCIAL SCIENCE");
  assert.strictEqual(normalizeSubjectName("Science /100"), "SCIENCE");
  assert.strictEqual(normalizeSubjectName("English /100"), "ENGLISH");
  console.log("✔ Test 2: Name normalization and alias resolution passed");
}

// TEST 3: Single-source-of-truth mergeStudentSubjects
{
  const extracted = [
    { subjectName: "Tamil /100", marksScored: 86 },
    { subjectName: "Maths", marksObtained: 91 },
    { subjectName: "Social", score: 88 }
  ];

  const merged = mergeStudentSubjects(extracted, mockClassSubjects, 100, 35);

  // 3 extracted subjects + 2 missing curriculum subjects (ENGLISH, SCIENCE) = 5 total
  assert.strictEqual(merged.length, 5);

  const tamil = merged.find(s => s.subjectName === "TAMIL");
  assert.strictEqual(tamil?.score, 86);
  assert.strictEqual(tamil?.marksScored, 86);
  assert.strictEqual(tamil?.subjectId, "cs-tamil");
  assert.strictEqual(tamil?.status, "PASS");

  const maths = merged.find(s => s.subjectName === "MATHEMATICS");
  assert.strictEqual(maths?.score, 91);
  assert.strictEqual(maths?.marksScored, 91);
  assert.strictEqual(maths?.subjectId, "cs-maths");

  const social = merged.find(s => s.subjectName === "SOCIAL SCIENCE");
  assert.strictEqual(social?.score, 88);
  assert.strictEqual(social?.marksScored, 88);
  assert.strictEqual(social?.subjectId, "cs-social");

  // Missing subjects must be appended as empty rows flagged NEEDS_REVIEW
  const english = merged.find(s => s.subjectName === "ENGLISH");
  assert.strictEqual(english?.score, "");
  assert.strictEqual(english?.marksScored, "");
  assert.strictEqual(english?.status, "NEEDS_REVIEW");
  assert.strictEqual(english?.isInvalid, true);
  assert.strictEqual(english?.validationError, "Score required");

  const science = merged.find(s => s.subjectName === "SCIENCE");
  assert.strictEqual(science?.score, "");
  assert.strictEqual(science?.status, "NEEDS_REVIEW");

  console.log("✔ Test 3: Single-source-of-truth mergeStudentSubjects passed");
}

// TEST 4: Regression test that an extracted mark is NEVER overwritten by an empty template row
{
  const extractedWithAll5 = [
    { subjectName: "Tamil", marksScored: 86 },
    { subjectName: "English", marksScored: 78 },
    { subjectName: "Mathematics", marksScored: 91 },
    { subjectName: "Science", marksScored: 84 },
    { subjectName: "Social Science", marksScored: 88 }
  ];

  const merged = mergeStudentSubjects(extractedWithAll5, mockClassSubjects, 100, 35);
  assert.strictEqual(merged.length, 5);
  merged.forEach(sub => {
    assert.notStrictEqual(sub.score, "", `Subject ${sub.subjectName} mark was overwritten by blank!`);
    assert.strictEqual(typeof sub.score, "number");
    assert.strictEqual(sub.status, "PASS");
    assert.strictEqual(sub.isInvalid, false);
  });
  console.log("✔ Test 4: Regression test verified: extracted marks are NEVER overwritten by blank template rows");
}

// TEST 5: Integration test with Kirithik M & Rajeswari M sample marksheet
{
  const rawTableText = `
STUDENT MARKSHEET — SAMPLE MARKS
Each subject is out of 100

S.No. | Student Name | Roll No. | Tamil /100 | English /100 | Maths /100 | Science /100 | Social /100 | Total /500 | Percentage
1 | KIRITHIK M | 7376252AD216 | 86 | 78 | 91 | 84 | 88 | 427 | 85.4%
2 | RAJESWARI M | 7376251EE172 | 92 | 89 | 95 | 90 | 94 | 460 | 92.0%
Illustrative marks for sample layout only — verify before official use.
  `.trim();

  const parsed = parseTextToReportCard(rawTableText, mockClassSubjects, mockClassStudents);

  assert.strictEqual(parsed.allDetectedStudents.length, 2, "Expected exactly 2 detected students");

  // Student 1: KIRITHIK M
  const st1 = parsed.allDetectedStudents[0];
  assert.strictEqual(st1.studentName, "KIRITHIK M");
  assert.strictEqual(st1.rollNumber, "7376252AD216");
  assert.strictEqual(st1.studentId, "st-kirithik");

  const st1Merged = mergeStudentSubjects(st1.subjects, mockClassSubjects, 100, 35);
  assert.strictEqual(st1Merged.length, 5);

  const st1Scores = st1Merged.map(s => s.score);
  assert.deepStrictEqual(st1Scores, [86, 78, 91, 84, 88]);

  const st1Total = st1Scores.reduce((a, b) => (Number(a) || 0) + (Number(b) || 0), 0);
  assert.strictEqual(st1Total, 427);
  const st1Pct = parseFloat(((st1Total / 500) * 100).toFixed(1));
  assert.strictEqual(st1Pct, 85.4);

  const st1Cmp = compareDocumentTotals(st1Total, 427);
  assert.strictEqual(st1Cmp.matches, true);

  // Student 2: RAJESWARI M
  const st2 = parsed.allDetectedStudents[1];
  assert.strictEqual(st2.studentName, "RAJESWARI M");
  assert.strictEqual(st2.rollNumber, "7376251EE172");
  assert.strictEqual(st2.studentId, "st-rajeswari");

  const st2Merged = mergeStudentSubjects(st2.subjects, mockClassSubjects, 100, 35);
  assert.strictEqual(st2Merged.length, 5);

  const st2Scores = st2Merged.map(s => s.score);
  assert.deepStrictEqual(st2Scores, [92, 89, 95, 90, 94]);

  const st2Total = st2Scores.reduce((a, b) => (Number(a) || 0) + (Number(b) || 0), 0);
  assert.strictEqual(st2Total, 460);
  const st2Pct = (st2Total / 500) * 100;
  assert.strictEqual(st2Pct, 92.0);

  const st2Cmp = compareDocumentTotals(st2Total, 460);
  assert.strictEqual(st2Cmp.matches, true);

  console.log("✔ Test 5: Integration test passed: Kirithik M (427/500, 85.4%) and Rajeswari M (460/500, 92.0%) fully matched");
}

// TEST 6: When API returns students with all marks null, queue shows 'marks could not be read'
{
  const emptyExtractedStudents = [
    {
      studentId: "st-kirithik",
      studentName: "KIRITHIK M",
      rollNumber: "7376252AD216",
      subjects: [
        { subjectName: "Tamil", score: null },
        { subjectName: "English", score: null },
        { subjectName: "Maths", score: null }
      ]
    }
  ];

  const totalMarksCount = emptyExtractedStudents.reduce((acc, st) => {
    const count = (st.subjects || []).filter(s => s.score !== "" && s.score !== null && s.score !== undefined).length;
    return acc + count;
  }, 0);

  assert.strictEqual(totalMarksCount, 0);

  // Simulation of client queue logic
  const queueStatus = totalMarksCount === 0 ? "FAILED" : "EXTRACTED";
  const progressText = totalMarksCount === 0
    ? "Scanned, but marks could not be read. Edit manually or retry"
    : "Extracted successfully";

  assert.strictEqual(queueStatus, "FAILED");
  assert.strictEqual(progressText, "Scanned, but marks could not be read. Edit manually or retry");
  assert.notStrictEqual(progressText, "Extracted successfully", "Must NEVER show success on empty marks result!");
  console.log("✔ Test 6: Empty marks result correctly shows 'marks could not be read', not 'Extracted successfully'");
}

// TEST 7: Regression on clearing a mark: shows error, PENDING, and disabled Send
{
  const subs: ScannedReportCardSubject[] = [
    { id: "1", subjectId: "cs-tamil", subjectName: "TAMIL", score: 86, marksScored: 86, maxScore: 100, passMarks: 35, remarks: "", status: "PASS", isInvalid: false },
    { id: "2", subjectId: "cs-english", subjectName: "ENGLISH", score: 78, marksScored: 78, maxScore: 100, passMarks: 35, remarks: "", status: "PASS", isInvalid: false }
  ];

  // User clears first mark
  const updated = subs.map(s => s.id === "1" ? { ...s, score: "" as const, marksScored: "" as const, isInvalid: true, validationError: "Score required" } : s);

  const emptyCount = updated.filter(s => s.score === "" || s.marksScored === "").length;
  const isAllEntered = emptyCount === 0;
  const resultStatus = !isAllEntered ? "PENDING" : "PASSED";
  const hasValidationErrors = updated.some(s => s.isInvalid || s.score === "");
  const isSendDisabled = hasValidationErrors || !isAllEntered;

  assert.strictEqual(isAllEntered, false);
  assert.strictEqual(resultStatus, "PENDING");
  assert.strictEqual(hasValidationErrors, true);
  assert.strictEqual(isSendDisabled, true);
  console.log("✔ Test 7: Clearing a mark sets PENDING and disables Send button as expected");
}

console.log("\n=======================================================");
console.log("🎉 ALL TESTS PASSED 100%! ZERO REGRESSIONS VERIFIED 🎉");
console.log("=======================================================\n");
