"use server";

import { prisma } from "@/backend/db/prisma";
import { revalidatePath } from "next/cache";

export async function recordAchievementAction(formData: FormData) {
  try {
    const studentId = formData.get("studentId") as string;
    const title = formData.get("title") as string;
    const category = formData.get("category") as string;
    const dateStr = formData.get("date") as string;
    const description = formData.get("description") as string;

    if (!studentId || !title || !category || !dateStr) {
      return { error: "Missing required fields" };
    }

    await prisma.achievement.create({
      data: {
        studentId,
        title,
        category,
        date: new Date(dateStr),
        description: description || null,
        isVerified: false, // Default to pending verification
      }
    });

    revalidatePath("/dashboard/teacher/achievements");
    return { success: true };
  } catch (error) {
    return { error: (error instanceof Error ? error.message : String(error)) || "Failed to record achievement" };
  }
}
