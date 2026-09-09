"use server";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function adminSendMessage(receiverId: string, content: string) {
  const session = await getServerSession(authOptions);
  
  if (!session || session.user.role !== 'ADMIN') {
    return { error: "Unauthorized" };
  }

  if (!content.trim()) {
    return { error: "Message cannot be empty" };
  }

  // Verify the receiver is a TEACHER
  const receiver = await prisma.user.findUnique({
    where: { id: receiverId }
  });

  if (!receiver || receiver.role !== 'TEACHER') {
    return { error: "Admins can only message teachers." };
  }

  try {
    const message = await prisma.message.create({
      data: {
        content,
        senderId: session.user.id,
        receiverId
      }
    });

    revalidatePath(`/dashboard/admin/messages/${receiverId}`);
    return { success: true, message };
  } catch (error) {
    console.error("Failed to send message:", error);
    return { error: "Failed to send message" };
  }
}
