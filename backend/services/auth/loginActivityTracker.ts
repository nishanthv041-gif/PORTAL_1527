import { prisma } from "@/backend/db/prisma";

export interface DeviceMetadata {
  userAgent?: string | null;
  ipAddress?: string | null;
  deviceId?: string | null;
}

export function parseUserAgent(userAgent?: string | null): {
  os: string;
  browser: string;
  deviceType: string;
} {
  if (!userAgent) {
    return { os: "Unknown OS", browser: "Unknown Browser", deviceType: "Desktop" };
  }

  const ua = userAgent.toLowerCase();

  // OS detection
  let os = "Unknown OS";
  if (ua.includes("android")) {
    os = "Android";
  } else if (ua.includes("iphone") || ua.includes("ipad") || ua.includes("ipod")) {
    os = "iOS";
  } else if (ua.includes("windows nt 10") || ua.includes("windows nt 11")) {
    os = "Windows";
  } else if (ua.includes("macintosh") || ua.includes("mac os x")) {
    os = "macOS";
  } else if (ua.includes("linux")) {
    os = "Linux";
  }

  // Browser detection
  let browser = "Web Browser";
  if (ua.includes("edg/")) {
    browser = "Edge";
  } else if (ua.includes("chrome/") && !ua.includes("edg/")) {
    browser = "Chrome";
  } else if (ua.includes("safari/") && !ua.includes("chrome/")) {
    browser = "Safari";
  } else if (ua.includes("firefox/")) {
    browser = "Firefox";
  }

  // Device type
  let deviceType = "Desktop";
  if (ua.includes("mobile") || ua.includes("android") || ua.includes("iphone")) {
    deviceType = "Mobile";
  } else if (ua.includes("tablet") || ua.includes("ipad")) {
    deviceType = "Tablet";
  }

  return { os, browser, deviceType };
}

/**
 * Record user login activity, update lastLoginAt, and reset inactivity counter
 */
export async function recordUserLogin(
  userId: string,
  metadata: DeviceMetadata,
  status: "SUCCESS" | "FAILED" = "SUCCESS"
) {
  try {
    const { os, browser, deviceType } = parseUserAgent(metadata.userAgent);

    // Run in parallel for high performance without slowing down login response
    await Promise.all([
      // 1. Update User timestamp
      prisma.user.update({
        where: { id: userId },
        data: {
          lastLoginAt: new Date(),
          lastActivityAt: new Date(),
        },
      }),
      // 2. Insert Login Activity Audit Record
      prisma.userLoginActivity.create({
        data: {
          userId,
          ipAddress: metadata.ipAddress || "Unknown",
          userAgent: metadata.userAgent || "Unknown",
          deviceId: metadata.deviceId || null,
          deviceType,
          browser,
          os,
          status,
        },
      }),
    ]);
  } catch (error) {
    console.error("[LoginActivityTracker] Failed to record user login:", error);
  }
}

/**
 * Check if a user has not logged in for >= 24 hours
 */
export async function checkUserInactivity(userId: string): Promise<{
  isInactive24h: boolean;
  hoursSinceLogin: number;
  lastLoginAt: Date | null;
}> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { lastLoginAt: true },
    });

    if (!user || !user.lastLoginAt) {
      return { isInactive24h: true, hoursSinceLogin: 999, lastLoginAt: null };
    }

    const elapsedMs = Date.now() - new Date(user.lastLoginAt).getTime();
    const hoursSinceLogin = elapsedMs / (1000 * 60 * 60);

    return {
      isInactive24h: hoursSinceLogin >= 24,
      hoursSinceLogin: Math.round(hoursSinceLogin * 10) / 10,
      lastLoginAt: user.lastLoginAt,
    };
  } catch (err) {
    console.error("[LoginActivityTracker] Error checking inactivity:", err);
    return { isInactive24h: true, hoursSinceLogin: 999, lastLoginAt: null };
  }
}

