import fs from "fs";
import path from "path";

function runTest() {
  console.log("================================================================================");
  console.log("UNIVERSAL PUSH NOTIFICATIONS, DELIVERY TRACE & AMPLIFY RUNTIME TEST SUITE");
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

  // 1. Verify amplify.yml exports all push variables to .env.production
  const amplifyPath = path.join(process.cwd(), "amplify.yml");
  const amplifyContent = fs.readFileSync(amplifyPath, "utf8");
  assert("amplify.yml passes ONESIGNAL_REST_API_KEY to runtime", amplifyContent.includes("ONESIGNAL_REST_API_KEY"));
  assert("amplify.yml passes ONESIGNAL_APP_ID to runtime", amplifyContent.includes("ONESIGNAL_APP_ID"));
  assert("amplify.yml passes VAPID_PRIVATE_KEY to runtime", amplifyContent.includes("VAPID_PRIVATE_KEY"));
  assert("amplify.yml passes VAPID_PUBLIC_KEY to runtime", amplifyContent.includes("VAPID_PUBLIC_KEY"));
  assert("amplify.yml passes FIREBASE_SERVICE_ACCOUNT to runtime", amplifyContent.includes("FIREBASE_SERVICE_ACCOUNT"));

  // 2. Verify schema.prisma contains NotificationDelivery model
  const schemaPath = path.join(process.cwd(), "prisma/schema.prisma");
  const schemaContent = fs.readFileSync(schemaPath, "utf8");
  assert("schema.prisma contains NotificationDelivery model", schemaContent.includes("model NotificationDelivery"));
  assert("schema.prisma maps to notification_deliveries table", schemaContent.includes('@@map("notification_deliveries")'));
  assert("schema.prisma includes eventType and channel", schemaContent.includes("eventType") && schemaContent.includes("channel"));

  // 3. Verify Diagnostics API route
  const diagPath = path.join(process.cwd(), "app/api/push/diagnostics/route.ts");
  assert("app/api/push/diagnostics/route.ts exists", fs.existsSync(diagPath));
  const diagContent = fs.readFileSync(diagPath, "utf8");
  assert("Diagnostics route requires ADMIN or CRON auth", diagContent.includes('session.user.role !== "ADMIN"'));
  assert("Diagnostics route checks runtime environment variables", diagContent.includes("runtimeEnvironment"));
  assert("Diagnostics route queries notification_deliveries table", diagContent.includes("notificationDelivery.findMany"));

  // 4. Verify lib/dispatcher.ts 24-hour TTL and delivery trace
  const dispatcherPath = path.join(process.cwd(), "lib/dispatcher.ts");
  const dispatcherContent = fs.readFileSync(dispatcherPath, "utf8");
  assert("dispatcher.ts sets TTL: 86400 (24 hours)", dispatcherContent.includes("86400"));
  assert("dispatcher.ts writes to notificationDelivery table", dispatcherContent.includes("prisma.notificationDelivery.createMany"));
  assert("dispatcher.ts validates OneSignal RECIPIENTS_ZERO", dispatcherContent.includes("RECIPIENTS_ZERO"));

  // 5. Verify notify.ts and pushDispatcher.ts delegate to unified dispatcher
  const notifyPath = path.join(process.cwd(), "lib/notify.ts");
  const notifyContent = fs.readFileSync(notifyPath, "utf8");
  assert("notify.ts delegates to dispatchNotification", notifyContent.includes("dispatchNotification"));
  const pushDispatcherPath = path.join(process.cwd(), "lib/pushDispatcher.ts");
  const pushDispatcherContent = fs.readFileSync(pushDispatcherPath, "utf8");
  assert("pushDispatcher.ts delegates to dispatchNotification", pushDispatcherContent.includes("dispatchNotification"));

  // 6. Verify Service Worker Unification in client components
  const pwaRegPath = path.join(process.cwd(), "frontend/components/pwa/PwaRegistration.tsx");
  const pwaRegContent = fs.readFileSync(pwaRegPath, "utf8");
  assert("PwaRegistration registers /OneSignalSDKWorker.js", pwaRegContent.includes("/OneSignalSDKWorker.js"));

  const welcomePath = path.join(process.cwd(), "frontend/components/pwa/PwaWelcomeNotificationPrompt.tsx");
  const welcomeContent = fs.readFileSync(welcomePath, "utf8");
  assert("PwaWelcomePrompt registers /OneSignalSDKWorker.js", welcomeContent.includes("/OneSignalSDKWorker.js"));

  // 7. Verify OneSignal clean logout in navigation components
  const sidebarPath = path.join(process.cwd(), "frontend/components/Sidebar.tsx");
  const sidebarContent = fs.readFileSync(sidebarPath, "utf8");
  assert("Sidebar calls logoutFromOneSignal on sign out", sidebarContent.includes("logoutFromOneSignal"));

  const parentNavPath = path.join(process.cwd(), "frontend/components/Layout/ParentBottomNav.tsx");
  const parentNavContent = fs.readFileSync(parentNavPath, "utf8");
  assert("ParentBottomNav calls logoutFromOneSignal on sign out", parentNavContent.includes("logoutFromOneSignal"));

  const teacherNavPath = path.join(process.cwd(), "frontend/components/Layout/TeacherBottomNav.tsx");
  const teacherNavContent = fs.readFileSync(teacherNavPath, "utf8");
  assert("TeacherBottomNav calls logoutFromOneSignal on sign out", teacherNavContent.includes("logoutFromOneSignal"));

  // 8. Verify Admin Attendance push dispatch on absence
  const adminAttPath = path.join(process.cwd(), "backend/api/actions/dashboard/admin/attendance/actions.ts");
  const adminAttContent = fs.readFileSync(adminAttPath, "utf8");
  assert("Admin attendance dispatches push for absent students", adminAttContent.includes("sendInstantPortalNotification"));
  assert("Admin attendance uses URGENT priority for absence alerts", adminAttContent.includes('priority: "URGENT"'));

  // 9. Verify bus message route awaits push dispatch
  const busMsgPath = path.join(process.cwd(), "app/api/buses/[id]/messages/route.ts");
  const busMsgContent = fs.readFileSync(busMsgPath, "utf8");
  assert("Bus messages route awaits sendInstantPortalNotification", busMsgContent.includes("await sendInstantPortalNotification"));

  console.log("\n================================================================================");
  console.log(`TOTAL PASSED: ${passed} | TOTAL FAILED: ${failed}`);
  console.log("================================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runTest();
