"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function createEventAction(formData: FormData) {
  try {
    const title = formData.get("title") as string;
    const type = formData.get("type") as string;
    const date = formData.get("date") as string;
    const endDate = formData.get("endDate") as string;
    const startTime = formData.get("startTime") as string;
    const endTime = formData.get("endTime") as string;
    const location = formData.get("location") as string;
    const description = formData.get("description") as string;
    const targetClass = formData.get("targetClass") as string;
    const targetSection = formData.get("targetSection") as string;
    const organizer = formData.get("organizer") as string;
    const status = formData.get("status") as string;
    const audience = formData.get("audience") as string;

    await prisma.calendarEvent.create({
      data: {
        title,
        type,
        date: new Date(date),
        startTime,
        endTime,
        location,
        description,
        targetClass,
        targetSection,
        organizer,
        audience: audience || "ALL",
        endDate: endDate ? new Date(endDate) : null,
        status: status || "UPCOMING"
      }
    });

    revalidatePath("/dashboard/admin/calendar");
    return { success: true };
  } catch (error: unknown) {
    if (error instanceof Error) {
      return { error: error.message };
    }
    return { error: "Failed to create event" };
  }
}

export async function deleteEventAction(id: string) {
  try {
    await prisma.calendarEvent.delete({ where: { id } });
    revalidatePath("/dashboard/admin/calendar");
    return { success: true };
  } catch (error: unknown) {
    if (error instanceof Error) {
      return { error: error.message };
    }
    return { error: "Failed to delete event" };
  }
}
