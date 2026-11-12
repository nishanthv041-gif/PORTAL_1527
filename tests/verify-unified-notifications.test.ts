import { prisma } from "../backend/db/prisma";
import { dispatchPortalNotification } from "../lib/notifications";
import { sendInstantPortalNotification } from "../lib/pushDispatcher";
import assert from "assert";

async function runTestSuite() {
  console.log("=== RUNNING UNIFIED PORTAL NOTIFICATIONS & DEDUPLICATION TEST SUITE ===\n");

  // 1. Create a dedicated isolated test user
  console.log("1. Creating isolated test user...");
  const tempUser = await prisma.user.create({
    data: {
      email: `test-notif-${Date.now()}@srtportal.test`,
      name: "Test Notif User",
      role: "PARENT",
      password: "test_password_hash",
      status: "ACTIVE",
    },
  });
  console.log(`✓ Test user created: ${tempUser.name} (${tempUser.id})\n`);

  try {
    // 2. Test in-app notification creation with dispatchPortalNotification
    console.log("2. Testing dispatchPortalNotification in-app record creation...");
    const result = await dispatchPortalNotification({
      userIds: [tempUser.id],
      type: "REPORT_CARD",
      title: "Test Report Card Published",
      message: "Report card for Term 1 has been published.",
      link: "/dashboard/parent/report-cards",
      tag: `test-tag-${Date.now()}`,
      priority: "URGENT",
    });

    assert.strictEqual(result.inAppCount, 1, "Must insert exactly 1 in-app notification record");
    console.log(`✓ In-app notification created successfully (inAppCount: ${result.inAppCount}).\n`);

    // 3. Test sendInstantPortalNotification across key modules
    console.log("3. Testing sendInstantPortalNotification across key modules...");
    const modulesToTest = [
      { category: "ANNOUNCEMENT", title: "School Circular", link: "/dashboard/parent/announcements" },
      { category: "MEETING", title: "PTM Scheduled", link: "/dashboard/parent/meetings" },
      { category: "BUS_MESSAGE", title: "Bus 12 Arrived", link: "/parent/bus" },
      { category: "HOMEWORK", title: "Math Assignment", link: "/dashboard/parent/homework" },
      { category: "ATTENDANCE", title: "Attendance Marked", link: "/dashboard/parent/attendance" },
    ];

    for (const mod of modulesToTest) {
      const instantRes = await sendInstantPortalNotification({
        targetUserIds: [tempUser.id],
        category: mod.category,
        title: mod.title,
        body: `Test body for ${mod.title}`,
        link: mod.link,
        priority: "HIGH",
        bypass48h: true,
      });
      assert(instantRes.success, `Failed to dispatch for ${mod.category}`);
      assert.strictEqual(instantRes.inAppCount, 1, `Must insert in-app record for ${mod.category}`);
    }
    console.log("✓ All module categories successfully created and verified in database.\n");

    // 4. Verify in-app record in database
    console.log("4. Verifying database record fields...");
    const createdRecord = await prisma.notification.findFirst({
      where: {
        userId: tempUser.id,
        title: "Test Report Card Published",
      },
      orderBy: { createdAt: "desc" },
    });

    assert(createdRecord, "Created notification must exist in database");
    assert.strictEqual(createdRecord.type, "REPORT_CARD", "Type must match REPORT_CARD");
    assert.strictEqual(createdRecord.isRead, false, "Must default isRead = false");
    console.log(`✓ Database record verified: ID ${createdRecord.id}, type: ${createdRecord.type}, isRead: ${createdRecord.isRead}.\n`);

    // 5. Setup duplicate test subscription on BOTH PushSubscription and DeviceNotificationsRegistry
    console.log("5. Testing endpoint deduplication with 1 active and 1 duplicate...");
    const sharedEndpoint = `https://fcm.googleapis.com/fcm/send/test-device-${Date.now()}`;
    const p256dh = "BC_valid_mock_p256dh_key_for_testing_purposes_only_here";
    const auth = "mock_auth_secret_key";

    // Insert into PushSubscription
    await prisma.pushSubscription.create({
      data: {
        userId: tempUser.id,
        endpoint: sharedEndpoint,
        p256dh,
        auth,
        isActive: true,
        lastLoginAt: new Date(),
      },
    });

    // Insert identical endpoint into DeviceNotificationsRegistry
    await prisma.deviceNotificationsRegistry.create({
      data: {
        userId: tempUser.id,
        deviceId: `test-device-${Date.now()}`,
        endpoint: sharedEndpoint,
        p256dh,
        auth,
        lastLoginAt: new Date(),
      },
    });

    const dedupDispatch = await dispatchPortalNotification({
      userIds: [tempUser.id],
      type: "MESSAGE",
      title: "Test Message",
      message: "Test message body",
      link: "/messages",
      tag: `chat-${tempUser.id}`,
    });

    // Even though it was present in both tables, deduplication ensures exactly 1 push target!
    assert.strictEqual(dedupDispatch.pushEligible, 1, "Must deduplicate to exactly 1 unique device endpoint");
    console.log(`✓ Deduplication verified: Exactly ${dedupDispatch.pushEligible} unique endpoint targeted across tables.\n`);

  } finally {
    // Clean up all user dependencies before deleting user
    await prisma.pushSubscription.deleteMany({ where: { userId: tempUser.id } }).catch(() => {});
    await prisma.deviceNotificationsRegistry.deleteMany({ where: { userId: tempUser.id } }).catch(() => {});
    await prisma.notificationRecipient.deleteMany({ where: { userId: tempUser.id } }).catch(() => {});
    await prisma.notification.deleteMany({ where: { userId: tempUser.id } }).catch(() => {});
    await prisma.user.delete({ where: { id: tempUser.id } }).catch(() => {});
    console.log("✓ Cleaned up isolated test user.\n");
  }

  console.log("==================================================================");
  console.log("🎉 ALL UNIFIED NOTIFICATION TESTS PASSED 100%!");
  console.log("==================================================================");
}

runTestSuite()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Test failed:", err);
    process.exit(1);
  });
