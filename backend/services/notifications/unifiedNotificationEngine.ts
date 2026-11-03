import { prisma } from "@/backend/db/prisma";
import { invalidateUserNotifCache } from "@/backend/api/actions/notifications/unifiedNotificationActions";
import { dispatchPushToRecipients, PushPayload } from "@/backend/services/push/webPushService";

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
  } else if (c === "account" || t === "SECURITY") {
    categoryKey = "account";
  } else if (c === "maintenance" || t === "MAINTENANCE") {
    categoryKey = "maintenance";
  }

  return { categoryKey, priority };
}

/**
 * Step 1-7 Unified Notification Creator for a Single User
 * Automatically synchronizes:
 * 1. Database Notification Record
 * 2. NotificationRecipient Record (same ID)
 * 3. In-App Notification Bell & Center Cache
 * 4. Device System Push Notification (Android, Windows, macOS, iOS)
 */
export async function sendUnifiedNotification(input: UnifiedNotificationInput) {
  const { userId, title, content, type = "SYSTEM", link = "/dashboard" } = input;
  if (!userId || !title || !content) return null;

  const { categoryKey, priority: defaultPriority } = resolveCategory(type, input.category);
  const priority = input.priority || defaultPriority;

  try {
    // 1. Create persistent Notification record in Neon PostgreSQL
    const notification = await prisma.notification.create({
      data: {
        userId,
        title,
        content,
        type,
        category: categoryKey.toUpperCase(),
        priority,
        link,
        isRead: false,
        sentAt: new Date(),
      },
    });

    // 2. Create NotificationRecipient entry with the SAME notification ID
    await prisma.notificationRecipient.create({
      data: {
        notificationId: notification.id,
        userId,
        status: "SENT",
        read: false,
      },
    }).catch(() => {});

    // 3. Invalidate in-app unread notifications cache
    await invalidateUserNotifCache(userId);

    // 4. Trigger Web Push in background (non-blocking)
    (async () => {
      try {
        const payload: PushPayload = {
          title,
          body: content,
          url: link,
          priority,
          category: categoryKey,
          data: {
            notificationId: notification.id,
            url: link,
          },
        };

        await dispatchPushToRecipients(
          [userId],
          payload,
          notification.id,
          categoryKey
        );
      } catch (pushErr) {
        console.warn(`[UnifiedNotification] Push delivery error for user ${userId}:`, pushErr);
      }
    })();

    return notification;
  } catch (err) {
    console.error("[UnifiedNotification] Error creating notification:", err);
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
    // 1. Deduplicate user IDs
    const uniqueUserIds = Array.from(new Set(userIds));

    // 2. Create Master Notification for tracking
    const masterNotification = await prisma.notification.create({
      data: {
        userId: uniqueUserIds[0], // primary anchor
        title,
        content,
        type,
        category: categoryKey.toUpperCase(),
        priority,
        link,
        targetType: "BROADCAST",
        sentAt: new Date(),
        isRead: false,
      },
    });

    // 3. Create individual in-app notification rows so each user has an inbox entry
    await prisma.notification.createMany({
      data: uniqueUserIds.map((uid) => ({
        userId: uid,
        title,
        content,
        type,
        category: categoryKey.toUpperCase(),
        priority,
        link,
        isRead: false,
      })),
    });

    // 4. Populate NotificationRecipient table
    await prisma.notificationRecipient.createMany({
      data: uniqueUserIds.map((uid) => ({
        notificationId: masterNotification.id,
        userId: uid,
        status: "SENT",
        read: false,
      })),
      skipDuplicates: true,
    }).catch(() => {});

    // 5. Invalidate caches for all recipients
    for (const uid of uniqueUserIds) {
      invalidateUserNotifCache(uid);
    }

    // 6. Asynchronously dispatch Web Push to all devices matching recipient preferences
    (async () => {
      try {
        const payload: PushPayload = {
          title,
          body: content,
          url: link,
          priority,
          category: categoryKey,
          data: {
            notificationId: masterNotification.id,
            url: link,
          },
        };

        await dispatchPushToRecipients(
          uniqueUserIds,
          payload,
          masterNotification.id,
          categoryKey
        );
      } catch (pushErr) {
        console.warn("[UnifiedNotification] Broadcast push delivery error:", pushErr);
      }
    })();

    return { success: true, count: uniqueUserIds.length, notificationId: masterNotification.id };
  } catch (err) {
    console.error("[UnifiedNotification] Error sending broadcast:", err);
    return { success: false, error: "Failed to broadcast notifications" };
  }
}

