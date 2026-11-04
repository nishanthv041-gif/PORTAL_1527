import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import { sendPushToSubscription } from "@/backend/services/push/webPushService";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const targetEndpoint = body.endpoint;

    // Look for subscription matching targetEndpoint or user's latest registered device
    const sub = targetEndpoint
      ? await prisma.pushSubscription.findUnique({
          where: { endpoint: targetEndpoint },
        })
      : await prisma.pushSubscription.findFirst({
          where: { userId: session.user.id, isActive: true },
          orderBy: { lastUsedAt: "desc" },
        });

    if (!sub) {
      return NextResponse.json(
        { error: "No registered push subscription found for this device/user. Please enable notifications first." },
        { status: 404 }
      );
    }

    const result = await sendPushToSubscription(
      sub,
      {
        title: "Nipo Portal Test Notification",
        body: `Success! Real-time Web Push is connected to ${sub.deviceName || "your device"}.`,
        url: "/dashboard",
        priority: "URGENT",
      }
    );

    if (result.success) {
      return NextResponse.json({ success: true, message: "Push notification dispatched successfully." });
    } else {
      const isExpired = result.statusCode === 410 || result.statusCode === 404;
      return NextResponse.json(
        {
          success: false,
          expired: isExpired,
          error: isExpired
            ? "Push subscription expired on push service. Re-registering device..."
            : result.error || "Failed to deliver push notification.",
        },
        { status: isExpired ? 410 : 500 }
      );
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

