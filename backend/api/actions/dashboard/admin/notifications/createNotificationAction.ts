"use server";

import { prisma } from "@/backend/db/prisma";
import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { revalidatePath } from "next/cache";
import { dispatchPushToRecipients } from "@/backend/services/push/webPushService";

export interface CreateNotificationInput {
  title: string;
  content: string;
  targetType: "ALL" | "ROLE" | "TEACHERS" | "PARENTS" | "CLASS" | "USER";
  targetRole?: string;
  targetClassId?: string;
  targetUserId?: string;
  category?: "general" | "account" | "alerts" | "academic" | "admin" | "maintenance";
  priority?: "NORMAL" | "URGENT";
  link?: string;
  scheduleDateTime?: string;
}

export async function createCustomNotificationAction(formData: FormData) {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session || session.user.role !== "ADMIN") {
      return { error: "Unauthorized. Admin credentials required." };
    }

    const title = (formData.get("title") as string)?.trim();
    const content = (formData.get("content") as string)?.trim();
    const targetType = (formData.get("targetType") as string) || "ALL";
    const targetRole = (formData.get("targetRole") as string) || null;
    const targetClassId = (formData.get("targetClassId") as string) || null;
    const targetUserId = (formData.get("targetUserId") as string) || null;
    const category = (formData.get("category") as string) || "general";
    const priority = (formData.get("priority") as "NORMAL" | "URGENT") || "NORMAL";
    const customLink = (formData.get("link") as string) || "/dashboard";
    const scheduleDateTime = (formData.get("scheduleDateTime") as string) || null;

    if (!title || !content) {
      return { error: "Title and message content are required." };
    }

    let userIdsToNotify: string[] = [];

    // 1. Resolve Target Audience
    if (targetType === "ALL") {
      const users = await prisma.user.findMany({
        where: { status: "ACTIVE" },
        select: { id: true },
      });
      userIdsToNotify = users.map((u) => u.id);
    } else if (targetType === "ROLE" && targetRole) {
      const users = await prisma.user.findMany({
        where: { role: targetRole, status: "ACTIVE" },
        select: { id: true },
      });
      userIdsToNotify = users.map((u) => u.id);
    } else if (targetType === "TEACHERS") {
      const teachers = await prisma.teacher.findMany({
        where: { isActive: true },
        select: { userId: true },
      });
      userIdsToNotify = teachers.map((t) => t.userId);
    } else if (targetType === "PARENTS") {
      const parents = await prisma.parent.findMany({
        where: { isActive: true },
        select: { userId: true },
      });
      userIdsToNotify = parents.map((p) => p.userId);
    } else if (targetType === "USER" && targetUserId) {
      userIdsToNotify = [targetUserId];
    } else if (targetType === "CLASS" && targetClassId) {
      const parents = await prisma.parent.findMany({
        where: { children: { some: { student: { classId: targetClassId } } } },
        select: { userId: true },
      });
      const cls = await prisma.class.findUnique({
        where: { id: targetClassId },
        select: {
          teacher: { select: { userId: true } },
          classTeacher: { select: { userId: true } },
        },
      });
      const teacherIds = [
        cls?.teacher?.userId,
        cls?.classTeacher?.userId,
      ].filter(Boolean) as string[];
      userIdsToNotify = Array.from(
        new Set([...parents.map((p) => p.userId), ...teacherIds])
      );
    } else {
      userIdsToNotify = [session.user.id];
    }

    if (userIdsToNotify.length === 0) {
      return { error: "No active recipients found for the selected audience." };
    }

    const scheduledDate = scheduleDateTime ? new Date(scheduleDateTime) : null;
    const isImmediate = !scheduledDate || scheduledDate <= new Date();

    // 2. Create Master Notification record for tracking
    const masterNotification = await prisma.notification.create({
      data: {
        userId: session.user.id, // Admin creator
        title,
        content,
        type: priority === "URGENT" ? "ALERT" : "ANNOUNCEMENT",
        category: category.toUpperCase(),
        priority,
        link: customLink,
        targetType,
        targetRole: targetRole || null,
        targetGroup: targetClassId || null,
        scheduledFor: scheduledDate,
        sentAt: isImmediate ? new Date() : null,
        isRead: false,
      },
    });

    // 3. Populate NotificationRecipient table
    await prisma.notificationRecipient.createMany({
      data: userIdsToNotify.map((uid) => ({
        notificationId: masterNotification.id,
        userId: uid,
        status: isImmediate ? "SENT" : "PENDING",
        read: false,
      })),
      skipDuplicates: true,
    });

    // 4. Create in-app individual Notification records for instant dashboard views
    await prisma.notification.createMany({
      data: userIdsToNotify.map((uid) => ({
        userId: uid,
        title,
        content,
        type: priority === "URGENT" ? "ALERT" : "ANNOUNCEMENT",
        category: category.toUpperCase(),
        priority,
        link: customLink,
        isRead: false,
      })),
    });

    // 5. If immediate, dispatch Web Push notifications to devices in parallel
    let pushResult = { sent: 0, failed: 0, totalSubscriptions: 0 };
    if (isImmediate) {
      const validCategory = (
        ["general", "account", "alerts", "academic", "admin", "maintenance"].includes(category)
          ? category
          : "general"
      ) as "general" | "account" | "alerts" | "academic" | "admin" | "maintenance";

      pushResult = await dispatchPushToRecipients(
        userIdsToNotify,
        {
          title,
          body: content,
          url: customLink,
          priority,
          category: validCategory,
        },
        masterNotification.id,
        validCategory
      );
    }

    revalidatePath("/dashboard/admin/notifications");
    revalidatePath("/dashboard/parent/notifications");
    revalidatePath("/dashboard/teacher/notifications");
    revalidatePath("/dashboard");

    return {
      success: true,
      notificationId: masterNotification.id,
      count: userIdsToNotify.length,
      pushSent: pushResult.sent,
      pushFailed: pushResult.failed,
      scheduled: !isImmediate,
    };
  } catch (error: unknown) {
    console.error("[Notification Action] Error:", error);
    if (error instanceof Error) {
      return { error: error.message || "Failed to create notification." };
    }
    return { error: "Failed to create notification." };
  }
}

/**
 * Retry failed push deliveries for a notification
 */
export async function retryFailedDeliveriesAction(notificationId: string) {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session || session.user.role !== "ADMIN") {
      return { error: "Unauthorized" };
    }

    const notif = await prisma.notification.findUnique({
      where: { id: notificationId },
    });

    if (!notif) return { error: "Notification not found" };

    // Find recipients whose push delivery failed or is pending
    const failedLogs = await prisma.notificationDeliveryLog.findMany({
      where: { notificationId, status: "FAILED" },
      select: { userId: true },
    });

    const userIdsToRetry = Array.from(new Set(failedLogs.map((l) => l.userId)));
    if (userIdsToRetry.length === 0) {
      return { message: "No failed deliveries to retry." };
    }

    const res = await dispatchPushToRecipients(
      userIdsToRetry,
      {
        title: notif.title,
        body: notif.content,
        url: notif.link || "/dashboard",
        priority: (notif.priority as "NORMAL" | "URGENT") || "NORMAL",
      },
      notif.id
    );

    revalidatePath("/dashboard/admin/notifications");
    return { success: true, retried: userIdsToRetry.length, sent: res.sent };
  } catch (err: unknown) {
    console.error("[Retry Error]", err);
    return { error: "Failed to retry delivery." };
  }
}

/**
 * Fetch delivery statistics for admin view
 */
export async function getNotificationDeliveryStatsAction(notificationId: string) {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session || session.user.role !== "ADMIN") {
      return { error: "Unauthorized" };
    }

    const totalRecipients = await prisma.notificationRecipient.count({
      where: { notificationId },
    });

    const readCount = await prisma.notificationRecipient.count({
      where: { notificationId, read: true },
    });

    const logs = await prisma.notificationDeliveryLog.groupBy({
      by: ["status"],
      where: { notificationId },
      _count: { id: true },
    });

    const stats = {
      totalRecipients,
      readCount,
      pushSent: logs.find((l) => l.status === "SENT")?._count.id || 0,
      pushFailed: logs.find((l) => l.status === "FAILED")?._count.id || 0,
      pushExpired: logs.find((l) => l.status === "EXPIRED")?._count.id || 0,
    };

    return { stats };
  } catch (err: unknown) {
    console.error("[Stats Error]", err);
    return { error: "Failed to fetch stats." };
  }
}
