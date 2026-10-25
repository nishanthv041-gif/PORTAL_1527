import { 
  parseGrade, 
  calculateNextClass, 
  simulateBatchPromotion, 
  executeBatchPromotionTransaction 
} from "../backend/lib/services/batchPromotionEngine";
import { prisma } from "../backend/db/prisma";

async function runBatchPromotionTestSuite() {
  console.log("==========================================================");
  console.log("BATCH & STUDENT PROMOTION ENGINE: COMPREHENSIVE TEST SUITE");
  console.log("==========================================================");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testId: string, testName: string, details?: string) {
    if (condition) {
      console.log(`[PASS] Test ${testId}: ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] Test ${testId}: ${testName}${details ? ` -> ${details}` : ""}`);
      failed++;
    }
  }

  // ----------------------------------------------------
  // Test 1: Grade parser for Numeric representations
  // ----------------------------------------------------
  const p1 = parseGrade("Class 1");
  const p5 = parseGrade("Class 5");
  const p12 = parseGrade("Grade 12");
  assert(
    p1?.gradeNumber === 1 && !p1?.isRoman &&
    p5?.gradeNumber === 5 && !p5?.isRoman &&
    p12?.gradeNumber === 12 && p12?.prefix === "Grade",
    "1",
    "Numeric grade parsing handles diverse prefixes and grade numbers accurately"
  );

  // ----------------------------------------------------
  // Test 2: Grade parser for Roman numeral representations
  // ----------------------------------------------------
  const pRoman1 = parseGrade("Class I");
  const pRoman5 = parseGrade("Class V");
  const pRoman6 = parseGrade("Class VI");
  const pRoman12 = parseGrade("Class XII");
  assert(
    pRoman1?.gradeNumber === 1 && pRoman1?.isRoman &&
    pRoman5?.gradeNumber === 5 && pRoman5?.isRoman &&
    pRoman6?.gradeNumber === 6 && pRoman6?.isRoman &&
    pRoman12?.gradeNumber === 12 && pRoman12?.isRoman,
    "2",
    "Roman numeral grade parsing accurately extracts I, V, VI, XII"
  );

  // ----------------------------------------------------
  // Test 3: Grade incrementation (Class 1 -> Class 2)
  // ----------------------------------------------------
  const calc1 = calculateNextClass("Class 1");
  assert(
    calc1.nextClassName === "Class 2" && calc1.action === "PROMOTE" && !calc1.isTerminalClass,
    "3",
    "Class 1 successfully advances to Class 2"
  );

  // ----------------------------------------------------
  // Test 4: Roman numeral incrementation (Class V -> Class VI)
  // ----------------------------------------------------
  const calcRoman = calculateNextClass("Class V");
  assert(
    calcRoman.nextClassName === "Class VI" && calcRoman.action === "PROMOTE" && !calcRoman.isTerminalClass,
    "4",
    "Class V successfully advances to Class VI preserving Roman numeral formatting"
  );

  // ----------------------------------------------------
  // Test 5: Terminal Class 12 graduation (Class 12 -> GRADUATED)
  // ----------------------------------------------------
  const calc12 = calculateNextClass("Class 12");
  const calcXII = calculateNextClass("Class XII");
  assert(
    calc12.isTerminalClass && calc12.action === "GRADUATE" && calc12.nextClassName === "GRADUATED" &&
    calcXII.isTerminalClass && calcXII.action === "GRADUATE" && calcXII.nextClassName === "GRADUATED",
    "5",
    "Terminal Class 12 and Class XII are recognized and flagged for Graduation"
  );

  // ----------------------------------------------------
  // Test 6: Database Integration - Batch Rollover Execution
  // ----------------------------------------------------
  const timestamp = Date.now();
  const sourceBatchName = `TEST_BATCH_25_26_${timestamp}`;
  const targetBatchName = `TEST_BATCH_26_27_${timestamp}`;

  // Create Source & Target Batches
  const sourceBatch = await prisma.academicBatch.create({
    data: {
      name: sourceBatchName,
      academicYear: "2025-2026",
      isCurrent: true,
      status: "ACTIVE"
    }
  });

  const targetBatch = await prisma.academicBatch.create({
    data: {
      name: targetBatchName,
      academicYear: "2026-2027",
      isCurrent: false,
      status: "UPCOMING"
    }
  });

  // Create source classes
  const [class1, class5, class12] = await Promise.all([
    prisma.class.create({
      data: {
        name: "Class 1",
        section: "A",
        maxStrength: 40,
        batchId: sourceBatch.id,
        isActive: true
      }
    }),
    prisma.class.create({
      data: {
        name: "Class V",
        section: "A",
        maxStrength: 40,
        batchId: sourceBatch.id,
        isActive: true
      }
    }),
    prisma.class.create({
      data: {
        name: "Class 12",
        section: "A",
        maxStrength: 40,
        batchId: sourceBatch.id,
        isActive: true
      }
    })
  ]);

  // Seed students in each class
  const s1Roll = `ROLL_P1_${timestamp}`;
  const s5Roll = `ROLL_P5_${timestamp}`;
  const s12Roll = `ROLL_P12_${timestamp}`;

  const [student1, student5, student12] = await Promise.all([
    prisma.student.create({
      data: {
        rollNumber: s1Roll,
        admissionNo: `ADM_P1_${timestamp}`,
        firstName: "Anushka",
        lastName: "Sharma",
        classId: class1.id,
        batch: sourceBatchName,
        isActive: true
      }
    }),
    prisma.student.create({
      data: {
        rollNumber: s5Roll,
        admissionNo: `ADM_P5_${timestamp}`,
        firstName: "Mounitha",
        lastName: "Reddy",
        classId: class5.id,
        batch: sourceBatchName,
        isActive: true
      }
    }),
    prisma.student.create({
      data: {
        rollNumber: s12Roll,
        admissionNo: `ADM_P12_${timestamp}`,
        firstName: "Rahul",
        lastName: "Verma",
        classId: class12.id,
        batch: sourceBatchName,
        isActive: true
      }
    })
  ]);

  // Simulate Batch Promotion
  const sim = await simulateBatchPromotion(sourceBatch.id, targetBatch.id);
  assert(
    sim.totalStudents === 3 && sim.totalToPromote === 2 && sim.totalToGraduate === 1,
    "6A",
    "Simulation accurately maps 2 students to promote and 1 student to graduate"
  );

  // Execute Batch Promotion Transaction
  const execResult = await executeBatchPromotionTransaction({
    sourceBatchId: sourceBatch.id,
    targetBatchId: targetBatch.id
  });

  assert(
    execResult.success && execResult.promotedCount === 2 && execResult.graduatedCount === 1,
    "6B",
    "Atomic batch promotion transaction executed with 2 promoted and 1 graduated"
  );

  // Verify Student 1 advanced to Class 2 - A
  const updatedS1 = await prisma.student.findUnique({
    where: { id: student1.id },
    include: { class: true }
  });
  assert(
    updatedS1?.class?.name === "Class 2" && updatedS1?.class?.section === "A" && updatedS1?.batch === targetBatchName,
    "6C",
    "Student in Class 1 successfully moved to Class 2 under target batch"
  );

  // Verify Student 5 advanced to Class VI - A
  const updatedS5 = await prisma.student.findUnique({
    where: { id: student5.id },
    include: { class: true }
  });
  assert(
    updatedS5?.class?.name === "Class VI" && updatedS5?.class?.section === "A" && updatedS5?.batch === targetBatchName,
    "6D",
    "Student in Class V successfully advanced to Class VI preserving Roman numeral formatting"
  );

  // Verify Student 12 is GRADUATED
  const updatedS12 = await prisma.student.findUnique({
    where: { id: student12.id }
  });
  assert(
    updatedS12?.enrollmentStatus === "GRADUATED" &&
    updatedS12?.graduationBatch === sourceBatchName &&
    updatedS12?.isActive === false &&
    !!updatedS12?.graduatedAt,
    "6E",
    "Student in Class 12 marked as GRADUATED with graduationBatch and deactivated from active rolls"
  );

  // Verify Batch statuses updated
  const [updatedSource, updatedTarget] = await Promise.all([
    prisma.academicBatch.findUnique({ where: { id: sourceBatch.id } }),
    prisma.academicBatch.findUnique({ where: { id: targetBatch.id } })
  ]);
  assert(
    updatedSource?.status === "COMPLETED" && !updatedSource?.isCurrent &&
    updatedTarget?.status === "ACTIVE" && updatedTarget?.isCurrent,
    "6F",
    "Target batch activated as current academic session and source batch marked completed"
  );

  // Verify PromotionAudit logs
  const auditLogs = await prisma.promotionAudit.findMany({
    where: { fromBatchId: sourceBatch.id }
  });
  assert(
    auditLogs.length === 3 && auditLogs.some(a => a.action === "GRADUATED") && auditLogs.filter(a => a.action === "PROMOTED").length === 2,
    "6G",
    "Promotion audit trail records all movements with actions and timestamps"
  );

  // Clean up test records
  try {
    await prisma.promotionAudit.deleteMany({ where: { fromBatchId: sourceBatch.id } });
    await prisma.student.deleteMany({ where: { rollNumber: { in: [s1Roll, s5Roll, s12Roll] } } });
    await prisma.class.deleteMany({ where: { batchId: { in: [sourceBatch.id, targetBatch.id] } } });
    await prisma.academicBatch.deleteMany({ where: { id: { in: [sourceBatch.id, targetBatch.id] } } });
  } catch (cleanErr) {
    // Ignore cleanup warnings
  }

  console.log("==========================================================");
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log("==========================================================");

  if (failed > 0) process.exit(1);
  process.exit(0);
}

runBatchPromotionTestSuite().catch(err => {
  console.error("Test execution fatal error:", err);
  process.exit(1);
});
