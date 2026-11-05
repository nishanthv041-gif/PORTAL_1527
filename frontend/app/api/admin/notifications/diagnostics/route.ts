export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import { getVapidPublicKey } from "@/backend/services/push/webPushService";

export async function GET() {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized. Admin credentials required." }, { status: 401 });
    }

    const vapidPublic = getVapidPublicKey();
    const vapidPrivateExists = !!(process.env.VAPID_PRIVATE_KEY || "ExZi6lTrD-JWJN9cqk88AA6Y8-vxTYaxwhaY4AUwMFc");
    const vapidSubject = process.env.VAPID_SUBJECT || "mailto:admin@nipoportal.com";

    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [
      totalSubscriptions,
      activeSubscriptions,
      boundSubscriptions,
      totalNotifications,
      deliveryLogs,
      inactiveUsersCount,
    ] = await Promise.all([
      prisma.pushSubscription.count(),
      prisma.pushSubscription.count({ where: { isActive: true } }),
      prisma.pushSubscription.count({ where: { userId: { not: null } } }),
      prisma.notification.count(),
      prisma.notificationDeliveryLog.groupBy({
        by: ["status"],
        _count: { status: true },
      }),
      prisma.user.count({
        where: {
          status: "ACTIVE",
          OR: [
            { lastLoginAt: null },
            { lastLoginAt: { lte: oneDayAgo } },
          ],
        },
      }),
    ]);

    return NextResponse.json({
      status: "HEALTHY",
      vapid: {
        configured: !!vapidPublic && vapidPrivateExists,
        publicKeyPreview: vapidPublic ? `${vapidPublic.slice(0, 10)}...${vapidPublic.slice(-6)}` : null,
        subject: vapidSubject,
      },
      subscriptions: {
        total: totalSubscriptions,
        active: activeSubscriptions,
        boundToUser: boundSubscriptions,
        anonymousDevice: totalSubscriptions - boundSubscriptions,
      },
      inactivity24h: {
        inactiveUsersCount,
        thresholdHours: 24,
      },
      notifications: {
        totalCreated: totalNotifications,
        deliveryLogs,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: unknown) {
    console.error("[Push Diagnostics] Error:", error);
    return NextResponse.json(
      { error: "Diagnostics probe failed", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
