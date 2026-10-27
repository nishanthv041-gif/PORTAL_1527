import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import { invalidateUserNotifCache } from "@/backend/api/actions/notifications/unifiedNotificationActions";

export async function POST(request: Request) {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { 
      receiverId, 
      content, 
      messageType = "TEXT", 
      fileUrl = null, 
      fileName = null, 
      fileSize = null, 
      fileType = null, 
      duration = null,
      clientTempId = null
    } = body;

    if (!receiverId) {
      return NextResponse.json({ error: "Receiver ID is required" }, { status: 400 });
    }

    const cleanContent = (content || "").trim();
    if (!cleanContent && !fileUrl && messageType === "TEXT") {
      return NextResponse.json({ error: "Message content or attachment is required" }, { status: 400 });
    }

    // Verify recipient exists
    const receiver = await prisma.user.findUnique({
      where: { id: receiverId },
      select: { id: true, role: true, name: true }
    });

    if (!receiver) {
      return NextResponse.json({ error: "Recipient not found" }, { status: 404 });
    }

    // Admins can only message teachers and parents
    if (session.user.role === "ADMIN" && receiver.role !== "TEACHER" && receiver.role !== "PARENT") {
      return NextResponse.json({ error: "Admins can only message teachers and parents." }, { status: 403 });
    }

    const finalContent = cleanContent || (messageType === "AUDIO" ? "🎤 Voice message" : fileName ? `📎 ${fileName}` : "Attachment");

    const message = await prisma.message.create({
      data: {
        senderId: session.user.id,
        receiverId,
        content: finalContent,
        messageType,
        fileUrl,
        fileName,
        fileSize,
        fileType,
        duration,
        isRead: false,
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

    // Fire notification asynchronously in background (non-blocking)
    (async () => {
      try {
        let recipientLink = `/dashboard/parent/messages/${session.user.id}`;
        if (receiver.role === "TEACHER") {
          recipientLink = `/dashboard/teacher/messages/${session.user.id}`;
        } else if (receiver.role === "ADMIN") {
          recipientLink = `/dashboard/admin/messages/${session.user.id}`;
        }

        const senderRoleLabel = session.user.role === "ADMIN" 
          ? "School Administration" 
          : session.user.role === "TEACHER" 
            ? "Faculty Teacher" 
            : "Parent";

        const previewSnippet = messageType === "AUDIO" 
          ? "Sent a voice message" 
          : fileUrl 
            ? `Sent an attachment: ${fileName || "file"}` 
            : cleanContent.length > 100 
              ? cleanContent.slice(0, 97) + "..." 
              : cleanContent;

        await prisma.notification.create({
          data: {
            userId: receiverId,
            title: `💬 New Message from ${session.user.name || "Portal User"} (${senderRoleLabel})`,
            content: `${session.user.name || "User"}: "${previewSnippet}"`,
            type: "MESSAGE",
            link: recipientLink,
            isRead: false,
          }
        });
        await invalidateUserNotifCache(receiverId);
      } catch (err) {
        console.error("Background notification error on message send:", err);
      }
    })();

    return NextResponse.json({
      success: true,
      message,
      clientTempId,
    });
  } catch (error) {
    const e = error as Error;
    console.error("POST /api/messages error:", e);
    return NextResponse.json({ error: e.message || "Failed to send message" }, { status: 500 });
  }
}
