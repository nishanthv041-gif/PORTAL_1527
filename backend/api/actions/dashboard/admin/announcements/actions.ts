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

    // Notify targeted users so notification popup triggers immediately
    try {
      let targetUserIds: string[] = [];
      if (targetType === "ALL") {
        const users = await prisma.user.findMany({
          where: { status: "ACTIVE" },
          select: { id: true }
        });
        targetUserIds = users.map(u => u.id);
      } else if (targetType === "TEACHERS") {
        const teachers = await prisma.teacher.findMany({
          where: { isActive: true },
          select: { userId: true }
        });
        targetUserIds = teachers.map(t => t.userId);
      } else if (targetType === "PARENTS") {
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
        const cls = await prisma.class.findUnique({
          where: { id: targetId },
          select: { teacher: { select: { userId: true } }, classTeacher: { select: { userId: true } } }
        });
        const teacherIds = [cls?.teacher?.userId, cls?.classTeacher?.userId].filter(Boolean) as string[];
        targetUserIds = Array.from(new Set([...parents.map(p => p.userId), ...teacherIds]));
      }

      if (targetUserIds.length > 0) {
        const lower = (title + " " + content).toLowerCase();
        const notifType = lower.includes("meeting") 
          ? "MEETING" 
          : lower.includes("instruction") || lower.includes("circular") 
          ? "INSTRUCTION" 
          : "ANNOUNCEMENT";

        await prisma.notification.createMany({
          data: targetUserIds.map(uid => ({
            userId: uid,
            title,
            content,
            type: notifType,
            link: "/dashboard"
          }))
        });
      }
    } catch (notifErr) {
      console.error("Failed to dispatch notifications for announcement:", notifErr);
    }

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
