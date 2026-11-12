import { prisma } from "@/backend/db/prisma";
import webpush from "web-push";
import { invalidateUserNotifCache } from "@/backend/api/actions/notifications/unifiedNotificationActions";

// Initialize VAPID Credentials with verified keys and fallback
const VAPID_PUBLIC_KEY =
  process.env.VAPID_PUBLIC_KEY ||
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
  "BBIHzbc-DVhlpPB_plCE0gUMpCSsHiqA1Y5FVyP-ax6p0HWnFZILFISth4FYfyAp0gywswCBxz4GfDnXm_c-Agk";

const VAPID_PRIVATE_KEY =
  process.env.VAPID_PRIVATE_KEY ||
  "ExZi6lTrD-JWJN9cqk88AA6Y8-vxTYaxwhaY4AUwMFc";

const VAPID_SUBJECT =
  process.env.VAPID_SUBJECT || "mailto:admin@nipoportal.com";

try {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
} catch (err) {
  console.warn("[PortalNotifications] VAPID initialization warning:", err);
}

export type PortalNotificationType =
  | "REPORT_CARD"
  | "HOMEWORK"
  | "MESSAGE"
  | "ANNOUNCEMENT"
  | "ATTENDANCE"
  | "GENERAL"
  | string;

export interface DispatchPortalNotificationOptions {
  userIds: string | string[];
  type: PortalNotificationType;
  title: string;
  message: string;
  link: string;
  tag?: string;
  priority?: "NORMAL" | "URGENT";
  category?: string;
  icon?: string;
  badge?: string;
}

export interface DispatchPortalNotificationResult {
  inAppCount: number;
  pushEligible: number;
  pushSent: number;
  pushFailed: number;
  prunedEndpoints: number;
}

/**
 * Centralized, production-grade notification dispatch service.
 * 1. Bulk-inserts In-App Notification records in PostgreSQL.
 * 2. Targets active device push subscriptions (lastLoginAt >= 48 hours).
 * 3. Enforces strict device endpoint deduplication (prevents 2x duplicate pushes).
 * 4. Applies deterministic notification tags so Android cleanly updates existing banners.
 * 5. Automatically prunes HTTP 404 / 410 dead endpoints.
 */
export async function dispatchPortalNotification(
  options: DispatchPortalNotificationOptions
): Promise<DispatchPortalNotificationResult> {
  const {
    type,
    title,
    message,
    link,
    priority = "NORMAL",
    category,
    icon = "/icons/icon-192x192.png",
    badge = "/icons/icon-192x192.png",
  } = options;

  // 1. Sanitize & deduplicate user IDs
  const rawUserIds = Array.isArray(options.userIds) ? options.userIds : [options.userIds];
  const userIds = Array.from(new Set(rawUserIds.filter((id): id is string => Boolean(id && typeof id === "string"))));

  if (userIds.length === 0 || !title || !message) {
    return { inAppCount: 0, pushEligible: 0, pushSent: 0, pushFailed: 0, prunedEndpoints: 0 };
  }

  const resolvedCategory = (category || (type === "REPORT_CARD" || type === "HOMEWORK" ? "ACADEMIC" : type === "ATTENDANCE" ? "ACADEMIC" : "GENERAL")).toUpperCase();

  // 2. Insert persistent In-App Notification records in PostgreSQL
  let inAppCount = 0;
  try {
    const created = await prisma.notification.createMany({
      data: userIds.map((uid) => ({
        userId: uid,
        title,
        content: message,
        type,
        category: resolvedCategory,
        priority,
        link,
        isRead: false,
        sentAt: new Date(),
        createdAt: new Date(),
      })),
    });
    inAppCount = created.count;

    // Invalidate user notification badge caches
    for (const uid of userIds) {
      invalidateUserNotifCache(uid).catch(() => {});
    }
  } catch (err) {
    console.error("[PortalNotifications] Failed to create in-app notification rows:", err);
  }

  // 3. Query Active Push Subscriptions (< 48 hours cutoff)
  const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
  let pushSent = 0;
  let pushFailed = 0;
  let prunedEndpoints = 0;
  let pushEligible = 0;

  try {
    const primarySubs = await prisma.pushSubscription.findMany({
      where: {
        userId: { in: userIds },
        isActive: true,
        lastLoginAt: { gte: fortyEightHoursAgo },
      },
      select: {
        id: true,
        userId: true,
        endpoint: true,
        p256dh: true,
        auth: true,
      },
    });

    // Also collect from device_notifications_registry if exists
    let registrySubs: Array<{ id: string; userId: string; endpoint: string; p256dh: string; auth: string }> = [];
    try {
      registrySubs = await prisma.deviceNotificationsRegistry.findMany({
        where: {
          userId: { in: userIds },
          lastLoginAt: { gte: fortyEightHoursAgo },
        },
        select: {
          id: true,
          userId: true,
          endpoint: true,
          p256dh: true,
          auth: true,
        },
      });
    } catch {
      // Optional table
    }

    // STRICT DEDUPLICATION: Map by unique endpoint so each device receives EXACTLY ONE push
    const endpointMap = new Map<string, { id: string; userId: string | null; endpoint: string; p256dh: string; auth: string }>();

    for (const sub of primarySubs) {
      if (sub.endpoint && sub.p256dh && sub.auth && !endpointMap.has(sub.endpoint)) {
        endpointMap.set(sub.endpoint, sub);
      }
    }

    for (const reg of registrySubs) {
      if (reg.endpoint && reg.p256dh && reg.auth && !endpointMap.has(reg.endpoint)) {
        endpointMap.set(reg.endpoint, reg);
      }
    }

    const uniqueDevices = Array.from(endpointMap.values());
    pushEligible = uniqueDevices.length;

    if (uniqueDevices.length > 0) {
      // Deterministic tag: prevents duplicates on Android lock screen & notification shade
      const deterministicTag =
        options.tag ||
        `${type.toLowerCase()}-${link.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 40)}`;

      const pushPayload = JSON.stringify({
        title,
        body: message,
        url: link,
        icon,
        badge,
        tag: deterministicTag,
        renotify: true,
        data: {
          url: link,
          tag: deterministicTag,
          type,
          timestamp: Date.now(),
        },
      });

      const pushResults = await Promise.allSettled(
        uniqueDevices.map(async (device) => {
          try {
            await webpush.sendNotification(
              {
                endpoint: device.endpoint,
                keys: {
                  p256dh: device.p256dh,
                  auth: device.auth,
                },
              },
              pushPayload,
              {
                TTL: 86400,
                urgency: priority === "URGENT" ? "high" : "high",
              }
            );
            return { success: true, endpoint: device.endpoint };
          } catch (pushErr: any) {
            const statusCode = pushErr?.statusCode;
            if (statusCode === 404 || statusCode === 410) {
              // Endpoint is dead or uninstalled: auto-prune
              await Promise.allSettled([
                prisma.pushSubscription.deleteMany({ where: { endpoint: device.endpoint } }),
                prisma.deviceNotificationsRegistry.deleteMany({ where: { endpoint: device.endpoint } }),
              ]);
              return { success: false, endpoint: device.endpoint, pruned: true };
            }
            return { success: false, endpoint: device.endpoint, error: pushErr?.message };
          }
        })
      );

      for (const res of pushResults) {
        if (res.status === "fulfilled") {
          if (res.value.success) {
            pushSent++;
          } else {
            pushFailed++;
            if (res.value.pruned) prunedEndpoints++;
          }
        } else {
          pushFailed++;
        }
      }
    }
  } catch (err) {
    console.error("[PortalNotifications] Push dispatch error:", err);
  }

  return { inAppCount, pushEligible, pushSent, pushFailed, prunedEndpoints };
}

/**
 * Non-blocking convenience wrapper.
 * Fires notification in the background without awaiting or blocking the calling route.
 */
export function firePortalNotification(options: DispatchPortalNotificationOptions): void {
  dispatchPortalNotification(options).catch((err) => {
    console.error("[PortalNotifications] Background fire error:", err);
  });
}
