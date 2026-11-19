import { prisma } from "../backend/db/prisma";
import { dispatchNotification } from "../lib/dispatcher";

interface EventTestResult {
  eventType: string;
  success: boolean;
  inAppCount: number;
  deliveryCount: number;
  deliveryStatus: string;
  error?: string;
}

async function runPushE2E() {
  console.log("================================================================================");
  console.log("END-TO-END UNIVERSAL PUSH NOTIFICATION SIMULATION & AUDIT SUITE");
  console.log("================================================================================\n");

  // 1. Identify Target Test User (Explicitly prioritize Anandan T with active subscriptions)
  let targetUser = await prisma.user.findFirst({
    where: {
      name: { contains: "Anandan", mode: "insensitive" },
    },
    select: { id: true, name: true, email: true, role: true },
  });

  if (!targetUser) {
    targetUser = await prisma.user.findFirst({
      where: {
        role: "PARENT",
        status: "ACTIVE",
      },
      select: { id: true, name: true, email: true, role: true },
    });
  }

  if (!targetUser) {
    console.error("No active test user found in database.");
    process.exit(1);
  }

  console.log(`Target Test User: ${targetUser.name} (${targetUser.role}) | ID: ${targetUser.id}`);

  // Check user active push subscriptions
  const activeSubs = await prisma.pushSubscription.count({
    where: { userId: targetUser.id, isActive: true },
  });
  console.log(`Active Push Subscriptions in DB: ${activeSubs}\n`);

  const eventTypesToTest = [
    { type: "MESSAGE", title: "Direct Message", body: "Hello from School Administration. Please check the portal." },
    { type: "REPORT_CARD", title: "Report Card Published", body: "Term 1 official report card and verified marks are now available." },
    { type: "ANNOUNCEMENT", title: "School Circular", body: "Annual sports day scheduled for next Friday. Attendance mandatory." },
    { type: "MEETING", title: "Parent Teacher Meeting", body: "PTM scheduled on Saturday at 10:00 AM in the school auditorium." },
    { type: "BUS_UPDATE", title: "Bus Delay Alert", body: "Bus route 12 is delayed by 15 minutes due to traffic." },
    { type: "ATTENDANCE", title: "Absence Alert", body: "Your child has been marked absent for today's morning session." },
    { type: "HOMEWORK", title: "New Assignment", body: "Mathematics Chapter 5 exercises assigned due on Monday." },
    { type: "LEAVE", title: "Leave Status Updated", body: "Your student leave request for Nov 22 has been reviewed." },
    { type: "EXAM", title: "Exam Schedule Notice", body: "Unit Test II examination timetable is now published." },
  ];

  const results: EventTestResult[] = [];

  for (const ev of eventTypesToTest) {
    process.stdout.write(`Dispatching ${ev.type.padEnd(14)} ... `);
    const timestamp = Date.now();
    const tag = `e2e-${ev.type.toLowerCase()}-${timestamp}`;

    try {
      const res = await dispatchNotification({
        type: ev.type,
        entityId: `e2e-entity-${timestamp}`,
        recipients: [targetUser.id],
        title: `🔔 ${ev.title}`,
        body: ev.body,
        url: "/dashboard",
        priority: ev.type === "BUS_UPDATE" || ev.type === "ATTENDANCE" ? "URGENT" : "HIGH",
        tag,
      });

      // Verify delivery trace in notification_deliveries table
      const deliveryRows = await prisma.notificationDelivery.findMany({
        where: {
          recipientUserId: targetUser.id,
          tag,
        },
      });

      const primaryStatus = deliveryRows[0]?.status || (res.success ? "SENT" : "FAILED");

      results.push({
        eventType: ev.type,
        success: res.success,
        inAppCount: res.inAppCount,
        deliveryCount: deliveryRows.length,
        deliveryStatus: primaryStatus,
      });

      console.log(`[PASS] (In-App: ${res.inAppCount}, Traces: ${deliveryRows.length}, Status: ${primaryStatus})`);
    } catch (err: any) {
      console.log(`[FAIL] Error: ${err.message}`);
      results.push({
        eventType: ev.type,
        success: false,
        inAppCount: 0,
        deliveryCount: 0,
        deliveryStatus: "FAILED",
        error: err.message,
      });
    }
  }

  // Print Summary Table
  console.log("\n================================================================================");
  console.log("EVENT TYPE DISPATCH COVERAGE & DELIVERY TRACE SUMMARY TABLE");
  console.log("================================================================================");
  console.log(
    "Event Type".padEnd(16) +
    "Result".padEnd(10) +
    "In-App".padEnd(10) +
    "Traces".padEnd(10) +
    "Delivery Status"
  );
  console.log("--------------------------------------------------------------------------------");

  let totalPassed = 0;
  for (const r of results) {
    const isPass = r.success && r.inAppCount > 0 && r.deliveryCount > 0;
    if (isPass) totalPassed++;
    console.log(
      r.eventType.padEnd(16) +
      (isPass ? "PASS" : "FAIL").padEnd(10) +
      String(r.inAppCount).padEnd(10) +
      String(r.deliveryCount).padEnd(10) +
      r.deliveryStatus
    );
  }

  console.log("================================================================================");
  console.log(`TOTAL EVENTS TESTED: ${results.length} | PASSED: ${totalPassed} | FAILED: ${results.length - totalPassed}`);
  console.log("================================================================================\n");

  if (totalPassed < results.length) {
    process.exit(1);
  }
}

runPushE2E()
  .catch((e) => {
    console.error("E2E Fatal Error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
