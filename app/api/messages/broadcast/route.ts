export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import { dispatchNotification } from "@/lib/dispatcher";

export async function POST(request: Request) {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session?.user?.id) {
      return NextResponse.json(
        { ok: false, code: "UNAUTHORIZED", error: "Your session has expired. Please log in again.", requestId },
        { status: 401 }
      );
    }

    const senderRole = (session.user.role || "").toUpperCase();
    const senderId = session.user.id;

    // Strict Server-Side RBAC Enforcement: Parents cannot broadcast
    if (senderRole === "PARENT") {
      return NextResponse.json(
        { 
          ok: false, 
          code: "FORBIDDEN", 
          error: "Permission denied. Parents are not permitted to send broadcast messages.", 
          requestId 
        },
        { status: 403 }
      );
    }

    if (senderRole !== "ADMIN" && senderRole !== "SUPER_ADMIN" && senderRole !== "TEACHER") {
      return NextResponse.json(
        { 
          ok: false, 
          code: "FORBIDDEN", 
          error: "Permission denied. Only Administrators and Teachers can broadcast messages.", 
          requestId 
        },
        { status: 403 }
      );
    }

    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { ok: false, code: "BAD_REQUEST", error: "Invalid JSON payload.", requestId },
        { status: 400 }
      );
    }

    const {
      audience = "ALL_PARENTS",
      classId,
      targetUserIds = [],
      content,
      attachmentId,
      attachmentIds = [],
      fileUrl,
      fileName,
      fileSize,
      fileType,
      messageType = "FILE",
    } = body || {};

    const cleanContent = (content || "").trim();
    if (!cleanContent && !fileUrl && !attachmentId && (!attachmentIds || attachmentIds.length === 0)) {
      return NextResponse.json(
        { ok: false, code: "BAD_REQUEST", error: "Message content or file attachment is required.", requestId },
        { status: 400 }
      );
    }

    // Role restriction: Teachers can only broadcast to ALL_PARENTS, their CLASS, or SELECTED
    if (senderRole === "TEACHER" && audience === "ALL_USERS") {
      return NextResponse.json(
        { 
          ok: false, 
          code: "FORBIDDEN", 
          error: "Teachers cannot broadcast to All Users. Please select Parents or a Class.", 
          requestId 
        },
        { status: 403 }
      );
    }

    // Resolve recipients list
    let recipientUserIds: string[] = [];

    if (audience === "ALL_USERS") {
      const users = await prisma.user.findMany({
        where: {
          status: "ACTIVE",
          id: { not: senderId },
        },
        select: { id: true },
      });
      recipientUserIds = users.map((u) => u.id);
    } else if (audience === "ALL_PARENTS") {
      const parents = await prisma.user.findMany({
        where: {
          status: "ACTIVE",
          role: "PARENT",
          id: { not: senderId },
        },
        select: { id: true },
      });
      recipientUserIds = parents.map((u) => u.id);
    } else if (audience === "ALL_TEACHERS") {
      const teachers = await prisma.user.findMany({
        where: {
          status: "ACTIVE",
          role: "TEACHER",
          id: { not: senderId },
        },
        select: { id: true },
      });
      recipientUserIds = teachers.map((u) => u.id);
    } else if (audience === "CLASS" || audience.startsWith("CLASS_")) {
      const resolvedClassId = classId || audience.replace("CLASS_", "");
      if (!resolvedClassId) {
        return NextResponse.json(
          { ok: false, code: "BAD_REQUEST", error: "Class ID is required for class broadcast.", requestId },
          { status: 400 }
        );
      }

      // Find parents of students in this class
      const students = await prisma.student.findMany({
        where: { classId: resolvedClassId },
        select: {
          parents: {
            select: {
              parent: {
                select: { userId: true },
              },
            },
          },
        },
      });

      const uniqueParentIds = new Set<string>();
      for (const s of students) {
        if (s.parents && Array.isArray(s.parents)) {
          for (const sp of s.parents) {
            if (sp.parent?.userId && sp.parent.userId !== senderId) {
              uniqueParentIds.add(sp.parent.userId);
            }
          }
        }
      }
      recipientUserIds = Array.from(uniqueParentIds);
    } else if (audience === "SELECTED") {
      recipientUserIds = Array.isArray(targetUserIds) 
        ? targetUserIds.filter((id: string) => id && id !== senderId) 
        : [];
    }

    if (recipientUserIds.length === 0) {
      return NextResponse.json(
        { 
          ok: false, 
          code: "NO_RECIPIENTS", 
          error: "No active recipients found for the selected audience.", 
          requestId 
        },
        { status: 400 }
      );
    }

    // Resolve attachment details if attachmentId was passed
    let effectiveFileUrl = fileUrl;
    let effectiveFileName = fileName;
    let effectiveFileSize = fileSize;
    let effectiveFileType = fileType;

    const primaryAttachmentId = attachmentId || (attachmentIds.length > 0 ? attachmentIds[0] : null);

    if (primaryAttachmentId) {
      const att = await prisma.attachment.findUnique({
        where: { id: primaryAttachmentId },
      });
      if (att) {
        effectiveFileUrl = att.url;
        effectiveFileName = att.fileName;
        effectiveFileSize = att.fileSize;
        effectiveFileType = att.fileType;
      }
    }

    const finalMessageText = cleanContent || (effectiveFileName ? `📎 Shared file: ${effectiveFileName}` : "Broadcast announcement");

    // Create message rows in batches (not one gigantic monolithic query)
    const BATCH_SIZE = 50;
    let totalMessagesCreated = 0;

    for (let i = 0; i < recipientUserIds.length; i += BATCH_SIZE) {
      const batchIds = recipientUserIds.slice(i, i + BATCH_SIZE);
      const records = batchIds.map((recId) => ({
        senderId,
        receiverId: recId,
        content: finalMessageText,
        messageType: effectiveFileUrl ? "FILE" : messageType || "TEXT",
        fileUrl: effectiveFileUrl || null,
        fileName: effectiveFileName || null,
        fileSize: effectiveFileSize ? Number(effectiveFileSize) : null,
        fileType: effectiveFileType || null,
        isRead: false,
      }));

      await prisma.message.createMany({
        data: records,
      });

      totalMessagesCreated += batchIds.length;
    }

    // Link attachment to the sender's upload record
    if (primaryAttachmentId) {
      try {
        await prisma.attachment.update({
          where: { id: primaryAttachmentId },
          data: { status: "READY" },
        });
      } catch (e) {
        console.warn("[Broadcast] Failed to update attachment status:", e);
      }
    }

    // Dispatch Lock-Screen Push & Bell Notifications
    // Chunked into groups of 250 for high throughput
    try {
      const senderLabel = senderRole === "ADMIN" 
        ? "School Administration" 
        : session.user.name || "Faculty Teacher";

      const notifTitle = effectiveFileName 
        ? `📁 New File from ${senderLabel}`
        : `📢 Announcement from ${senderLabel}`;

      const notifBody = effectiveFileName 
        ? `${effectiveFileName}${cleanContent ? ` - "${cleanContent.slice(0, 80)}"` : ""}`
        : (cleanContent.length > 120 ? cleanContent.slice(0, 117) + "..." : cleanContent);

      const NOTIF_CHUNK = 250;
      for (let i = 0; i < recipientUserIds.length; i += NOTIF_CHUNK) {
        const chunk = recipientUserIds.slice(i, i + NOTIF_CHUNK);
        await dispatchNotification({
          type: "MESSAGE",
          recipients: chunk,
          title: notifTitle,
          body: notifBody,
          url: `/dashboard/parent/messages/${senderId}`,
          priority: "HIGH",
          tag: `broadcast-${senderId}-${Date.now()}`,
        });
      }
    } catch (notifErr) {
      console.error("[Broadcast] Notification dispatch error:", notifErr);
    }

    return NextResponse.json({
      ok: true,
      success: true,
      audience,
      recipientCount: recipientUserIds.length,
      messagesCreated: totalMessagesCreated,
      fileName: effectiveFileName,
      requestId,
    });
  } catch (error: any) {
    console.error(`[POST /api/messages/broadcast][${requestId}] Error:`, error);
    return NextResponse.json(
      { 
        ok: false, 
        code: "INTERNAL_ERROR", 
        error: error.message || "Failed to broadcast message.", 
        requestId 
      },
      { status: 500 }
    );
  }
}
