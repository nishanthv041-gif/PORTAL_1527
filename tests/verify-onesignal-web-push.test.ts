import fs from "fs";
import path from "path";

function runOneSignalVerification() {
  console.log("================================================================================");
  console.log("ONESIGNAL WEB PUSH, SERVICE WORKER & WHATSAPP BADGE TEST SUITE");
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

  const EXPECTED_APP_ID = "721f0fa5-683c-4edc-93ce-35a8786d655b";

  // 1. Verify OneSignal Service Worker in public/
  const workerPath = path.join(process.cwd(), "public/OneSignalSDKWorker.js");
  assert("public/OneSignalSDKWorker.js exists", fs.existsSync(workerPath));
  if (fs.existsSync(workerPath)) {
    const workerContent = fs.readFileSync(workerPath, "utf8");
    assert(
      "OneSignalSDKWorker imports OneSignalSDK.sw.js v16",
      workerContent.includes("https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js")
    );
    assert("OneSignalSDKWorker handles setAppBadge", workerContent.includes("setAppBadge"));
    assert("OneSignalSDKWorker handles clearAppBadge", workerContent.includes("clearAppBadge"));
  }

  // 2. Verify Client-Side OneSignal SDK Helper
  const clientLibPath = path.join(process.cwd(), "frontend/lib/onesignal.ts");
  assert("frontend/lib/onesignal.ts exists", fs.existsSync(clientLibPath));
  if (fs.existsSync(clientLibPath)) {
    const clientLib = fs.readFileSync(clientLibPath, "utf8");
    assert("frontend/lib/onesignal.ts imports react-onesignal", clientLib.includes("react-onesignal"));
    assert("frontend/lib/onesignal.ts contains correct App ID", clientLib.includes(EXPECTED_APP_ID));
    assert("frontend/lib/onesignal.ts configures allowLocalhostAsSecureOrigin", clientLib.includes("allowLocalhostAsSecureOrigin: true"));
    assert("frontend/lib/onesignal.ts exports loginToOneSignal", clientLib.includes("export async function loginToOneSignal"));
    assert("frontend/lib/onesignal.ts links external_id via OneSignal.login", clientLib.includes("OneSignal.login("));
  }

  // 3. Verify Backend Dispatcher Service
  const servicePath = path.join(process.cwd(), "backend/services/push/oneSignalService.ts");
  assert("backend/services/push/oneSignalService.ts exists", fs.existsSync(servicePath));
  if (fs.existsSync(servicePath)) {
    const serviceContent = fs.readFileSync(servicePath, "utf8");
    assert("oneSignalService targets onesignal.com notifications API", serviceContent.includes("https://onesignal.com/api/v1/notifications"));
    assert("oneSignalService sets target_channel: 'push'", serviceContent.includes('"push"'));
    assert("oneSignalService targets include_aliases.external_id", serviceContent.includes("include_aliases") && serviceContent.includes("external_id"));
    assert("oneSignalService sets ios_badgeType: 'SetTo'", serviceContent.includes("ios_badgeType") && serviceContent.includes('"SetTo"'));
    assert("oneSignalService sets ios_badgeCount with unreadCount", serviceContent.includes("ios_badgeCount"));
    assert("oneSignalService uses ONESIGNAL_REST_API_KEY", serviceContent.includes("ONESIGNAL_REST_API_KEY"));
  }

  // 4. Verify NotificationPermissionGate OneSignal Integration
  const gatePath = path.join(process.cwd(), "frontend/components/notifications/NotificationPermissionGate.tsx");
  assert("NotificationPermissionGate.tsx exists", fs.existsSync(gatePath));
  if (fs.existsSync(gatePath)) {
    const gateContent = fs.readFileSync(gatePath, "utf8");
    assert("PermissionGate imports onesignal helpers", gateContent.includes("@/frontend/lib/onesignal"));
    assert("PermissionGate initializes and logs into OneSignal", gateContent.includes("loginToOneSignal(userId)"));
    assert("PermissionGate triggers OneSignal permission prompt", gateContent.includes("requestOneSignalPermission"));
  }

  // 5. Verify Universal Dispatcher Pipeline (lib/dispatcher.ts)
  const dispatcherPath = path.join(process.cwd(), "lib/dispatcher.ts");
  assert("lib/dispatcher.ts exists", fs.existsSync(dispatcherPath));
  if (fs.existsSync(dispatcherPath)) {
    const dispContent = fs.readFileSync(dispatcherPath, "utf8");
    assert("dispatcher.ts imports sendOneSignalPush", dispContent.includes("sendOneSignalPush"));
    assert("dispatcher.ts dispatches OneSignal push on system notifications", dispContent.includes("sendOneSignalPush({"));
  }

  // 6. Verify POST /api/push/test uses the REAL unified dispatcher pipeline
  const pushTestPath = path.join(process.cwd(), "app/api/push/test/route.ts");
  assert("app/api/push/test/route.ts exists", fs.existsSync(pushTestPath));
  if (fs.existsSync(pushTestPath)) {
    const testContent = fs.readFileSync(pushTestPath, "utf8");
    assert("push/test route imports dispatchNotification", testContent.includes("dispatchNotification"));
    assert("push/test route calls dispatchNotification", testContent.includes("dispatchNotification({"));
    assert("push/test route returns unified diagnostic result", testContent.includes("dispatchResult"));
  }

  // 7. Verify .env configuration contains OneSignal placeholders
  const envPath = path.join(process.cwd(), ".env");
  const envContent = fs.readFileSync(envPath, "utf8");
  assert(".env contains ONESIGNAL_APP_ID", envContent.includes("ONESIGNAL_APP_ID"));
  assert(".env contains correct App ID value", envContent.includes(EXPECTED_APP_ID));
  assert(".env contains ONESIGNAL_REST_API_KEY placeholder", envContent.includes("ONESIGNAL_REST_API_KEY"));

  console.log("\n================================================================================");
  console.log(`TOTAL PASSED: ${passed} | TOTAL FAILED: ${failed}`);
  console.log("================================================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runOneSignalVerification();
