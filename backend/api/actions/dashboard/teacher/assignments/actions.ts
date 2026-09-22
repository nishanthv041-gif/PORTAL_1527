"use server";

import { prisma } from "@/backend/db/prisma";
import { revalidatePath } from "next/cache";

export async function createAssignment(formData: FormData) {
  const title = formData.get("title") as string;
  const description = formData.get("description") as string;
  const deadline = formData.get("deadline") as string;
  const classId = formData.get("classId") as string;
  const teacherId = formData.get("teacherId") as string;

  if (!title || !deadline || !classId || !teacherId) {
    return { success: false, error: "Missing required fields" };
  }

  try {
    await prisma.assignment.create({
      data: {
        title,
        description,
        deadline: new Date(deadline),
        classId,
        teacherId
      }
    });

    revalidatePath("/dashboard/teacher/assignments");
    return { success: true };
  } catch (error: unknown) {
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to create assignment." };
  }
}
