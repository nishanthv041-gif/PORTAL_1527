"use server";

import { prisma } from "@/backend/db/prisma";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";

export async function createAnnouncementAction(formData: FormData) {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session || session.user.role !== 'ADMIN') return { error: "Unauthorized" };

    const title = formData.get("title") as string;
    const content = formData.get("content") as string;
    const targetType = formData.get("targetType") as string;
    const targetId = formData.get("targetId") as string || null;
    const priority = formData.get("priority") as string || "NORMAL";
    const expiryDateStr = formData.get("expiryDate") as string;
    const fileUrl = formData.get("fileUrl") as string || null;

    if (!title || !content || !targetType) {
      return { error: "Title, content, and target audience are required." };
    }

    if (targetType === "CLASS" && !targetId) {
      return { error: "Please select a specific class for this announcement." };
    }

    await prisma.announcement.create({
      data: {
        title,
        content,
        targetType,
        targetId: targetType === "CLASS" ? targetId : null,
        priority,
        expiryDate: expiryDateStr ? new Date(expiryDateStr) : null,
        fileUrl,
        authorId: session.user.id
      }
    });

    revalidatePath("/dashboard/admin/announcements");
    return { success: true };
  } catch (error: unknown) {
    if (error instanceof Error) {
      return { error: error.message || "Failed to create announcement." };
    }
    return { error: "Failed to create announcement." };
  }
}

export async function deleteAnnouncementAction(id: string) {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session || session.user.role !== 'ADMIN') return { error: "Unauthorized" };

    await prisma.announcement.delete({ where: { id } });
    revalidatePath("/dashboard/admin/announcements");
    return { success: true };
  } catch (error: unknown) {
    if (error instanceof Error) {
      return { error: error.message || "Failed to delete announcement." };
    }
    return { error: "Failed to delete announcement." };
  }
}
