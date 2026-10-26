"use server";

import { prisma } from "@/backend/db/prisma";
import { revalidatePath } from "next/cache";
import { invalidateUserNotifCache } from "@/backend/api/actions/notifications/unifiedNotificationActions";

export async function sendMessage(senderId: string, receiverId: string, content: string) {
  try {
    const cleanContent = content.trim();
    if (!cleanContent) {
      return { success: false, error: "Message cannot be empty." };
    }

    const [sender, receiver] = await Promise.all([
      prisma.user.findUnique({ where: { id: senderId } }),
      prisma.user.findUnique({ where: { id: receiverId } })
    ]);

    if (!receiver) {
      return { success: false, error: "Recipient not found." };
    }

    const message = await prisma.message.create({
      data: {
        content: cleanContent,
        senderId,
        receiverId
      }
    });

    // Determine target link based on receiver's role
    let recipientLink = `/dashboard/parent/messages/${senderId}`;
    if (receiver.role === "TEACHER") {
      recipientLink = `/dashboard/teacher/messages/${senderId}`;
    } else if (receiver.role === "ADMIN") {
      recipientLink = `/dashboard/admin/messages/${senderId}`;
    }

    // Create real-time notification pop-up alert & notification entry
    try {
      const senderRoleLabel = sender?.role === "ADMIN" ? "School Administration" : sender?.role === "TEACHER" ? "Faculty Teacher" : "Parent";
      await prisma.notification.create({
        data: {
          userId: receiverId,
          title: `💬 New Message from ${sender?.name || "Portal User"} (${senderRoleLabel})`,
          content: `${sender?.name || "User"}: "${cleanContent.length > 120 ? cleanContent.slice(0, 117) + "..." : cleanContent}"`,
          type: "MESSAGE",
          link: recipientLink,
          isRead: false
        }
      });
      await invalidateUserNotifCache(receiverId);
    } catch (notifErr) {
      console.error("Message notification creation error:", notifErr);
    }

    revalidatePath(`/dashboard/teacher/messages/${receiverId}`);
    revalidatePath(`/dashboard/parent/messages/${receiverId}`);
    revalidatePath(`/dashboard/admin/messages/${receiverId}`);
    revalidatePath(`/dashboard/teacher/messages`);
    revalidatePath(`/dashboard/parent/messages`);
    revalidatePath(`/dashboard/admin/messages`);
    revalidatePath(`/dashboard/parent/notifications`);
    revalidatePath(`/dashboard/teacher/notifications`);
    revalidatePath(`/dashboard/admin/notifications`);

    return { success: true, message };
  } catch (error: unknown) {
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to send message." };
  }
}
