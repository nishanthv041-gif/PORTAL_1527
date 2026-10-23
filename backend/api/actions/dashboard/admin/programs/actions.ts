"use server";

import { prisma } from "@/backend/db/prisma";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";

export async function sendProgramNotificationToAllAction(programId: string) {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session || session.user.role !== 'ADMIN') return { error: "Unauthorized" };

    const prog = await prisma.calendarEvent.findUnique({ where: { id: programId } });
    if (!prog) return { error: "Program not found." };

    const activeUsers = await prisma.user.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, role: true }
    });

    if (activeUsers.length === 0) return { error: "No active users found to notify." };

    const dateFormatted = new Date(prog.date).toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric"
    });

    const notifTitle = `School Program: ${prog.title}`;
    const notifContent = `📅 Program Scheduled: "${prog.title}" on ${dateFormatted} at ${prog.startTime}${prog.endTime ? ` - ${prog.endTime}` : ""}${prog.location ? ` | Venue: ${prog.location}` : ""}. ${prog.description || "All are cordially invited."}`;

    // Create notifications for all active users with role-specific link
    await prisma.notification.createMany({
      data: activeUsers.map(u => ({
        userId: u.id,
        title: notifTitle,
        content: notifContent,
        type: "PROGRAM",
        link: u.role === "PARENT" 
          ? "/dashboard/parent/programs" 
          : u.role === "ADMIN" 
            ? "/dashboard/admin/programs" 
            : "/dashboard/teacher/calendar",
        isRead: false
      }))
    });

    revalidatePath("/dashboard/admin/programs");
    revalidatePath("/dashboard/parent/programs");
    revalidatePath("/dashboard/parent/notifications");
    revalidatePath("/dashboard/teacher/notifications");
    revalidatePath("/dashboard/admin/notifications");
    revalidatePath("/dashboard");

    return { success: true, count: activeUsers.length };
  } catch (error: unknown) {
    if (error instanceof Error) {
      return { error: error.message || "Failed to send notifications." };
    }
    return { error: "Failed to send notifications." };
  }
}

export async function createProgramAction(formData: FormData) {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session || session.user.role !== 'ADMIN') return { error: "Unauthorized" };

    const title = formData.get("title") as string;
    const date = formData.get("date") as string;
    const startTime = formData.get("startTime") as string;
    const endTime = formData.get("endTime") as string;
    const location = formData.get("location") as string;
    const description = formData.get("description") as string;
    const organizer = formData.get("organizer") as string;
    const isPublished = formData.get("isPublished") === "true";
    const notifyAll = formData.get("notifyAll") !== "false"; // Default true

    if (!title || !date || !startTime || !endTime) {
      return { error: "Title, date, start time and end time are required." };
    }

    const prog = await prisma.calendarEvent.create({
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

    // Notify all active users if requested and published
    if (notifyAll && isPublished) {
      try {
        const activeUsers = await prisma.user.findMany({
          where: { status: "ACTIVE" },
          select: { id: true, role: true }
        });

        if (activeUsers.length > 0) {
          const dateFormatted = new Date(date).toLocaleDateString(undefined, {
            weekday: "short",
            month: "short",
            day: "numeric",
            year: "numeric"
          });

          const notifContent = `📅 New School Program: "${title}" on ${dateFormatted} at ${startTime}${endTime ? ` - ${endTime}` : ""}${location ? ` | Venue: ${location}` : ""}. ${description || "All are cordially invited."}`;

          await prisma.notification.createMany({
            data: activeUsers.map(u => ({
              userId: u.id,
              title: `School Program: ${title}`,
              content: notifContent,
              type: "PROGRAM",
              link: u.role === "PARENT" ? "/dashboard/parent/programs" : u.role === "ADMIN" ? "/dashboard/admin/programs" : "/dashboard/teacher/calendar",
              isRead: false
            }))
          });
        }
      } catch (notifErr) {
        console.error("Failed to dispatch notifications for new program:", notifErr);
      }
    }

    revalidatePath("/dashboard/admin/programs");
    revalidatePath("/dashboard/parent/programs");
    revalidatePath("/dashboard/parent/notifications");
    revalidatePath("/dashboard/teacher/notifications");
    revalidatePath("/dashboard/admin/notifications");
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
    const prog = await prisma.calendarEvent.update({
      where: { id },
      data: { isPublished }
    });

    // If publishing, dispatch notification to everyone
    if (isPublished) {
      try {
        const activeUsers = await prisma.user.findMany({
          where: { status: "ACTIVE" },
          select: { id: true, role: true }
        });

        if (activeUsers.length > 0) {
          const dateFormatted = new Date(prog.date).toLocaleDateString(undefined, {
            weekday: "short",
            month: "short",
            day: "numeric",
            year: "numeric"
          });

          await prisma.notification.createMany({
            data: activeUsers.map(u => ({
              userId: u.id,
              title: `School Program Published: ${prog.title}`,
              content: `📅 School Program Published: "${prog.title}" on ${dateFormatted} at ${prog.startTime}${prog.location ? ` | Venue: ${prog.location}` : ""}.`,
              type: "PROGRAM",
              link: u.role === "PARENT" ? "/dashboard/parent/programs" : u.role === "ADMIN" ? "/dashboard/admin/programs" : "/dashboard/teacher/calendar",
              isRead: false
            }))
          });
        }
      } catch (err) {
        console.error("Failed to notify users on program publish:", err);
      }
    }

    revalidatePath("/dashboard/admin/programs");
    revalidatePath("/dashboard/parent/programs");
    revalidatePath("/dashboard/parent/notifications");
    revalidatePath("/dashboard/teacher/notifications");
    revalidatePath("/dashboard/admin/notifications");
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
    const session = await getServerSession(getAuthOptions());
    if (!session || session.user.role !== 'ADMIN') return { error: "Unauthorized" };

    await prisma.calendarEvent.delete({ where: { id } });
    revalidatePath("/dashboard/admin/programs");
    revalidatePath("/dashboard/parent/programs");
    return { success: true };
  } catch (error: unknown) {
    if (error instanceof Error) {
      return { error: error.message || "Failed to delete program." };
    }
    return { error: "Failed to delete program." };
  }
}
