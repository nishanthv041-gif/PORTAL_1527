import { prisma } from "../backend/db/prisma";
import { dispatchPortalNotification } from "../lib/notifications";
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

    // 3. Verify in-app record in database
    console.log("3. Verifying database record fields...");
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

    // 4. Test Endpoint Deduplication
    console.log("4. Testing endpoint deduplication with 1 active and 1 duplicate...");
    const dummyEndpoint = `https://fcm.googleapis.com/fcm/send/test-dedup-${Date.now()}`;
    const dummyP256dh = "BBIHzbc-DVhlpPB_plCE0gUMpCSsHiqA1Y5FVyP-ax6p0HWnFZILFISth4FYfyAp0gywswCBxz4GfDnXm_c-Agk";
    const dummyAuth = "ExZi6lTrD-JWJN9cqk88AA6Y8-vxTYaxwhaY4AUwMFc";

    // Create 1 primary subscription
    const sub = await prisma.pushSubscription.create({
      data: {
        userId: tempUser.id,
        endpoint: dummyEndpoint,
        p256dh: dummyP256dh,
        auth: dummyAuth,
        lastLoginAt: new Date(),
        isActive: true,
      },
    });

    // Create a duplicate record in deviceNotificationsRegistry with the same endpoint
    await prisma.deviceNotificationsRegistry.create({
      data: {
        userId: tempUser.id,
        endpoint: dummyEndpoint,
        p256dh: dummyP256dh,
        auth: dummyAuth,
        deviceId: `dev_${tempUser.id}`,
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

    // Clean up subscriptions
    await prisma.pushSubscription.deleteMany({ where: { userId: tempUser.id } });
    await prisma.deviceNotificationsRegistry.deleteMany({ where: { userId: tempUser.id } });
    await prisma.notification.deleteMany({ where: { userId: tempUser.id } });
  } finally {
    // Clean up isolated test user
    await prisma.user.delete({ where: { id: tempUser.id } });
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
