"use server";

import { prisma } from "@/backend/db/prisma";
import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { revalidatePath } from "next/cache";
import { dispatchNotification } from "@/lib/dispatcher";

export interface CreateNotificationInput {
  title: string;
  content: string;
  targetType: "ALL" | "ROLE" | "TEACHERS" | "PARENTS" | "CLASS" | "USER" | "INACTIVE_24H";
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
    } else if (targetType === "INACTIVE_24H") {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const inactiveUsers = await prisma.user.findMany({
        where: {
          status: "ACTIVE",
          OR: [
            { lastLoginAt: null },
            { lastLoginAt: { lte: oneDayAgo } },
          ],
        },
        select: { id: true },
      });
      userIdsToNotify = inactiveUsers.map((u) => u.id);
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

    let scheduledDate: Date | null = null;
    let isImmediate = true;
    if (scheduleDateTime && scheduleDateTime.trim() !== "") {
      const parsed = new Date(scheduleDateTime);
      if (!isNaN(parsed.getTime())) {
        // If scheduled for more than 10 minutes in the future, treat as scheduled; otherwise send immediately
        if (parsed.getTime() > Date.now() + 10 * 60 * 1000) {
          scheduledDate = parsed;
          isImmediate = false;
        }
      }
    }

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

    // 4. Dispatch immediate notifications across in-app, WebPush & OneSignal
    let pushResult = { sent: 0, failed: 0 };
    if (isImmediate) {
      // dispatchNotification inserts in-app notification rows and lock-screen push for all recipients
      const nonAdminRecipients = userIdsToNotify.filter(id => id !== session.user.id);
      const res = await dispatchNotification({
        type: category ? category.toUpperCase() : "ANNOUNCEMENT",
        entityId: masterNotification.id,
        recipients: nonAdminRecipients.length > 0 ? nonAdminRecipients : userIdsToNotify,
        title,
        body: content,
        url: customLink || "/dashboard",
        priority: priority === "URGENT" ? "URGENT" : "HIGH",
        tag: `admin-notif-${masterNotification.id}-${Date.now()}`,
        targetType,
        targetRole: targetRole || undefined,
      }).catch((err) => {
        console.warn("[CreateNotification] Push error:", err);
        return null;
      });

      if (res) {
        pushResult = {
          sent: (res.oneSignalCount || 0) + (res.webPushCount || 0),
          failed: res.failedCount || 0,
        };
      }
    } else {
      // If scheduled, insert in-app notification rows for non-admin recipients with targetType preserved
      const nonAdminRecipients = userIdsToNotify.filter(id => id !== session.user.id);
      if (nonAdminRecipients.length > 0) {
        await prisma.notification.createMany({
          data: nonAdminRecipients.map((uid) => ({
            userId: uid,
            title,
            content,
            type: priority === "URGENT" ? "ALERT" : "ANNOUNCEMENT",
            category: category.toUpperCase(),
            priority,
            link: customLink,
            targetType,
            targetRole: targetRole || null,
            targetGroup: targetClassId || null,
            isRead: false,
          })),
        });
      }
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

    // 1. First check recipients recorded in notificationRecipient
    const recipientRows = await prisma.notificationRecipient.findMany({
      where: { notificationId },
      select: { userId: true },
    });

    let userIdsToRetry: string[] = recipientRows.map((r) => r.userId);

    // 2. If no recipients recorded, re-resolve based on targetType
    if (userIdsToRetry.length === 0) {
      if (notif.targetType === "ALL") {
        const users = await prisma.user.findMany({
          where: { status: "ACTIVE" },
          select: { id: true },
        });
        userIdsToRetry = users.map((u) => u.id);
      } else if (notif.targetType === "TEACHERS") {
        const teachers = await prisma.teacher.findMany({
          where: { isActive: true },
          select: { userId: true },
        });
        userIdsToRetry = teachers.map((t) => t.userId);
      } else if (notif.targetType === "PARENTS") {
        const parents = await prisma.parent.findMany({
          where: { isActive: true },
          select: { userId: true },
        });
        userIdsToRetry = parents.map((p) => p.userId);
      } else {
        userIdsToRetry = [notif.userId];
      }
    }

    const res = await dispatchNotification({
      type: (notif.category || notif.type || "ANNOUNCEMENT").toUpperCase(),
      entityId: notif.id,
      recipients: userIdsToRetry,
      title: notif.title,
      body: notif.content,
      url: notif.link || "/dashboard",
      priority: (notif.priority as "NORMAL" | "URGENT") || "NORMAL",
      tag: `retry-${notif.id}-${Date.now()}`,
    });

    revalidatePath("/dashboard/admin/notifications");
    const totalSent = (res.oneSignalCount || 0) + (res.webPushCount || 0);
    return {
      success: true,
      retried: userIdsToRetry.length,
      sent: totalSent,
      message: totalSent > 0 
        ? `Successfully pushed to ${totalSent} device(s).` 
        : `Targeted ${userIdsToRetry.length} user(s), but no active devices are registered yet.`,
    };
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
