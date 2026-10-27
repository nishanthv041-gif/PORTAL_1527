import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";

export async function GET(request: Request) {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const otherUserId = searchParams.get("otherUserId");
    const since = searchParams.get("since");

    if (!otherUserId) {
      return NextResponse.json({ error: "otherUserId parameter is required" }, { status: 400 });
    }

    const currentUserId = session.user.id;

    // Check user conversation meta (clear history boundary)
    const meta = await prisma.conversationMeta.findUnique({
      where: {
        userId_otherUserId: {
          userId: currentUserId,
          otherUserId,
        }
      }
    });

    const clearedAt = meta?.clearedAt || null;

    // Build query conditions
    const conditions: any[] = [
      {
        OR: [
          { senderId: currentUserId, receiverId: otherUserId },
          { senderId: otherUserId, receiverId: currentUserId }
        ]
      },
      // Exclude messages hidden by "Delete for me"
      {
        NOT: {
          OR: [
            { senderId: currentUserId, deletedForSender: true },
            { receiverId: currentUserId, deletedForReceiver: true }
          ]
        }
      }
    ];

    if (clearedAt) {
      conditions.push({ createdAt: { gt: clearedAt } });
    }

    if (since) {
      const sinceDate = new Date(since);
      if (!isNaN(sinceDate.getTime())) {
        conditions.push({ createdAt: { gt: sinceDate } });
      }
    }

    const messages = await prisma.message.findMany({
      where: {
        AND: conditions,
      },
      orderBy: {
        createdAt: "asc",
      },
      select: {
        id: true,
        content: true,
        senderId: true,
        receiverId: true,
        isRead: true,
        isDeleted: true,
        messageType: true,
        fileUrl: true,
        fileName: true,
        fileSize: true,
        fileType: true,
        duration: true,
        editedAt: true,
        createdAt: true,
      }
    });

    // Mark unread received messages as read
    const unreadReceivedIds = messages
      .filter(m => m.receiverId === currentUserId && !m.isRead)
      .map(m => m.id);

    if (unreadReceivedIds.length > 0) {
      await prisma.message.updateMany({
        where: {
          id: { in: unreadReceivedIds }
        },
        data: {
          isRead: true
        }
      });
      // Reflect isRead in returned list
      unreadReceivedIds.forEach(id => {
        const found = messages.find(m => m.id === id);
        if (found) found.isRead = true;
      });
    }

    return NextResponse.json({
      messages,
      clearedAt,
    });
  } catch (error) {
    const e = error as Error;
    console.error("GET /api/messages/thread error:", e);
    return NextResponse.json({ error: e.message || "Failed to fetch messages" }, { status: 500 });
  }
}
