import { prisma } from "@/backend/db/prisma";
import { dispatchNotification } from "@/lib/dispatcher";

/**
 * Standardized Notification Dispatcher for SRT Portal
 * Handles in-app records and real-time Web Push + OneSignal delivery across user roles.
 */

// 1. Admin Alert: Notify all administrators of critical system events
export async function sendSystemAlertToAdmins(
  title: string,
  content: string,
  priority: "NORMAL" | "URGENT" = "NORMAL"
) {
  try {
    await dispatchNotification({
      type: priority === "URGENT" ? "ALERT" : "SYSTEM",
      audience: { roles: ["ADMIN"] },
      title: `🚨 ${title}`,
      body: content,
      url: "/dashboard/admin/system-health",
      priority: priority === "URGENT" ? "URGENT" : "HIGH",
    });
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
    await dispatchNotification({
      type: "ANNOUNCEMENT",
      audience: targetRole && targetRole !== "ALL" ? { roles: [targetRole as any] } : { all: true },
      title,
      body: content,
      url: link,
      priority: "HIGH",
    });
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
    await dispatchNotification({
      type: category.toUpperCase(),
      recipients: [userId],
      title,
      body: content,
      url: link,
      priority: priority === "URGENT" ? "URGENT" : "HIGH",
    });
  } catch (err) {
    console.error("[Notification Dispatcher] User notification error:", err);
  }
}
