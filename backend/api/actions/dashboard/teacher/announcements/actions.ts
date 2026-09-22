"use server";

import { prisma } from "@/backend/db/prisma";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";

export async function createTeacherAnnouncementAction(formData: FormData) {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session || session.user.role !== 'TEACHER') {
      return { error: "Unauthorized" };
    }

    const title = formData.get("title") as string;
    const content = formData.get("content") as string;
    const targetType = formData.get("targetType") as string;
    const targetId = formData.get("targetId") as string;
    const priority = formData.get("priority") as string || "NORMAL";

    if (!title || !content || !targetType) {
      return { error: "Missing required fields" };
    }

    // Ensure teachers can only post to CLASS or PARENTS
    if (targetType !== "CLASS" && targetType !== "PARENTS") {
      return { error: "Invalid target type for teacher" };
    }

    if (targetType === "CLASS" && !targetId) {
      return { error: "Class must be selected" };
    }

    await prisma.announcement.create({
      data: {
        title,
        content,
        targetType,
        targetId: targetId || null,
        priority,
        authorId: session.user.id,
      }
    });

    revalidatePath("/dashboard/teacher/announcements");
    return { success: true };
  } catch (error) {
    return { error: (error instanceof Error ? error.message : String(error)) || "Failed to post announcement" };
  }
}
