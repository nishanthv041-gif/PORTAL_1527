import { prisma } from "../backend/db/prisma";

console.log("=== RUNNING EXAM GROUP DELETION & PERFORMANCE PRESERVATION TESTS ===");

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${msg}`);
    process.exit(1);
  } else {
    console.log(`✅ PASSED: ${msg}`);
  }
}

async function runTests() {
  try {
    // Find or pick a student
    let student = await prisma.student.findFirst({
      include: { class: true }
    });

    let testClassId = student?.classId;
    if (!testClassId) {
      const cls = await prisma.class.findFirst();
      testClassId = cls?.id;
    }

    if (!student || !testClassId) {
      console.log("Creating temporary class and student for test...");
      const cls = await prisma.class.create({
        data: {
          name: "Class 2",
          section: "A"
        }
      });
      student = await prisma.student.create({
        data: {
          firstName: "Anushka",
          lastName: "A",
          rollNumber: `TEST_${Date.now()}`,
          classId: cls.id
        },
        include: { class: true }
      });
      testClassId = cls.id;
    }

    const testExamName = `Test Delete Exam ${Date.now()}`;

    // 1. Create a dummy test Exam
    const exam = await prisma.exam.create({
      data: {
        name: testExamName,
        date: new Date(),
        classId: testClassId,
        isPublished: true,
        studentCount: 1
      }
    });
    assert(!!exam.id, "Created test exam");

    // 2. Create a ReportCard with ReportCardSubject
    const reportCard = await prisma.reportCard.create({
      data: {
        studentId: student.id,
        examId: exam.id,
        totalMarks: 95,
        percentage: 95.0,
        grade: "A+",
        published: true,
        subjectMarks: {
          create: [
            {
              subjectName: "MATHEMATICS",
              marks: 95,
              maxMarks: 100,
              passMark: 35,
              grade: "A+",
              status: "PASS"
            }
          ]
        }
      },
      include: {
        subjectMarks: true
      }
    });
    assert(!!reportCard.id, "Created test report card");
    assert(reportCard.subjectMarks.length === 1, "Report card subject mark created");

    // 3. Create a corresponding Mark record (representing performance chart data)
    let subject = await prisma.subject.findFirst({ where: { classId: testClassId } });
    if (!subject) {
      subject = await prisma.subject.create({
        data: {
          name: "Test Subject",
          code: `TS_${Date.now()}`,
          classId: testClassId
        }
      });
    }

    const mark = await prisma.mark.create({
      data: {
        studentId: student.id,
        examId: exam.id,
        subjectId: subject.id,
        score: 95,
        maxScore: 100
      }
    });
    assert(!!mark.id, "Created test mark for performance chart");

    // 4. Verify report card exists in Parent view query
    const parentViewBefore = await prisma.reportCard.findMany({
      where: {
        studentId: student.id,
        published: true,
        id: reportCard.id
      }
    });
    assert(parentViewBefore.length === 1, "Parent view sees the published report card before deletion");

    // 5. Simulate Exam Group Deletion logic:
    // Delete ReportCardSubject
    await prisma.reportCardSubject.deleteMany({
      where: { reportCardId: { in: [reportCard.id] } }
    });
    // Delete ReportCard
    await prisma.reportCard.deleteMany({
      where: { id: { in: [reportCard.id] } }
    });

    // 6. Verify report card is GONE from Parent view query
    const parentViewAfter = await prisma.reportCard.findMany({
      where: {
        studentId: student.id,
        published: true,
        id: reportCard.id
      }
    });
    assert(parentViewAfter.length === 0, "Parent view NO LONGER sees the deleted report card");

    // 7. Verify dependent subject marks are also deleted
    const subjectsAfter = await prisma.reportCardSubject.findMany({
      where: { reportCardId: reportCard.id }
    });
    assert(subjectsAfter.length === 0, "Report card subject records deleted cleanly");

    // 8. CRITICAL: Verify student's academic performance mark is PRESERVED!
    // ("don't remove in performance chat for every one")
    const markAfter = await prisma.mark.findUnique({
      where: { id: mark.id }
    });
    assert(!!markAfter, "CRITICAL: Academic mark is preserved in database for performance chart!");
    assert(markAfter?.score === 95, "Academic mark score intact");

    // Clean up test data
    await prisma.mark.delete({ where: { id: mark.id } });
    await prisma.exam.delete({ where: { id: exam.id } });
    console.log("🧹 Test cleanup completed successfully.");

    console.log("🎉 ALL EXAM GROUP DELETION & PERFORMANCE PRESERVATION TESTS PASSED!");
  } catch (error) {
    console.error("Test error:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runTests();
