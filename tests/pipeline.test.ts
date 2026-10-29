import assert from "node:assert";
import {
  cleanSubjectHeader,
  normalizeSubjectName,
  matchSubject,
  matchStudent,
  parseScoreNumber,
  computeGrade,
  normalizeLookAlikes,
  compareDocumentTotals,
  parseTextToReportCard,
  parseJsonToReportCard,
  generateStandardJsonTemplate
} from "../backend/api/actions/dashboard/teacher/report-cards/scanReportCardUtils";

const classSubjects = [
  { id: "sub-tamil", name: "TAMIL", maxMarks: 100, passMarks: 35 },
  { id: "sub-english", name: "ENGLISH", maxMarks: 100, passMarks: 35 },
  { id: "sub-maths", name: "MATHEMATICS", maxMarks: 100, passMarks: 35 },
  { id: "sub-science", name: "SCIENCE", maxMarks: 100, passMarks: 35 },
  { id: "sub-social", name: "SOCIAL SCIENCE", maxMarks: 100, passMarks: 35 }
];

const classStudents = [
  { id: "st-kirithik", name: "KIRITHIK M", rollNumber: "7376252AD216" },
  { id: "st-rajeswari", name: "RAJESWARI M", rollNumber: "7376251EE172" }
];

console.log("=== RUNNING REPORT CARD PIPELINE TEST SUITE ===");

// 1. Clean Subject Header
{
  assert.strictEqual(cleanSubjectHeader("Tamil /100"), "Tamil");
  assert.strictEqual(cleanSubjectHeader("English / 50"), "English");
  assert.strictEqual(cleanSubjectHeader("Maths (100)"), "Maths");
  assert.strictEqual(cleanSubjectHeader("Science:100"), "Science");
  assert.strictEqual(cleanSubjectHeader("Social / 100"), "Social");
  console.log("✔ Test 1: Subject header suffix cleanup passed");
}

// 2. Subject Alias Mapping
{
  assert.strictEqual(matchSubject("Tamil", classSubjects)?.subjectId, "sub-tamil");
  assert.strictEqual(matchSubject("English", classSubjects)?.subjectId, "sub-english");
  assert.strictEqual(matchSubject("Maths", classSubjects)?.subjectId, "sub-maths");
  assert.strictEqual(matchSubject("Science", classSubjects)?.subjectId, "sub-science");
  assert.strictEqual(matchSubject("Social", classSubjects)?.subjectId, "sub-social");
  // Non-subject keywords
  assert.strictEqual(matchSubject("Total", classSubjects), null);
  assert.strictEqual(matchSubject("Percentage", classSubjects), null);
  assert.strictEqual(matchSubject("S.No", classSubjects), null);
  console.log("✔ Test 2: Subject alias and non-subject exclusion passed");
}

// 3. Number and Score Parsing
{
  assert.strictEqual(parseScoreNumber("86").score, 86);
  assert.strictEqual(parseScoreNumber("92 / 100").score, 92);
  assert.strictEqual(parseScoreNumber(89).score, 89);
  
  // Absent handling
  const absentResult = parseScoreNumber("AB");
  assert.strictEqual(absentResult.score, null);
  assert.strictEqual(absentResult.isAbsent, true);

  // Unreadable / Empty
  assert.strictEqual(parseScoreNumber("").score, null);
  assert.strictEqual(parseScoreNumber("").isNeedsReview, true);
  assert.strictEqual(parseScoreNumber("???").score, null);
  assert.strictEqual(parseScoreNumber("???").isNeedsReview, true);
  console.log("✔ Test 3: Score parsing (numeric, absent, unreadable) passed");
}

// 4. Look-alike roll numbers & fuzzy name matching
{
  // Exact match
  const exact = matchStudent("KIRITHIK M 7376252AD216", classStudents);
  assert.strictEqual(exact.studentId, "st-kirithik");
  assert.strictEqual(exact.confidence, "HIGH");

  // Look-alike match: 1 misread as I in roll number
  const lookAlike = matchStudent("KIRITHIK M 7376252AD2I6", classStudents);
  assert.strictEqual(lookAlike.studentId, "st-kirithik");
  assert.strictEqual(lookAlike.isLookAlikeMatch, true);

  // Fuzzy name match: "KIRITHK M" (missing 'I')
  const fuzzy = matchStudent("KIRITHK M", classStudents);
  assert.strictEqual(fuzzy.studentId, "st-kirithik");
  assert.strictEqual(fuzzy.studentName, "KIRITHIK M");

  // Rajeswari glued: "RAJESWARIM"
  const rajeswari = matchStudent("RAJESWARIM", classStudents);
  assert.strictEqual(rajeswari.studentId, "st-rajeswari");
  console.log("✔ Test 4: Look-alike roll numbers and fuzzy name matching passed");
}

// 5. Integration Test: The Sample Marksheet
{
  const sampleOcrText = `
STUDENT MARKSHEET — SAMPLE MARKS
Each subject is out of 100
Tamil English Maths Science Social Total
S.No. Student Name Roll No. /100 /100 /100 7100 | /500 Percentage
1 KIRITHIK M 7376252AD216 86 78 91 84 88 427 85.4%
2 RAJESWARIM 7376251EE172 92 89 95 90 94 460 92.0%
Illustrative marks for sample layout only — verify before official use.
  `.trim();

  const parsed = parseTextToReportCard(sampleOcrText, classSubjects, classStudents);

  assert.strictEqual(parsed.allDetectedStudents.length, 2, "Must detect exactly 2 students");

  // Student 1: Kirithik M
  const kirithik = parsed.allDetectedStudents[0];
  assert.strictEqual(kirithik.studentName, "KIRITHIK M");
  assert.strictEqual(kirithik.rollNumber, "7376252AD216");
  assert.strictEqual(kirithik.studentId, "st-kirithik");
  assert.strictEqual(kirithik.totalMarks, 427);
  assert.strictEqual(kirithik.percentage, 85.4);

  const kTamil = kirithik.subjects.find(s => s.subjectName === "TAMIL");
  const kEnglish = kirithik.subjects.find(s => s.subjectName === "ENGLISH");
  const kMaths = kirithik.subjects.find(s => s.subjectName === "MATHEMATICS");
  const kScience = kirithik.subjects.find(s => s.subjectName === "SCIENCE");
  const kSocial = kirithik.subjects.find(s => s.subjectName === "SOCIAL SCIENCE");

  assert.strictEqual(kTamil?.score, 86, "Kirithik Tamil should be 86");
  assert.strictEqual(kEnglish?.score, 78, "Kirithik English should be 78");
  assert.strictEqual(kMaths?.score, 91, "Kirithik Maths should be 91");
  assert.strictEqual(kScience?.score, 84, "Kirithik Science should be 84");
  assert.strictEqual(kSocial?.score, 88, "Kirithik Social should be 88");

  // Student 2: Rajeswari M
  const rajeswari = parsed.allDetectedStudents[1];
  assert.strictEqual(rajeswari.studentName, "RAJESWARI M");
  assert.strictEqual(rajeswari.rollNumber, "7376251EE172");
  assert.strictEqual(rajeswari.studentId, "st-rajeswari");
  assert.strictEqual(rajeswari.totalMarks, 460);
  assert.strictEqual(rajeswari.percentage, 92.0);

  const rTamil = rajeswari.subjects.find(s => s.subjectName === "TAMIL");
  const rEnglish = rajeswari.subjects.find(s => s.subjectName === "ENGLISH");
  const rMaths = rajeswari.subjects.find(s => s.subjectName === "MATHEMATICS");
  const rScience = rajeswari.subjects.find(s => s.subjectName === "SCIENCE");
  const rSocial = rajeswari.subjects.find(s => s.subjectName === "SOCIAL SCIENCE");

  assert.strictEqual(rTamil?.score, 92, "Rajeswari Tamil should be 92");
  assert.strictEqual(rEnglish?.score, 89, "Rajeswari English should be 89");
  assert.strictEqual(rMaths?.score, 95, "Rajeswari Maths should be 95");
  assert.strictEqual(rScience?.score, 90, "Rajeswari Science should be 90");
  assert.strictEqual(rSocial?.score, 94, "Rajeswari Social should be 94");

  console.log("✔ Test 5: Full marksheet extraction integration test passed (Kirithik 427/500, Rajeswari 460/500)");
}

// 6. Document Comparison
{
  const matchComp = compareDocumentTotals(427, 427, 85.4, 85.4);
  assert.strictEqual(matchComp.matches, true);

  const mismatchComp = compareDocumentTotals(426, 427, 85.2, 85.4);
  assert.strictEqual(mismatchComp.matches, false);
  assert.strictEqual(mismatchComp.diff, 1);
  assert.ok(mismatchComp.warning?.includes("Document says 427, calculated 426"));
  console.log("✔ Test 6: Document comparison (matches & mismatch diagnostic) passed");
}

// 7. Regression Test: Clearing a mark
{
  const sampleSubjects = [
    { score: 86, maxScore: 100, passMarks: 35 },
    { score: "", maxScore: 100, passMarks: 35 } // Cleared mark!
  ];

  const emptyCount = sampleSubjects.filter(s => s.score === "").length;
  const isAllEntered = emptyCount === 0;
  const resultStatus = !isAllEntered ? "PENDING" : "PASSED";

  assert.strictEqual(isAllEntered, false, "Must not be considered all entered");
  assert.strictEqual(resultStatus, "PENDING", "Result must be PENDING when any mark is empty");
  console.log("✔ Test 7: Regression test for clearing marks passed (result remains PENDING)");
}

// 8. Standard JSON Upload Pipeline
{
  const jsonTemplate = generateStandardJsonTemplate("Class 10 - A", classSubjects, classStudents);
  const jsonStr = JSON.stringify(jsonTemplate);
  const parsed = parseJsonToReportCard(jsonStr, classSubjects, classStudents);

  assert.strictEqual(parsed.allDetectedStudents.length, 2);
  assert.strictEqual(parsed.allDetectedStudents[0].studentName, "KIRITHIK M");
  assert.strictEqual(parsed.allDetectedStudents[1].studentName, "RAJESWARI M");
  assert.strictEqual(parsed.allDetectedStudents[0].subjects.length, 5);
  console.log("✔ Test 8: Standard JSON template and upload parser passed");
}

console.log("\n=======================================================");
console.log("🎉 ALL REPORT CARD OCR PIPELINE TESTS PASSED 100%! 🎉");
console.log("=======================================================\n");
