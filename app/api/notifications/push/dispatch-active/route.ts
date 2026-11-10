import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { dispatchPushToActiveDevicesLast24Hours } from "@/backend/services/push/webPushService";

export const dynamic = "force-dynamic";

/**
 * POST /api/notifications/push/dispatch-active
 * Triggers push notifications to devices active within the last 24 hours.
 * Secured by: Admin user session OR Bearer CRON_SECRET token.
 */
export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    const isCronAuthorized = cronSecret && authHeader === `Bearer ${cronSecret}`;

    let isAuthorized = Boolean(isCronAuthorized);

    if (!isAuthorized) {
      const session = await getServerSession(getAuthOptions());
      if (session && session.user.role === "ADMIN") {
        isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      return NextResponse.json(
        { error: "Unauthorized: Administrator session or valid Bearer CRON_SECRET required." },
        { status: 401 }
      );
    }

    const body = await req.json().catch(() => null);
    if (!body || !body.title || !body.body) {
      return NextResponse.json(
        { error: "Invalid payload: 'title' and 'body' are required string fields." },
        { status: 400 }
      );
    }

    const {
      title,
      body: messageBody,
      url,
      icon,
      badge,
      tag,
      userIds,
      role,
      maxAgeHours = 24,
    } = body;

    const result = await dispatchPushToActiveDevicesLast24Hours(
      {
        title,
        body: messageBody,
        url: url || "/dashboard",
        icon: icon || "/icons/icon-192x192.png",
        badge: badge || "/icons/icon-192x192.png",
        tag: tag || `active-push-${Date.now()}`,
      },
      {
        userIds: Array.isArray(userIds) ? userIds : undefined,
        role: typeof role === "string" ? role : undefined,
        maxAgeHours: typeof maxAgeHours === "number" ? maxAgeHours : 24,
      }
    );

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      ...result,
    });
  } catch (err: unknown) {
    console.error("[dispatch-active] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to dispatch active notifications." },
      { status: 500 }
    );
  }
}
