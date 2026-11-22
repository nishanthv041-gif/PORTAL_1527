import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { getToken } from "next-auth/jwt";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import { invalidateUserNotifCache } from "@/backend/api/actions/notifications/unifiedNotificationActions";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/notifications/read-all
 * Marks all unread notifications for the authenticated user as read.
 */
export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(getAuthOptions());
    const token = !session?.user?.id
      ? await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
      : null;

    const userId = session?.user?.id || (token?.id as string);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const now = new Date();
    const result = await prisma.notification.updateMany({
      where: {
        userId,
        isRead: false,
      },
      data: {
        isRead: true,
        readAt: now,
      },
    });

    await invalidateUserNotifCache(userId);

    return NextResponse.json({
      success: true,
      updatedCount: result.count,
      readAt: now.toISOString(),
    });
  } catch (error) {
    console.error("PATCH /api/notifications/read-all error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
