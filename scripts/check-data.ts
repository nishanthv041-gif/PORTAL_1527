import { prisma } from "../backend/db/prisma";

async function main() {
  const isFix = process.argv.includes("--fix");

  console.log("================================================================================");
  console.log("             SRT SCHOOL PORTAL - DATABASE INTEGRITY CHECK                       ");
  console.log(` Mode: ${isFix ? "🔴 FIX ORPHANS (--fix)" : "🟡 AUDIT ONLY (default)"}`);
  console.log("================================================================================\n");

  let totalIssues = 0;

  // 1. Students without active class or invalid classId
  const allStudents = await prisma.student.findMany({
    include: { class: true },
  });
  const orphanStudents = allStudents.filter((s) => !s.class || !s.class.isActive);
  console.log(`1. Students without an active class: ${orphanStudents.length}`);
  if (orphanStudents.length > 0) {
    totalIssues += orphanStudents.length;
    orphanStudents.forEach((s) => {
      console.log(`   - Student ID: ${s.id} | ${s.firstName} ${s.lastName} (Roll: ${s.rollNumber}) | classId: ${s.classId}`);
    });
  }

  // 2. Parents without any linked student
  const allParents = await prisma.parent.findMany({
    include: {
      user: true,
      children: true,
    },
  });
  const orphanParents = allParents.filter((p) => p.children.length === 0);
  console.log(`\n2. Parents without any linked student: ${orphanParents.length}`);
  if (orphanParents.length > 0) {
    totalIssues += orphanParents.length;
    orphanParents.forEach((p) => {
      console.log(`   - Parent ID: ${p.id} | User: ${p.user?.name} (${p.user?.email})`);
    });
  }

  // 3. ParentStudent links pointing to missing student or parent
  const parentStudents = await prisma.parentStudent.findMany();
  const studentIds = new Set(allStudents.map((s) => s.id));
  const parentIds = new Set(allParents.map((p) => p.id));
  const brokenParentStudents = parentStudents.filter(
    (ps) => !studentIds.has(ps.studentId) || !parentIds.has(ps.parentId)
  );
  console.log(`\n3. Broken ParentStudent links: ${brokenParentStudents.length}`);
  if (brokenParentStudents.length > 0) {
    totalIssues += brokenParentStudents.length;
    brokenParentStudents.forEach((ps) => {
      console.log(`   - Parent: ${ps.parentId} <-> Student: ${ps.studentId}`);
    });
  }

  // 4. BusStudent assignments pointing to missing student or bus
  const allBuses = await prisma.bus.findMany();
  const busIds = new Set(allBuses.map((b) => b.id));
  const busAssignments = await prisma.busStudent.findMany();
  const brokenBusAssignments = busAssignments.filter(
    (ba) => !studentIds.has(ba.studentId) || !busIds.has(ba.busId)
  );
  console.log(`\n4. Broken BusStudent assignments: ${brokenBusAssignments.length}`);
  if (brokenBusAssignments.length > 0) {
    totalIssues += brokenBusAssignments.length;
    brokenBusAssignments.forEach((ba) => {
      console.log(`   - Assignment ID: ${ba.id} | Bus: ${ba.busId} | Student: ${ba.studentId}`);
    });
  }

  // 5. Buses with invalid or missing inChargeStaffId
  const allStaff = await prisma.staff.findMany();
  const staffIds = new Set(allStaff.map((s) => s.id));
  const busesWithInvalidStaff = allBuses.filter(
    (b) => b.inChargeStaffId && !staffIds.has(b.inChargeStaffId)
  );
  console.log(`\n5. Buses with missing inChargeStaff: ${busesWithInvalidStaff.length}`);
  if (busesWithInvalidStaff.length > 0) {
    totalIssues += busesWithInvalidStaff.length;
    busesWithInvalidStaff.forEach((b) => {
      console.log(`   - Bus: ${b.busNumber} (${b.name}) | inChargeStaffId: ${b.inChargeStaffId}`);
    });
  }

  // 6. Notifications for missing users
  const allUsers = await prisma.user.findMany();
  const userIds = new Set(allUsers.map((u) => u.id));
  const allNotifs = await prisma.notification.findMany();
  const orphanNotifs = allNotifs.filter((n) => !userIds.has(n.userId));
  console.log(`\n6. Notifications for missing users: ${orphanNotifs.length}`);
  if (orphanNotifs.length > 0) {
    totalIssues += orphanNotifs.length;
    orphanNotifs.forEach((n) => {
      console.log(`   - Notification ID: ${n.id} | Missing userId: ${n.userId}`);
    });
  }

  // 7. UserSessions for missing users
  const allSessions = await prisma.userSession.findMany();
  const orphanSessions = allSessions.filter((s) => !userIds.has(s.userId));
  console.log(`\n7. UserSessions for missing users: ${orphanSessions.length}`);
  if (orphanSessions.length > 0) {
    totalIssues += orphanSessions.length;
    orphanSessions.forEach((s) => {
      console.log(`   - Session ID: ${s.id} | Missing userId: ${s.userId}`);
    });
  }

  console.log("\n--------------------------------------------------------------------------------");
  console.log(`Summary: Found ${totalIssues} integrity anomaly / orphan record(s).`);
  console.log("--------------------------------------------------------------------------------");

  if (isFix && totalIssues > 0) {
    console.log("🔧 Repairing orphan links...");
    await prisma.$transaction(async (tx) => {
      if (brokenParentStudents.length > 0) {
        await tx.parentStudent.deleteMany({
          where: {
            OR: brokenParentStudents.map((ps) => ({
              parentId: ps.parentId,
              studentId: ps.studentId,
            })),
          },
        });
      }
      if (brokenBusAssignments.length > 0) {
        await tx.busStudent.deleteMany({
          where: { id: { in: brokenBusAssignments.map((b) => b.id) } },
        });
      }
      if (orphanNotifs.length > 0) {
        await tx.notification.deleteMany({
          where: { id: { in: orphanNotifs.map((n) => n.id) } },
        });
      }
      if (orphanSessions.length > 0) {
        await tx.userSession.deleteMany({
          where: { id: { in: orphanSessions.map((s) => s.id) } },
        });
      }
    });
    console.log("✅ Broken join links cleaned up successfully.");
  } else if (!isFix && totalIssues > 0) {
    console.log("ℹ️ Run with --fix to automatically prune broken join links.");
  } else {
    console.log("🎉 Database relations are 100% clean and consistent!");
  }
}

main()
  .catch((e) => {
    console.error("Check failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

