import { prisma } from "@/backend/db/prisma";
import webpush from "web-push";
import { invalidateUserNotifCache } from "@/backend/api/actions/notifications/unifiedNotificationActions";

// Initialize VAPID Credentials with production-verified keys
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
  console.warn("[PushDispatcher] VAPID initialization note:", err);
}

export type NotificationCategory =
  | "ANNOUNCEMENT"
  | "MEETING"
  | "MESSAGE"
  | "REPORT_CARD"
  | "BUS_MESSAGE"
  | "HOMEWORK"
  | "ATTENDANCE"
  | "GENERAL"
  | string;

export interface InstantNotificationParams {
  targetUserIds?: string | string[];
  targetAllUsers?: boolean;
  targetRoles?: string[];
  category: NotificationCategory;
  title: string;
  body: string;
  link?: string;
  tag?: string;
  priority?: "HIGH" | "NORMAL" | "URGENT";
  bypass48h?: boolean;
  icon?: string;
  badge?: string;
}

export interface InstantNotificationResult {
  success: boolean;
  recipientCount: number;
  inAppCount: number;
  pushEligible: number;
  pushSent: number;
  pushFailed: number;
  prunedEndpoints: number;
}

/**
 * High-Speed, Non-Blocking Push Dispatch Engine.
 * 
 * 1. Efficient recipient resolution (single user, user list, role broadcast, or all active users).
 * 2. Parallel In-App Database creation (Notification.createMany).
 * 3. Immediate High-Priority Web Push (Urgency: high, TTL: 86400, requireInteraction: true, renotify: true).
 * 4. Strict physical device endpoint deduplication.
 * 5. Automatic pruning of invalid / dead (404/410) push endpoints.
 */
export async function sendInstantPortalNotification(
  params: InstantNotificationParams
): Promise<InstantNotificationResult> {
  const {
    category,
    title,
    body,
    link = "/notifications",
    priority = "HIGH",
    bypass48h = false,
    icon = "/icons/icon-192x192.png",
    badge = "/icons/icon-192x192.png",
  } = params;

  if (!title || !body) {
    return { success: false, recipientCount: 0, inAppCount: 0, pushEligible: 0, pushSent: 0, pushFailed: 0, prunedEndpoints: 0 };
  }

  // 1. Recipient Resolution
  let resolvedUserIds: string[] = [];

  if (params.targetAllUsers) {
    try {
      const allActive = await prisma.user.findMany({
        where: { status: "ACTIVE" },
        select: { id: true },
      });
      resolvedUserIds = allActive.map((u) => u.id);
    } catch (e) {
      console.error("[PushDispatcher] Error resolving all users:", e);
    }
  } else if (params.targetRoles && params.targetRoles.length > 0) {
    try {
      const roleUsers = await prisma.user.findMany({
        where: {
          status: "ACTIVE",
          role: { in: params.targetRoles },
        },
        select: { id: true },
      });
      resolvedUserIds = roleUsers.map((u) => u.id);
    } catch (e) {
      console.error("[PushDispatcher] Error resolving role users:", e);
    }
  }

  if (params.targetUserIds) {
    const directIds = Array.isArray(params.targetUserIds) ? params.targetUserIds : [params.targetUserIds];
    resolvedUserIds = [...resolvedUserIds, ...directIds];
  }

  // Deduplicate and filter valid IDs
  const targetUserIds = Array.from(new Set(resolvedUserIds.filter((id): id is string => Boolean(id && typeof id === "string"))));

  if (targetUserIds.length === 0) {
    return { success: true, recipientCount: 0, inAppCount: 0, pushEligible: 0, pushSent: 0, pushFailed: 0, prunedEndpoints: 0 };
  }

  const normalizedCategory = (category || "GENERAL").toUpperCase();
  const normalizedPriority = (priority || "HIGH").toUpperCase();

  // 2. Parallel Database Bulk Insert (In-App Notification Center)
  let inAppCount = 0;
  try {
    const created = await prisma.notification.createMany({
      data: targetUserIds.map((uid) => ({
        userId: uid,
        title,
        content: body,
        body,
        category: normalizedCategory,
        type: normalizedCategory,
        priority: normalizedPriority,
        link,
        isRead: false,
        sentAt: new Date(),
        createdAt: new Date(),
      })),
    });
    inAppCount = created.count;

    // Invalidate user notification badge caches
    for (const uid of targetUserIds) {
      invalidateUserNotifCache(uid).catch(() => {});
    }
  } catch (err) {
    console.error("[PushDispatcher] Failed to create in-app notification rows:", err);
  }

  // 3. Multi-Device Push Subscription Targeting & Strict Deduplication
  // High-priority and emergency broadcasts (e.g. Bus, Announcements) bypass the 48-hour activity cutoff
  const isUrgent =
    bypass48h ||
    normalizedPriority === "HIGH" ||
    normalizedPriority === "URGENT" ||
    normalizedCategory === "BUS_MESSAGE" ||
    normalizedCategory === "BUS" ||
    normalizedCategory === "ANNOUNCEMENT";

  const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);

  let pushEligible = 0;
  let pushSent = 0;
  let pushFailed = 0;
  let prunedEndpoints = 0;

  try {
    const subscriptionWhere: any = {
      userId: { in: targetUserIds },
      isActive: true,
    };
    if (!isUrgent) {
      subscriptionWhere.lastLoginAt = { gte: fortyEightHoursAgo };
    }

    const [primarySubs, registrySubs] = await Promise.all([
      prisma.pushSubscription.findMany({
        where: subscriptionWhere,
        select: {
          id: true,
          userId: true,
          endpoint: true,
          p256dh: true,
          auth: true,
        },
      }),
      prisma.deviceNotificationsRegistry
        .findMany({
          where: isUrgent
            ? { userId: { in: targetUserIds } }
            : { userId: { in: targetUserIds }, lastLoginAt: { gte: fortyEightHoursAgo } },
          select: {
            id: true,
            userId: true,
            endpoint: true,
            p256dh: true,
            auth: true,
          },
        })
        .catch(() => []),
    ]);

    // STRICT ENDPOINT DEDUPLICATION: Map by unique endpoint so each device receives EXACTLY ONE push
    const endpointMap = new Map<string, { id: string; userId: string | null; endpoint: string; p256dh: string; auth: string }>();

    for (const sub of primarySubs) {
      if (sub.endpoint && sub.p256dh && sub.auth && !endpointMap.has(sub.endpoint)) {
        endpointMap.set(sub.endpoint, {
          id: sub.id,
          userId: sub.userId,
          endpoint: sub.endpoint,
          p256dh: sub.p256dh,
          auth: sub.auth,
        });
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
        params.tag ||
        `${normalizedCategory.toLowerCase()}-${link.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 35)}`;

      const pushPayload = JSON.stringify({
        title,
        body,
        url: link,
        icon,
        badge,
        tag: deterministicTag,
        renotify: true,
        vibrate: [200, 100, 200],
        requireInteraction: true,
        priority: "high",
        data: {
          url: link,
          tag: deterministicTag,
          category: normalizedCategory,
          timestamp: Date.now(),
        },
      });

      // High-priority Web Push Options with explicit lock-screen wakeup urgency
      const pushOptions = {
        TTL: 86400,
        urgency: "high" as const,
        headers: {
          Urgency: "high",
        },
      };

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
              pushOptions
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
    console.error("[PushDispatcher] Error during push delivery:", err);
  }

  return {
    success: true,
    recipientCount: targetUserIds.length,
    inAppCount,
    pushEligible,
    pushSent,
    pushFailed,
    prunedEndpoints,
  };
}

/**
 * Non-blocking convenience wrapper.
 * Fires the notification immediately in the background without blocking the caller.
 */
export function fireInstantPortalNotification(params: InstantNotificationParams): void {
  sendInstantPortalNotification(params).catch((err) => {
    console.error("[PushDispatcher] Background fire error:", err);
  });
}
