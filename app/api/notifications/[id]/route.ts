import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { getToken } from "next-auth/jwt";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import { invalidateUserNotifCache } from "@/backend/api/actions/notifications/unifiedNotificationActions";

export const dynamic = "force-dynamic";

/**
 * DELETE /api/notifications/:id
 * Deletes a notification belonging to the authenticated user.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(getAuthOptions());
    const token = !session?.user?.id
      ? await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
      : null;

    const userId = session?.user?.id || (token?.id as string);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Missing notification ID" }, { status: 400 });
    }

    const existing = await prisma.notification.findUnique({
      where: { id },
      select: { id: true, userId: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "Notification not found" }, { status: 404 });
    }

    if (existing.userId !== userId) {
      return NextResponse.json({ error: "Forbidden: Not notification owner" }, { status: 403 });
    }

    await prisma.notification.delete({
      where: { id },
    });

    await invalidateUserNotifCache(userId);

    return NextResponse.json({
      success: true,
      deletedId: id,
    });
  } catch (error) {
    console.error("DELETE /api/notifications/:id error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
