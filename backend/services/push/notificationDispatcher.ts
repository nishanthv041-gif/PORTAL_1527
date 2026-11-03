import { prisma } from "@/backend/db/prisma";
import { dispatchPushToRecipients, PushPayload } from "./webPushService";

/**
 * Standardized Notification Dispatcher for Nipo Portal
 * Handles in-app records and real-time Web Push delivery across user roles.
 */

// 1. Admin Alert: Notify all administrators of critical system events
export async function sendSystemAlertToAdmins(
  title: string,
  content: string,
  priority: "NORMAL" | "URGENT" = "NORMAL"
) {
  try {
    const adminUsers = await prisma.user.findMany({
      where: { role: "ADMIN", status: "ACTIVE" },
      select: { id: true },
    });

    if (adminUsers.length === 0) return;
    const adminIds = adminUsers.map((a) => a.id);

    // In-app records
    await prisma.notification.createMany({
      data: adminIds.map((uid) => ({
        userId: uid,
        title,
        content,
        type: priority === "URGENT" ? "ALERT" : "SYSTEM",
        category: "SYSTEM",
        priority,
        link: "/dashboard/admin/system-health",
        isRead: false,
      })),
    });

    // Real-time Push
    await dispatchPushToRecipients(
      adminIds,
      {
        title,
        body: content,
        url: "/dashboard/admin/system-health",
        priority,
        category: "alerts",
      },
      undefined,
      "alerts"
    );
  } catch (err) {
    console.error("[Notification Dispatcher] Admin alert error:", err);
  }
}

// 2. Broadcast Announcement: To all users or specific roles (Teachers, Parents)
export async function broadcastAnnouncementNotification(
  title: string,
  content: string,
  targetRole?: "TEACHER" | "PARENT" | "STAFF" | "ALL",
  link: string = "/dashboard"
) {
  try {
    let users = [];
    if (!targetRole || targetRole === "ALL") {
      users = await prisma.user.findMany({
        where: { status: "ACTIVE" },
        select: { id: true },
      });
    } else {
      users = await prisma.user.findMany({
        where: { role: targetRole, status: "ACTIVE" },
        select: { id: true },
      });
    }

    if (users.length === 0) return;
    const userIds = users.map((u) => u.id);

    await prisma.notification.createMany({
      data: userIds.map((uid) => ({
        userId: uid,
        title,
        content,
        type: "ANNOUNCEMENT",
        category: "GENERAL",
        priority: "NORMAL",
        link,
        isRead: false,
      })),
    });

    await dispatchPushToRecipients(
      userIds,
      {
        title,
        body: content,
        url: link,
        category: "general",
      },
      undefined,
      "general"
    );
  } catch (err) {
    console.error("[Notification Dispatcher] Announcement broadcast error:", err);
  }
}

// 3. User Specific Notification: Account update, password change, direct message
export async function sendUserNotification(
  userId: string,
  title: string,
  content: string,
  category: "account" | "academic" | "alerts" | "admin" | "maintenance" = "account",
  link: string = "/dashboard",
  priority: "NORMAL" | "URGENT" = "NORMAL"
) {
  try {
    await prisma.notification.create({
      data: {
        userId,
        title,
        content,
        type: priority === "URGENT" ? "ALERT" : "MESSAGE",
        category: category.toUpperCase(),
        priority,
        link,
        isRead: false,
      },
    });

    await dispatchPushToRecipients(
      [userId],
      {
        title,
        body: content,
        url: link,
        priority,
        category,
      },
      undefined,
      category
    );
  } catch (err) {
    console.error("[Notification Dispatcher] User notification error:", err);
  }
}

