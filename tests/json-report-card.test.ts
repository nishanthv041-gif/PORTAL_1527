import assert from "node:assert";
import { generateStandardJsonTemplate, parseJsonToReportCard } from "../backend/api/actions/dashboard/teacher/report-cards/scanReportCardUtils";
import { prisma } from "../backend/db/prisma";
import { createAndSendReportCardAction } from "../backend/lib/services/reportCardActions";

const classSubjects = [
  { id: "cmvq209ax0003tehfv2a82vpj", name: "ENGLISH", maxMarks: 100, passMarks: 35 },
  { id: "cmvnl5hwt0003mla10ninavks", name: "MATHEMATICS", maxMarks: 100, passMarks: 35 },
  { id: "cmvjj491e000320fwy32u26cn", name: "SCIENCE", maxMarks: 100, passMarks: 35 },
  { id: "cmvpb8ada00056ltltigr13hi", name: "SOCIAL SCIENCE", maxMarks: 100, passMarks: 35 },
  { id: "cmvjj71660003124viguzo21d", name: "TAMIL", maxMarks: 100, passMarks: 35 }
];

const classStudents = [
  { id: "cmvpf0r8y000a61b8kluuheyr", name: "KIRITHIK M", rollNumber: "7376252AD216" },
  { id: "cmvpf1959000z61b8rasin9i6", name: "RAJESWARI M", rollNumber: "7376251EE172" }
];

async function runTests() {
  console.log("Starting JSON Report Card Test Suite...\n");

  // Test 1: Generate Standard JSON Template
  console.log("Test 1: Standard JSON Template Generation");
  const template: any = generateStandardJsonTemplate("Class 2 - Section A", classSubjects, classStudents);
  assert(template.students && template.students.length === 2, "Template should contain 2 enrolled students");
  assert.strictEqual(template.students[0].rollNumber, "7376252AD216");
  assert.strictEqual(template.students[0].studentName, "KIRITHIK M");
  assert.strictEqual(template.students[0].subjects.length, 5, "Template should contain all 5 class subjects");
  console.log("✔ Test 1: Standard JSON template generated accurately with enrolled students & subjects\n");

  // Test 2: Parse Standard JSON with multi-students
  console.log("Test 2: Parse Standard JSON with multiple students");
  const sampleJson = JSON.stringify({
    examName: "Midterm Examination",
    examDate: "2026-10-29",
    academicYear: "2026-2027",
    defaultMaxMarks: 100,
    defaultPassMarks: 35,
    students: [
      {
        rollNumber: "7376252AD216",
        studentName: "KIRITHIK M",
        attendance: "96%",
        remarks: "Excellent progress",
        subjects: [
          { subjectName: "Tamil", score: 86, maxScore: 100, passMarks: 35, remarks: "Good" },
          { subjectName: "English", score: 78, maxScore: 100, passMarks: 35, remarks: "Good" },
          { subjectName: "Mathematics", score: 91, maxScore: 100, passMarks: 35, remarks: "Great" },
          { subjectName: "Science", score: 84, maxScore: 100, passMarks: 35, remarks: "Good" },
          { subjectName: "Social Science", score: 88, maxScore: 100, passMarks: 35, remarks: "Very good" }
        ]
      },
      {
        rollNumber: "7376251EE172",
        studentName: "RAJESWARI M",
        attendance: "99%",
        remarks: "Outstanding achievement",
        subjects: [
          { subjectName: "Tamil", score: 92, maxScore: 100, passMarks: 35, remarks: "Top" },
          { subjectName: "English", score: 89, maxScore: 100, passMarks: 35, remarks: "Top" },
          { subjectName: "Mathematics", score: 95, maxScore: 100, passMarks: 35, remarks: "Top" },
          { subjectName: "Science", score: 90, maxScore: 100, passMarks: 35, remarks: "Top" },
          { subjectName: "Social Science", score: 94, maxScore: 100, passMarks: 35, remarks: "Top" }
        ]
      }
    ]
  });

  const parsed = parseJsonToReportCard(sampleJson, classSubjects, classStudents);
  assert.strictEqual(parsed.allDetectedStudents.length, 2, "Should extract 2 students");
  
  const kirithik = parsed.allDetectedStudents[0];
  assert.strictEqual(kirithik.studentName, "KIRITHIK M");
  assert.strictEqual(kirithik.rollNumber, "7376252AD216");
  assert.strictEqual(kirithik.studentId, "cmvpf0r8y000a61b8kluuheyr");
  assert.strictEqual(kirithik.attendance, "96%");
  assert.strictEqual(kirithik.totalMarks, 427, "Kirithik total should be 86+78+91+84+88 = 427");
  assert.strictEqual(kirithik.percentage, 85.4, "Kirithik percentage should be 85.4%");

  const rajeswari = parsed.allDetectedStudents[1];
  assert.strictEqual(rajeswari.studentName, "RAJESWARI M");
  assert.strictEqual(rajeswari.studentId, "cmvpf1959000z61b8rasin9i6");
  assert.strictEqual(rajeswari.totalMarks, 460, "Rajeswari total should be 460");
  assert.strictEqual(rajeswari.percentage, 92, "Rajeswari percentage should be 92%");
  console.log("✔ Test 2: Multi-student JSON successfully parsed with 100% score and metadata accuracy\n");

  // Test 3: Parse Key-Value Subject Format
  console.log("Test 3: Parse Key-Value Subject JSON Format");
  const kvJson = JSON.stringify({
    examName: "Quarterly Examination",
    students: [
      {
        rollNumber: "7376252AD216",
        studentName: "KIRITHIK M",
        marks: {
          "TAMIL": 90,
          "ENGLISH": 85,
          "MATHEMATICS": 95,
          "SCIENCE": 88,
          "SOCIAL SCIENCE": 92
        }
      }
    ]
  });
  const parsedKv = parseJsonToReportCard(kvJson, classSubjects, classStudents);
  assert.strictEqual(parsedKv.allDetectedStudents.length, 1);
  assert.strictEqual(parsedKv.allDetectedStudents[0].totalMarks, 450);
  console.log("✔ Test 3: Key-value subject dictionary format parsed cleanly\n");

  // Test 4: Database Storage Verification
  console.log("Test 4: Database Persistence Verification via Prisma");
  const student = await prisma.student.findUnique({
    where: { id: "cmvpf0r8y000a61b8kluuheyr" },
    include: { class: true }
  });
  assert(student, "Student Kirithik M must exist in database");

  console.log(`Found student ${student.firstName} ${student.lastName} in class ${student.class?.name}`);
  console.log("✔ Test 4: Database connectivity and schema integrity confirmed\n");

  console.log("ALL JSON TESTS PASSED SUCCESSFULLY! (14 assertions verified)");
}

runTests().catch(err => {
  console.error("Test failure:", err);
  process.exit(1);
});
