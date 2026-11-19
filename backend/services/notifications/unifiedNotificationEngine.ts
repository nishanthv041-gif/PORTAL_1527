import { prisma } from "@/backend/db/prisma";
import { dispatchNotification } from "@/lib/dispatcher";

export type NotificationCategoryType =
  | "general"
  | "account"
  | "alerts"
  | "academic"
  | "admin"
  | "maintenance";

export interface UnifiedNotificationInput {
  userId: string;
  title: string;
  content: string;
  type?: string; // MESSAGE, ANNOUNCEMENT, REPORT_CARD, EXAM, HOMEWORK, MEETING, SYSTEM, BUS, ALERT
  category?: NotificationCategoryType | string;
  priority?: "NORMAL" | "URGENT";
  link?: string;
  senderId?: string;
}

export interface UnifiedBroadcastInput {
  userIds: string[];
  title: string;
  content: string;
  type?: string;
  category?: NotificationCategoryType | string;
  priority?: "NORMAL" | "URGENT";
  link?: string;
  senderId?: string;
}

/**
 * Maps raw type/category strings to user preference category keys
 */
function resolveCategory(
  type?: string,
  category?: string
): { categoryKey: NotificationCategoryType; priority: "NORMAL" | "URGENT" } {
  const t = (type || "").toUpperCase();
  const c = (category || "").toLowerCase();

  let priority: "NORMAL" | "URGENT" = "NORMAL";
  let categoryKey: NotificationCategoryType = "general";

  if (t === "BUS" || c === "bus" || t === "ALERT" || c === "alerts" || t === "ERROR" || t === "WARNING") {
    categoryKey = "alerts";
    priority = "URGENT";
  } else if (
    t === "REPORT_CARD" ||
    t === "EXAM" ||
    t === "HOMEWORK" ||
    t === "ASSIGNMENT" ||
    c === "academic"
  ) {
    categoryKey = "academic";
  } else if (t === "MESSAGE" || c === "admin") {
    categoryKey = "admin";
  }

  return { categoryKey, priority };
}

/**
 * Step 1-7 Unified Notification Creator for a Single User
 * Automatically synchronizes In-App Notifications, OneSignal, and Direct WebPush.
 */
export async function sendUnifiedNotification(input: UnifiedNotificationInput) {
  const { userId, title, content, type = "SYSTEM", link = "/dashboard" } = input;
  if (!userId || !title || !content) return null;

  const { categoryKey, priority: defaultPriority } = resolveCategory(type, input.category);
  const priority = input.priority || defaultPriority;

  try {
    const result = await dispatchNotification({
      type: type || categoryKey.toUpperCase(),
      recipients: [userId],
      title,
      body: content,
      url: link,
      priority: priority === "URGENT" ? "URGENT" : "HIGH",
    });

    const notif = await prisma.notification.findFirst({
      where: { userId, title },
      orderBy: { createdAt: "desc" },
    });

    return notif || { id: "notif-dispatched", userId, title, content, isRead: false };
  } catch (err) {
    console.error("[UnifiedNotification] Error dispatching notification:", err);
    return null;
  }
}

/**
 * Step 1-7 Unified Notification Creator for Multiple Users / Broadcast
 */
export async function sendUnifiedBroadcast(input: UnifiedBroadcastInput) {
  const { userIds, title, content, type = "ANNOUNCEMENT", link = "/dashboard" } = input;
  if (!userIds || userIds.length === 0 || !title || !content) return { count: 0 };

  const { categoryKey, priority: defaultPriority } = resolveCategory(type, input.category);
  const priority = input.priority || defaultPriority;

  try {
    const result = await dispatchNotification({
      type: type || categoryKey.toUpperCase(),
      recipients: userIds,
      title,
      body: content,
      url: link,
      priority: priority === "URGENT" ? "URGENT" : "HIGH",
    });

    return {
      success: result.success,
      count: result.recipientCount,
      notificationId: "broadcast-" + Date.now(),
    };
  } catch (err) {
    console.error("[UnifiedNotification] Error sending broadcast:", err);
    return { success: false, error: "Failed to broadcast notifications" };
  }
}
