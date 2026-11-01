import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session?.user?.id) {
      return NextResponse.json({ unreadCount: 0, hasBusAlert: false }, { status: 401 });
    }

    const userId = session.user.id;

    const [unreadCount, busAlertCount] = await Promise.all([
      prisma.notification.count({
        where: { userId, isRead: false },
      }),
      prisma.notification.count({
        where: { userId, isRead: false, category: "BUS" },
      }),
    ]);

    return NextResponse.json({
      success: true,
      unreadCount,
      hasBusAlert: busAlertCount > 0,
      busAlertCount,
    });
  } catch (error: any) {
    console.error("GET /api/notifications/unread-count error:", error);
    return NextResponse.json({ unreadCount: 0, hasBusAlert: false }, { status: 500 });
  }
}

