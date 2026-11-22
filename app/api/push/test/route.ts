import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import { dispatchNotification } from "@/lib/dispatcher";
import { ONESIGNAL_APP_ID } from "@/backend/services/push/oneSignalService";

export const dynamic = "force-dynamic";

/**
 * POST /api/push/test
 * 
 * Production Test Push Endpoint.
 * Executes the EXACT same dispatchNotification() pipeline as real business events (OneSignal + WebPush),
 * guaranteeing that any successful test confirms the real event path.
 */
export async function POST(req: Request) {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session || !session.user || !session.user.id) {
      return NextResponse.json({ error: "Unauthorized. Please log in first." }, { status: 401 });
    }

    let bodyPayload: any = {};
    try {
      bodyPayload = await req.json();
    } catch {
      // If GET or empty body, parse query parameters
      const url = new URL(req.url);
      bodyPayload = {
        role: url.searchParams.get("role"),
        broadcast: url.searchParams.get("broadcast") === "true",
        title: url.searchParams.get("title"),
        body: url.searchParams.get("body") || url.searchParams.get("message"),
        url: url.searchParams.get("url"),
      };
    }

    const targetUserId = bodyPayload.targetUserId || session.user.id;
    const isBroadcast = Boolean(bodyPayload.broadcast);
    const targetRole = bodyPayload.role ? String(bodyPayload.role).toUpperCase() : undefined;
    const title = bodyPayload.title || "🔔 Portal Push Test";
    const body =
      bodyPayload.body ||
      bodyPayload.message ||
      "Unified Push Notification (OneSignal + WebPush) is operational on SRT Portal!";
    const url = bodyPayload.url || "/dashboard";

    let audience: { all?: boolean; admin?: boolean; teachers?: boolean; parents?: boolean; students?: boolean } | undefined = undefined;
    if (isBroadcast) {
      audience = { all: true };
    } else if (targetRole) {
      if (targetRole === "ADMIN") audience = { admin: true };
      else if (targetRole === "TEACHER") audience = { teachers: true };
      else if (targetRole === "PARENT") audience = { parents: true };
      else if (targetRole === "STUDENT") audience = { students: true };
    }

    // 1. Dispatch through the REAL unified pipeline
    const dispatchResult = await dispatchNotification({
      type: "TEST",
      recipients: (isBroadcast || targetRole) ? undefined : [targetUserId],
      audience,
      title,
      body,
      url,
      priority: "HIGH",
      tag: `test-${Date.now()}`,
    });

    // 2. Query latest delivery trace rows for immediate diagnostic feedback
    const latestTraces = await prisma.notificationDelivery.findMany({
      where: targetRole || isBroadcast ? {} : { recipientUserId: targetUserId },
      orderBy: { createdAt: "desc" },
      take: 5,
    });

    return NextResponse.json({
      success: dispatchResult.success,
      targetUserId: (isBroadcast || targetRole) ? null : targetUserId,
      targetRole: targetRole || (isBroadcast ? "ALL" : null),
      dispatchResult,
      oneSignalAppId: ONESIGNAL_APP_ID,
      deliveryTraces: latestTraces,
      message: dispatchResult.success
        ? "Push notification dispatched successfully through unified pipeline."
        : "Push dispatch failed. Check delivery traces and device registration.",
    });
  } catch (error: any) {
    console.error("[Push Test API] Error:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET(req: Request) {
  return POST(req);
}
