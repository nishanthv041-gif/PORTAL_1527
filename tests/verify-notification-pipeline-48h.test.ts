import fs from "fs";
import path from "path";

function runTest() {
  console.log("================================================================================");
  console.log("NOTIFICATION PIPELINE, MESSAGE AUTO-POPUP & 48-HOUR DEVICE DELIVERY TEST");
  console.log("================================================================================\n");

  let passed = 0;
  let failed = 0;

  function assert(name: string, condition: boolean, extra?: string) {
    if (condition) {
      console.log(`[PASS] ${name}${extra ? ` - ${extra}` : ""}`);
      passed++;
    } else {
      console.error(`[FAIL] ${name}${extra ? ` - ${extra}` : ""}`);
      failed++;
    }
  }

  // 1. Check NotificationPopupModal.tsx
  const modalPath = path.join(process.cwd(), "frontend/components/notifications/NotificationPopupModal.tsx");
  const modalContent = fs.readFileSync(modalPath, "utf8");
  assert(
    "Message category is NOT excluded from auto-popup",
    !modalContent.includes('filter(n => n.category !== "MESSAGE")') &&
    !modalContent.includes("n.category !== 'MESSAGE'")
  );
  assert(
    "Fast 5s background polling is active",
    modalContent.includes("5000")
  );

  // 2. Check NotificationsPage (app/notifications/page.tsx)
  const notifPagePath = path.join(process.cwd(), "frontend/app/notifications/page.tsx");
  const notifPageContent = fs.readFileSync(notifPagePath, "utf8");
  assert(
    "NotificationsPage uses getUnifiedNotificationsAction",
    notifPageContent.includes("getUnifiedNotificationsAction")
  );

  // 3. Check lib/notify.ts 48-hour device filtering & multi-table sync
  const notifyPath = path.join(process.cwd(), "lib/notify.ts");
  const notifyContent = fs.readFileSync(notifyPath, "utf8");
  assert(
    "notify.ts calculates 48 hours cutoff",
    notifyContent.includes("48 * 60 * 60 * 1000")
  );
  assert(
    "notify.ts checks pwaSubscription table",
    notifyContent.includes("prisma.pwaSubscription.findMany")
  );
  assert(
    "notify.ts checks deviceNotificationsRegistry table",
    notifyContent.includes("prisma.deviceNotificationsRegistry.findMany")
  );

  // 4. Check unifiedNotificationActions default links
  const actionsPath = path.join(process.cwd(), "backend/api/actions/notifications/unifiedNotificationActions.ts");
  const actionsContent = fs.readFileSync(actionsPath, "utf8");
  assert(
    "Default link for MESSAGE points to /messages",
    actionsContent.includes('/dashboard/parent/messages')
  );
  assert(
    "Default link for MEETING points to /meetings",
    actionsContent.includes('/dashboard/parent/meetings')
  );

  // 5. Check admin message action uses sendUniversalNotification
  const adminMsgPath = path.join(process.cwd(), "backend/api/actions/dashboard/admin/messages/[id]/actions.ts");
  const adminMsgContent = fs.readFileSync(adminMsgPath, "utf8");
  assert(
    "adminSendMessage invokes sendUniversalNotification",
    adminMsgContent.includes("sendUniversalNotification")
  );

  console.log("\n================================================================================");
  console.log(`TOTAL PASSED: ${passed} | TOTAL FAILED: ${failed}`);
  console.log("================================================================================");

  if (failed > 0) process.exit(1);
}

runTest();
