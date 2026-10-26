"use server";

import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import { revalidatePath } from "next/cache";
import { invalidateUserNotifCache } from "@/backend/api/actions/notifications/unifiedNotificationActions";

export async function adminSendMessage(receiverId: string, content: string) {
  const session = await getServerSession(getAuthOptions());
  
  if (!session || session.user.role !== 'ADMIN') {
    return { error: "Unauthorized" };
  }

  const cleanContent = content.trim();
  if (!cleanContent) {
    return { error: "Message cannot be empty" };
  }

  // Verify the receiver is either a TEACHER or PARENT
  const receiver = await prisma.user.findUnique({
    where: { id: receiverId }
  });

  if (!receiver || (receiver.role !== 'TEACHER' && receiver.role !== 'PARENT')) {
    return { error: "Invalid recipient. You can only message teachers and parents." };
  }

  try {
    const message = await prisma.message.create({
      data: {
        content: cleanContent,
        senderId: session.user.id,
        receiverId
      }
    });

    // Send real-time notification pop-up alert & notification store
    try {
      await prisma.notification.create({
        data: {
          userId: receiverId,
          title: `💬 New Message from School Administration`,
          content: `${session.user.name || "School Administration"}: "${cleanContent.length > 120 ? cleanContent.slice(0, 117) + "..." : cleanContent}"`,
          type: "MESSAGE",
          link: receiver.role === 'PARENT' 
            ? `/dashboard/parent/messages/${session.user.id}` 
            : `/dashboard/teacher/messages/${session.user.id}`,
          isRead: false
        }
      });
      await invalidateUserNotifCache(receiverId);
    } catch (notifErr) {
      console.error("Message notification creation error:", notifErr);
    }

    revalidatePath(`/dashboard/admin/messages`);
    revalidatePath(`/dashboard/admin/messages/${receiverId}`);
    revalidatePath(`/dashboard/parent/messages`);
    revalidatePath(`/dashboard/teacher/messages`);
    revalidatePath(`/dashboard/parent/notifications`);
    revalidatePath(`/dashboard/teacher/notifications`);

    return { success: true, message };
  } catch (error) {
    console.error("Failed to send message:", error);
    return { error: "Failed to send message" };
  }
}
