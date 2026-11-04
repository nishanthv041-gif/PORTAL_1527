import { findBestSubjectMatch, matchScanResultToDatabase } from "../frontend/lib/scan/match-students";
import { reconstructTableFromWords } from "../frontend/lib/scan/table-reconstruction";
import { calculateStudentTotals } from "../frontend/lib/marks-extractor";

console.log("=== RUNNING REPORT CARD EXTRACTION PIPELINE TESTS ===");

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${msg}`);
    process.exit(1);
  } else {
    console.log(`✅ PASSED: ${msg}`);
  }
}

const classSubjects = [
  { id: "sub-1", name: "ENGLISH", code: "ENG", maxMarks: 100, passMarks: 35 },
  { id: "sub-2", name: "MATHEMATICS", code: "MAT", maxMarks: 100, passMarks: 35 },
  { id: "sub-3", name: "SOCIAL SCIENCE", code: "SOC", maxMarks: 100, passMarks: 35 }, // Note: SOCIAL SCIENCE placed BEFORE SCIENCE to verify collision prevention
  { id: "sub-4", name: "SCIENCE", code: "SCI", maxMarks: 100, passMarks: 35 },
  { id: "sub-5", name: "TAMIL", code: "TAM", maxMarks: 100, passMarks: 35 },
];

const classStudents = [
  { id: "st-1", name: "ANUSHKA A", enrollmentNumber: "7376252AD114", rollNumber: "7376252AD114" },
  { id: "st-2", name: "Iniya K", enrollmentNumber: "7376252AD189", rollNumber: "7376252AD189" },
  { id: "st-3", name: "Karuppusamy S", enrollmentNumber: "7376252AD208", rollNumber: "7376252AD208" },
];

// Test 1: Subject Collision Prevention (Science vs Social Science)
{
  const sciMatch = findBestSubjectMatch("SCIENCE", classSubjects);
  assert(sciMatch?.name === "SCIENCE" && sciMatch?.id === "sub-4", `SCIENCE must map to SCIENCE, got ${sciMatch?.name}`);

  const sciShortMatch = findBestSubjectMatch("Sci", classSubjects);
  assert(sciShortMatch?.name === "SCIENCE" && sciShortMatch?.id === "sub-4", `Sci must map to SCIENCE, got ${sciShortMatch?.name}`);

  const socMatch = findBestSubjectMatch("SOCIAL", classSubjects);
  assert(socMatch?.name === "SOCIAL SCIENCE" && socMatch?.id === "sub-3", `SOCIAL must map to SOCIAL SCIENCE, got ${socMatch?.name}`);

  const socFullMatch = findBestSubjectMatch("SOCIAL SCIENCE", classSubjects);
  assert(socFullMatch?.name === "SOCIAL SCIENCE" && socFullMatch?.id === "sub-3", `SOCIAL SCIENCE must map to SOCIAL SCIENCE, got ${socFullMatch?.name}`);

  const tamMatch = findBestSubjectMatch("TAMIL", classSubjects);
  assert(tamMatch?.name === "TAMIL", `TAMIL must map to TAMIL, got ${tamMatch?.name}`);

  const engMatch = findBestSubjectMatch("ENGLISH", classSubjects);
  assert(engMatch?.name === "ENGLISH", `ENGLISH must map to ENGLISH, got ${engMatch?.name}`);

  const matMatch = findBestSubjectMatch("MATHS", classSubjects);
  assert(matMatch?.name === "MATHEMATICS", `MATHS must map to MATHEMATICS, got ${matMatch?.name}`);
}

// Test 2: Full Document Extraction for 3 Test Students (Anushka A, Iniya K, Karuppusamy S)
{
  const words = [
    // Header: STUDENT NAME | TAMIL | ENGLISH | MATHS | SCIENCE | SOCIAL | TOTAL
    { text: "STUDENT", x0: 50, x1: 150, y0: 100, y1: 120 },
    { text: "NAME", x0: 160, x1: 220, y0: 100, y1: 120 },
    { text: "TAMIL", x0: 300, x1: 370, y0: 100, y1: 120 },
    { text: "ENGLISH", x0: 420, x1: 510, y0: 100, y1: 120 },
    { text: "MATHS", x0: 560, x1: 640, y0: 100, y1: 120 },
    { text: "SCIENCE", x0: 690, x1: 780, y0: 100, y1: 120 },
    { text: "SOCIAL", x0: 830, x1: 910, y0: 100, y1: 120 },
    { text: "TOTAL", x0: 960, x1: 1040, y0: 100, y1: 120 },

    // Row 1: Anushka A (86, 91, 88, 84, 90, cut-off total "43")
    { text: "Anushka", x0: 50, x1: 160, y0: 150, y1: 170 },
    { text: "A", x0: 170, x1: 190, y0: 150, y1: 170 },
    { text: "86", x0: 320, x1: 350, y0: 150, y1: 170 },
    { text: "91", x0: 450, x1: 480, y0: 150, y1: 170 },
    { text: "88", x0: 590, x1: 620, y0: 150, y1: 170 },
    { text: "84", x0: 720, x1: 750, y0: 150, y1: 170 },
    { text: "90", x0: 860, x1: 890, y0: 150, y1: 170 },
    { text: "43", x0: 990, x1: 1020, y0: 150, y1: 170 },

    // Row 2: Iniya K (92, 89, 95, 90, 87, cut-off total "45")
    { text: "Iniya", x0: 50, x1: 130, y0: 200, y1: 220 },
    { text: "K", x0: 140, x1: 160, y0: 200, y1: 220 },
    { text: "92", x0: 320, x1: 350, y0: 200, y1: 220 },
    { text: "89", x0: 450, x1: 480, y0: 200, y1: 220 },
    { text: "95", x0: 590, x1: 620, y0: 200, y1: 220 },
    { text: "90", x0: 720, x1: 750, y0: 200, y1: 220 },
    { text: "87", x0: 860, x1: 890, y0: 200, y1: 220 },
    { text: "45", x0: 990, x1: 1020, y0: 200, y1: 220 },

    // Row 3: Karuppusamy S (81, 85, 89, 86, 83, cut-off total "42")
    { text: "Karuppusamy", x0: 50, x1: 180, y0: 250, y1: 270 },
    { text: "S", x0: 190, x1: 210, y0: 250, y1: 270 },
    { text: "81", x0: 320, x1: 350, y0: 250, y1: 270 },
    { text: "85", x0: 450, x1: 480, y0: 250, y1: 270 },
    { text: "89", x0: 590, x1: 620, y0: 250, y1: 270 },
    { text: "86", x0: 720, x1: 750, y0: 250, y1: 270 },
    { text: "83", x0: 860, x1: 890, y0: 250, y1: 270 },
    { text: "42", x0: 990, x1: 1020, y0: 250, y1: 270 },
  ];

  const scanResult = reconstructTableFromWords(words as any, { defaultMaxMarks: 100, defaultPassMarks: 35 });
  assert(scanResult.students.length === 3, `Expected 3 students, got ${scanResult.students.length}`);

  const detected = matchScanResultToDatabase(scanResult, classStudents as any, classSubjects as any);
  assert(detected.length === 3, `Expected 3 detected students, got ${detected.length}`);

  // 1. Anushka A: 86 + 91 + 88 + 84 + 90 = 439/500 (87.8%)
  const anushka = detected[0];
  assert(anushka.studentName === "ANUSHKA A", `Student 0 name must be ANUSHKA A, got ${anushka.studentName}`);
  assert(anushka.subjects.length === 5, `Anushka must have 5 subjects, got ${anushka.subjects.length}`);
  assert(anushka.totalMarks === 439, `Anushka total must be 439, got ${anushka.totalMarks}`);
  assert(anushka.maxTotal === 500, `Anushka maxTotal must be 500, got ${anushka.maxTotal}`);
  assert(anushka.percentage === 87.8, `Anushka percentage must be 87.8, got ${anushka.percentage}`);

  // 2. Iniya K: 92 + 89 + 95 + 90 + 87 = 453/500 (90.6%)
  const iniya = detected[1];
  assert(iniya.studentName === "Iniya K", `Student 1 name must be Iniya K, got ${iniya.studentName}`);
  assert(iniya.subjects.length === 5, `Iniya must have 5 subjects, got ${iniya.subjects.length}`);
  assert(iniya.totalMarks === 453, `Iniya total must be 453, got ${iniya.totalMarks}`);
  assert(iniya.maxTotal === 500, `Iniya maxTotal must be 500, got ${iniya.maxTotal}`);
  assert(iniya.percentage === 90.6, `Iniya percentage must be 90.6, got ${iniya.percentage}`);

  // 3. Karuppusamy S: 81 + 85 + 89 + 86 + 83 = 424/500 (84.8%)
  const karuppu = detected[2];
  assert(karuppu.studentName === "Karuppusamy S", `Student 2 name must be Karuppusamy S, got ${karuppu.studentName}`);
  assert(karuppu.subjects.length === 5, `Karuppusamy MUST have 5 subjects (including SCIENCE), got ${karuppu.subjects.length}`);
  
  const subjectsMap = new Map(karuppu.subjects.map(s => [s.subjectName, s.score]));
  assert(subjectsMap.get("TAMIL") === 81, `Tamil mark must be 81, got ${subjectsMap.get("TAMIL")}`);
  assert(subjectsMap.get("ENGLISH") === 85, `English mark must be 85, got ${subjectsMap.get("ENGLISH")}`);
  assert(subjectsMap.get("MATHEMATICS") === 89, `Maths mark must be 89, got ${subjectsMap.get("MATHEMATICS")}`);
  assert(subjectsMap.get("SCIENCE") === 86, `SCIENCE MUST BE PRESENT and mark must be 86, got ${subjectsMap.get("SCIENCE")}`);
  assert(subjectsMap.get("SOCIAL SCIENCE") === 83, `Social Science mark must be 83, got ${subjectsMap.get("SOCIAL SCIENCE")}`);

  assert(karuppu.totalMarks === 424, `Karuppusamy total must be recalculated to 424 (never 338 or cut-off 42), got ${karuppu.totalMarks}`);
  assert(karuppu.maxTotal === 500, `Karuppusamy maxTotal must be 500 (never 400), got ${karuppu.maxTotal}`);
  assert(karuppu.percentage === 84.8, `Karuppusamy percentage must be 84.8% (never 84.5%), got ${karuppu.percentage}`);
}

// Test 3: Absent Students Handling
{
  const totals = calculateStudentTotals([
    { subjectName: "Tamil", score: 85, maxScore: 100, passMarks: 35 },
    { subjectName: "English", score: "AB", maxScore: 100, passMarks: 35 },
    { subjectName: "Maths", score: 90, maxScore: 100, passMarks: 35 },
  ]);
  assert(totals.totalMarks === 175, `Total marks must be sum of present subjects (175), got ${totals.totalMarks}`);
  assert(totals.maxTotalMarks === 300, `Max total must be 300, got ${totals.maxTotalMarks}`);
  assert(totals.resultStatus === "NEEDS SUPPORT", `Absent in a subject must flag NEEDS SUPPORT, got ${totals.resultStatus}`);
}

console.log("=== ALL REPORT CARD EXTRACTION UNIT TESTS PASSED SUCCESSFULLY! ===");
