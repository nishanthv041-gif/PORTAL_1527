import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
    }

    const {
      platform = "WEB",
      token,
      endpoint,
      keys,
      deviceName,
      userAgent,
      deviceFingerprint,
    } = body;

    const normalizedPlatform = (platform || "WEB").toUpperCase();
    const effectiveToken = token || endpoint;
    const effectiveEndpoint = endpoint || (token ? `fcm:${token}` : null);

    if (!effectiveEndpoint) {
      return NextResponse.json(
        { error: "Token or endpoint is required for push registration." },
        { status: 400 }
      );
    }

    const now = new Date();

    const subscription = await prisma.pushSubscription.upsert({
      where: { endpoint: effectiveEndpoint },
      create: {
        userId: session.user.id,
        platform: normalizedPlatform,
        token: effectiveToken,
        endpoint: effectiveEndpoint,
        p256dh: keys?.p256dh || null,
        auth: keys?.auth || null,
        deviceName: deviceName || (normalizedPlatform === "ANDROID" ? "Android Capacitor App" : "Web / iOS Safari PWA"),
        userAgent: userAgent || null,
        deviceFingerprint: deviceFingerprint || null,
        isActive: true,
        lastLoginAt: now,
        lastUsedAt: now,
      },
      update: {
        userId: session.user.id,
        platform: normalizedPlatform,
        token: effectiveToken,
        p256dh: keys?.p256dh || undefined,
        auth: keys?.auth || undefined,
        deviceName: deviceName || undefined,
        userAgent: userAgent || undefined,
        deviceFingerprint: deviceFingerprint || undefined,
        isActive: true,
        lastLoginAt: now,
        lastUsedAt: now,
      },
    });

    // Deactivate stale subscriptions on the same physical device to prevent duplicate push alerts
    if (deviceFingerprint) {
      await prisma.pushSubscription.updateMany({
        where: {
          userId: session.user.id,
          deviceFingerprint,
          endpoint: { not: effectiveEndpoint },
        },
        data: { isActive: false },
      }).catch(() => {});
    }

    return NextResponse.json({
      success: true,
      subscriptionId: subscription.id,
      platform: normalizedPlatform,
      message: "Device registered for push notifications successfully.",
    });
  } catch (err: any) {
    console.error("[PushRegister] Error registering push subscription:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to register push subscription." },
      { status: 500 }
    );
  }
}
