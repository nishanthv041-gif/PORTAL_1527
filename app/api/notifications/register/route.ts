import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";

export const dynamic = "force-dynamic";

/**
 * POST /api/notifications/register
 * Registers or updates a device Web Push subscription tied to an active user session.
 * Tracks last_active_at for 24h targeting and multi-device support.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(getAuthOptions());
    const body = await req.json();

    const {
      endpoint,
      keys,
      device_type,
      deviceType,
      device_fingerprint,
      deviceFingerprint,
      userId: bodyUserId,
    } = body;

    const resolvedUserId = session?.user?.id || bodyUserId;
    if (!resolvedUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return NextResponse.json(
        { error: "Invalid subscription payload: endpoint, p256dh, and auth keys required" },
        { status: 400 }
      );
    }

    const type = device_type || deviceType || "BROWSER";
    const fingerprint = device_fingerprint || deviceFingerprint || null;
    const now = new Date();

    // Upsert into pwa_subscriptions
    await (prisma as any).pwaSubscription.upsert({
      where: { endpoint },
      create: {
        userId: resolvedUserId,
        endpoint,
        p256dhKey: keys.p256dh,
        authKey: keys.auth,
        deviceType: type,
        lastActiveAt: now,
      },
      update: {
        userId: resolvedUserId,
        p256dhKey: keys.p256dh,
        authKey: keys.auth,
        deviceType: type,
        lastActiveAt: now,
      },
    });

    // Also update legacy/pushSubscription table if present
    try {
      await prisma.pushSubscription.upsert({
        where: { endpoint },
        create: {
          userId: resolvedUserId,
          endpoint,
          p256dh: keys.p256dh,
          auth: keys.auth,
          deviceFingerprint: fingerprint,
          lastLoginAt: now,
        },
        update: {
          userId: resolvedUserId,
          p256dh: keys.p256dh,
          auth: keys.auth,
          deviceFingerprint: fingerprint || undefined,
          lastLoginAt: now,
        },
      });
    } catch {
      // Non-fatal if legacy table constraint differs
    }

    return NextResponse.json({
      success: true,
      message: "Push device registered successfully with 24-hour activity tracking.",
      lastActiveAt: now.toISOString(),
    });
  } catch (error: unknown) {
    console.error("[Push Notification Register Error]:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to register device subscription" },
      { status: 500 }
    );
  }
}

