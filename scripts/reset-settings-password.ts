/**
 * Terminal Recovery Script: Reset Settings Password
 * 
 * Usage:
 *   npx tsx scripts/reset-settings-password.ts "<new-password>"
 */

import bcrypt from "bcryptjs";
import { prisma } from "../backend/db/prisma";

async function main() {
  const newPassword = process.argv[2];

  if (!newPassword || newPassword.trim().length === 0) {
    console.error("❌ Error: Please provide a new password as an argument.");
    console.error("Usage: npx tsx scripts/reset-settings-password.ts \"<new-password>\"");
    process.exit(1);
  }

  const trimmed = newPassword.trim();
  if (trimmed.length < 8) {
    console.error("❌ Error: Password must be at least 8 characters long.");
    process.exit(1);
  }

  const hasLetter = /[A-Za-z]/.test(trimmed);
  const hasNumber = /[0-9]/.test(trimmed);
  if (!hasLetter || !hasNumber) {
    console.error("❌ Error: Password must contain at least one letter and at least one number.");
    process.exit(1);
  }

  console.log("🔒 Hashing new settings password...");
  const passwordHash = await bcrypt.hash(trimmed, 10);

  const existing = await prisma.settingsSecurity.findFirst({
    orderBy: { updatedAt: "desc" },
  });

  let updated;
  if (existing) {
    updated = await prisma.settingsSecurity.update({
      where: { id: existing.id },
      data: {
        passwordHash,
        passwordVersion: existing.passwordVersion + 1,
        failedAttempts: 0,
        lockedUntil: null,
        updatedAt: new Date(),
        updatedByUserId: "CLI_RECOVERY",
      },
    });
  } else {
    updated = await prisma.settingsSecurity.create({
      data: {
        passwordHash,
        passwordVersion: 1,
        failedAttempts: 0,
        lockedUntil: null,
        updatedByUserId: "CLI_RECOVERY",
      },
    });
  }

  // Audit log entry
  await prisma.auditLog.create({
    data: {
      userId: "SYSTEM_CLI",
      action: "SETTINGS_PASSWORD_RESET_CLI",
      targetModel: "SettingsSecurity",
      targetId: updated.id,
      details: `Settings password reset via CLI recovery tool. Version: ${updated.passwordVersion}.`,
    },
  }).catch(() => null);

  console.log("✅ [SUCCESS] Settings security password has been successfully reset!");
  console.log(`   Security Version : ${updated.passwordVersion}`);
  console.log("   Locked State     : UNLOCKED (Failed attempts cleared)");
  console.log("   Active Sessions  : All previous settings unlock sessions revoked immediately.");

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("❌ Fatal error executing reset-settings-password:", err);
  process.exit(1);
});

