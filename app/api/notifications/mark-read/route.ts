import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import { invalidateUserNotifCache } from "@/backend/api/actions/notifications/unifiedNotificationActions";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(getAuthOptions());
    const body = await req.json().catch(() => ({}));
    const { notificationId, markAll = false } = body;

    const targetUserId = session?.user?.id;

    if (markAll && targetUserId) {
      await prisma.notification.updateMany({
        where: { userId: targetUserId, isRead: false },
        data: { isRead: true },
      });
      await invalidateUserNotifCache(targetUserId);
      return NextResponse.json({ success: true, markedAll: true });
    }

    if (notificationId) {
      await prisma.notification.updateMany({
        where: {
          id: notificationId,
          ...(targetUserId ? { userId: targetUserId } : {}),
        },
        data: { isRead: true },
      });

      if (targetUserId) {
        await invalidateUserNotifCache(targetUserId);
      }
      return NextResponse.json({ success: true, notificationId });
    }

    return NextResponse.json({ error: "Missing notificationId or markAll flag" }, { status: 400 });
  } catch (error) {
    console.error("POST /api/notifications/mark-read error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
