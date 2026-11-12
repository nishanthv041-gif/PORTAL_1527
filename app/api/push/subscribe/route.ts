import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import { registerDevicePushSubscription } from "@/backend/services/push/nativePushDispatcher";
import { getVapidPublicKey } from "@/backend/services/push/webPushService";

function detectPlatform(userAgent?: string | null): string {
  if (!userAgent) return "Web";
  const ua = userAgent.toLowerCase();
  if (ua.includes("android")) return "Android";
  if (ua.includes("iphone") || ua.includes("ipad") || ua.includes("ipod")) return "iOS";
  if (ua.includes("windows")) return "Windows";
  if (ua.includes("macintosh") || ua.includes("mac os x")) return "macOS";
  if (ua.includes("linux")) return "Linux";
  return "Web";
}

export const dynamic = "force-dynamic";

export async function GET() {
  const publicKey = getVapidPublicKey();
  return NextResponse.json({ publicKey }, { status: 200 });
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(getAuthOptions());
    const authenticatedUserId = session?.user?.id || null;

    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json(
        { error: "Invalid JSON request payload." },
        { status: 400 }
      );
    }

    const {
      endpoint,
      keys,
      userAgent,
      deviceName,
      platform: rawPlatform,
      userId: bodyUserId,
      deviceFingerprint,
    } = body;

    if (!endpoint || typeof endpoint !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid subscription endpoint." },
        { status: 400 }
      );
    }

    if (!keys || typeof keys !== "object" || !keys.p256dh || !keys.auth) {
      return NextResponse.json(
        { error: "Invalid encryption keys. Both p256dh and auth are required." },
        { status: 400 }
      );
    }

    const detectedPlatform = rawPlatform || detectPlatform(userAgent);
    const resolvedDeviceName = deviceName || `${detectedPlatform} PWA`;

    const existingSub = await prisma.pushSubscription.findUnique({
      where: { endpoint },
    });

    const resolvedBodyUserId =
      typeof bodyUserId === "string" && bodyUserId.trim() ? bodyUserId.trim() : null;
    const finalUserId = authenticatedUserId || resolvedBodyUserId || existingSub?.userId || null;
    const now = new Date();

    const subscription = await prisma.pushSubscription.upsert({
      where: { endpoint },
      create: {
        userId: finalUserId,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        deviceFingerprint: typeof deviceFingerprint === "string" ? deviceFingerprint.trim() : null,
        userAgent: userAgent || null,
        deviceName: resolvedDeviceName,
        platform: detectedPlatform,
        isActive: true,
        lastLoginAt: now,
        lastUsedAt: now,
      },
      update: {
        ...(finalUserId ? { userId: finalUserId } : {}),
        p256dh: keys.p256dh,
        auth: keys.auth,
        deviceFingerprint: typeof deviceFingerprint === "string" ? deviceFingerprint.trim() : undefined,
        userAgent: userAgent || null,
        deviceName: resolvedDeviceName,
        platform: detectedPlatform,
        isActive: true,
        lastLoginAt: now,
        lastUsedAt: now,
      },
    });

    if (finalUserId) {
      try {
        await registerDevicePushSubscription({
          userId: finalUserId,
          endpoint,
          p256dh: keys.p256dh,
          auth: keys.auth,
          deviceId: typeof deviceFingerprint === "string" ? deviceFingerprint.trim() : undefined,
          deviceType: detectedPlatform,
        });
      } catch (regErr) {
        console.warn("[Push API] Could not mirror to device registry:", regErr);
      }
    }

    return NextResponse.json({
      success: true,
      subscriptionId: subscription.id,
      associatedUser: !!finalUserId,
      platform: detectedPlatform,
      lastLoginAt: now.toISOString(),
      message: finalUserId
        ? "Push notifications enabled. Device registered for active 48-hour delivery."
        : "Push notifications enabled for this device.",
    });
  } catch (error: unknown) {
    const errMessage = error instanceof Error ? error.message : "Internal server error";
    console.error("[Push API] Subscribe error:", error);
    return NextResponse.json(
      {
        error: "Database error while registering push subscription.",
        details: process.env.NODE_ENV === "development" ? errMessage : undefined,
      },
      { status: 500 }
    );
  }
}
