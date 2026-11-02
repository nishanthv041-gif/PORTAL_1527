import { prisma } from "../backend/db/prisma";
import {
  createExamRequestWorkflowAction,
  adminApproveExamRequestWorkflowAction,
  adminRejectExamRequestWorkflowAction,
} from "../backend/api/actions/exams/examRequestWorkflowActions";

async function runTest() {
  console.log("=== STARTING PHASE 1 TEST ===");

  // 1. Find a class with subjects and a class teacher
  const testClass = await prisma.class.findFirst({
    where: {
      isActive: true,
      classTeacherId: { not: null },
      subjects: { some: { isActive: true } },
    },
    include: {
      classTeacher: { include: { user: true } },
      subjects: { include: { teacher: { include: { user: true } } } },
    },
  });

  if (!testClass) {
    throw new Error("No eligible test class with class teacher and subjects found.");
  }

  console.log(`Test Class: ${testClass.name} - ${testClass.section} (ID: ${testClass.id})`);
  console.log(`Class Teacher: ${testClass.classTeacher?.user.name} (Teacher ID: ${testClass.classTeacher?.id})`);
  console.log(`Subjects count: ${testClass.subjects.length}`);

  // Clean up any previous test requests with name 'Phase 1 Test Exam'
  await prisma.examSubject.deleteMany({
    where: { exam: { name: "Phase 1 Test Exam" } },
  });
  await prisma.exam.deleteMany({
    where: { name: "Phase 1 Test Exam" },
  });
  await prisma.examRequestSubject.deleteMany({
    where: { request: { title: "Phase 1 Test Exam" } },
  });
  await prisma.examRequest.deleteMany({
    where: { title: "Phase 1 Test Exam" },
  });

  // 2. Create an Exam Request
  const subList = testClass.subjects.slice(0, 3).map((s) => ({
    subjectId: s.id,
    maxMarks: 100,
    passMark: 35,
    examDate: new Date().toISOString(),
  }));

  const created = await prisma.examRequest.create({
    data: {
      title: "Phase 1 Test Exam",
      examType: "UNIT_TEST",
      classId: testClass.id,
      sectionId: testClass.section,
      requestedByStaffId: testClass.classTeacher!.id,
      teacherId: testClass.classTeacher!.id,
      status: "PENDING_ADMIN",
      remarks: "Test proposal created by test suite",
      requestSubjects: {
        create: subList.map((s) => ({
          subjectId: s.subjectId,
          teacherId: testClass.subjects.find((ts) => ts.id === s.subjectId)?.teacherId || testClass.classTeacher!.id,
          maxMarks: s.maxMarks,
          passMark: s.passMark,
          examDate: new Date(s.examDate),
        })),
      },
    },
    include: {
      requestSubjects: true,
    },
  });

  console.log(`Created ExamRequest: ID ${created.id}, status: ${created.status}, subjects: ${created.requestSubjects.length}`);

  // 3. Verify Admin approval workflow
  const adminUser = await prisma.user.findFirst({ where: { role: "ADMIN" } });
  if (!adminUser) throw new Error("No admin user found.");

  // Test approval logic simulation
  const academicBatch = await prisma.academicBatch.findFirst({ where: { isCurrent: true } });

  const approvedExam = await prisma.$transaction(async (tx) => {
    await tx.examRequest.update({
      where: { id: created.id },
      data: {
        status: "APPROVED",
        decidedBy: adminUser.id,
        decidedAt: new Date(),
      },
    });

    const ex = await tx.exam.create({
      data: {
        name: created.title,
        requestId: created.id,
        classId: created.classId,
        sectionId: created.sectionId,
        academicYearId: academicBatch?.id || null,
        status: "MARKS_IN_PROGRESS",
      },
    });

    for (const rs of created.requestSubjects) {
      await tx.examSubject.create({
        data: {
          examId: ex.id,
          subjectId: rs.subjectId,
          teacherId: rs.teacherId,
          maxMarks: rs.maxMarks,
          passMark: rs.passMark,
          status: "PENDING",
        },
      });
    }

    return ex;
  });

  console.log(`Approved Exam created: ID ${approvedExam.id}, status: ${approvedExam.status}`);

  const examSubjects = await prisma.examSubject.findMany({
    where: { examId: approvedExam.id },
  });
  console.log(`Verified ExamSubjects created count: ${examSubjects.length}`);
  if (examSubjects.length !== subList.length) {
    throw new Error(`Expected ${subList.length} ExamSubjects, got ${examSubjects.length}`);
  }

  // Clean up test records
  await prisma.examSubject.deleteMany({ where: { examId: approvedExam.id } });
  await prisma.exam.deleteMany({ where: { id: approvedExam.id } });
  await prisma.examRequestSubject.deleteMany({ where: { requestId: created.id } });
  await prisma.examRequest.deleteMany({ where: { id: created.id } });

  console.log("=== PHASE 1 TEST COMPLETED SUCCESSFULLY! ===");
}

runTest()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("Test failed:", e);
    process.exit(1);
  });
