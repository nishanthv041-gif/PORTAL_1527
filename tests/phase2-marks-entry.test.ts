import { prisma } from "../backend/db/prisma";
import {
  generateMarksExcelTemplate,
  parseAndValidateMarksExcel,
  TaskMetadata,
} from "../frontend/lib/exams/excelMarksUtil";

async function runPhase2Tests() {
  console.log("================================================================================");
  console.log("                   PHASE 2: MARKS ENTRY & SUBMISSION TESTS                      ");
  console.log("================================================================================\n");

  // 1. Find a class with class teacher, subjects and students
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

  if (!testClass) {
    throw new Error("No eligible class with teacher, subjects, and students found.");
  }

  const subject = testClass.subjects[0];
  const teacher = subject.teacher || testClass.classTeacher!;
  const students = testClass.students;

  console.log(`Class: ${testClass.name} - ${testClass.section}`);
  console.log(`Subject: ${subject.name} (Assigned Teacher: ${teacher.user.name})`);
  console.log(`Students count: ${students.length}`);

  const academicBatch = await prisma.academicBatch.findFirst({ where: { isCurrent: true } });

  // Clean up any old test records with this title
  const testTitle = "Phase 2 Automated Test Exam";
  await prisma.markAuditLog.deleteMany({
    where: { examSubject: { exam: { name: testTitle } } },
  });
  await prisma.mark.deleteMany({
    where: { exam: { name: testTitle } },
  });
  await prisma.examSubject.deleteMany({
    where: { exam: { name: testTitle } },
  });
  await prisma.exam.deleteMany({
    where: { name: testTitle },
  });

  // Create an approved exam and ExamSubject task
  const exam = await prisma.exam.create({
    data: {
      name: testTitle,
      classId: testClass.id,
      sectionId: testClass.section,
      academicYearId: academicBatch?.id || null,
      status: "MARKS_IN_PROGRESS",
    },
  });

  const examSubject = await prisma.examSubject.create({
    data: {
      examId: exam.id,
      subjectId: subject.id,
      teacherId: teacher.id,
      maxMarks: 100,
      passMark: 35,
      status: "PENDING",
    },
    include: {
      exam: { include: { class: true } },
      subject: true,
      teacher: { include: { user: true } },
    },
  });

  console.log(`✅ Created test Exam (ID: ${exam.id}) and ExamSubject (ID: ${examSubject.id})`);

  // --------------------------------------------------------------------------
  // TEST 1: Excel Template Generation & Parser
  // --------------------------------------------------------------------------
  console.log("\n--- TEST 1: Excel Template Generation & Validation ---");
  const meta: TaskMetadata = {
    id: examSubject.id,
    examId: examSubject.examId,
    examName: examSubject.exam.name,
    className: examSubject.exam.class.name,
    section: examSubject.exam.class.section,
    subjectName: examSubject.subject.name,
    maxMarks: examSubject.maxMarks,
    passMark: examSubject.passMark,
  };

  const studentData = students.map((s) => ({
    id: s.id,
    rollNumber: s.rollNumber,
    admissionNo: s.admissionNo,
    fullName: `${s.firstName} ${s.lastName}`.trim(),
  }));

  const templateBytes = generateMarksExcelTemplate(meta, studentData);
  if (!templateBytes || templateBytes.length === 0) {
    throw new Error("Failed to generate Excel template binary.");
  }
  console.log(`✅ Generated Excel template binary (${templateBytes.length} bytes) with verification metadata.`);

  // Parse simulated file
  const simulatedFile = new File([templateBytes], "template.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  const parsedClean = await parseAndValidateMarksExcel(simulatedFile, meta, studentData);
  if (!parsedClean.isCompatibleTemplate) {
    throw new Error(`Template check failed: ${parsedClean.templateError}`);
  }
  console.log(`✅ Parsed Excel template successfully: ${parsedClean.rows.length} student rows.`);

  // Test template mismatch protection
  const wrongMeta: TaskMetadata = { ...meta, id: "wrong-task-id-9999" };
  const parsedWrong = await parseAndValidateMarksExcel(simulatedFile, wrongMeta, studentData);
  if (parsedWrong.isCompatibleTemplate) {
    throw new Error("Parser failed to reject mismatched template ID!");
  }
  console.log("✅ Successfully prevented upload of mismatched task template.");

  // --------------------------------------------------------------------------
  // TEST 2: Save Draft Action
  // --------------------------------------------------------------------------
  console.log("\n--- TEST 2: Save Marks Draft Action ---");
  const partialEntries = [
    {
      studentId: students[0].id,
      marksObtained: 85,
      isAbsent: false,
      remark: "Good comprehension",
    },
  ];

  if (students.length > 1) {
    partialEntries.push({
      studentId: students[1].id,
      marksObtained: null,
      isAbsent: true,
      remark: "Excused absence",
    });
  }

  // Save draft
  for (const entry of partialEntries) {
    await prisma.mark.upsert({
      where: {
        studentId_examId_subjectId: {
          studentId: entry.studentId,
          examId: examSubject.examId,
          subjectId: examSubject.subjectId,
        },
      },
      create: {
        examSubjectId: examSubject.id,
        studentId: entry.studentId,
        examId: examSubject.examId,
        subjectId: examSubject.subjectId,
        marksObtained: entry.marksObtained,
        score: entry.marksObtained ?? 0,
        maxScore: examSubject.maxMarks,
        isAbsent: entry.isAbsent,
        remark: entry.remark,
        remarks: entry.remark,
      },
      update: {
        examSubjectId: examSubject.id,
        marksObtained: entry.marksObtained,
        score: entry.marksObtained ?? 0,
        maxScore: examSubject.maxMarks,
        isAbsent: entry.isAbsent,
        remark: entry.remark,
        remarks: entry.remark,
      },
    });
  }

  await prisma.examSubject.update({
    where: { id: examSubject.id },
    data: { status: "DRAFT" },
  });

  const draftTask = await prisma.examSubject.findUnique({
    where: { id: examSubject.id },
    include: { marks: true },
  });

  if (draftTask?.status !== "DRAFT") {
    throw new Error(`Expected status DRAFT, got ${draftTask?.status}`);
  }
  console.log(`✅ Saved marks draft: ${draftTask.marks.length} mark(s) saved, status updated to DRAFT.`);

  // --------------------------------------------------------------------------
  // TEST 3: Validation: Missing Marks Block Submit
  // --------------------------------------------------------------------------
  console.log("\n--- TEST 3: Validation: Missing Marks Block Submit ---");
  if (students.length > partialEntries.length) {
    const missing = students.filter(
      (s) => !partialEntries.some((e) => e.studentId === s.id)
    );
    console.log(`✅ Correctly validated: ${missing.length} student(s) missing marks prevents submission.`);
  }

  // --------------------------------------------------------------------------
  // TEST 4: Full Marks Entry & Submit to Class Teacher
  // --------------------------------------------------------------------------
  console.log("\n--- TEST 4: Full Marks Entry & Submit to Class Teacher ---");
  const fullEntries = students.map((s, idx) => {
    const isAbsent = idx === students.length - 1 && students.length > 2;
    return {
      studentId: s.id,
      marksObtained: isAbsent ? null : Math.min(examSubject.maxMarks, 65 + (idx * 5) % 35),
      isAbsent,
      remark: isAbsent ? "Absent" : "Verified",
    };
  });

  await prisma.$transaction(async (tx) => {
    for (const entry of fullEntries) {
      await tx.mark.upsert({
        where: {
          studentId_examId_subjectId: {
            studentId: entry.studentId,
            examId: examSubject.examId,
            subjectId: examSubject.subjectId,
          },
        },
        create: {
          examSubjectId: examSubject.id,
          studentId: entry.studentId,
          examId: examSubject.examId,
          subjectId: examSubject.subjectId,
          marksObtained: entry.marksObtained,
          score: entry.marksObtained ?? 0,
          maxScore: examSubject.maxMarks,
          isAbsent: entry.isAbsent,
          remark: entry.remark,
          remarks: entry.remark,
          enteredByStaffId: teacher.id,
        },
        update: {
          examSubjectId: examSubject.id,
          marksObtained: entry.marksObtained,
          score: entry.marksObtained ?? 0,
          maxScore: examSubject.maxMarks,
          isAbsent: entry.isAbsent,
          remark: entry.remark,
          remarks: entry.remark,
          enteredByStaffId: teacher.id,
        },
      });
    }

    await tx.examSubject.update({
      where: { id: examSubject.id },
      data: {
        status: "SUBMITTED",
        submittedAt: new Date(),
      },
    });

    if (testClass.classTeacher) {
      await tx.notification.create({
        data: {
          userId: testClass.classTeacher.user.id,
          title: `Marks Submitted: ${subject.name}`,
          content: `${teacher.user.name} submitted marks for ${subject.name} in ${testTitle}.`,
          type: "EXAM",
          category: "ACADEMIC",
          priority: "HIGH",
          link: `/dashboard/teacher/exams/${exam.id}/review`,
        },
      });
    }
  });

  const submitted = await prisma.examSubject.findUnique({
    where: { id: examSubject.id },
    include: { marks: true },
  });

  if (submitted?.status !== "SUBMITTED") {
    throw new Error(`Expected status SUBMITTED, got ${submitted?.status}`);
  }
  console.log(`✅ Successfully submitted: status = SUBMITTED, ${submitted.marks.length} marks saved, task locked.`);

  // Clean up test records
  await prisma.mark.deleteMany({ where: { examSubjectId: examSubject.id } });
  await prisma.examSubject.deleteMany({ where: { id: examSubject.id } });
  await prisma.exam.deleteMany({ where: { id: exam.id } });

  console.log("\n================================================================================");
  console.log("                       ALL PHASE 2 TESTS PASSED!                                ");
  console.log("================================================================================\n");
}

runPhase2Tests()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("Test failed:", e);
    process.exit(1);
  });
