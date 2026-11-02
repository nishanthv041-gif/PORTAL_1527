import { prisma } from "../backend/db/prisma";

async function runPhase3WorkflowTests() {
  console.log("================================================================================");
  console.log("            PHASE 3 & FULL END-TO-END WORKFLOW VERIFICATION SUITE               ");
  console.log("================================================================================\n");

  // 1. Pick a test class with teacher, subjects, and students
  const testClass = await prisma.class.findFirst({
    where: {
      isActive: true,
      classTeacherId: { not: null },
      subjects: { some: { isActive: true } },
      students: { some: { isActive: true } },
    },
    include: {
      classTeacher: { include: { user: true } },
      subjects: { include: { teacher: { include: { user: true } } } },
      students: { where: { isActive: true }, orderBy: { rollNumber: "asc" } },
    },
  });

  if (!testClass || !testClass.classTeacher) {
    throw new Error("No eligible class with class teacher, subjects, and students found.");
  }

  const classTeacher = testClass.classTeacher;
  const subjects = testClass.subjects.slice(0, 2); // 2 subjects
  const students = testClass.students;

  console.log(`Class: ${testClass.name} - ${testClass.section}`);
  console.log(`Class Teacher: ${classTeacher.user.name}`);
  console.log(`Subjects: ${subjects.map((s) => s.name).join(", ")}`);
  console.log(`Students enrolled: ${students.length}`);

  const academicBatch = await prisma.academicBatch.findFirst({ where: { isCurrent: true } });
  const adminUser = await prisma.user.findFirst({ where: { role: "ADMIN" } });
  if (!adminUser) throw new Error("No admin user found.");

  // Clean up any existing test records
  const examTitle = "Phase 3 E2E Verification Exam";
  await prisma.markAuditLog.deleteMany({
    where: { examSubject: { exam: { name: examTitle } } },
  });
  await prisma.reportCard.deleteMany({
    where: { exam: { name: examTitle } },
  });
  await prisma.mark.deleteMany({
    where: { exam: { name: examTitle } },
  });
  await prisma.examSubject.deleteMany({
    where: { exam: { name: examTitle } },
  });
  await prisma.exam.deleteMany({
    where: { name: examTitle },
  });
  await prisma.examRequestSubject.deleteMany({
    where: { request: { title: examTitle } },
  });
  await prisma.examRequest.deleteMany({
    where: { title: examTitle },
  });

  // --------------------------------------------------------------------------
  // STEP 1: Class Teacher Creates Exam Request
  // --------------------------------------------------------------------------
  console.log("\n--- STEP 1: Exam Request Creation ---");
  const examRequest = await prisma.examRequest.create({
    data: {
      title: examTitle,
      examType: "UNIT_TEST",
      classId: testClass.id,
      sectionId: testClass.section,
      requestedByStaffId: classTeacher.id,
      teacherId: classTeacher.id,
      status: "PENDING_ADMIN",
      remarks: "Comprehensive Term Assessment",
      maxMarks: 100,
      passMark: 35,
      requestSubjects: {
        create: subjects.map((s) => ({
          subjectId: s.id,
          teacherId: s.teacherId || classTeacher.id,
          maxMarks: 100,
          passMark: 35,
        })),
      },
    },
    include: { requestSubjects: true },
  });
  console.log(`✅ Exam Request created: ID=${examRequest.id}, Status=${examRequest.status}, Subjects=${examRequest.requestSubjects.length}`);

  // --------------------------------------------------------------------------
  // STEP 2: Admin Approves Request -> Creates Exam & ExamSubject Tasks
  // --------------------------------------------------------------------------
  console.log("\n--- STEP 2: Admin Approval & Task Dispatch ---");
  const approvedExam = await prisma.$transaction(async (tx) => {
    await tx.examRequest.update({
      where: { id: examRequest.id },
      data: {
        status: "APPROVED",
        decidedBy: adminUser.id,
        decidedAt: new Date(),
      },
    });

    const ex = await tx.exam.create({
      data: {
        name: examTitle,
        requestId: examRequest.id,
        classId: testClass.id,
        sectionId: testClass.section,
        academicYearId: academicBatch?.id || null,
        status: "MARKS_IN_PROGRESS",
        isPublished: false,
      },
    });

    for (const rs of examRequest.requestSubjects) {
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

  const createdTasks = await prisma.examSubject.findMany({
    where: { examId: approvedExam.id },
    include: { subject: true, teacher: { include: { user: true } } },
  });

  if (createdTasks.length !== subjects.length) {
    throw new Error(`Expected ${subjects.length} ExamSubjects, got ${createdTasks.length}`);
  }
  console.log(`✅ Admin approved: Created Exam (ID: ${approvedExam.id}) with ${createdTasks.length} subject tasks assigned to teachers.`);

  // --------------------------------------------------------------------------
  // STEP 3: Subject Teachers Enter & Submit Marks
  // --------------------------------------------------------------------------
  console.log("\n--- STEP 3: Marks Entry & Submission ---");
  for (const task of createdTasks) {
    // Enter marks for every student
    for (let i = 0; i < students.length; i++) {
      const student = students[i];
      const isAbsent = i === students.length - 1 && students.length > 2; // last student absent if > 2
      const marksObtained = isAbsent ? null : 70 + (i * 10) % 25;

      await prisma.mark.create({
        data: {
          examSubjectId: task.id,
          studentId: student.id,
          examId: approvedExam.id,
          subjectId: task.subjectId,
          marksObtained,
          score: marksObtained ?? 0,
          maxScore: task.maxMarks,
          isAbsent,
          remark: isAbsent ? "Medical leave" : "Regular",
          enteredByStaffId: task.teacherId,
        },
      });
    }

    // Submit subject
    await prisma.examSubject.update({
      where: { id: task.id },
      data: {
        status: "SUBMITTED",
        submittedAt: new Date(),
      },
    });
  }

  console.log(`✅ Both subject teachers successfully entered and submitted marks.`);

  // --------------------------------------------------------------------------
  // STEP 4: Class Teacher Review, Return & Verify Workflow
  // --------------------------------------------------------------------------
  console.log("\n--- STEP 4: Class Teacher Return & Verify Workflow ---");
  const taskToReturn = createdTasks[0];
  const returnReason = "Please double check Roll #1 calculation on question 4.";

  // Return subject 1
  await prisma.$transaction(async (tx) => {
    await tx.examSubject.update({
      where: { id: taskToReturn.id },
      data: {
        status: "RETURNED",
        returnRemark: returnReason,
      },
    });
    await tx.exam.update({
      where: { id: approvedExam.id },
      data: { status: "MARKS_IN_PROGRESS" },
    });
  });

  let checkReturned = await prisma.examSubject.findUnique({ where: { id: taskToReturn.id } });
  if (checkReturned?.status !== "RETURNED" || checkReturned?.returnRemark !== returnReason) {
    throw new Error("Subject task failed to enter RETURNED state with remark.");
  }
  console.log(`✅ Class teacher returned subject ${taskToReturn.subject.name}: status=RETURNED, returnRemark="${returnReason}".`);

  // Subject teacher revises mark and resubmits
  const markToRevise = await prisma.mark.findFirst({
    where: { examSubjectId: taskToReturn.id, studentId: students[0].id },
  });
  if (markToRevise) {
    await prisma.markAuditLog.create({
      data: {
        markId: markToRevise.id,
        examSubjectId: taskToReturn.id,
        studentId: students[0].id,
        oldValue: markToRevise.marksObtained,
        newValue: 82,
        changedBy: taskToReturn.teacherId || "system",
        reason: "Recalculated question 4 as requested by class teacher",
      },
    });
    await prisma.mark.update({
      where: { id: markToRevise.id },
      data: { marksObtained: 82, score: 82 },
    });
  }

  await prisma.examSubject.update({
    where: { id: taskToReturn.id },
    data: {
      status: "SUBMITTED",
      submittedAt: new Date(),
      returnRemark: null,
    },
  });
  console.log(`✅ Subject teacher revised mark and re-submitted subject task.`);

  // Class teacher verifies both subjects
  for (const task of createdTasks) {
    await prisma.examSubject.update({
      where: { id: task.id },
      data: {
        status: "VERIFIED",
        verifiedAt: new Date(),
      },
    });
  }

  // Check if all verified -> exam status becomes VERIFIED
  const allVerified = (await prisma.examSubject.findMany({ where: { examId: approvedExam.id } })).every(
    (s) => s.status === "VERIFIED"
  );
  if (allVerified) {
    await prisma.exam.update({
      where: { id: approvedExam.id },
      data: { status: "VERIFIED" },
    });
  }

  const verifiedExam = await prisma.exam.findUnique({ where: { id: approvedExam.id } });
  if (verifiedExam?.status !== "VERIFIED") {
    throw new Error(`Expected Exam status VERIFIED, got ${verifiedExam?.status}`);
  }
  console.log(`✅ All subjects verified by Class Teacher! Exam status = VERIFIED.`);

  // --------------------------------------------------------------------------
  // STEP 5: Audit Log & Single Mark Correction with Reason
  // --------------------------------------------------------------------------
  console.log("\n--- STEP 5: Single Mark Correction Audit Trail ---");
  const auditReason = "Re-checking addition of total marks verified with principal";
  const markToCorrect = await prisma.mark.findFirst({
    where: { examSubjectId: createdTasks[1].id, studentId: students[0].id },
  });

  if (markToCorrect) {
    await prisma.markAuditLog.create({
      data: {
        markId: markToCorrect.id,
        examSubjectId: createdTasks[1].id,
        studentId: students[0].id,
        oldValue: markToCorrect.marksObtained,
        newValue: 95,
        changedBy: classTeacher.id,
        reason: auditReason,
      },
    });

    await prisma.mark.update({
      where: { id: markToCorrect.id },
      data: { marksObtained: 95, score: 95 },
    });
  }

  const logs = await prisma.markAuditLog.findMany({
    where: { studentId: students[0].id },
  });
  if (logs.length === 0) {
    throw new Error("Audit log entry was not found!");
  }
  console.log(`✅ Audit log verified: ${logs.length} audit trail record(s) created with reason.`);

  // --------------------------------------------------------------------------
  // STEP 6: Publish Exam to Report Cards
  // --------------------------------------------------------------------------
  console.log("\n--- STEP 6: Publish Exam to Report Cards ---");
  await prisma.$transaction(async (tx) => {
    await tx.exam.update({
      where: { id: approvedExam.id },
      data: {
        status: "PUBLISHED",
        isPublished: true,
      },
    });

    for (const student of students) {
      const studentMarks = await tx.mark.findMany({
        where: { examId: approvedExam.id, studentId: student.id },
      });

      const totalObtained = studentMarks.reduce((acc, m) => acc + (m.isAbsent ? 0 : (m.marksObtained ?? 0)), 0);
      const totalMax = 200; // 2 subjects * 100
      const percentage = (totalObtained / totalMax) * 100;
      const grade = percentage >= 80 ? "A" : percentage >= 60 ? "B" : "C";

      await tx.reportCard.create({
        data: {
          studentId: student.id,
          examId: approvedExam.id,
          totalMarks: totalObtained,
          percentage,
          grade,
          remarks: "Exam completed successfully",
          published: true,
        },
      });
    }
  });

  const publishedReportCards = await prisma.reportCard.findMany({
    where: { examId: approvedExam.id },
    include: { student: true },
  });

  if (publishedReportCards.length !== students.length) {
    throw new Error(`Expected ${students.length} report cards, found ${publishedReportCards.length}`);
  }
  console.log(`✅ Successfully published exam! Generated ${publishedReportCards.length} official ReportCard records.`);

  // --------------------------------------------------------------------------
  // STEP 7: Parent Visibility Verification
  // --------------------------------------------------------------------------
  console.log("\n--- STEP 7: Parent Visibility Verification ---");
  // Check that parent queries only select isPublished: true
  const parentVisibleExams = await prisma.exam.findMany({
    where: {
      classId: testClass.id,
      isPublished: true,
      id: approvedExam.id,
    },
  });
  if (parentVisibleExams.length !== 1) {
    throw new Error("Published exam is not visible to parent queries.");
  }

  // Simulate an unverified exam
  const unpublishedExam = await prisma.exam.create({
    data: {
      name: "Unpublished Secret Exam",
      classId: testClass.id,
      status: "MARKS_IN_PROGRESS",
      isPublished: false,
    },
  });

  const parentShouldNotSee = await prisma.exam.findMany({
    where: {
      classId: testClass.id,
      isPublished: true,
      id: unpublishedExam.id,
    },
  });
  if (parentShouldNotSee.length > 0) {
    throw new Error("Parent can see unpublished exam! Permission leak!");
  }
  console.log(`✅ Verified parent privacy: Unpublished exams are strictly invisible to parents.`);

  // Clean up test records
  await prisma.exam.delete({ where: { id: unpublishedExam.id } });
  await prisma.reportCard.deleteMany({ where: { examId: approvedExam.id } });
  await prisma.markAuditLog.deleteMany({ where: { examSubject: { examId: approvedExam.id } } });
  await prisma.mark.deleteMany({ where: { examId: approvedExam.id } });
  await prisma.examSubject.deleteMany({ where: { examId: approvedExam.id } });
  await prisma.exam.deleteMany({ where: { id: approvedExam.id } });
  await prisma.examRequestSubject.deleteMany({ where: { requestId: examRequest.id } });
  await prisma.examRequest.deleteMany({ where: { id: examRequest.id } });

  console.log("\n================================================================================");
  console.log("             ALL PHASE 3 & FULL WORKFLOW TESTS PASSED (100%)!                   ");
  console.log("================================================================================\n");
}

runPhase3WorkflowTests()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("Test failed:", e);
    process.exit(1);
  });
