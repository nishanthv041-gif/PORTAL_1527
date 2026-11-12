import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { sendNotificationToActiveDevices } from "@/backend/services/push/nativePushDispatcher";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session || !session.user || !session.user.id) {
      return NextResponse.json({ error: "Unauthorized. Please log in first." }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const title = body?.title || "🔔 SRT Universal School Alert";
    const message = body?.message || "Test Notification: Active 48-hour device targeting is fully operational!";
    const url = body?.url || "/dashboard";

    const result = await sendNotificationToActiveDevices(session.user.id, {
      title,
      body: message,
      url,
      icon: "/icons/icon-192x192.png",
      badge: "/icons/icon-192x192.png",
      tag: `test-${Date.now()}`,
    });

    return NextResponse.json({
      success: true,
      userId: session.user.id,
      targetedEligibleDevices: result.eligible,
      deliveredDevices: result.sent,
      failedDevices: result.failed,
      message: result.eligible > 0
        ? `Delivered native push alert to ${result.sent} active device(s) logged in within the last 48 hours.`
        : "No active devices logged in within the last 48 hours for this user. Enable notifications on your device first.",
    });
  } catch (error: unknown) {
    const errMessage = error instanceof Error ? error.message : "Internal server error";
    console.error("[Push API] Test dispatch error:", error);
    return NextResponse.json({ error: errMessage }, { status: 500 });
  }
}

export async function GET() {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session || !session.user || !session.user.id) {
      return NextResponse.json({ error: "Unauthorized. Please log in first." }, { status: 401 });
    }

    const result = await sendNotificationToActiveDevices(session.user.id, {
      title: "🔔 SRT Universal School Alert",
      body: "Test Notification: Active 48-hour device targeting is fully operational!",
      url: "/dashboard",
      icon: "/icons/icon-192x192.png",
      badge: "/icons/icon-192x192.png",
      tag: `test-get-${Date.now()}`,
    });

    return NextResponse.json({
      success: true,
      userId: session.user.id,
      targetedEligibleDevices: result.eligible,
      deliveredDevices: result.sent,
      failedDevices: result.failed,
      message: result.eligible > 0
        ? `Delivered native push alert to ${result.sent} active device(s) logged in within the last 48 hours.`
        : "No active devices logged in within the last 48 hours for this user. Enable notifications on your device first.",
    });
  } catch (error: unknown) {
    const errMessage = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: errMessage }, { status: 500 });
  }
}
