"use server";

import { prisma } from "@/backend/db/prisma";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";

export async function createTeacherEventAction(formData: FormData) {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session || session.user.role !== 'TEACHER') {
      return { error: "Unauthorized" };
    }

    const title = formData.get("title") as string;
    const type = formData.get("type") as string;
    const dateStr = formData.get("date") as string;
    const audience = formData.get("audience") as string;
    const startTime = formData.get("startTime") as string;
    const endTime = formData.get("endTime") as string;
    
    // Optional fields
    const endDateStr = formData.get("endDate") as string;
    const location = formData.get("location") as string;
    const description = formData.get("description") as string;

    if (!title || !type || !dateStr || !audience || !startTime || !endTime) {
      return { error: "Missing required fields" };
    }

    // Force audience to TEACHER or ALL to prevent teachers from creating STUDENT-only events
    const safeAudience = (audience === "ALL" || audience === "TEACHER") ? audience : "TEACHER";

    const date = new Date(dateStr);
    const endDate = endDateStr ? new Date(endDateStr) : null;

    const teacher = await prisma.teacher.findUnique({
      where: { userId: session.user.id },
      include: { user: true }
    });

    await prisma.calendarEvent.create({
      data: {
        title,
        type,
        date,
        endDate,
        audience: safeAudience,
        startTime,
        endTime,
        location: location || null,
        description: description || null,
        organizer: teacher?.user.name || "Teacher",
        isPublished: true,
      }
    });

    revalidatePath("/dashboard/teacher/calendar");
    return { success: true };
  } catch (error) {
    return { error: (error instanceof Error ? error.message : String(error)) || "Failed to create event" };
  }
}

export async function deleteTeacherEventAction(id: string) {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session || session.user.role !== 'TEACHER') {
      return { error: "Unauthorized" };
    }

    const teacher = await prisma.teacher.findUnique({
      where: { userId: session.user.id },
      include: { user: true }
    });

    const event = await prisma.calendarEvent.findUnique({ where: { id } });
    if (!event) return { error: "Event not found" };

    // Only allow deleting if they are the organizer
    if (event.organizer !== teacher?.user.name) {
      return { error: "You can only delete events you created" };
    }

    await prisma.calendarEvent.delete({
      where: { id }
    });

    revalidatePath("/dashboard/teacher/calendar");
    return { success: true };
  } catch (error) {
    return { error: (error instanceof Error ? error.message : String(error)) || "Failed to delete event" };
  }
}
