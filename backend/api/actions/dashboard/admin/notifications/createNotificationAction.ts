"use server";

import { prisma } from "@/backend/db/prisma";
import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { revalidatePath } from "next/cache";

export async function createCustomNotificationAction(formData: FormData) {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session || session.user.role !== "ADMIN") return { error: "Unauthorized" };

    const title = formData.get("title") as string;
    const content = formData.get("content") as string;
    const targetType = formData.get("targetType") as string; // "ALL", "TEACHERS", "PARENTS", "USER", "CLASS"
    const targetUserId = formData.get("targetUserId") as string || null;
    const targetClassId = formData.get("targetClassId") as string || null;
    const type = (formData.get("type") as string) || "INFO";
    const customLink = formData.get("link") as string || null;

    if (!title || !content) {
      return { error: "Title and message content are required." };
    }

    let userIdsToNotify: string[] = [];

    if (targetType === "ALL") {
      const users = await prisma.user.findMany({
        where: { status: "ACTIVE" },
        select: { id: true }
      });
      userIdsToNotify = users.map(u => u.id);
    } else if (targetType === "TEACHERS") {
      const teachers = await prisma.teacher.findMany({
        where: { isActive: true },
        select: { userId: true }
      });
      userIdsToNotify = teachers.map(t => t.userId);
    } else if (targetType === "PARENTS") {
      const parents = await prisma.parent.findMany({
        where: { isActive: true },
        select: { userId: true }
      });
      userIdsToNotify = parents.map(p => p.userId);
    } else if (targetType === "USER" && targetUserId) {
      userIdsToNotify = [targetUserId];
    } else if (targetType === "CLASS" && targetClassId) {
      const parents = await prisma.parent.findMany({
        where: { children: { some: { student: { classId: targetClassId } } } },
        select: { userId: true }
      });
      const cls = await prisma.class.findUnique({
        where: { id: targetClassId },
        select: { teacher: { select: { userId: true } }, classTeacher: { select: { userId: true } } }
      });
      const teacherIds = [cls?.teacher?.userId, cls?.classTeacher?.userId].filter(Boolean) as string[];
      userIdsToNotify = Array.from(new Set([...parents.map(p => p.userId), ...teacherIds]));
    } else {
      userIdsToNotify = [session.user.id];
    }

    if (userIdsToNotify.length === 0) {
      return { error: "No recipients found for the selected audience." };
    }

    await prisma.notification.createMany({
      data: userIdsToNotify.map(uid => ({
        userId: uid,
        title,
        content,
        type,
        link: customLink || "/dashboard",
        isRead: false
      }))
    });

    revalidatePath("/dashboard/admin/notifications");
    revalidatePath("/dashboard/parent/notifications");
    revalidatePath("/dashboard/teacher/notifications");
    revalidatePath("/dashboard");

    return { success: true, count: userIdsToNotify.length };
  } catch (error: unknown) {
    if (error instanceof Error) {
      return { error: error.message || "Failed to create notification." };
    }
    return { error: "Failed to create notification." };
  }
}
