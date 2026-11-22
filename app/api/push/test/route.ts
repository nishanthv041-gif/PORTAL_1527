import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import webpush from "web-push";
import { sendOneSignalPush, ONESIGNAL_APP_ID } from "@/backend/services/push/oneSignalService";
import { dispatchNotification } from "@/lib/dispatcher";

export const dynamic = "force-dynamic";

// Ensure VAPID keys are initialized as auxiliary fallback
const VAPID_PUBLIC_KEY =
  process.env.VAPID_PUBLIC_KEY ||
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
  "BBIHzbc-DVhlpPB_plCE0gUMpCSsHiqA1Y5FVyP-ax6p0HWnFZILFISth4FYfyAp0gywswCBxz4GfDnXm_c-Agk";

const VAPID_PRIVATE_KEY =
  process.env.VAPID_PRIVATE_KEY ||
  "ExZi6lTrD-JWJN9cqk88AA6Y8-vxTYaxwhaY4AUwMFc";

const VAPID_SUBJECT =
  process.env.VAPID_SUBJECT || "mailto:admin@nipoportal.com";

try {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
} catch (err) {
  console.warn("[Push Test API] VAPID initialization warning:", err);
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session || !session.user || !session.user.id) {
      return NextResponse.json({ error: "Unauthorized. Please log in first." }, { status: 401 });
    }

    const userId = session.user.id;
    const userName = session.user.name || "User";

    // 1. Calculate recipient's exact unread notification count from PostgreSQL
    let unreadCount = 1;
    try {
      const [unreadNotifs, unreadMsgs] = await Promise.all([
        prisma.notification.count({ where: { userId, isRead: false } }),
        prisma.message.count({ where: { receiverId: userId, isRead: false } }),
      ]);
      unreadCount = Math.max(1, unreadNotifs + unreadMsgs);
    } catch {
      unreadCount = 1;
    }

    const bodyPayload = await req.json().catch(() => ({}));
    const isBroadcast = Boolean(bodyPayload.broadcast);
    const title = bodyPayload.title || "🔔 Portal Push Test";
    const body =
      bodyPayload.body ||
      bodyPayload.message ||
      "OneSignal Web Push & direct WebPush are operational on SRT Portal!";
    const url = bodyPayload.url || "/dashboard";

    // 2. Primary Dispatch: OneSignal REST API
    const oneSignalResult = await sendOneSignalPush({
      userId,
      broadcast: isBroadcast,
      title,
      body,
      url,
      unreadCount,
      category: "TEST",
    });

    // 3. Auxiliary Dispatch: Direct Web Push to subscriptions in PostgreSQL (fallback)
    const [pushSubs, pwaSubs, registrySubs] = await Promise.all([
      prisma.pushSubscription.findMany({
        where: isBroadcast ? { isActive: true } : { userId, isActive: true },
        select: { id: true, endpoint: true, p256dh: true, auth: true, platform: true, deviceName: true },
      }),
      prisma.pwaSubscription.findMany({
        where: isBroadcast ? {} : { userId },
        select: { id: true, endpoint: true, p256dhKey: true, authKey: true, deviceType: true },
      }).catch(() => []),
      prisma.deviceNotificationsRegistry.findMany({
        where: isBroadcast ? {} : { userId },
        select: { id: true, endpoint: true, p256dh: true, auth: true, deviceId: true },
      }).catch(() => []),
    ]);

    const targetMap = new Map<string, { endpoint: string; p256dh: string; auth: string; source: string; platform: string }>();

    for (const sub of pushSubs) {
      if (sub.endpoint && sub.p256dh && sub.auth) {
        targetMap.set(sub.endpoint, {
          endpoint: sub.endpoint,
          p256dh: sub.p256dh,
          auth: sub.auth,
          source: "pushSubscription",
          platform: sub.platform || "WEB",
        });
      }
    }

    for (const sub of pwaSubs) {
      if (sub.endpoint && sub.p256dhKey && sub.authKey && !targetMap.has(sub.endpoint)) {
        targetMap.set(sub.endpoint, {
          endpoint: sub.endpoint,
          p256dh: sub.p256dhKey,
          auth: sub.authKey,
          source: "pwaSubscription",
          platform: sub.deviceType?.toUpperCase() === "IOS" ? "IOS" : "WEB",
        });
      }
    }

    for (const sub of registrySubs) {
      if (sub.endpoint && sub.p256dh && sub.auth && !targetMap.has(sub.endpoint)) {
        targetMap.set(sub.endpoint, {
          endpoint: sub.endpoint,
          p256dh: sub.p256dh,
          auth: sub.auth,
          source: "deviceRegistry",
          platform: "WEB",
        });
      }
    }

    const uniqueTargets = Array.from(targetMap.values());
    let webPushDelivered = 0;
    let webPushFailed = 0;
    const deviceResults: Array<{ endpoint: string; status: "DELIVERED" | "FAILED"; statusCode?: number; error?: string }> = [];

    if (uniqueTargets.length > 0) {
      const payload = JSON.stringify({
        title,
        body,
        url,
        unreadCount,
        badgeCount: unreadCount,
        icon: "/icon-192x192.png",
        badge: "/badge-72x72.png",
        vibrate: [200, 100, 200],
        requireInteraction: true,
        renotify: true,
        tag: `test-${userId}`,
        data: {
          url,
          unreadCount,
          timestamp: Date.now(),
        },
      });

      const webOptions = {
        TTL: 60,
        urgency: "high" as const,
        headers: {
          Urgency: "high",
        },
      };

      await Promise.allSettled(
        uniqueTargets.map(async (target) => {
          try {
            const res = await webpush.sendNotification(
              {
                endpoint: target.endpoint,
                keys: {
                  p256dh: target.p256dh,
                  auth: target.auth,
                },
              },
              payload,
              webOptions
            );

            webPushDelivered++;
            deviceResults.push({
              endpoint: target.endpoint.slice(0, 45) + "...",
              status: "DELIVERED",
              statusCode: res.statusCode || 201,
            });
          } catch (pushErr: any) {
            webPushFailed++;
            const statusCode = pushErr?.statusCode || 500;
            const errorMsg = pushErr?.message || pushErr?.body || "Failed to deliver push";

            deviceResults.push({
              endpoint: target.endpoint.slice(0, 45) + "...",
              status: "FAILED",
              statusCode,
              error: errorMsg,
            });

            if (statusCode === 404 || statusCode === 410) {
              await Promise.allSettled([
                prisma.pushSubscription.deleteMany({ where: { endpoint: target.endpoint } }),
                prisma.pwaSubscription.deleteMany({ where: { endpoint: target.endpoint } }),
                prisma.deviceNotificationsRegistry.deleteMany({ where: { endpoint: target.endpoint } }),
              ]);
            }
          }
        })
      );
    }

    const overallSuccess = oneSignalResult.success || webPushDelivered > 0;

    return NextResponse.json({
      success: overallSuccess,
      userId,
      userName,
      unreadCount,
      oneSignal: {
        appId: ONESIGNAL_APP_ID,
        externalId: userId,
        result: oneSignalResult,
      },
      webPush: {
        subscriptionsFound: uniqueTargets.length,
        delivered: webPushDelivered,
        failed: webPushFailed,
        deviceResults,
      },
      message: overallSuccess
        ? "Push notification dispatched successfully."
        : "Push dispatch complete.",
    });
  } catch (error: unknown) {
    const errMessage = error instanceof Error ? error.message : "Internal server error";
    console.error("[Push Test API] Error:", error);
    return NextResponse.json({ success: false, error: errMessage }, { status: 500 });
  }
}

export async function GET() {
  return POST(new Request("https://localhost/api/push/test", { method: "POST" }));
}
