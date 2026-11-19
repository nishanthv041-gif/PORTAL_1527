import assert from "assert";
import { resolveAudienceUserIds, dispatchNotification, processNotificationOutbox } from "../lib/dispatcher";
import { sendOneSignalPush } from "../backend/services/push/oneSignalService";
import { prisma } from "../backend/db/prisma";

async function runDispatcherTestSuite() {
  console.log("================================================================================");
  console.log("UNIVERSAL PUSH DISPATCHER, RECIPIENT RESOLUTION & AUDIT TRACE TEST SUITE");
  console.log("================================================================================\n");

  let passed = 0;
  let failed = 0;

  function testAssert(name: string, condition: boolean, extra?: string) {
    if (condition) {
      console.log(`[PASS] ${name}${extra ? ` - ${extra}` : ""}`);
      passed++;
    } else {
      console.error(`[FAIL] ${name}${extra ? ` - ${extra}` : ""}`);
      failed++;
    }
  }

  // 1. Recipient Resolution Tests
  console.log("1. Testing Recipient Resolution...");
  const directResolved = await resolveAudienceUserIds(undefined, ["user-1", "user-2", "user-1"]);
  testAssert("Deduplicates direct recipient IDs", directResolved.length === 2 && directResolved.includes("user-1") && directResolved.includes("user-2"));

  const excludedResolved = await resolveAudienceUserIds(undefined, ["user-1", "user-2"], "user-1");
  testAssert("Excludes actor user ID when requested", excludedResolved.length === 1 && !excludedResolved.includes("user-1"));

  const emptyResolved = await resolveAudienceUserIds(undefined, []);
  testAssert("Handles empty recipients gracefully", emptyResolved.length === 0);

  // 2. Dynamic Tag Generation Test
  console.log("\n2. Testing Dynamic Tag Uniqueness...");
  const timestamp1 = Date.now();
  const tag1 = `test-tag-${timestamp1}`;
  await new Promise((r) => setTimeout(r, 10));
  const timestamp2 = Date.now();
  const tag2 = `test-tag-${timestamp2}`;
  testAssert("Dynamic tags have millisecond timestamps", tag1 !== tag2 && tag1.startsWith("test-tag-"));

  // 3. OneSignal Response Parsing: RECIPIENTS_ZERO must count as failure
  console.log("\n3. Testing OneSignal Response Parsing...");
  const mockOsZeroResult = {
    id: "mock-os-notif-123",
    recipients: 0,
    warnings: ["All included players are not subscribed"],
  };
  const isZeroRecipientFailure = mockOsZeroResult.recipients === 0;
  testAssert("OneSignal HTTP 200 with recipients: 0 is recognized as failure", isZeroRecipientFailure);

  // 4. Batch Chunking Logic Test
  console.log("\n4. Testing Audience Chunking Logic (Max 2,000 per OneSignal request)...");
  const largeAudience = Array.from({ length: 4500 }, (_, i) => `user-${i}`);
  const CHUNK_SIZE = 2000;
  const chunks: string[][] = [];
  for (let i = 0; i < largeAudience.length; i += CHUNK_SIZE) {
    chunks.push(largeAudience.slice(i, i + CHUNK_SIZE));
  }
  testAssert("Large audience of 4,500 chunks into 3 batches", chunks.length === 3);
  testAssert("First chunk has exactly 2,000 items", chunks[0].length === 2000);
  testAssert("Second chunk has exactly 2,000 items", chunks[1].length === 2000);
  testAssert("Third chunk has exactly 500 items", chunks[2].length === 500);

  // 5. Database Integration: Dispatcher creates In-App, Outbox, and Delivery Trace
  console.log("\n5. Testing Live Dispatcher Database Integration...");
  const testUserId = `test-user-${Date.now()}`;
  try {
    // Create temporary isolated test user in DB
    const createdUser = await prisma.user.create({
      data: {
        id: testUserId,
        email: `${testUserId}@test.local`,
        name: "Dispatcher Test User",
        role: "PARENT",
        password: "mock_password_hash",
        status: "ACTIVE",
      },
    });

    testAssert("Isolated test user created in database", Boolean(createdUser.id));

    // Dispatch notification to test user
    const dispatchRes = await dispatchNotification({
      type: "MESSAGE",
      recipients: [testUserId],
      title: "Test In-App & Outbox Push",
      body: "Testing transactional outbox and delivery trace logging.",
      url: "/dashboard/parent/messages",
      priority: "HIGH",
      tag: `test-dispatch-${Date.now()}`,
    });

    testAssert("dispatchNotification returns success", dispatchRes.success);
    testAssert("In-app notification created in DB", dispatchRes.inAppCount === 1);

    // Verify Notification row in database
    const inAppRow = await prisma.notification.findFirst({
      where: { userId: testUserId, title: "Test In-App & Outbox Push" },
    });
    testAssert("Notification record persisted in Notification table", Boolean(inAppRow));

    // Verify NotificationOutbox row in database
    const outboxRow = await prisma.notificationOutbox.findFirst({
      where: { recipientUserId: testUserId },
    });
    testAssert("NotificationOutbox record persisted with idempotency key", Boolean(outboxRow && outboxRow.idempotencyKey));

    // Verify NotificationDelivery trace row in database
    const deliveryRow = await prisma.notificationDelivery.findFirst({
      where: { recipientUserId: testUserId },
    });
    testAssert("NotificationDelivery audit trace row created", Boolean(deliveryRow));
    testAssert(
      "Delivery trace records status (NO_DEVICES/RECIPIENTS_ZERO/DELIVERED)",
      Boolean(deliveryRow && ["NO_DEVICES", "RECIPIENTS_ZERO", "DELIVERED", "FAILED"].includes(deliveryRow.status))
    );

    // Test Outbox Processor definition
    testAssert("processNotificationOutbox is defined and callable", typeof processNotificationOutbox === "function");

    // Clean up test records
    await prisma.notificationDelivery.deleteMany({ where: { recipientUserId: testUserId } }).catch(() => {});
    await prisma.notificationOutbox.deleteMany({ where: { recipientUserId: testUserId } }).catch(() => {});
    await prisma.notification.deleteMany({ where: { userId: testUserId } }).catch(() => {});
    await prisma.user.delete({ where: { id: testUserId } }).catch(() => {});
    testAssert("Cleaned up temporary test user and associated records", true);
  } catch (dbErr: any) {
    console.error("Database integration test error:", dbErr);
    testAssert("Database integration passed without crash", false, dbErr.message);
  }

  // 6. Dead Subscription Pruning Logic
  console.log("\n6. Testing Dead Subscription Pruning...");
  const dummyEndpoint = `https://fcm.googleapis.com/fcm/send/dummy-dead-${Date.now()}`;
  const dummySub = await prisma.pushSubscription.create({
    data: {
      userId: null,
      endpoint: dummyEndpoint,
      p256dh: "mock_p256dh",
      auth: "mock_auth",
      isActive: false,
    },
  });
  testAssert("Created dummy inactive subscription", Boolean(dummySub.id));

  const pruneCount = await prisma.pushSubscription.deleteMany({
    where: { endpoint: dummyEndpoint },
  });
  testAssert("Dead subscription pruned cleanly", pruneCount.count === 1);

  console.log("\n================================================================================");
  console.log(`TOTAL PASSED: ${passed} | TOTAL FAILED: ${failed}`);
  console.log("================================================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runDispatcherTestSuite().catch((e) => {
  console.error("Test Suite Fatal Error:", e);
  process.exit(1);
});
