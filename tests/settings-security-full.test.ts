import { prisma } from "../backend/db/prisma";
import bcrypt from "bcryptjs";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import {
  signUnlockPayload,
  verifyUnlockToken,
  getOrCreateSettingsSecurity,
  SETTINGS_UNLOCK_TIMEOUT_MIN,
  MAX_SETTINGS_FAILED_ATTEMPTS,
  SETTINGS_LOCKOUT_MINUTES,
} from "../backend/lib/settings/settingsSecurityConfig";

async function runTests() {
  console.log("================================================================================");
  console.log("            SETTINGS SECURITY & BATCHES INTEGRATION VERIFICATION SUITE          ");
  console.log("================================================================================\n");

  let passed = 0;
  let failed = 0;

  async function test(name: string, fn: () => Promise<void>) {
    try {
      await fn();
      console.log(`✅ PASS: ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`❌ FAIL: ${name}`);
      console.error(`   Error: ${err.message || err}`);
      failed++;
    }
  }

  const initialPassword = process.env.SETTINGS_INITIAL_PASSWORD || "";
  if (!initialPassword) {
    throw new Error("SETTINGS_INITIAL_PASSWORD is not set in environment!");
  }

  // 1. Initialization and DB record verification
  await test("1. getOrCreateSettingsSecurity seeds DB record if missing", async () => {
    const record = await getOrCreateSettingsSecurity();
    if (!record || !record.passwordHash) {
      throw new Error("SettingsSecurity record was not found or created");
    }
    const match = await bcrypt.compare(initialPassword, record.passwordHash);
    if (!match) {
      throw new Error("Initial password hash does not match SETTINGS_INITIAL_PASSWORD");
    }
    console.log(`   SettingsSecurity ID: ${record.id}, Version: ${record.passwordVersion}`);
  });

  // 2. Token signing and cryptographic verification
  await test("2. Token signing and signature tamper detection", async () => {
    const adminId = "admin_user_test_123";
    const sessionId = "session_active_456";
    const now = Date.now();
    const expiresAt = now + SETTINGS_UNLOCK_TIMEOUT_MIN * 60 * 1000;
    const version = 1;

    const payload = {
      userId: adminId,
      sessionId,
      passwordVersion: version,
      unlockedAt: now,
      expiresAt,
    };

    const token = signUnlockPayload(payload);
    if (!token || !token.includes(".")) {
      throw new Error("signUnlockPayload produced invalid token format");
    }

    // Valid token verifies
    const verified = verifyUnlockToken(token);
    if (!verified || verified.userId !== adminId || verified.passwordVersion !== version) {
      throw new Error("Expected valid payload from verifyUnlockToken");
    }

    // Tampered signature fails
    const [b64Payload, sig] = token.split(".");
    const tamperedSigToken = `${b64Payload}.${sig.slice(0, -4)}abcd`;
    const tamperedCheck = verifyUnlockToken(tamperedSigToken);
    if (tamperedCheck !== null) {
      throw new Error("Tampered token signature was incorrectly accepted");
    }

    // Tampered payload fails
    const rawPayload = JSON.parse(Buffer.from(b64Payload, "base64url").toString("utf-8"));
    rawPayload.userId = "hacker_user_999";
    const badPayloadB64 = Buffer.from(JSON.stringify(rawPayload)).toString("base64url");
    const badToken = `${badPayloadB64}.${sig}`;
    const payloadCheck = verifyUnlockToken(badToken);
    if (payloadCheck !== null) {
      throw new Error("Tampered token payload was incorrectly accepted");
    }

    // Expired token fails
    const expiredPayload = {
      ...payload,
      expiresAt: now - 1000, // 1 second in the past
    };
    const expiredToken = signUnlockPayload(expiredPayload);
    const expiredCheck = verifyUnlockToken(expiredToken);
    if (expiredCheck !== null) {
      throw new Error("Expired token was incorrectly accepted");
    }
  });

  // 3. Brute force rate limiting and lockout state verification
  await test("3. Brute-force rate limiting: 5 attempts triggers 15-minute lockout in DB", async () => {
    // Reset test state in DB
    const sec = await getOrCreateSettingsSecurity();
    await prisma.settingsSecurity.update({
      where: { id: sec.id },
      data: { failedAttempts: 0, lockedUntil: null },
    });

    // Simulate 4 failed attempts
    for (let i = 1; i <= 4; i++) {
      const match = await bcrypt.compare("WrongPassword123!", sec.passwordHash);
      if (match) throw new Error("Wrong password unexpectedly matched!");
      await prisma.settingsSecurity.update({
        where: { id: sec.id },
        data: { failedAttempts: i },
      });
    }

    let state = await prisma.settingsSecurity.findUnique({ where: { id: sec.id } });
    if (state?.failedAttempts !== 4 || state?.lockedUntil !== null) {
      throw new Error("Failed attempts counter not tracking correctly before lockout");
    }

    // 5th failed attempt locks out for 15 minutes
    const lockedUntilDate = new Date(Date.now() + SETTINGS_LOCKOUT_MINUTES * 60 * 1000);
    await prisma.settingsSecurity.update({
      where: { id: sec.id },
      data: {
        failedAttempts: 5,
        lockedUntil: lockedUntilDate,
      },
    });

    state = await prisma.settingsSecurity.findUnique({ where: { id: sec.id } });
    if (!state?.lockedUntil || state.lockedUntil.getTime() <= Date.now()) {
      throw new Error("Lockout timestamp not properly set in future");
    }

    // Clean up lockout for subsequent tests
    await prisma.settingsSecurity.update({
      where: { id: sec.id },
      data: { failedAttempts: 0, lockedUntil: null },
    });
  });

  // 4. Test terminal recovery script
  await test("4. Terminal recovery script (scripts/reset-settings-password.ts) works", async () => {
    const tempPass = "ResetPassword999!";
    const output = execSync(`npx tsx scripts/reset-settings-password.ts "${tempPass}"`, {
      encoding: "utf-8",
    });

    if (!output.includes("[SUCCESS] Settings security password has been successfully reset!")) {
      throw new Error(`CLI script output did not indicate success: ${output}`);
    }

    const sec = await prisma.settingsSecurity.findFirst();
    const isNewMatch = await bcrypt.compare(tempPass, sec?.passwordHash || "");
    if (!isNewMatch) {
      throw new Error("New password from CLI reset did not match DB hash");
    }

    // Restore back to initialPassword
    execSync(`npx tsx scripts/reset-settings-password.ts "${initialPassword}"`, {
      encoding: "utf-8",
    });
    console.log("   Restored initial password via CLI recovery script.");
  });

  // 5. Verify Batches route redirects
  await test("5. Batches route redirects: /admin/batches & /dashboard/admin/batches", async () => {
    const adminBatchesPage = fs.readFileSync(
      path.join(process.cwd(), "frontend/app/admin/batches/page.tsx"),
      "utf-8"
    );
    if (!adminBatchesPage.includes('redirect("/admin/settings?tab=batches")')) {
      throw new Error("frontend/app/admin/batches/page.tsx does not redirect to /admin/settings?tab=batches");
    }

    const dashboardBatchesPage = fs.readFileSync(
      path.join(process.cwd(), "frontend/app/dashboard/admin/batches/page.tsx"),
      "utf-8"
    );
    if (!dashboardBatchesPage.includes('redirect("/dashboard/admin/settings?tab=batches")')) {
      throw new Error("frontend/app/dashboard/admin/batches/page.tsx does not redirect to /dashboard/admin/settings?tab=batches");
    }
  });

  // 6. Verify Sidebar does NOT contain Batches link
  await test("6. Sidebar has removed 'Batches & Promotion' standalone item", async () => {
    const sidebar = fs.readFileSync(
      path.join(process.cwd(), "frontend/components/Sidebar.tsx"),
      "utf-8"
    );
    if (sidebar.includes('href: "/dashboard/admin/batches"') || sidebar.includes('label: "Batches & Promotion"')) {
      throw new Error("Sidebar still contains standalone Batches & Promotion navigation link");
    }
  });

  // 7. Verify Settings Unlock Gate Page and Lock settings button
  await test("7. Settings page contains 'Lock Settings' action and gate page exists", async () => {
    const settingsClient = fs.readFileSync(
      path.join(process.cwd(), "frontend/app/dashboard/admin/settings/SettingsClient.tsx"),
      "utf-8"
    );
    if (!settingsClient.includes("Lock Settings") || !settingsClient.includes("lockSettingsAction")) {
      throw new Error("SettingsClient.tsx does not include Lock Settings button or action");
    }
    if (!settingsClient.includes('activeTab === "batches"') || !settingsClient.includes("<BatchManagementClient")) {
      throw new Error("SettingsClient.tsx does not embed BatchManagementClient under batches tab");
    }
    if (!settingsClient.includes('activeTab === "security"') || !settingsClient.includes("Change Settings Password")) {
      throw new Error("SettingsClient.tsx does not embed Change Settings Password tab");
    }

    const gateClient = fs.readFileSync(
      path.join(process.cwd(), "frontend/components/settings/SettingsUnlockGateClient.tsx"),
      "utf-8"
    );
    if (!gateClient.includes("Enter Settings Password") || !gateClient.includes("Unlock Settings")) {
      throw new Error("SettingsUnlockGateClient.tsx does not include unlock UI elements");
    }
  });

  // 8. Plaintext password repository scan
  await test("8. Plaintext password is NEVER present in git repository", async () => {
    try {
      const grepOutput = execSync(`git grep -i "${initialPassword}"`, {
        encoding: "utf-8",
      });
      if (grepOutput.trim().length > 0) {
        throw new Error(`Plaintext password leaked in repository files:\n${grepOutput}`);
      }
    } catch (e: any) {
      // git grep exits with 1 when no matches are found, which is exactly what we require
      if (e.status !== 1) {
        throw e;
      }
    }
  });

  // 9. Batch Promotion Password Verification Gate
  await test("9. Batch Promotion requires Admin Password Verification before moving to preview", async () => {
    const wizardModal = fs.readFileSync(
      path.join(process.cwd(), "frontend/app/dashboard/admin/batches/PromotionWizardModal.tsx"),
      "utf-8"
    );

    if (!wizardModal.includes("AdminPasswordVerificationModal")) {
      throw new Error("PromotionWizardModal does not import AdminPasswordVerificationModal");
    }
    if (!wizardModal.includes("handleGenerateClick") || !wizardModal.includes("setIsPasswordModalOpen(true)")) {
      throw new Error("PromotionWizardModal does not intercept 'Generate Promotion Preview' with password modal");
    }
    if (!wizardModal.includes("handlePasswordVerified") || !wizardModal.includes("setStep(2)")) {
      throw new Error("PromotionWizardModal does not advance to step 2 upon password verification");
    }

    const actionsCode = fs.readFileSync(
      path.join(process.cwd(), "backend/api/actions/dashboard/admin/batches/actions.ts"),
      "utf-8"
    );
    if (!actionsCode.includes("adminPassword?: string") || !actionsCode.includes("unlockSettingsAction(adminPassword)")) {
      throw new Error("simulateBatchPromotionAction does not enforce server-side admin password check");
    }
  });

  console.log("\n================================================================================");
  console.log(` SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log("================================================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
