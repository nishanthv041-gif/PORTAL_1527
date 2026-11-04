import { executeImportTransaction } from "../backend/lib/services/excelImportEngine";
import { prisma } from "../backend/db/prisma";

async function runPerformanceBenchmark() {
  console.log("=== STARTING IMPORT PERFORMANCE BENCHMARK ===");

  // Prepare 6 test teacher rows
  const testRows = [
    {
      excelRowNumber: 101,
      firstName: "PerfTest1",
      lastName: "Teacher",
      email: "perftest1@school.internal",
      googleEmail: "perftest1@school.internal",
      password: "TestPassword@123",
      phone: "9999900001",
      qualification: "M.Sc B.Ed",
      classTeacherRaw: "Class 1 - Section A",
      subjects: "Mathematics, Science"
    },
    {
      excelRowNumber: 102,
      firstName: "PerfTest2",
      lastName: "Teacher",
      email: "perftest2@school.internal",
      googleEmail: "perftest2@school.internal",
      password: "TestPassword@123",
      phone: "9999900002",
      qualification: "M.A B.Ed",
      classTeacherRaw: "Class 2 - Section A",
      subjects: "English, Social Science"
    },
    {
      excelRowNumber: 103,
      firstName: "PerfTest3",
      lastName: "Teacher",
      email: "perftest3@school.internal",
      googleEmail: "perftest3@school.internal",
      password: "TestPassword@123",
      phone: "9999900003",
      qualification: "M.Com B.Ed",
      classTeacherRaw: "Class 3 - Section A",
      subjects: "Tamil, Mathematics"
    },
    {
      excelRowNumber: 104,
      firstName: "PerfTest4",
      lastName: "Teacher",
      email: "perftest4@school.internal",
      googleEmail: "perftest4@school.internal",
      password: "TestPassword@123",
      phone: "9999900004",
      qualification: "M.Sc M.Phil",
      classTeacherRaw: "Class 4 - Section A",
      subjects: "Science, Computer Science"
    },
    {
      excelRowNumber: 105,
      firstName: "PerfTest5",
      lastName: "Teacher",
      email: "perftest5@school.internal",
      googleEmail: "perftest5@school.internal",
      password: "TestPassword@123",
      phone: "9999900005",
      qualification: "M.A M.Ed",
      classTeacherRaw: "Class 5 - Section A",
      subjects: "Social Science, English"
    },
    {
      excelRowNumber: 106,
      firstName: "PerfTest6",
      lastName: "Teacher",
      email: "perftest6@school.internal",
      googleEmail: "perftest6@school.internal",
      password: "TestPassword@123",
      phone: "9999900006",
      qualification: "B.Ed",
      classTeacherRaw: "Class 6 - Section A",
      subjects: "Tamil, English"
    }
  ];

  const startTime = Date.now();
  const commitResult = await executeImportTransaction(
    "TEACHER",
    testRows,
    { id: "perf-admin", email: "admin@nipoportal.internal" },
    "benchmark.xlsx",
    1024
  );
  const durationMs = Date.now() - startTime;

  console.log(`✓ Imported ${commitResult.importedCount} teachers in ${durationMs}ms`);
  console.log(`✓ Average time per teacher: ${(durationMs / testRows.length).toFixed(1)}ms`);
  console.log(`✓ Projected time for 32 teachers: ${((durationMs / testRows.length) * 32 / 1000).toFixed(2)}s`);
  console.log(`✓ Errors: ${commitResult.errors.length}`);

  // Cleanup benchmark test users
  const testEmails = testRows.map(r => r.email);
  const users = await prisma.user.findMany({
    where: { email: { in: testEmails } },
    select: { id: true }
  });
  const userIds = users.map(u => u.id);
  await prisma.teacher.deleteMany({
    where: { userId: { in: userIds } }
  });
  await prisma.user.deleteMany({
    where: { id: { in: userIds } }
  });
  if (commitResult.batchId) {
    await prisma.importBatch.delete({
      where: { id: commitResult.batchId }
    }).catch(() => {});
  }

  console.log("✓ Cleanup finished successfully");

  if (commitResult.importedCount !== testRows.length) {
    throw new Error(`Expected ${testRows.length} imported, got ${commitResult.importedCount}`);
  }
}

runPerformanceBenchmark()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
