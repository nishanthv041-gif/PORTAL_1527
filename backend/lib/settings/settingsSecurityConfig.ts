import crypto from "crypto";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";

// ==========================================
// CONSTANTS & POLICIES
// ==========================================
export const SETTINGS_UNLOCK_COOKIE = "settings_unlock";
export const SETTINGS_UNLOCK_TIMEOUT_MIN = 15; // 15-minute sliding inactivity timeout
export const MAX_SETTINGS_FAILED_ATTEMPTS = 5;
export const SETTINGS_LOCKOUT_MINUTES = 15;
export const BCRYPT_SALT_ROUNDS = 10;

export interface SettingsUnlockPayload {
  userId: string;
  sessionId?: string;
  passwordVersion: number;
  unlockedAt: number;
  expiresAt: number;
}

function getSecretKey(): string {
  return process.env.NEXTAUTH_SECRET || "srt-default-settings-security-secret-key-32b";
}

// ==========================================
// CRYPTOGRAPHIC TOKEN SIGNING & VERIFICATION
// ==========================================
export function signUnlockPayload(payload: SettingsUnlockPayload): string {
  const json = JSON.stringify(payload);
  const b64Payload = Buffer.from(json, "utf8").toString("base64url");
  const hmac = crypto.createHmac("sha256", getSecretKey());
  hmac.update(b64Payload);
  const signature = hmac.digest("base64url");
  return `${b64Payload}.${signature}`;
}

export function verifyUnlockToken(token: string): SettingsUnlockPayload | null {
  if (!token || !token.includes(".")) return null;
  const [b64Payload, signature] = token.split(".");
  if (!b64Payload || !signature) return null;

  try {
    const hmac = crypto.createHmac("sha256", getSecretKey());
    hmac.update(b64Payload);
    const expectedSig = hmac.digest("base64url");

    // Timing-safe comparison to prevent timing attacks
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) {
      return null;
    }

    const json = Buffer.from(b64Payload, "base64url").toString("utf8");
    const payload: SettingsUnlockPayload = JSON.parse(json);

    // Check expiration
    if (!payload.expiresAt || payload.expiresAt < Date.now()) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

// ==========================================
// DB BOOTSTRAP & RECORD RETRIEVAL
// ==========================================
export async function getOrCreateSettingsSecurity() {
  let security = await prisma.settingsSecurity.findFirst({
    orderBy: { updatedAt: "desc" },
  });

  if (!security) {
    // Read initial password once from environment variable
    const initialPlain = process.env.SETTINGS_INITIAL_PASSWORD;
    if (!initialPlain || initialPlain.trim().length === 0) {
      throw new Error(
        "SETTINGS_INITIAL_PASSWORD environment variable is not defined. Please set it in .env.local and Vercel."
      );
    }

    const passwordHash = await bcrypt.hash(initialPlain.trim(), BCRYPT_SALT_ROUNDS);
    security = await prisma.settingsSecurity.create({
      data: {
        passwordHash,
        passwordVersion: 1,
        failedAttempts: 0,
        lockedUntil: null,
      },
    });
  }

  return security;
}

// ==========================================
// SERVER-SIDE STATUS & UNLOCK CHECK
// ==========================================
export async function isSettingsUnlockedServer(): Promise<{
  unlocked: boolean;
  reason?: string;
  security?: any;
  payload?: SettingsUnlockPayload;
}> {
  const session = await getServerSession(getAuthOptions());
  if (!session || session.user?.role !== "ADMIN") {
    return { unlocked: false, reason: "unauthorized" };
  }

  const security = await getOrCreateSettingsSecurity();

  // If locked due to brute-force attempts
  if (security.lockedUntil && security.lockedUntil.getTime() > Date.now()) {
    return { unlocked: false, reason: "locked", security };
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(SETTINGS_UNLOCK_COOKIE)?.value;
  if (!token) {
    return { unlocked: false, reason: "missing_cookie", security };
  }

  const payload = verifyUnlockToken(token);
  if (!payload) {
    return { unlocked: false, reason: "invalid_or_expired_token", security };
  }

  // Must match current admin user id
  if (payload.userId !== session.user.id) {
    return { unlocked: false, reason: "user_mismatch", security };
  }

  // Must match current active login session if session tracking is active
  if (session.user.sessionId && payload.sessionId && payload.sessionId !== session.user.sessionId) {
    return { unlocked: false, reason: "session_mismatch", security };
  }

  // Must match current passwordVersion (invalidates all older cookies when password changes)
  if (payload.passwordVersion !== security.passwordVersion) {
    return { unlocked: false, reason: "password_version_mismatch", security };
  }

  return { unlocked: true, security, payload };
}

// ==========================================
// COOKIE MANAGEMENT (SLIDING EXPIRATION)
// ==========================================
export async function issueSettingsUnlockCookie(
  userId: string,
  sessionId?: string,
  passwordVersion = 1
): Promise<void> {
  const cookieStore = await cookies();
  const now = Date.now();
  const expiresAt = now + SETTINGS_UNLOCK_TIMEOUT_MIN * 60 * 1000;

  const payload: SettingsUnlockPayload = {
    userId,
    sessionId,
    passwordVersion,
    unlockedAt: now,
    expiresAt,
  };

  const token = signUnlockPayload(payload);

  cookieStore.set(SETTINGS_UNLOCK_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SETTINGS_UNLOCK_TIMEOUT_MIN * 60, // in seconds
  });
}

export async function clearSettingsUnlockCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SETTINGS_UNLOCK_COOKIE);
}

