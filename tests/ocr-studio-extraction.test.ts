import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import {
  parseTextToReportCard,
  matchSubject,
  matchStudent,
  computeGrade,
  stringSimilarity
} from "../backend/api/actions/dashboard/teacher/report-cards/scanReportCardUtils";

const mockClassSubjects = [
  { id: "sub-tamil", name: "Tamil", maxMarks: 100, passMarks: 35 },
  { id: "sub-english", name: "English", maxMarks: 100, passMarks: 35 },
  { id: "sub-maths", name: "Mathematics", maxMarks: 100, passMarks: 35 },
  { id: "sub-science", name: "Science", maxMarks: 100, passMarks: 35 },
  { id: "sub-social", name: "Social Science", maxMarks: 100, passMarks: 35 }
];

const mockClassStudents = [
  { id: "st-iniya", name: "Iniya K", rollNumber: "7376252AD189" },
  { id: "st-kirithik", name: "KIRITHIK M", rollNumber: "7376252AD216" },
  { id: "st-rajeswari", name: "RAJESWARI M", rollNumber: "7376251EE172" }
];

console.log("Running OCR & Document Studio Test Suite...");

// TEST 1: Subject matching & synonym resolution
{
  const m1 = matchSubject("Tamil /100", mockClassSubjects);
  assert.strictEqual(m1?.subjectId, "sub-tamil", "Tamil /100 should match sub-tamil");

  const m2 = matchSubject("Maths", mockClassSubjects);
  assert.strictEqual(m2?.subjectId, "sub-maths", "Maths should match sub-maths (Mathematics)");

  const m3 = matchSubject("Social", mockClassSubjects);
  assert.strictEqual(m3?.subjectId, "sub-social", "Social should match sub-social (Social Science)");

  const m4 = matchSubject("Total", mockClassSubjects);
  assert.strictEqual(m4, null, "'Total' is a non-subject keyword and should not match a subject");

  const m5 = matchSubject("S.No", mockClassSubjects);
  assert.strictEqual(m5, null, "'S.No' is a non-subject keyword and should not match a subject");
  console.log("✔ Test 1: Subject matching and non-subject keyword exclusion passed");
}

// TEST 2: Single Student Marksheet (Iniya K - Image 3)
{
  const rawTextIniya = `
STUDENT MARK SHEET
Student Name: Iniya K

S. No. | Subject | Maximum Marks | Marks Obtained
1 | Tamil | 100 | 85
2 | English | 100 | 90
3 | Mathematics | 100 | 92
4 | Science | 100 | 88
5 | Social Science | 100 | 86
TOTAL | 500 | 441
AVERAGE | 88.2 / 100
Note: These marks are sample marks assigned for this mark sheet.
  `.trim();

  const parsed = parseTextToReportCard(rawTextIniya, mockClassSubjects, mockClassStudents);

  assert.strictEqual(parsed.studentName, "Iniya K", "Student name should match Iniya K");
  assert.strictEqual(parsed.studentId, "st-iniya", "Student ID should match st-iniya");
  assert.strictEqual(parsed.docTotal, 441, "Doc total should be 441");

  // Check subject scores: S.No (1, 2, 3...) must NEVER be the score!
  const tamil = parsed.subjects.find(s => s.subjectId === "sub-tamil");
  assert.strictEqual(tamil?.score, 85, "Tamil score should be 85 (NOT S.No 1)");
  assert.strictEqual(tamil?.maxScore, 100, "Tamil max score should be 100");
  assert.strictEqual(tamil?.passMarks, 35, "Tamil pass mark should remain 35 (NOT replaced by score 85)");

  const maths = parsed.subjects.find(s => s.subjectId === "sub-maths");
  assert.strictEqual(maths?.score, 92, "Maths score should be 92 (NOT S.No 3)");

  const science = parsed.subjects.find(s => s.subjectId === "sub-science");
  assert.strictEqual(science?.score, 88, "Science score should be 88 (NOT S.No 4)");

  console.log("✔ Test 2: Single student marksheet (Iniya K) correctly parsed with accurate column mapping");
}

// TEST 3: Multi-Student Gradebook Table (Image 9: Kirithik M & Rajeswari M)
{
  const rawTextMulti = `
STUDENT MARKSHEET — SAMPLE MARKS
Each subject is out of 100

S.No. | Student Name | Roll No. | Tamil /100 | English /100 | Maths /100 | Science /100 | Social /100 | Total /500 | Percentage
1 | KIRITHIK M | 7376252AD216 | 86 | 78 | 91 | 84 | 88 | 427 | 85.4%
2 | RAJESWARI M | 7376251EE172 | 92 | 89 | 95 | 90 | 94 | 460 | 92.0%
Illustrative marks for sample layout only — verify before official use.
  `.trim();

  const parsed = parseTextToReportCard(rawTextMulti, mockClassSubjects, mockClassStudents);

  assert.strictEqual(parsed.allDetectedStudents.length, 2, "Should detect exactly 2 students");

  const st1 = parsed.allDetectedStudents[0];
  assert.strictEqual(st1.studentName, "KIRITHIK M", "First student should be KIRITHIK M");
  assert.strictEqual(st1.rollNumber, "7376252AD216", "First student roll number should match");

  const st1Tamil = st1.subjects.find(s => s.subjectId === "sub-tamil");
  assert.strictEqual(st1Tamil?.score, 86, "Kirithik Tamil score should be 86");
  const st1Maths = st1.subjects.find(s => s.subjectId === "sub-maths");
  assert.strictEqual(st1Maths?.score, 91, "Kirithik Maths score should be 91");

  const st2 = parsed.allDetectedStudents[1];
  assert.strictEqual(st2.studentName, "RAJESWARI M", "Second student should be RAJESWARI M");
  assert.strictEqual(st2.rollNumber, "7376251EE172", "Second student roll number should match");

  const st2Tamil = st2.subjects.find(s => s.subjectId === "sub-tamil");
  assert.strictEqual(st2Tamil?.score, 92, "Rajeswari Tamil score should be 92");
  const st2Social = st2.subjects.find(s => s.subjectId === "sub-social");
  assert.strictEqual(st2Social?.score, 94, "Rajeswari Social score should be 94");

  console.log("✔ Test 3: Multi-student gradebook table successfully parsed both Kirithik M & Rajeswari M");
}

// TEST 4: Zero disk persistence verification
{
  const uploadsDir = path.join(process.cwd(), "public", "uploads", "report-cards");
  assert.strictEqual(
    fs.existsSync(uploadsDir),
    false,
    "Directory public/uploads/report-cards must not exist. Uploads are strictly processed in-memory."
  );
  console.log("✔ Test 4: Verified zero disk persistence (public/uploads/report-cards does not exist)");
}

// TEST 5: Grade & result pending logic
{
  assert.strictEqual(computeGrade(95, 100), "A+");
  assert.strictEqual(computeGrade(85, 100), "A");
  assert.strictEqual(computeGrade(75, 100), "B");
  assert.strictEqual(computeGrade(65, 100), "C");
  assert.strictEqual(computeGrade(55, 100), "D");
  assert.strictEqual(computeGrade(30, 100), "F");
  console.log("✔ Test 5: Grade computations verified");
}

console.log("\nALL TESTS PASSED SUCCESSFULLY! (28 assertions verified)");
