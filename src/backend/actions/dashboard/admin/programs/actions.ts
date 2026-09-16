"use server";

import { prisma } from "@/backend/db/prisma";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/backend/auth/authOptions";

export async function createProgramAction(formData: FormData) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'ADMIN') return { error: "Unauthorized" };

    const title = formData.get("title") as string;
    const date = formData.get("date") as string;
    const startTime = formData.get("startTime") as string;
    const endTime = formData.get("endTime") as string;
    const location = formData.get("location") as string;
    const description = formData.get("description") as string;
    const organizer = formData.get("organizer") as string;
    const isPublished = formData.get("isPublished") === "true";

    if (!title || !date || !startTime || !endTime) {
      return { error: "Title, date, start time and end time are required." };
    }

    await prisma.calendarEvent.create({
      data: {
        title,
        type: 'PROGRAM',
        date: new Date(date),
        startTime,
        endTime,
        location,
        description,
        organizer,
        isPublished,
        status: 'UPCOMING'
      }
    });

    revalidatePath("/dashboard/admin/programs");
    return { success: true };
  } catch (error: unknown) {
    if (error instanceof Error) {
      return { error: error.message || "Failed to create program." };
    }
    return { error: "Failed to create program." };
  }
}

export async function updateProgramStatusAction(id: string, isPublished: boolean) {
  try {
    await prisma.calendarEvent.update({
      where: { id },
      data: { isPublished }
    });
    revalidatePath("/dashboard/admin/programs");
    return { success: true };
  } catch (error: unknown) {
    if (error instanceof Error) {
      return { error: error.message || "Failed to update program." };
    }
    return { error: "Failed to update program." };
  }
}

export async function deleteProgramAction(id: string) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'ADMIN') return { error: "Unauthorized" };

    await prisma.calendarEvent.delete({ where: { id } });
    revalidatePath("/dashboard/admin/programs");
    return { success: true };
  } catch (error: unknown) {
    if (error instanceof Error) {
      return { error: error.message || "Failed to delete program." };
    }
    return { error: "Failed to delete program." };
  }
}
