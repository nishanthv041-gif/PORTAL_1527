export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import { sendUniversalNotification } from "@/lib/notify";

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

    // Resolve recipient user ID (handling both direct User.id, Parent.id, or Teacher.id)
    let targetReceiverId = receiverId;
    let receiver = await prisma.user.findUnique({
      where: { id: targetReceiverId },
      select: { id: true, role: true, name: true }
    });

    if (!receiver) {
      // Check if receiverId is actually a Parent model ID
      const parentRecord = await prisma.parent.findUnique({
        where: { id: receiverId },
        select: { userId: true, user: { select: { id: true, role: true, name: true } } }
      });
      if (parentRecord?.user) {
        receiver = parentRecord.user;
        targetReceiverId = parentRecord.userId;
      }
    }

    if (!receiver) {
      // Check if receiverId is actually a Teacher model ID
      const teacherRecord = await prisma.teacher.findUnique({
        where: { id: receiverId },
        select: { userId: true, user: { select: { id: true, role: true, name: true } } }
      });
      if (teacherRecord?.user) {
        receiver = teacherRecord.user;
        targetReceiverId = teacherRecord.userId;
      }
    }

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
        receiverId: targetReceiverId,
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

    // Deliver cross-platform notification (In-app + PC Web / iPhone Safari PWA + Android Capacitor)
    // Strictly awaited so serverless functions (Vercel / Amplify) do not freeze or terminate early
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

      await sendUniversalNotification({
        userId: targetReceiverId,
        title: `💬 New Message from ${session.user.name || "Portal User"} (${senderRoleLabel})`,
        body: `${session.user.name || "User"}: "${previewSnippet}"`,
        category: "MESSAGE",
        url: recipientLink,
        tag: `chat-${session.user.id}`,
        priority: "HIGH",
      });
    } catch (notifErr) {
      console.error("[Messages] Notification delivery warning:", notifErr);
    }

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
