import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import { dispatchNotification, processNotificationOutbox } from "@/lib/dispatcher";
import { ONESIGNAL_APP_ID } from "@/backend/services/push/oneSignalService";

export const dynamic = "force-dynamic";

/**
 * GET /api/push/diagnostics
 * 
 * Secure Admin Diagnostic Health Check for Universal Push Notifications.
 * Supports:
 * - Runtime Environment Variables Audit (Lengths and Presence ONLY - Zero Secrets)
 * - Multi-Channel Subscription Statistics
 * - Per-User Deep Diagnostic Lookup (OneSignal external_id + WebPush subscriptions)
 * - Latest Delivery Trace Logs (with filters: type, status, user)
 */
export async function GET(req: Request) {
  try {
    const session = await getServerSession(getAuthOptions());
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    const isCronAuthed = cronSecret && authHeader === `Bearer ${cronSecret}`;

    if (!isCronAuthed && (!session || !session.user || session.user.role !== "ADMIN")) {
      return NextResponse.json({ error: "Unauthorized. Admin access required." }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const targetUserId = searchParams.get("userId");
    const statusFilter = searchParams.get("status");
    const typeFilter = searchParams.get("type");

    // 1. Runtime Environment Variables Audit (Lengths only, NO raw secrets)
    const envVars = {
      ONESIGNAL_APP_ID: {
        present: Boolean(process.env.ONESIGNAL_APP_ID),
        length: process.env.ONESIGNAL_APP_ID ? process.env.ONESIGNAL_APP_ID.length : 0,
      },
      NEXT_PUBLIC_ONESIGNAL_APP_ID: {
        present: Boolean(process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID),
        length: process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID ? process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID.length : 0,
      },
      ONESIGNAL_REST_API_KEY: {
        present: Boolean(process.env.ONESIGNAL_REST_API_KEY),
        length: process.env.ONESIGNAL_REST_API_KEY ? process.env.ONESIGNAL_REST_API_KEY.length : 0,
      },
      VAPID_PUBLIC_KEY: {
        present: Boolean(process.env.VAPID_PUBLIC_KEY),
        length: process.env.VAPID_PUBLIC_KEY ? process.env.VAPID_PUBLIC_KEY.length : 0,
      },
      NEXT_PUBLIC_VAPID_PUBLIC_KEY: {
        present: Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY),
        length: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ? process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY.length : 0,
      },
      VAPID_PRIVATE_KEY: {
        present: Boolean(process.env.VAPID_PRIVATE_KEY),
        length: process.env.VAPID_PRIVATE_KEY ? process.env.VAPID_PRIVATE_KEY.length : 0,
      },
      VAPID_SUBJECT: {
        present: Boolean(process.env.VAPID_SUBJECT),
        length: process.env.VAPID_SUBJECT ? process.env.VAPID_SUBJECT.length : 0,
      },
      FIREBASE_SERVICE_ACCOUNT: {
        present: Boolean(process.env.FIREBASE_SERVICE_ACCOUNT),
        length: process.env.FIREBASE_SERVICE_ACCOUNT ? process.env.FIREBASE_SERVICE_ACCOUNT.length : 0,
      },
      DATABASE_URL: {
        present: Boolean(process.env.DATABASE_URL),
        length: process.env.DATABASE_URL ? process.env.DATABASE_URL.length : 0,
      },
    };

    // 2. Multi-Channel Device Subscription Breakdown
    const [
      totalPushSubs,
      activePushSubs,
      androidSubs,
      iosSubs,
      webSubs,
      pwaSubCount,
      deviceRegistryCount,
      recentDeliveries,
      outboxPendingCount,
    ] = await Promise.all([
      prisma.pushSubscription.count(),
      prisma.pushSubscription.count({ where: { isActive: true } }),
      prisma.pushSubscription.count({ where: { isActive: true, platform: "Android" } }),
      prisma.pushSubscription.count({ where: { isActive: true, platform: "iOS" } }),
      prisma.pushSubscription.count({ where: { isActive: true, platform: "Web" } }),
      prisma.pwaSubscription.count().catch(() => 0),
      prisma.deviceNotificationsRegistry.count().catch(() => 0),
      prisma.notificationDelivery.findMany({
        where: {
          ...(targetUserId ? { recipientUserId: targetUserId } : {}),
          ...(statusFilter ? { status: statusFilter } : {}),
          ...(typeFilter ? { eventType: typeFilter } : {}),
        },
        take: 30,
        orderBy: { createdAt: "desc" },
      }).catch(() => []),
      prisma.notificationOutbox.count({ where: { status: "PENDING" } }).catch(() => 0),
    ]);

    // 3. Optional Per-User Diagnostics
    let userDetails = null;
    if (targetUserId) {
      const user = await prisma.user.findUnique({
        where: { id: targetUserId },
        select: { id: true, name: true, email: true, role: true, notificationsEnabled: true, status: true },
      });

      if (user) {
        const userSubs = await prisma.pushSubscription.findMany({
          where: { userId: user.id },
          select: {
            id: true,
            platform: true,
            endpoint: true,
            isActive: true,
            lastLoginAt: true,
            updatedAt: true,
          },
        });

        // Query OneSignal API for user's subscriptions
        let oneSignalStatus: any = { checked: false };
        const apiKey = process.env.ONESIGNAL_REST_API_KEY;
        if (apiKey && ONESIGNAL_APP_ID) {
          try {
            const cleanKey = apiKey.trim().replace(/^["']|["']$/g, "").trim();
            const authHeader = cleanKey.startsWith("Key ") || cleanKey.startsWith("Basic ") ? cleanKey : `Key ${cleanKey}`;
            const osRes = await fetch(
              `https://api.onesignal.com/apps/${ONESIGNAL_APP_ID}/users/by/external_id/${encodeURIComponent(user.id)}`,
              {
                headers: {
                  Authorization: authHeader,
                  "Content-Type": "application/json",
                },
                signal: AbortSignal.timeout(3000),
              }
            );

            if (osRes.ok) {
              const osData = await osRes.json();
              oneSignalStatus = {
                checked: true,
                found: true,
                subscriptionsCount: osData.subscriptions?.length || 0,
                subscriptions: (osData.subscriptions || []).map((s: any) => ({
                  id: s.id,
                  type: s.type,
                  optedIn: s.opted_in,
                  status: s.notification_types,
                })),
              };
            } else {
              oneSignalStatus = {
                checked: true,
                found: false,
                statusCode: osRes.status,
              };
            }
          } catch (osErr: any) {
            oneSignalStatus = { checked: true, error: osErr?.message };
          }
        }

        userDetails = {
          user,
          webPushSubscriptions: userSubs.map((s) => ({
            ...s,
            endpoint: s.endpoint.slice(0, 45) + "...",
          })),
          oneSignalStatus,
        };
      }
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      runtimeEnvironment: envVars,
      subscriptions: {
        primaryPushSubscriptions: {
          total: totalPushSubs,
          active: activePushSubs,
          android: androidSubs,
          ios: iosSubs,
          web: webSubs,
        },
        pwaSubscriptionsTable: pwaSubCount,
        deviceRegistryTable: deviceRegistryCount,
      },
      outbox: {
        pendingCount: outboxPendingCount,
      },
      deliveryTrace: {
        recentCount: recentDeliveries.length,
        latestDeliveries: recentDeliveries,
      },
      userDetails,
    });
  } catch (err: any) {
    console.error("[Push Diagnostics API] Error:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to generate push diagnostics." },
      { status: 500 }
    );
  }
}

/**
 * POST /api/push/diagnostics
 * 
 * Diagnostic Actions:
 * - action: "send_test" (Sends real test push to target user via dispatchNotification)
 * - action: "retry_outbox" (Drains pending outbox items)
 * - action: "prune_dead" (Deletes dead/expired subscriptions)
 */
export async function POST(req: Request) {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session || !session.user || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized. Admin required." }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const action = body.action;

    if (action === "send_test") {
      const targetUserId = body.userId || session.user.id;
      const result = await dispatchNotification({
        type: "TEST",
        recipients: [targetUserId],
        title: "🔔 Diagnostics Test Push",
        body: "Real-pipeline push alert dispatched from Admin Diagnostics.",
        url: "/dashboard/admin/notifications/diagnostics",
        priority: "HIGH",
        tag: `diag-${targetUserId}-${Date.now()}`,
      });

      return NextResponse.json({
        success: result.success,
        action: "send_test",
        result,
      });
    }

    if (action === "retry_outbox") {
      const result = await processNotificationOutbox();
      return NextResponse.json({
        success: true,
        action: "retry_outbox",
        result,
      });
    }

    if (action === "prune_dead") {
      const [prunedPush, prunedPwa, prunedRegistry] = await Promise.all([
        prisma.pushSubscription.deleteMany({
          where: {
            OR: [{ isActive: false }, { endpoint: "" }],
          },
        }),
        prisma.pwaSubscription.deleteMany({
          where: { endpoint: "" },
        }).catch(() => ({ count: 0 })),
        prisma.deviceNotificationsRegistry.deleteMany({
          where: { endpoint: "" },
        }).catch(() => ({ count: 0 })),
      ]);

      return NextResponse.json({
        success: true,
        action: "prune_dead",
        prunedCount: prunedPush.count + prunedPwa.count + prunedRegistry.count,
      });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error: any) {
    console.error("[Push Diagnostics API POST] Error:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Action failed" },
      { status: 500 }
    );
  }
}
