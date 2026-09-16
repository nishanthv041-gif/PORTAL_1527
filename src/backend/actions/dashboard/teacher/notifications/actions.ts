"use server";

import { prisma } from "@/backend/db/prisma";
import { revalidatePath } from "next/cache";

export async function markNotificationReadAction(notificationId: string) {
  try {
    await prisma.notification.update({
      where: { id: notificationId },
      data: { isRead: true }
    });

    revalidatePath("/dashboard/teacher/notifications");
    return { success: true };
  } catch (error) {
    return { error: (error instanceof Error ? error.message : String(error)) || "Failed to mark notification as read" };
  }
}

export async function toggleNotificationsEnabled(userId: string, enabled: boolean) {
  try {
    await prisma.user.update({
      where: { id: userId },
      data: { notificationsEnabled: enabled }
    });
    revalidatePath("/dashboard/teacher/notifications");
    return { success: true };
  } catch (error: unknown) {
    if (error instanceof Error) return { error: error.message };
    return { error: "Failed to toggle notifications." };
  }
}

export async function deleteNotificationAction(id: string) {
  try {
    await prisma.notification.delete({ where: { id } });
    revalidatePath("/dashboard/teacher/notifications");
    return { success: true };
  } catch (error: unknown) {
    if (error instanceof Error) return { error: error.message };
    return { error: "Failed to delete notification." };
  }
}
