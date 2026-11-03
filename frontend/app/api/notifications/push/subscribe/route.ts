import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session || !session.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { endpoint, keys, userAgent, deviceName } = body;

    if (!endpoint || !keys || !keys.p256dh || !keys.auth) {
      return NextResponse.json(
        { error: "Invalid subscription payload. Missing endpoint or keys." },
        { status: 400 }
      );
    }

    // Upsert subscription for the current user
    const subscription = await prisma.pushSubscription.upsert({
      where: { endpoint },
      create: {
        userId: session.user.id,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        userAgent: userAgent || null,
        deviceName: deviceName || "Web Browser",
      },
      update: {
        userId: session.user.id,
        p256dh: keys.p256dh,
        auth: keys.auth,
        userAgent: userAgent || null,
        deviceName: deviceName || "Web Browser",
      },
    });

    // Ensure user has default NotificationPreference record
    await prisma.notificationPreference.upsert({
      where: { userId: session.user.id },
      create: {
        userId: session.user.id,
        enabled: true,
        general: true,
        account: true,
        alerts: true,
        academic: true,
        admin: true,
        maintenance: true,
      },
      update: {},
    });

    return NextResponse.json({
      success: true,
      subscriptionId: subscription.id,
      message: "Push subscription registered successfully.",
    });
  } catch (error: unknown) {
    console.error("[Push API] Subscribe error:", error);
    return NextResponse.json(
      { error: "Internal server error while registering subscription." },
      { status: 500 }
    );
  }
}

