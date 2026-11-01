import crypto from "crypto";
import { prisma } from "@/backend/db/prisma";
import {
  SINGLE_DEVICE_ROLES,
  IDLE_TIMEOUT_HOURS,
  MAX_SESSION_HOURS,
  ACTIVITY_UPDATE_INTERVAL_MIN,
  SessionRevocationReason,
} from "./session-config";

export interface CreateSessionParams {
  userId: string;
  userRole: string;
  ipAddress?: string;
  deviceInfo?: string;
}

/**
 * Creates a new UserSession.
 * If user's role is in SINGLE_DEVICE_ROLES (Parent, Teacher), revokes ALL active
 * sessions for this user in a single atomic transaction with reason LOGIN_ELSEWHERE.
 */
export async function createUserSession({
  userId,
  userRole,
  ipAddress = "unknown",
  deviceInfo = "unknown",
}: CreateSessionParams) {
  const sessionId = crypto.randomBytes(32).toString("hex");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + IDLE_TIMEOUT_HOURS * 3600 * 1000);
  const normalizedRole = userRole?.toUpperCase() || "";

  if (SINGLE_DEVICE_ROLES.includes(normalizedRole)) {
    // Atomic race-safe transaction with row-level lock on User record
    return await prisma.$transaction(async (tx) => {
      // Serialize concurrent logins for this specific user in Postgres
      await tx.$executeRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;

      await tx.userSession.updateMany({
        where: {
          userId,
          revokedAt: null,
        },
        data: {
          revokedAt: now,
          revokedReason: "LOGIN_ELSEWHERE",
        },
      });

      return await tx.userSession.create({
        data: {
          userId,
          sessionId,
          deviceInfo: deviceInfo.slice(0, 500),
          ipAddress: ipAddress.slice(0, 100),
          createdAt: now,
          lastActiveAt: now,
          expiresAt,
        },
      });
    });
  }

  // Multi-session roles (e.g. ADMIN)
  return await prisma.userSession.create({
    data: {
      userId,
      sessionId,
      deviceInfo: deviceInfo.slice(0, 500),
      ipAddress: ipAddress.slice(0, 100),
      createdAt: now,
      lastActiveAt: now,
      expiresAt,
    },
  });
}

/**
 * Validates a session by sessionId against the database.
 * Enforces revoked status, idle timeout (6 hours), and optional absolute max session limit.
 */
export async function validateSession(sessionId: string) {
  if (!sessionId) {
    return { valid: false, reason: "LOGOUT" as SessionRevocationReason };
  }

  try {
    const session = await prisma.userSession.findUnique({
      where: { sessionId },
      include: {
        user: {
          select: {
            id: true,
            role: true,
            status: true,
            name: true,
            email: true,
            sessionVersion: true,
          },
        },
      },
    });

    if (!session) {
      return { valid: false, reason: "LOGOUT" as SessionRevocationReason };
    }

    if (session.revokedAt) {
      return {
        valid: false,
        reason: (session.revokedReason as SessionRevocationReason) || "LOGOUT",
        revokedAt: session.revokedAt,
      };
    }

    if (session.user?.status === "INACTIVE") {
      await revokeSession(sessionId, "ADMIN_FORCED");
      return { valid: false, reason: "ADMIN_FORCED" as SessionRevocationReason };
    }

    const now = Date.now();
    const lastActiveTime = new Date(session.lastActiveAt).getTime();
    const idleLimitMs = IDLE_TIMEOUT_HOURS * 3600 * 1000;

    // Check idle timeout
    if (now - lastActiveTime > idleLimitMs) {
      await revokeSession(sessionId, "IDLE_TIMEOUT");
      return { valid: false, reason: "IDLE_TIMEOUT" as SessionRevocationReason };
    }

    // Check max session hours if configured
    if (MAX_SESSION_HOURS && MAX_SESSION_HOURS > 0) {
      const createdTime = new Date(session.createdAt).getTime();
      const maxLimitMs = MAX_SESSION_HOURS * 3600 * 1000;
      if (now - createdTime > maxLimitMs) {
        await revokeSession(sessionId, "MAX_TIME");
        return { valid: false, reason: "MAX_TIME" as SessionRevocationReason };
      }
    }

    // Check expiresAt
    if (now > new Date(session.expiresAt).getTime()) {
      await revokeSession(sessionId, "IDLE_TIMEOUT");
      return { valid: false, reason: "IDLE_TIMEOUT" as SessionRevocationReason };
    }

    return { valid: true, session, user: session.user };
  } catch (error) {
    console.error("[SessionManager] validateSession error:", error);
    // On temporary DB connection error, don't arbitrarily logout unless confirmed
    return { valid: true, error };
  }
}

/**
 * Updates lastActiveAt and extends expiresAt.
 * Throttled: only writes to DB if at least ACTIVITY_UPDATE_INTERVAL_MIN minutes have passed.
 */
export async function recordSessionActivity(sessionId: string) {
  if (!sessionId) return;

  try {
    const session = await prisma.userSession.findUnique({
      where: { sessionId },
      select: { id: true, lastActiveAt: true, revokedAt: true },
    });

    if (!session || session.revokedAt) return;

    const now = new Date();
    const lastActiveTime = new Date(session.lastActiveAt).getTime();
    const throttleMs = ACTIVITY_UPDATE_INTERVAL_MIN * 60 * 1000;

    if (now.getTime() - lastActiveTime < throttleMs) {
      return; // Throttled: skip DB write
    }

    const newExpiresAt = new Date(now.getTime() + IDLE_TIMEOUT_HOURS * 3600 * 1000);

    await prisma.userSession.update({
      where: { id: session.id },
      data: {
        lastActiveAt: now,
        expiresAt: newExpiresAt,
      },
    });
  } catch (error) {
    console.error("[SessionManager] recordSessionActivity error:", error);
  }
}

/**
 * Revokes a single session by sessionId.
 */
export async function revokeSession(
  sessionId: string,
  reason: SessionRevocationReason = "LOGOUT"
) {
  if (!sessionId) return;
  try {
    await prisma.userSession.updateMany({
      where: { sessionId, revokedAt: null },
      data: {
        revokedAt: new Date(),
        revokedReason: reason,
      },
    });
  } catch (error) {
    console.error("[SessionManager] revokeSession error:", error);
  }
}

/**
 * Revokes all sessions for a user (e.g. Password Change or Admin Force Logout).
 */
export async function revokeAllUserSessions(
  userId: string,
  reason: SessionRevocationReason = "PASSWORD_CHANGED"
) {
  if (!userId) return;
  try {
    await prisma.$transaction([
      prisma.userSession.updateMany({
        where: { userId, revokedAt: null },
        data: {
          revokedAt: new Date(),
          revokedReason: reason,
        },
      }),
      prisma.user.update({
        where: { id: userId },
        data: { sessionVersion: { increment: 1 } },
      }),
    ]);
  } catch (error) {
    console.error("[SessionManager] revokeAllUserSessions error:", error);
  }
}

/**
 * Gets active sessions for a user (for Admin view).
 */
export async function getUserActiveSessions(userId: string) {
  try {
    return await prisma.userSession.findMany({
      where: {
        userId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { lastActiveAt: "desc" },
      select: {
        id: true,
        sessionId: true,
        deviceInfo: true,
        ipAddress: true,
        createdAt: true,
        lastActiveAt: true,
        expiresAt: true,
      },
    });
  } catch (error) {
    console.error("[SessionManager] getUserActiveSessions error:", error);
    return [];
  }
}

/**
 * Cleanup expired or revoked sessions older than 30 days.
 */
export async function cleanupExpiredSessions() {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  try {
    const res = await prisma.userSession.deleteMany({
      where: {
        OR: [
          { revokedAt: { lte: thirtyDaysAgo } },
          { expiresAt: { lte: thirtyDaysAgo } },
        ],
      },
    });
    return res.count;
  } catch (error) {
    console.error("[SessionManager] cleanupExpiredSessions error:", error);
    return 0;
  }
}

