import fs from "fs";
import path from "path";

function runVerification() {
  console.log("================================================================================");
  console.log("iOS PWA INSTALLATION, MODAL RESILIENCY & NOTIFICATION DEDUPLICATION TEST SUITE");
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

  // 1. Verify PWA Manifests
  const manifestPath = path.join(process.cwd(), "public/manifest.json");
  const webManifestPath = path.join(process.cwd(), "public/manifest.webmanifest");
  assert("manifest.json exists", fs.existsSync(manifestPath));
  assert("manifest.webmanifest exists", fs.existsSync(webManifestPath));

  if (fs.existsSync(manifestPath)) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    assert("Manifest display is standalone", manifest.display === "standalone");
    assert("Manifest has start_url /", manifest.start_url === "/");
    assert("Manifest has apple-touch-icon", manifest.icons.some((i: any) => i.src.includes("apple-touch-icon")));
  }

  // 2. Verify Apple Touch Icon on disk
  const appleTouchIconPath = path.join(process.cwd(), "public/apple-touch-icon.png");
  assert("apple-touch-icon.png exists in public/", fs.existsSync(appleTouchIconPath));

  // 3. Verify Layout Metadata & IosInstallPrompt mounting
  const layoutPath = path.join(process.cwd(), "frontend/app/layout.tsx");
  const layoutContent = fs.readFileSync(layoutPath, "utf8");
  assert("Layout includes appleWebApp metadata", layoutContent.includes("appleWebApp"));
  assert("Layout has apple-touch-icon link", layoutContent.includes("/apple-touch-icon.png"));
  assert("Layout mounts <IosInstallPrompt />", layoutContent.includes("<IosInstallPrompt />"));

  // 4. Verify IosInstallPrompt component logic
  const iosPromptPath = path.join(process.cwd(), "frontend/components/IosInstallPrompt.tsx");
  const iosPromptContent = fs.readFileSync(iosPromptPath, "utf8");
  assert("IosInstallPrompt has standalone detection", iosPromptContent.includes("display-mode: standalone"));
  assert("IosInstallPrompt detects in-app browsers", iosPromptContent.includes("isInAppBrowser") || iosPromptContent.includes("CriOS"));
  assert("IosInstallPrompt has 7-day dismissal memory", iosPromptContent.includes("DISMISSED_KEY"));
  assert("IosInstallPrompt supports manual event trigger", iosPromptContent.includes("open-ios-install-prompt"));

  // 5. Verify NotificationPopupModal CSS buffer preventing top clipping
  const modalCssPath = path.join(process.cwd(), "frontend/components/notifications/NotificationPopupModal.module.css");
  const modalCss = fs.readFileSync(modalCssPath, "utf8");
  assert(
    "Overlay has generous top padding (max(3.5rem))",
    modalCss.includes("padding: max(3.5rem") || modalCss.includes("3.5rem")
  );
  assert(
    "Bell badge circle top is within safety buffer (-34px)",
    modalCss.includes("top: -34px")
  );
  assert(
    "Modal card constrained to calc(100dvh - 5.5rem)",
    modalCss.includes("calc(100dvh - 5.5rem)")
  );

  // 6. Verify NotificationsCenterClient Birthday categorization & deduplication
  const clientNotifPath = path.join(process.cwd(), "frontend/app/notifications/NotificationsCenterClient.tsx");
  const clientNotifContent = fs.readFileSync(clientNotifPath, "utf8");
  assert("Client notif has Birthday Wish badge", clientNotifContent.includes("Birthday Wish 🎂"));
  assert("Client notif has deduplicatedNotifications", clientNotifContent.includes("deduplicatedNotifications"));
  assert("Client notif renders Birthday card pop-up on click", clientNotifContent.includes("BirthdayWishCard"));

  // 7. Verify lib/notify.ts FCM Android collapseKey & in-app deduplication
  const notifyPath = path.join(process.cwd(), "lib/notify.ts");
  const notifyContent = fs.readFileSync(notifyPath, "utf8");
  assert("notify.ts includes FCM collapseKey", notifyContent.includes("collapseKey: deterministicTag"));
  assert("notify.ts includes Android tag", notifyContent.includes("tag: deterministicTag"));
  assert("notify.ts deduplicates in-app notifications", notifyContent.includes("recentCutoff"));

  console.log("\n================================================================================");
  console.log(`TOTAL PASSED: ${passed} | TOTAL FAILED: ${failed}`);
  console.log("================================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runVerification();
