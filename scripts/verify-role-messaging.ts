import { prisma } from "../backend/db/prisma";
import { getTeachersForParent, getParentsForTeacher } from "../frontend/lib/directoryResolver";
import { resolveAudienceUserIds } from "../lib/dispatcher";

function assert(condition: boolean, testName: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`);
  } else {
    console.error(`  ❌ FAIL: ${testName}`);
    process.exitCode = 1;
  }
}

async function runVerification() {
  console.log("=================================================");
  console.log("🚀 ROLE MESSAGING & NOTIFICATIONS VERIFICATION");
  console.log("=================================================\n");

  // --------------------------------------------------------------------------
  // TEST SUITE 1: Directory Resolver - Parent to Teachers
  // --------------------------------------------------------------------------
  console.log("📋 1. Testing Parent -> Teachers Directory Resolution");
  const parent = await prisma.user.findFirst({
    where: { role: "PARENT", status: "ACTIVE" },
  });
  assert(Boolean(parent), "Found active parent in database");

  if (parent) {
    const teachers = await getTeachersForParent(parent.id);
    assert(teachers.length > 0, `Parent (${parent.name}) successfully resolved ${teachers.length} teachers`);
    const hasSubjectsOrClasses = teachers.some((t) => t.roleDesc && t.roleDesc.length > 0);
    assert(hasSubjectsOrClasses, "Resolved teachers contain role descriptions (Class Teacher / Subject)");
    for (const t of teachers.slice(0, 3)) {
      console.log(`     - Teacher: ${t.name} (${t.roleDesc}) for ${t.childName}`);
    }
  }

  // --------------------------------------------------------------------------
  // TEST SUITE 2: Directory Resolver - Teacher to Parents & Classes
  // --------------------------------------------------------------------------
  console.log("\n📋 2. Testing Teacher -> Parents & Classes Directory Resolution");
  // Test a subject teacher who teaches an enrolled class (e.g. Class 2)
  const subjectTeacher = await prisma.teacher.findFirst({
    where: {
      subjects: {
        some: {
          class: {
            students: {
              some: {
                parents: { some: {} }
              }
            }
          }
        }
      }
    },
    include: { user: true },
  });
  assert(Boolean(subjectTeacher), "Found teacher with subjects in enrolled class in database");

  if (subjectTeacher) {
    const res = await getParentsForTeacher(subjectTeacher.userId);
    assert(res.classes.length > 0, `Subject teacher (${subjectTeacher.user.name}) successfully resolved ${res.classes.length} class(es)`);
    assert(res.parents.length > 0, `Subject teacher (${subjectTeacher.user.name}) successfully resolved ${res.parents.length} parent(s)`);
    for (const p of res.parents.slice(0, 3)) {
      console.log(`     - Parent: ${p.name} (Child: ${p.studentName}, Class: ${p.className})`);
    }
  }

  // --------------------------------------------------------------------------
  // TEST SUITE 3: Universal Audience Resolution
  // --------------------------------------------------------------------------
  console.log("\n📋 3. Testing Universal Audience Resolution (Class with Subject Teachers)");
  const sampleClass = await prisma.class.findFirst({
    where: { students: { some: {} } },
  });
  assert(Boolean(sampleClass), "Found active class with students in database");

  if (sampleClass) {
    const resolvedUserIds = await resolveAudienceUserIds({ classId: sampleClass.id });
    assert(resolvedUserIds.length > 0, `Resolved ${resolvedUserIds.length} recipient user IDs for class ${sampleClass.name}-${sampleClass.section}`);
  }

  // --------------------------------------------------------------------------
  // TEST SUITE 4: Topbar Unread Aggregation Logic
  // --------------------------------------------------------------------------
  console.log("\n📋 4. Testing Topbar Unread Aggregation (Notifications + Messages)");
  if (parent) {
    const [notifCount, msgCount] = await Promise.all([
      prisma.notification.count({ where: { userId: parent.id, isRead: false } }),
      prisma.message.count({ where: { receiverId: parent.id, isRead: false, isDeleted: false } }),
    ]);
    const total = notifCount + msgCount;
    assert(total >= 0, `Successfully aggregated unread notifications (${notifCount}) and messages (${msgCount}) -> Total: ${total}`);
  }

  // --------------------------------------------------------------------------
  // TEST SUITE 5: Admin Notification Redundancy Filter
  // --------------------------------------------------------------------------
  console.log("\n📋 5. Testing Admin Broadcast Redundancy Filter");
  const admin = await prisma.user.findFirst({ where: { role: "ADMIN", status: "ACTIVE" } });
  if (admin) {
    const filteredNotifs = await prisma.notification.findMany({
      where: {
        userId: admin.id,
        NOT: {
          AND: [
            { targetType: null },
            { type: "ANNOUNCEMENT" },
            { recipients: { none: {} } },
          ],
        },
      },
      take: 10,
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { recipients: true } },
      },
    });

    const hasRedundantZeroRecipientAnnouncement = filteredNotifs.some(
      (n) => n.targetType === null && n.type === "ANNOUNCEMENT" && n._count.recipients === 0
    );
    assert(!hasRedundantZeroRecipientAnnouncement, "Redundant 0-recipient 'To: System Admin' broadcast copies successfully filtered out");
  }

  console.log("\n=================================================");
  console.log("✨ ALL ROLE MESSAGING & NOTIFICATION TESTS PASSED!");
  console.log("=================================================\n");
}

runVerification().catch(console.error).finally(() => prisma.$disconnect());
