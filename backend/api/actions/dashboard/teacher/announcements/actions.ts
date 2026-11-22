"use server";

import { prisma } from "@/backend/db/prisma";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { sendInstantPortalNotification } from "@/lib/pushDispatcher";

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

    const newAnnouncement = await prisma.announcement.create({
      data: {
        title,
        content,
        targetType,
        targetId: targetId || null,
        priority,
        authorId: session.user.id,
      }
    });

    // Notify targeted parents
    try {
      let targetUserIds: string[] = [];
      if (targetType === "PARENTS") {
        const parents = await prisma.parent.findMany({
          where: { isActive: true },
          select: { userId: true }
        });
        targetUserIds = parents.map(p => p.userId);
      } else if (targetType === "CLASS" && targetId) {
        const parents = await prisma.parent.findMany({
          where: { children: { some: { student: { classId: targetId } } } },
          select: { userId: true }
        });
        targetUserIds = parents.map(p => p.userId);
      }

      if (targetUserIds.length > 0) {
        const lower = (title + " " + content).toLowerCase();
        const notifType = lower.includes("meeting") 
          ? "MEETING" 
          : lower.includes("instruction") || lower.includes("circular") 
          ? "INSTRUCTION" 
          : "ANNOUNCEMENT";

        await sendInstantPortalNotification({
          targetUserIds,
          category: notifType,
          title: `📢 ${title}`,
          body: content.slice(0, 150),
          link: "/dashboard/parent/announcements",
          tag: `teacher-announcement-${newAnnouncement.id}`,
          priority: priority === "HIGH" ? "HIGH" : "NORMAL",
          bypass48h: true,
        });
      }
    } catch (notifErr) {
      console.error("Failed to dispatch notifications for teacher announcement:", notifErr);
    }

    revalidatePath("/dashboard/teacher/announcements");
    return { success: true };
  } catch (error) {
    return { error: (error instanceof Error ? error.message : String(error)) || "Failed to post announcement" };
  }
}
