import { prisma } from "../backend/db/prisma";
import fs from "fs";
import path from "path";

// List of strictly protected roll numbers and emails that must NEVER be touched
const PROTECTED_STUDENT_ROLLS = [
  "7376252AD114", // ANUSHKA A
  "7376252AD189", // Iniya K
  "7376252AD208", // Karuppusamy S (real student explicitly guarded)
  "7376251EE172", // RAJESWARI M
  "7376251CS303", // MYSHRI R S
  "7376251CS465", // Vijayasri S
  "7376252AD216", // KIRITHIK M
];

const PROTECTED_USER_EMAILS = [
  "jpranav116@gmail.com",
  "nishanthv041@gmail.com",
  "mounithavenkatesan@gmail.com",
  "deepikaviswanathan2007@gmail.com",
  "kgvivin@gmail.com",
  "rajeswarim.ee25@bitsathy.ac.in",
  "itsiniya.k@gmail.com",
  "karuppusamysaravanan904@gmail.com",
  "vijayasrisugumar33@gmail.com",
  "anushkaa.ad25@bitsathy.ac.in",
  "rsmyshri@gmail.com",
  "mkirithik@gmail.com",
];

async function main() {
  const isConfirm = process.argv.includes("--confirm");

  console.log("================================================================================");
  console.log("             SRT SCHOOL PORTAL - SAFE DEMO DATA CLEANUP SCRIPT                  ");
  console.log(` Mode: ${isConfirm ? "🔴 LIVE EXECUTION (--confirm)" : "🟡 DRY-RUN PREVIEW (default)"}`);
  console.log("================================================================================\n");

  // 1. Identify Demo Students
  const demoStudents = await prisma.student.findMany({
    where: {
      OR: [
        { admissionNo: { in: ["TEST-BUS-S1", "TEST-BUS-S2"] } },
        { rollNumber: { in: ["501", "502"] } },
        { firstName: "Aarav", lastName: "Sharma" },
        { firstName: "Diya", lastName: "Patel" },
      ],
    },
    include: {
      class: true,
      parents: { include: { parent: { include: { user: true } } } },
      busAssignments: true,
      attendances: true,
      marks: true,
      reportCards: true,
    },
  });

  // Strict safety assertion
  for (const s of demoStudents) {
    if (PROTECTED_STUDENT_ROLLS.includes(s.rollNumber)) {
      throw new Error(`CRITICAL SAFETY VIOLATION: Protected real student ${s.firstName} ${s.lastName} (${s.rollNumber}) was matched! Aborting immediately.`);
    }
  }

  const demoStudentIds = demoStudents.map((s) => s.id);

  // 2. Identify Demo Users (Parents and Staff created by test scripts)
  const demoUserEmails = [
    "parent.bus1@test.com",
    "parent.bus2@test.com",
    "staff.transport@srt.edu",
    "staff.other@srt.edu",
  ];

  const demoUsers = await prisma.user.findMany({
    where: { email: { in: demoUserEmails } },
    include: {
      parent: { include: { children: true } },
      staff: { include: { inChargeBuses: true } },
      notifications: true,
      sessions: true,
    },
  });

  for (const u of demoUsers) {
    if (PROTECTED_USER_EMAILS.includes(u.email)) {
      throw new Error(`CRITICAL SAFETY VIOLATION: Protected real user ${u.email} was matched! Aborting immediately.`);
    }
  }

  const demoUserIds = demoUsers.map((u) => u.id);
  const demoParentIds = demoUsers.map((u) => u.parent?.id).filter(Boolean) as string[];
  const demoStaffIds = demoUsers.map((u) => u.staff?.id).filter(Boolean) as string[];

  // 3. Identify Demo Notifications
  const demoNotifications = await prisma.notification.findMany({
    where: {
      OR: [
        { userId: { in: demoUserIds } },
        { content: { contains: "Aarav" } },
        { content: { contains: "TEST-BUS-99" } },
      ],
    },
  });

  const demoNotificationIds = demoNotifications.map((n) => n.id);

  // 4. Identify Parent-Student Relations to remove
  const demoParentStudents = await prisma.parentStudent.findMany({
    where: {
      OR: [
        { studentId: { in: demoStudentIds } },
        { parentId: { in: demoParentIds } },
      ],
    },
  });

  // 5. Identify Bus Assignments for demo students
  const demoBusAssignments = await prisma.busStudent.findMany({
    where: { studentId: { in: demoStudentIds } },
  });

  // 6. Summary of records to clean
  console.log("📋 IDENTIFIED DEMO RECORDS FOR REMOVAL:");
  console.log("--------------------------------------------------------------------------------");
  console.log(`1. Demo Students (${demoStudents.length}):`);
  for (const s of demoStudents) {
    console.log(`   - ID: ${s.id} | ${s.firstName} ${s.lastName} | Roll: ${s.rollNumber} | Adm: ${s.admissionNo} | Class: ${s.class?.name || "N/A"} ${s.class?.section || ""}`);
  }

  console.log(`\n2. Demo Users & Accounts (${demoUsers.length}):`);
  for (const u of demoUsers) {
    console.log(`   - ID: ${u.id} | ${u.name} | Email: ${u.email} | Role: ${u.role}`);
  }

  console.log(`\n3. Demo Parent Profiles (${demoParentIds.length}):`);
  for (const pid of demoParentIds) {
    console.log(`   - Parent ID: ${pid}`);
  }

  console.log(`\n4. Demo Staff Profiles (${demoStaffIds.length}):`);
  for (const sid of demoStaffIds) {
    console.log(`   - Staff ID: ${sid}`);
  }

  console.log(`\n5. Demo Parent-Student Links (${demoParentStudents.length}):`);
  for (const ps of demoParentStudents) {
    console.log(`   - Parent: ${ps.parentId} <-> Student: ${ps.studentId}`);
  }

  console.log(`\n6. Demo Bus Student Assignments (${demoBusAssignments.length}):`);
  for (const ba of demoBusAssignments) {
    console.log(`   - Assignment ID: ${ba.id} | Bus: ${ba.busId} | Student: ${ba.studentId}`);
  }

  console.log(`\n7. Demo Notifications (${demoNotifications.length}):`);
  for (const n of demoNotifications) {
    console.log(`   - ID: ${n.id} | User: ${n.userId} | [${n.category}] ${n.title}`);
  }

  console.log("--------------------------------------------------------------------------------");
  const totalCount =
    demoStudents.length +
    demoUsers.length +
    demoParentIds.length +
    demoStaffIds.length +
    demoParentStudents.length +
    demoBusAssignments.length +
    demoNotifications.length;

  console.log(`Total Records Identified: ${totalCount}\n`);

  // BACKUP CREATION
  const backupDir = path.join(process.cwd(), "backups");
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupFilePath = path.join(backupDir, `demo-data-backup-${timestamp}.json`);

  const backupData = {
    exportedAt: new Date().toISOString(),
    demoStudents,
    demoUsers,
    demoNotifications,
    demoParentStudents,
    demoBusAssignments,
  };

  fs.writeFileSync(backupFilePath, JSON.stringify(backupData, null, 2), "utf8");
  console.log(`💾 Safety Backup created at: ${backupFilePath}`);
  console.log(`   File size: ${(fs.statSync(backupFilePath).size / 1024).toFixed(2)} KB\n`);

  if (!isConfirm) {
    console.log("================================================================================");
    console.log("🟡 DRY-RUN COMPLETE: NO DATA WAS DELETED.");
    console.log("   Review the records above carefully.");
    console.log("   Real students (Karuppusamy S, etc.) and real users are strictly preserved.");
    console.log("   To execute the deletion in a single atomic transaction, provide explicit approval.");
    console.log("   Command to execute when approved: npx tsx scripts/remove-demo-data.ts --confirm");
    console.log("================================================================================");
    return;
  }

  // LIVE EXECUTION IN ONE TRANSACTION
  console.log("🚀 Executing deletion in an atomic transaction...");

  const result = await prisma.$transaction(async (tx) => {
    // 1. Delete notifications
    const deletedNotifs = await tx.notification.deleteMany({
      where: { id: { in: demoNotificationIds } },
    });

    // 2. Delete user sessions
    const deletedSessions = await tx.userSession.deleteMany({
      where: { userId: { in: demoUserIds } },
    });

    // 3. Delete parent student links
    const deletedParentStudents = await tx.parentStudent.deleteMany({
      where: {
        OR: [
          { studentId: { in: demoStudentIds } },
          { parentId: { in: demoParentIds } },
        ],
      },
    });

    // 4. Delete bus assignments
    const deletedBusStudents = await tx.busStudent.deleteMany({
      where: { studentId: { in: demoStudentIds } },
    });

    // 5. Delete students
    const deletedStudents = await tx.student.deleteMany({
      where: { id: { in: demoStudentIds } },
    });

    // 6. Delete parent profiles
    const deletedParents = await tx.parent.deleteMany({
      where: { id: { in: demoParentIds } },
    });

    // 7. Delete staff profiles
    const deletedStaff = await tx.staff.deleteMany({
      where: { id: { in: demoStaffIds } },
    });

    // 8. Delete users
    const deletedUsers = await tx.user.deleteMany({
      where: { id: { in: demoUserIds } },
    });

    return {
      deletedNotifs: deletedNotifs.count,
      deletedSessions: deletedSessions.count,
      deletedParentStudents: deletedParentStudents.count,
      deletedBusStudents: deletedBusStudents.count,
      deletedStudents: deletedStudents.count,
      deletedParents: deletedParents.count,
      deletedStaff: deletedStaff.count,
      deletedUsers: deletedUsers.count,
    };
  });

  console.log("✅ Deletion completed successfully!");
  console.log(`   - Students deleted: ${result.deletedStudents}`);
  console.log(`   - Users deleted: ${result.deletedUsers}`);
  console.log(`   - Parent profiles deleted: ${result.deletedParents}`);
  console.log(`   - Staff profiles deleted: ${result.deletedStaff}`);
  console.log(`   - Parent-Student links deleted: ${result.deletedParentStudents}`);
  console.log(`   - Bus assignments deleted: ${result.deletedBusStudents}`);
  console.log(`   - User sessions deleted: ${result.deletedSessions}`);
  console.log(`   - Notifications deleted: ${result.deletedNotifs}`);
  console.log("================================================================================");
}

main()
  .catch((err) => {
    console.error("❌ Cleanup failed with error:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

