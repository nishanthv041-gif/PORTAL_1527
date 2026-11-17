import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import webpush from "web-push";

export const dynamic = "force-dynamic";

// Ensure VAPID keys are initialized
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
    const unreadCount = await prisma.notification.count({
      where: { userId, isRead: false },
    });

    // 2. Query all subscriptions for this user across push tables
    const [pushSubs, pwaSubs, registrySubs] = await Promise.all([
      prisma.pushSubscription.findMany({
        where: { userId, isActive: true },
        select: { id: true, endpoint: true, p256dh: true, auth: true, platform: true, deviceName: true },
      }),
      prisma.pwaSubscription.findMany({
        where: { userId },
        select: { id: true, endpoint: true, p256dhKey: true, authKey: true, deviceType: true },
      }),
      prisma.deviceNotificationsRegistry.findMany({
        where: { userId },
        select: { id: true, endpoint: true, p256dh: true, auth: true, deviceId: true },
      }),
    ]);

    // Deduplicate unique endpoints
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

    if (uniqueTargets.length === 0) {
      return NextResponse.json({
        success: false,
        error: "No push subscription registered for this user in PostgreSQL. Please enable notifications on this device first.",
        userId,
        userName,
        unreadCount,
        subscriptionsFound: 0,
        delivered: 0,
        failed: 0,
      }, { status: 404 });
    }

    // 3. Prepare payload with unreadCount for app icon badge
    const bodyPayload = await req.json().catch(() => ({}));
    const title = bodyPayload.title || "🔔 SRT Portal Test";
    const body = bodyPayload.body || bodyPayload.message || "Lock-Screen Push & WhatsApp Unread Badge is 100% operational!";
    const url = bodyPayload.url || "/dashboard";

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
      tag: `test-${Date.now()}`,
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

    let delivered = 0;
    let failed = 0;
    const deviceResults: Array<{ endpoint: string; status: "DELIVERED" | "FAILED"; statusCode?: number; error?: string }> = [];

    // 4. Send via webpush to all targets and collect errors
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

          delivered++;
          deviceResults.push({
            endpoint: target.endpoint.slice(0, 45) + "...",
            status: "DELIVERED",
            statusCode: res.statusCode || 201,
          });
        } catch (pushErr: any) {
          failed++;
          const statusCode = pushErr?.statusCode || 500;
          const errorMsg = pushErr?.message || pushErr?.body || "Failed to deliver push";

          deviceResults.push({
            endpoint: target.endpoint.slice(0, 45) + "...",
            status: "FAILED",
            statusCode,
            error: errorMsg,
          });

          // Auto-delete dead subscriptions on 404/410
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

    return NextResponse.json({
      success: delivered > 0,
      userId,
      userName,
      unreadCount,
      subscriptionsFound: uniqueTargets.length,
      delivered,
      failed,
      message: delivered > 0
        ? `Delivered push notification to ${delivered} device(s) successfully.`
        : `Push notification failed across all ${uniqueTargets.length} devices.`,
      deviceResults,
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
