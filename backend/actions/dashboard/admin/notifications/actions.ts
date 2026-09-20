"use server";

import { prisma } from "@/backend/db/prisma";
import { revalidatePath } from "next/cache";

export async function deleteNotification(id: string) {
  try {
    await prisma.notification.delete({ where: { id } });
    revalidatePath("/dashboard/admin/notifications");
    return { success: true };
  } catch (error: unknown) {
    if (error instanceof Error) return { error: error.message };
    return { error: "Failed to delete notification." };
  }
}

export async function markAllNotificationsRead(userId: string) {
  try {
    await prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true }
    });
    revalidatePath("/dashboard/admin/notifications");
    return { success: true };
  } catch (error: unknown) {
    if (error instanceof Error) return { error: error.message };
    return { error: "Failed to mark all as read." };
  }
}

export async function toggleNotificationsEnabled(userId: string, enabled: boolean) {
  try {
    await prisma.user.update({
      where: { id: userId },
      data: { notificationsEnabled: enabled }
    });
    revalidatePath("/dashboard/admin/notifications");
    return { success: true };
  } catch (error: unknown) {
    if (error instanceof Error) return { error: error.message };
    return { error: "Failed to toggle notifications." };
  }
}
