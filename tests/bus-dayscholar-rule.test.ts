import assert from "assert";

// Mock Next.js headers/cookies store before any server action imports
const nextHeaders = require("next/headers");
nextHeaders.headers = async () => new Headers();
nextHeaders.cookies = async () => ({ get: () => undefined });

const nextAuth = require("next-auth/next");
const originalGetServerSession = nextAuth.getServerSession;
nextAuth.getServerSession = async () => ({
  user: {
    id: "admin-test-id",
    role: "ADMIN",
    name: "System Admin",
    email: "admin@srt.edu",
  },
});

import { prisma } from "../backend/db/prisma";
import {
  getDayScholarWhere,
  getDayScholarBusStudentWhere,
  isDayScholarStudent,
} from "../backend/lib/transport/dayScholarHelper";
import {
  getTransportOverviewAction,
  assignStudentsToBusAction,
} from "../backend/api/actions/dashboard/admin/transport/actions";
import fs from "fs";
import path from "path";

async function runTests() {
  console.log("================================================================================");
  console.log("     TEST SUITE: BUS MODULE STRICT DAY-SCHOLAR ONLY RULE & DB METRICS           ");
  console.log("================================================================================\n");

  let passed = 0;
  let failed = 0;

  async function test(name: string, fn: () => Promise<void> | void) {
    try {
      await fn();
      console.log(`  ✅ PASS: ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`  ❌ FAIL: ${name}`);
      console.error(`     Error: ${err?.message || err}`);
      failed++;
    }
  }

  await test("1. Helper getDayScholarWhere correctly defines Day-Scholar criteria", () => {
    const where = getDayScholarWhere();
    assert.strictEqual(where.isActive, true);
    assert.deepStrictEqual(where.NOT, { residenceType: "HOSTEL" });
    assert.ok(Array.isArray(where.OR));
  });

  await test("2. Helper isDayScholarStudent validates student objects correctly", () => {
    assert.strictEqual(isDayScholarStudent({ isActive: true, residenceType: "DAYSCHOLAR" }), true);
    assert.strictEqual(isDayScholarStudent({ isActive: true, residenceType: null }), true);
    assert.strictEqual(isDayScholarStudent({ isActive: true, residenceType: "HOSTEL" }), false);
    assert.strictEqual(isDayScholarStudent({ isActive: false, residenceType: "DAYSCHOLAR" }), false);
    assert.strictEqual(isDayScholarStudent(null), false);
  });

  await test("3. Database audit: zero Hostellers assigned to any bus in the database", async () => {
    const invalidAssignments = await prisma.busStudent.findMany({
      where: {
        student: {
          residenceType: "HOSTEL",
        },
      },
      include: {
        student: true,
        bus: true,
      },
    });

    assert.strictEqual(invalidAssignments.length, 0, `Found ${invalidAssignments.length} hosteller bus assignments!`);
  });

  await test("4. Database audit: all assigned bus students are active Day Scholars", async () => {
    const allBusStudents = await prisma.busStudent.findMany({
      include: {
        student: true,
      },
    });

    for (const bs of allBusStudents) {
      assert.strictEqual(isDayScholarStudent(bs.student), true, `Student ${bs.student.firstName} is not an active Day Scholar!`);
      assert.notStrictEqual(bs.student.residenceType, "HOSTEL");
      assert.strictEqual(bs.student.isActive, true);
    }
  });

  await test("5. Server-side action calculates summaryMetrics grounded in real DB counts", async () => {
    const overviewRes = await getTransportOverviewAction();
    assert.strictEqual(overviewRes.success, true);
    assert.ok(overviewRes.data);

    const metrics = overviewRes.data!.summaryMetrics;
    assert.ok(metrics, "summaryMetrics must be present");
    assert.strictEqual(typeof metrics.totalBuses, "number");
    assert.strictEqual(typeof metrics.runningBuses, "number");
    assert.strictEqual(typeof metrics.issuesBuses, "number");
    assert.strictEqual(typeof metrics.totalDayScholars, "number");
    assert.strictEqual(typeof metrics.dayScholarsOnBuses, "number");
    assert.strictEqual(typeof metrics.dayScholarsUnassigned, "number");

    // Real DB assertions for current school portal state
    assert.ok(metrics.totalBuses >= 1, "Must have at least 1 bus");
    assert.ok(metrics.runningBuses >= 1, "Must have at least 1 running bus");
    assert.strictEqual(metrics.totalDayScholars, 1, "Must have 1 total Day Scholar (Karuppusamy S)");
    assert.strictEqual(metrics.dayScholarsOnBuses, 1, "Must have 1 Day Scholar on buses");
    assert.strictEqual(metrics.dayScholarsUnassigned, 0, "Must have 0 unassigned Day Scholars");

    // Bus student count must strictly match assigned day scholars
    const bus1 = overviewRes.data!.buses.find((b: any) => b.busNumber === "BUS-01");
    assert.ok(bus1, "BUS-01 must exist");
    assert.strictEqual(bus1!._count.students, 1, "BUS-01 student count must equal 1");
  });

  await test("6. assignStudentsToBusAction strictly blocks Hosteller students", async () => {
    const hosteller = await prisma.student.findFirst({
      where: { residenceType: "HOSTEL", isActive: true },
    });

    const bus = await prisma.bus.findFirst({
      where: { isActive: true },
    });

    assert.ok(hosteller, "Hosteller student must exist in database");
    assert.ok(bus, "Active bus must exist in database");

    // Attempt to assign hosteller to bus
    const result = await assignStudentsToBusAction(bus!.id, [
      { studentId: hosteller!.id },
    ]);

    assert.ok(result.error, "assignStudentsToBusAction must return an error when assigning a hosteller");
    assert.match(result.error, /Hostel|strictly reserved for active Day Scholars/i);
  });

  await test("7. Source code inspection: no Hostel tabs or badges in AdminBusManagement.tsx", () => {
    const compPath = path.join(
      process.cwd(),
      "frontend",
      "components",
      "transport",
      "AdminBusManagement.tsx"
    );
    const content = fs.readFileSync(compPath, "utf-8");

    // Must not have hostel filter tab or button options
    assert.doesNotMatch(content, /"HOSTEL"\s*as\s*const/);
    assert.doesNotMatch(content, /label\s*===\s*["']Hostellers["']/);
    assert.doesNotMatch(content, />\s*Hostellers\s*</i);
    assert.doesNotMatch(content, />\s*Hosteller\s*</i);
  });

  console.log("\n================================================================================");
  console.log(` RESULTS: ${passed} passed, ${failed} failed`);
  console.log("================================================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test runner encountered an error:", err);
  process.exit(1);
});
