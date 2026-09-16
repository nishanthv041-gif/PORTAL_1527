"use server";

import { prisma } from "@/backend/db/prisma";
import { revalidatePath } from "next/cache";

export async function sendMessage(senderId: string, receiverId: string, content: string) {
  try {
    await prisma.message.create({
      data: {
        content,
        senderId,
        receiverId
      }
    });

    revalidatePath(`/dashboard/teacher/messages/${receiverId}`);
    return { success: true };
  } catch (error: unknown) {
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to send message." };
  }
}
