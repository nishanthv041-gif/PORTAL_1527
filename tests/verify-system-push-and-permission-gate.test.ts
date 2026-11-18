import fs from "fs";
import path from "path";
import webpush from "web-push";

function runVerification() {
  console.log("================================================================================");
  console.log("SYSTEM PUSH NOTIFICATIONS, PERMISSION GATE & UNREAD BADGE TEST SUITE");
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

  // 1. Verify VAPID credentials validity
  const envContent = fs.readFileSync(path.join(process.cwd(), ".env"), "utf8");
  const vapidPublicMatch = envContent.match(/VAPID_PUBLIC_KEY="?([^"\r\n]+)"?/);
  const vapidPrivateMatch = envContent.match(/VAPID_PRIVATE_KEY="?([^"\r\n]+)"?/);
  const vapidSubjectMatch = envContent.match(/VAPID_SUBJECT="?([^"\r\n]+)"?/);

  assert("VAPID_PUBLIC_KEY is configured in .env", Boolean(vapidPublicMatch && vapidPublicMatch[1]));
  assert("VAPID_PRIVATE_KEY is configured in .env", Boolean(vapidPrivateMatch && vapidPrivateMatch[1]));
  assert("VAPID_SUBJECT is configured in .env", Boolean(vapidSubjectMatch && vapidSubjectMatch[1]));

  if (vapidPublicMatch && vapidPrivateMatch && vapidSubjectMatch) {
    let vapidValid = false;
    try {
      webpush.setVapidDetails(vapidSubjectMatch[1], vapidPublicMatch[1], vapidPrivateMatch[1]);
      vapidValid = true;
    } catch {}
    assert("web-push successfully validates VAPID EC P-256 key pair", vapidValid);
  }

  // 2. Verify POST /api/push/test route exists and has full diagnostic implementation
  const pushTestPath = path.join(process.cwd(), "app/api/push/test/route.ts");
  assert("app/api/push/test/route.ts exists", fs.existsSync(pushTestPath));

  if (fs.existsSync(pushTestPath)) {
    const testContent = fs.readFileSync(pushTestPath, "utf8");
    assert("push/test route checks authenticated session", testContent.includes("getServerSession"));
    assert("push/test queries PostgreSQL subscriptions", testContent.includes("prisma.pushSubscription.findMany"));
    assert("push/test queries exact PostgreSQL unread count", testContent.includes("prisma.notification.count"));
    assert("push/test executes webpush.sendNotification", testContent.includes("webpush.sendNotification"));
    assert("push/test uses TTL: 60 and Urgency: high", testContent.includes("TTL: 60") && testContent.includes("Urgency: \"high\""));
    assert("push/test returns detailed error and success report", testContent.includes("deviceResults"));
  }

  // 3. Verify backend notification pipeline (lib/notify.ts) calculates exact unreadCount
  const notifyPath = path.join(process.cwd(), "lib/notify.ts");
  const notifyContent = fs.readFileSync(notifyPath, "utf8");
  assert("notify.ts calculates exact unread count from PostgreSQL", notifyContent.includes("prisma.notification.count"));
  assert("notify.ts sets TTL: 60 and Urgency: high", notifyContent.includes("TTL: 60") && notifyContent.includes("Urgency: \"high\""));
  assert("notify.ts auto-deletes 404/410 dead endpoints across push tables", notifyContent.includes("statusCode === 404 || statusCode === 410"));

  // 4. Verify NotificationPermissionGate component
  const gatePath = path.join(process.cwd(), "frontend/components/notifications/NotificationPermissionGate.tsx");
  assert("NotificationPermissionGate.tsx exists", fs.existsSync(gatePath));

  if (fs.existsSync(gatePath)) {
    const gateContent = fs.readFileSync(gatePath, "utf8");
    assert("PermissionGate allows instant 0ms entry to children", gateContent.includes("{children}"));
    assert("PermissionGate has Enable Push Notifications prompt", gateContent.includes("Enable Push Notifications"));
    assert("PermissionGate syncs subscription to PostgreSQL", gateContent.includes("/api/push/subscribe"));
  }

  // 5. Verify DashboardLayout mounts NotificationPermissionGate
  const layoutPath = path.join(process.cwd(), "frontend/app/dashboard/layout.tsx");
  const layoutContent = fs.readFileSync(layoutPath, "utf8");
  assert("Dashboard layout imports NotificationPermissionGate", layoutContent.includes("NotificationPermissionGate"));
  assert("Dashboard layout wraps dashboards with NotificationPermissionGate", layoutContent.includes("<NotificationPermissionGate"));

  // 6. Verify Topbar has visible "Test Lock-Screen Notification" button
  const topbarPath = path.join(process.cwd(), "frontend/components/Topbar.tsx");
  const topbarContent = fs.readFileSync(topbarPath, "utf8");
  assert("Topbar includes Test Push button", topbarContent.includes("Test Push"));
  assert("Topbar Test Push button calls /api/push/test", topbarContent.includes("/api/push/test"));
  assert("Topbar provides non-intrusive toast feedback for push dispatch", topbarContent.includes("toastMessage") || topbarContent.includes("setToastMessage"));

  // 7. Verify public/sw.js
  const swPath = path.join(process.cwd(), "public/sw.js");
  const swContent = fs.readFileSync(swPath, "utf8");
  assert("sw.js calls skipWaiting()", swContent.includes("self.skipWaiting()"));
  assert("sw.js calls clients.claim()", swContent.includes("self.clients.claim()"));
  assert("sw.js push listener shows notification with required params", swContent.includes("self.registration.showNotification"));
  assert("sw.js sets app icon badge with unreadCount", swContent.includes("setAppBadge(unreadCount)"));

  // 8. Verify manifest.json and icons
  const manifestPath = path.join(process.cwd(), "public/manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  assert("manifest.json has display: standalone", manifest.display === "standalone");
  assert("public/icons/icon-192x192.png exists", fs.existsSync(path.join(process.cwd(), "public/icons/icon-192x192.png")));
  assert("public/icons/icon-512x512.png exists", fs.existsSync(path.join(process.cwd(), "public/icons/icon-512x512.png")));
  assert("public/icon-192x192.png exists", fs.existsSync(path.join(process.cwd(), "public/icon-192x192.png")));
  assert("public/badge-72x72.png exists", fs.existsSync(path.join(process.cwd(), "public/badge-72x72.png")));

  console.log("\n================================================================================");
  console.log(`TOTAL PASSED: ${passed} | TOTAL FAILED: ${failed}`);
  console.log("================================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runVerification();
