"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import {
  getOrCreateSettingsSecurity,
  isSettingsUnlockedServer,
  issueSettingsUnlockCookie,
  clearSettingsUnlockCookie,
  BCRYPT_SALT_ROUNDS,
  MAX_SETTINGS_FAILED_ATTEMPTS,
  SETTINGS_LOCKOUT_MINUTES,
} from "@/backend/lib/settings/settingsSecurityConfig";

// Zod Validation Schema for Password Change
const ChangePasswordSchema = z
  .object({
    oldPassword: z.string().min(1, "Current password is required"),
    newPassword: z
      .string()
      .min(8, "New password must be at least 8 characters long")
      .regex(/[A-Za-z]/, "New password must contain at least one letter")
      .regex(/[0-9]/, "New password must contain at least one number"),
    confirmPassword: z.string().min(1, "Confirm password is required"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Confirm password does not match",
    path: ["confirmPassword"],
  })
  .refine((data) => data.newPassword !== data.oldPassword, {
    message: "New password must differ from current password",
    path: ["newPassword"],
  });

// ==========================================
// 1. UNLOCK SETTINGS (GATE ACTION)
// ==========================================
export async function unlockSettingsAction(password: string): Promise<{
  success?: boolean;
  error?: string;
  lockedUntil?: string;
  remainingMinutes?: number;
}> {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session || session.user?.role !== "ADMIN") {
      return { error: "Unauthorized. Admin privileges required." };
    }

    if (!password || typeof password !== "string") {
      return { error: "Please enter the settings password." };
    }

    const security = await getOrCreateSettingsSecurity();

    // Check active lockout
    if (security.lockedUntil && security.lockedUntil.getTime() > Date.now()) {
      const remainingMinutes = Math.max(
        1,
        Math.ceil((security.lockedUntil.getTime() - Date.now()) / (60 * 1000))
      );
      return {
        error: `Settings are temporarily locked due to repeated failed attempts. Please wait ${remainingMinutes} minute(s).`,
        lockedUntil: security.lockedUntil.toISOString(),
        remainingMinutes,
      };
    }

    // Artificial constant delay to prevent timing attacks
    await new Promise((resolve) => setTimeout(resolve, 350));

    // Compare with bcrypt
    const isMatch = await bcrypt.compare(password, security.passwordHash);

    if (!isMatch) {
      const nextFailed = security.failedAttempts + 1;
      let lockedUntil: Date | null = null;
      let isNowLocked = false;

      if (nextFailed >= MAX_SETTINGS_FAILED_ATTEMPTS) {
        lockedUntil = new Date(Date.now() + SETTINGS_LOCKOUT_MINUTES * 60 * 1000);
        isNowLocked = true;
      }

      await prisma.$transaction([
        prisma.settingsSecurity.update({
          where: { id: security.id },
          data: {
            failedAttempts: nextFailed,
            lockedUntil,
          },
        }),
        prisma.auditLog.create({
          data: {
            userId: session.user.id,
            action: isNowLocked ? "SETTINGS_UNLOCK_LOCKED_OUT" : "SETTINGS_UNLOCK_FAILED",
            targetModel: "SettingsSecurity",
            targetId: security.id,
            details: isNowLocked
              ? `Account locked out for ${SETTINGS_LOCKOUT_MINUTES}m after ${nextFailed} consecutive failed unlock attempts.`
              : `Incorrect settings unlock attempt (${nextFailed}/${MAX_SETTINGS_FAILED_ATTEMPTS}).`,
          },
        }),
      ]);

      if (isNowLocked && lockedUntil) {
        return {
          error: `Incorrect password. Maximum attempts exceeded. Settings locked for ${SETTINGS_LOCKOUT_MINUTES} minutes.`,
          lockedUntil: lockedUntil.toISOString(),
          remainingMinutes: SETTINGS_LOCKOUT_MINUTES,
        };
      }

      return {
        error: "Incorrect password",
      };
    }

    // Success: Reset failed attempts & issue unlock cookie
    await prisma.$transaction([
      prisma.settingsSecurity.update({
        where: { id: security.id },
        data: {
          failedAttempts: 0,
          lockedUntil: null,
        },
      }),
      prisma.auditLog.create({
        data: {
          userId: session.user.id,
          action: "SETTINGS_UNLOCK_SUCCESS",
          targetModel: "SettingsSecurity",
          targetId: security.id,
          details: "Settings successfully unlocked.",
        },
      }),
    ]);

    await issueSettingsUnlockCookie(
      session.user.id,
      session.user.sessionId,
      security.passwordVersion
    );

    return { success: true };
  } catch (error: any) {
    console.error("[unlockSettingsAction] Error:", error);
    return { error: error?.message || "An unexpected error occurred while unlocking settings." };
  }
}

// ==========================================
// 2. LOCK SETTINGS ACTION
// ==========================================
export async function lockSettingsAction(): Promise<{ success: boolean }> {
  try {
    const session = await getServerSession(getAuthOptions());
    await clearSettingsUnlockCookie();

    if (session?.user?.id) {
      await prisma.auditLog.create({
        data: {
          userId: session.user.id,
          action: "SETTINGS_LOCKED",
          targetModel: "SettingsSecurity",
          details: "Admin manually locked settings.",
        },
      }).catch(() => null);
    }

    return { success: true };
  } catch {
    return { success: true };
  }
}

// ==========================================
// 3. CHANGE SETTINGS PASSWORD ACTION
// ==========================================
export async function changeSettingsPasswordAction(rawData: {
  oldPassword: string;
  newPassword: string;
  confirmPassword: string;
}): Promise<{
  success?: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
}> {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session || session.user?.role !== "ADMIN") {
      return { error: "Unauthorized access." };
    }

    // Verify settings are currently unlocked
    const status = await isSettingsUnlockedServer();
    if (!status.unlocked) {
      return { error: "Settings are locked. Please unlock settings first." };
    }

    // Zod validation
    const parsed = ChangePasswordSchema.safeParse(rawData);
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      parsed.error.errors.forEach((err) => {
        const field = err.path[0]?.toString();
        if (field) fieldErrors[field] = err.message;
      });
      return {
        error: parsed.error.errors[0]?.message || "Validation failed.",
        fieldErrors,
      };
    }

    const { oldPassword, newPassword } = parsed.data;
    const security = await getOrCreateSettingsSecurity();

    // Verify old password
    const isOldMatch = await bcrypt.compare(oldPassword, security.passwordHash);
    if (!isOldMatch) {
      const nextFailed = security.failedAttempts + 1;
      let lockedUntil: Date | null = null;
      if (nextFailed >= MAX_SETTINGS_FAILED_ATTEMPTS) {
        lockedUntil = new Date(Date.now() + SETTINGS_LOCKOUT_MINUTES * 60 * 1000);
      }

      await prisma.$transaction([
        prisma.settingsSecurity.update({
          where: { id: security.id },
          data: { failedAttempts: nextFailed, lockedUntil },
        }),
        prisma.auditLog.create({
          data: {
            userId: session.user.id,
            action: "SETTINGS_PASSWORD_CHANGE_FAILED",
            targetModel: "SettingsSecurity",
            targetId: security.id,
            details: "Incorrect current password entered while attempting to change settings password.",
          },
        }),
      ]);

      if (lockedUntil) {
        await clearSettingsUnlockCookie();
        return {
          error: "Incorrect current password. Settings have been locked due to repeated failed attempts.",
        };
      }

      return {
        error: "Incorrect current password.",
        fieldErrors: { oldPassword: "The current password you entered is incorrect." },
      };
    }

    // Hash new password and increment version in single transaction
    const newHash = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS);
    const newVersion = security.passwordVersion + 1;

    await prisma.$transaction([
      prisma.settingsSecurity.update({
        where: { id: security.id },
        data: {
          passwordHash: newHash,
          passwordVersion: newVersion,
          failedAttempts: 0,
          lockedUntil: null,
          updatedByUserId: session.user.id,
        },
      }),
      prisma.auditLog.create({
        data: {
          userId: session.user.id,
          action: "SETTINGS_PASSWORD_CHANGED",
          targetModel: "SettingsSecurity",
          targetId: security.id,
          details: `Settings password successfully updated. Version bumped to ${newVersion}.`,
        },
      }),
    ]);

    // Issue a fresh unlock cookie with new passwordVersion so current admin remains unlocked
    await issueSettingsUnlockCookie(
      session.user.id,
      session.user.sessionId,
      newVersion
    );

    return { success: true };
  } catch (error: any) {
    console.error("[changeSettingsPasswordAction] Error:", error);
    return { error: error?.message || "Failed to update settings password." };
  }
}

// ==========================================
// 4. CHECK UNLOCK STATUS
// ==========================================
export async function getSettingsUnlockStatusAction(): Promise<{
  unlocked: boolean;
  lockedUntil?: string | null;
  remainingMinutes?: number;
}> {
  try {
    const status = await isSettingsUnlockedServer();
    if (!status.unlocked && status.security?.lockedUntil) {
      const remainingMinutes = Math.max(
        1,
        Math.ceil((status.security.lockedUntil.getTime() - Date.now()) / (60 * 1000))
      );
      return {
        unlocked: false,
        lockedUntil: status.security.lockedUntil.toISOString(),
        remainingMinutes,
      };
    }
    return { unlocked: status.unlocked };
  } catch {
    return { unlocked: false };
  }
}

