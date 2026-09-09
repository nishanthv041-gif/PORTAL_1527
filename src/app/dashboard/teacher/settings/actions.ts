"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function updateProfile(formData: FormData) {
  const userId = formData.get("userId") as string;
  const name = formData.get("name") as string;
  const phone = formData.get("phone") as string;
  const qualification = formData.get("qualification") as string;
  const password = formData.get("password") as string;

  try {
    const updateData: { name: string; password?: string } = { name };
    if (password) {
      updateData.password = password; // In a real app, hash this
    }

    await prisma.user.update({
      where: { id: userId },
      data: updateData
    });

    const teacher = await prisma.teacher.findUnique({
      where: { userId }
    });

    if (teacher) {
      await prisma.teacher.update({
        where: { id: teacher.id },
        data: {
          phone,
          qualification
        }
      });
    }

    revalidatePath("/dashboard/teacher/settings");
    return { success: true };
  } catch (error: unknown) {
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to update profile." };
  }
}
