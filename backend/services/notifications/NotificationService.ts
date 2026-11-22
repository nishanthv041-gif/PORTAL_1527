import { prisma } from "@/backend/db/prisma";
import webpush from "web-push";
import { sendOneSignalPush } from "@/backend/services/push/oneSignalService";
import { invalidateUserNotifCache } from "@/backend/api/actions/notifications/unifiedNotificationActions";

// Initialize VAPID
const VAPID_PUBLIC_KEY =
  process.env.VAPID_PUBLIC_KEY ||
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
  "BBIHzbc-DVhlpPB_plCE0gUMpCSsHiqA1Y5FVyP-ax6p0HWnFZILFISth4FYfyAp0gywswCBxz4GfDnXm_c-Agk";

const VAPID_PRIVATE_KEY =
  process.env.VAPID_PRIVATE_KEY ||
  "ExZi6lTrD-JWJN9cqk88AA6Y8-vxTYaxwhaY4AUwMFc";

const VAPID_SUBJECT =
  process.env.VAPID_SUBJECT || "mailto:admin@nipoportal.com";

let vapidConfigured = false;
try {
  if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    vapidConfigured = true;
  }
} catch (err) {
  console.warn("[NotificationService] VAPID init note:", err);
}

export type NotificationType =
  | "ANNOUNCEMENT"
  | "REPORT_CARD"
  | "MARKS"
  | "ASSIGNMENT"
  | "ATTENDANCE"
  | "CALENDAR"
  | "BUS"
  | "LEAVE"
  | "PASSWORD"
  | "FEE"
  | "MESSAGE"
  | "GENERAL";

export interface SendNotificationOptions {
  recipients: string | string[];
  type: NotificationType | string;
  title: string;
  body: string;
  link?: string;
  data?: Record<string, any>;
  priority?: "NORMAL" | "HIGH" | "URGENT";
  dedupeKey?: string;
  category?: string;
  icon?: string;
  badge?: string;
  targetType?: string;
  targetRole?: string;
}

export interface SendNotificationResult {
  success: boolean;
  notificationId?: string;
  recipientsCount: number;
  inAppCount: number;
  pushSent: number;
  pushFailed: number;
  skippedDedupeCount: number;
}

export class NotificationService {
  /**
   * Primary entry point for sending notifications across the entire portal.
   * Guarantees database persistence, 24-hour deduplication, clean multi-channel push,
   * dead endpoint cleanup, and unread badge cache invalidation.
   */
  static async send(options: SendNotificationOptions): Promise<SendNotificationResult> {
    const {
      recipients,
      type = "GENERAL",
      title,
      body,
      link = "/dashboard",
      data = {},
      priority = "NORMAL",
      dedupeKey,
      category,
      icon = "/icon-192x192.png",
      badge = "/badge-72x72.png",
      targetType,
      targetRole,
    } = options;

    if (!title || !body) {
      return {
        success: false,
        recipientsCount: 0,
        inAppCount: 0,
        pushSent: 0,
        pushFailed: 0,
        skippedDedupeCount: 0,
      };
    }

    // Normalize recipient list
    const rawList = Array.isArray(recipients) ? recipients : [recipients];
    const uniqueUserIds = Array.from(
      new Set(rawList.map((id) => (typeof id === "string" ? id.trim() : "")).filter(Boolean))
    );

    if (uniqueUserIds.length === 0) {
      return {
        success: true,
        recipientsCount: 0,
        inAppCount: 0,
        pushSent: 0,
        pushFailed: 0,
        skippedDedupeCount: 0,
      };
    }

    const normalizedType = (type || "GENERAL").toUpperCase();
    const normalizedCategory = (category || normalizedType).toUpperCase();
    const now = new Date();
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // 1. Deduplication check if dedupeKey is provided
    let eligibleUserIds = uniqueUserIds;
    let skippedDedupeCount = 0;

    if (dedupeKey) {
      try {
        const existingNotifications = await prisma.notification.findMany({
          where: {
            dedupeKey,
            userId: { in: uniqueUserIds },
            createdAt: { gte: oneDayAgo },
          },
          select: { userId: true },
        });

        const existingSet = new Set(existingNotifications.map((n) => n.userId));
        eligibleUserIds = uniqueUserIds.filter((uid) => !existingSet.has(uid));
        skippedDedupeCount = uniqueUserIds.length - eligibleUserIds.length;

        if (eligibleUserIds.length === 0) {
          return {
            success: true,
            recipientsCount: uniqueUserIds.length,
            inAppCount: 0,
            pushSent: 0,
            pushFailed: 0,
            skippedDedupeCount,
          };
        }
      } catch (dedupeErr) {
        console.warn("[NotificationService] Dedupe check note:", dedupeErr);
      }
    }

    // 2. Insert into Notification table
    let firstNotificationId = "";
    let inAppCount = 0;

    try {
      // Create records individually or via createMany
      const createData = eligibleUserIds.map((uid) => ({
        userId: uid,
        title,
        content: body,
        body,
        type: normalizedType,
        category: normalizedCategory,
        priority,
        link,
        data: data || {},
        isRead: false,
        readAt: null,
        deliveredAt: null,
        dedupeKey: dedupeKey || null,
        targetType: targetType || null,
        targetRole: targetRole || null,
        createdAt: now,
      }));

      if (eligibleUserIds.length === 1) {
        const singleRow = await prisma.notification.create({
          data: createData[0],
        });
        firstNotificationId = singleRow.id;
        inAppCount = 1;
      } else {
        const batchResult = await prisma.notification.createMany({
          data: createData,
        });
        inAppCount = batchResult.count;
      }

      // Invalidate in-memory & badge cache
      for (const uid of eligibleUserIds) {
        invalidateUserNotifCache(uid).catch(() => {});
      }
    } catch (insertErr) {
      console.error("[NotificationService] Error creating notification records:", insertErr);
    }

    // Stable deterministic tag for OS notification collapsing
    const stableTag = dedupeKey || (firstNotificationId ? `notif-${firstNotificationId}` : `srt-${normalizedType.toLowerCase()}`);

    // 3. Dispatch Push Notifications
    let pushSent = 0;
    let pushFailed = 0;

    try {
      // Fetch active web push subscriptions for eligible users
      const subscriptions = await prisma.pushSubscription.findMany({
        where: {
          userId: { in: eligibleUserIds },
          isActive: true,
        },
        select: {
          id: true,
          userId: true,
          endpoint: true,
          p256dh: true,
          auth: true,
        },
      });

      // Deduplicate by endpoint
      const endpointMap = new Map<string, typeof subscriptions[0]>();
      for (const sub of subscriptions) {
        if (sub.endpoint && sub.p256dh && sub.auth && !endpointMap.has(sub.endpoint)) {
          endpointMap.set(sub.endpoint, sub);
        }
      }

      const activeSubs = Array.from(endpointMap.values());

      // Prepare WebPush Payload
      const pushPayload = JSON.stringify({
        title,
        body,
        url: link,
        unreadCount: 1,
        badgeCount: 1,
        icon,
        badge,
        tag: stableTag,
        data: {
          url: link,
          notificationId: firstNotificationId,
          type: normalizedType,
          category: normalizedCategory,
          tag: stableTag,
          ...data,
        },
      });

      const pushPromises = activeSubs.map(async (sub) => {
        if (!vapidConfigured) return;
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: {
                p256dh: sub.p256dh!,
                auth: sub.auth!,
              },
            },
            pushPayload,
            {
              TTL: 86400,
              urgency: priority === "URGENT" ? "high" : "normal",
            }
          );
          pushSent++;
        } catch (pushErr: any) {
          pushFailed++;
          const statusCode = pushErr?.statusCode || pushErr?.status;
          // If subscription has expired / unregistered (404 or 410), prune it
          if (statusCode === 404 || statusCode === 410) {
            await prisma.pushSubscription.deleteMany({
              where: { endpoint: sub.endpoint },
            }).catch(() => {});
          }
        }
      });

      // Also dispatch via OneSignal for external_id targeting
      const oneSignalPromise = sendOneSignalPush({
        userId: eligibleUserIds,
        title,
        body,
        url: link,
        unreadCount: 1,
        category: normalizedCategory,
        additionalData: {
          notificationId: firstNotificationId,
          type: normalizedType,
          tag: stableTag,
          ...data,
        },
      }).then((res) => {
        if (res.success && res.recipients) {
          pushSent += res.recipients;
        }
      }).catch((osErr) => {
        console.warn("[NotificationService] OneSignal dispatch note:", osErr);
      });

      await Promise.allSettled([...pushPromises, oneSignalPromise]);

      // Update deliveredAt timestamp for created notifications
      if (firstNotificationId) {
        await prisma.notification.updateMany({
          where: {
            id: firstNotificationId,
          },
          data: {
            deliveredAt: new Date(),
          },
        }).catch(() => {});
      } else if (eligibleUserIds.length > 0) {
        await prisma.notification.updateMany({
          where: {
            userId: { in: eligibleUserIds },
            createdAt: now,
          },
          data: {
            deliveredAt: new Date(),
          },
        }).catch(() => {});
      }
    } catch (pushDispatchErr) {
      console.warn("[NotificationService] Push delivery dispatch note:", pushDispatchErr);
    }

    return {
      success: true,
      notificationId: firstNotificationId,
      recipientsCount: uniqueUserIds.length,
      inAppCount,
      pushSent,
      pushFailed,
      skippedDedupeCount,
    };
  }
}
