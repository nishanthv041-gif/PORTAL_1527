import webpush from "web-push";
import { prisma } from "@/backend/db/prisma";

// VAPID Credentials initialization
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
  console.warn("[NativePushDispatcher] VAPID initialization warning:", err);
}

export interface RegisterDevicePayload {
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  deviceId?: string;
  deviceType?: string;
}

export interface NativeChatMessagePushPayload {
  recipientId: string;
  senderName: string;
  senderRole?: string;
  messageSnippet: string;
  targetUrl: string;
}

/**
 * 1. Register or update a device in device_notifications_registry.
 * Ties the subscription to the user's active session and timestamps last_login_at.
 */
export async function registerDevicePushSubscription(data: RegisterDevicePayload) {
  const { userId, endpoint, p256dh, auth, deviceId } = data;
  const resolvedDeviceId = deviceId || `dev_${Math.abs(hashString(endpoint))}`;
  const now = new Date();

  // Upsert into device_notifications_registry
  const registryRecord = await prisma.deviceNotificationsRegistry.upsert({
    where: {
      userId_deviceId: {
        userId,
        deviceId: resolvedDeviceId,
      },
    },
    create: {
      userId,
      endpoint,
      p256dh,
      auth,
      deviceId: resolvedDeviceId,
      lastLoginAt: now,
    },
    update: {
      endpoint,
      p256dh,
      auth,
      lastLoginAt: now,
    },
  });

  // Also maintain backward-compatible tables
  try {
    await prisma.pushSubscription.upsert({
      where: { endpoint },
      create: {
        userId,
        endpoint,
        p256dh,
        auth,
        deviceFingerprint: resolvedDeviceId,
        lastLoginAt: now,
      },
      update: {
        userId,
        p256dh,
        auth,
        deviceFingerprint: resolvedDeviceId,
        lastLoginAt: now,
      },
    });

    await prisma.pwaSubscription.upsert({
      where: { endpoint },
      create: {
        userId,
        endpoint,
        p256dhKey: p256dh,
        authKey: auth,
        deviceType: data.deviceType || "mobile",
        lastActiveAt: now,
      },
      update: {
        userId,
        p256dhKey: p256dh,
        authKey: auth,
        lastActiveAt: now,
      },
    });
  } catch (err) {
    // Non-fatal if legacy tables differ
    console.warn("[NativePushDispatcher] Legacy table sync warning:", err);
  }

  return registryRecord;
}

/**
 * 2. Transmit native OS alert specifically targeting devices active in the last 24 hours.
 * Directly invokes webpush.sendNotification() and prunes 404/410 subscriptions.
 */
export async function sendNativeChatPushNotification(params: NativeChatMessagePushPayload) {
  const { recipientId, senderName, senderRole, messageSnippet, targetUrl } = params;
  const cutoffTime = new Date(Date.now() - 24 * 60 * 60 * 1000); // exactly last 24 hours

  // Query devices that have actively logged in within the last 24 hours
  const activeDevices = await prisma.deviceNotificationsRegistry.findMany({
    where: {
      userId: recipientId,
      lastLoginAt: { gte: cutoffTime },
    },
    select: {
      id: true,
      endpoint: true,
      p256dh: true,
      auth: true,
      deviceId: true,
    },
  });

  // Fallback: check legacy tables for 24h active sessions if registry is empty
  let candidateEndpoints = [...activeDevices];
  if (candidateEndpoints.length === 0) {
    const legacySubs = await prisma.pushSubscription.findMany({
      where: {
        userId: recipientId,
        isActive: true,
        lastLoginAt: { gte: cutoffTime },
      },
      select: {
        id: true,
        endpoint: true,
        p256dh: true,
        auth: true,
        deviceFingerprint: true,
      },
    });

    for (const sub of legacySubs) {
      candidateEndpoints.push({
        id: sub.id,
        endpoint: sub.endpoint,
        p256dh: sub.p256dh,
        auth: sub.auth,
        deviceId: sub.deviceFingerprint || "unknown",
      });
    }
  }

  if (candidateEndpoints.length === 0) {
    console.info(`[NativePushDispatcher] Recipient ${recipientId} has no active device sessions in the last 24h.`);
    return { sent: 0, failed: 0, eligible: 0 };
  }

  const roleText = senderRole ? ` (${senderRole})` : "";
  const pushPayload = JSON.stringify({
    title: `💬 New Message from ${senderName}${roleText}`,
    body: messageSnippet,
    url: targetUrl,
    icon: "/icons/icon-192x192.png",
    badge: "/icons/icon-192x192.png",
    tag: `chat-${Date.now()}`,
    data: {
      url: targetUrl,
      senderName,
      timestamp: Date.now(),
    },
  });

  const sendResults = await Promise.allSettled(
    candidateEndpoints.map(async (device) => {
      const subscription = {
        endpoint: device.endpoint,
        keys: {
          p256dh: device.p256dh,
          auth: device.auth,
        },
      };

      try {
        await webpush.sendNotification(subscription, pushPayload, {
          TTL: 86400, // 24 hours delivery window
          urgency: "high",
        });
        return { success: true, endpoint: device.endpoint };
      } catch (error: any) {
        const statusCode = error?.statusCode || 500;

        // Auto-clean dead or uninstalled registrations on HTTP 404 or 410 Gone
        if (statusCode === 404 || statusCode === 410) {
          console.info(`[NativePushDispatcher] Removing dead subscription (${statusCode}): ${device.endpoint}`);
          await prisma.deviceNotificationsRegistry.deleteMany({
            where: { endpoint: device.endpoint },
          }).catch(() => {});
          await prisma.pushSubscription.deleteMany({
            where: { endpoint: device.endpoint },
          }).catch(() => {});
          await prisma.pwaSubscription.deleteMany({
            where: { endpoint: device.endpoint },
          }).catch(() => {});
        }

        throw { statusCode, error: error?.message || "Delivery failed" };
      }
    })
  );

  let sent = 0;
  let failed = 0;
  for (const r of sendResults) {
    if (r.status === "fulfilled") sent++;
    else failed++;
  }

  console.info(`[NativePushDispatcher] Delivered chat alert to recipient ${recipientId}: ${sent} sent, ${failed} failed.`);
  return { sent, failed, eligible: candidateEndpoints.length };
}

export interface ActiveDevicePushPayload {
  title: string;
  body: string;
  url?: string;
  icon?: string;
  badge?: string;
  tag?: string;
  data?: Record<string, unknown>;
}

/**
 * Core Requirement: Target and send push notifications ONLY to devices/browser sessions
 * where the user has logged in within the last 48 hours.
 * 
 * 1. Cutoff: 48 hours ago.
 * 2. Queries PostgreSQL indexed composite index (userId, lastLoginAt).
 * 3. Concurrent dispatch via Promise.allSettled with web-push (TTL: 86400, urgency: "high").
 * 4. Automatic cleanup of HTTP 404 / 410 dead endpoints.
 */
export async function sendNotificationToActiveDevices(
  userId: string,
  rawPayload: ActiveDevicePushPayload | string
): Promise<{ sent: number; failed: number; eligible: number }> {
  if (!userId) return { sent: 0, failed: 0, eligible: 0 };

  const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);

  // 1. Query active subscriptions across tables within 48h window
  const [deviceRegistries, pushSubs, pwaSubs] = await Promise.all([
    prisma.deviceNotificationsRegistry.findMany({
      where: {
        userId,
        lastLoginAt: { gte: fortyEightHoursAgo },
      },
      select: {
        id: true,
        endpoint: true,
        p256dh: true,
        auth: true,
        deviceId: true,
      },
    }),
    prisma.pushSubscription.findMany({
      where: {
        userId,
        isActive: true,
        lastLoginAt: { gte: fortyEightHoursAgo },
      },
      select: {
        id: true,
        endpoint: true,
        p256dh: true,
        auth: true,
        deviceFingerprint: true,
      },
    }),
    prisma.pwaSubscription.findMany({
      where: {
        userId,
        lastActiveAt: { gte: fortyEightHoursAgo },
      },
      select: {
        id: true,
        endpoint: true,
        p256dhKey: true,
        authKey: true,
        deviceType: true,
      },
    }),
  ]);

  // Deduplicate by endpoint
  const targetMap = new Map<string, { endpoint: string; p256dh: string; auth: string; deviceId?: string }>();

  for (const reg of deviceRegistries) {
    targetMap.set(reg.endpoint, {
      endpoint: reg.endpoint,
      p256dh: reg.p256dh,
      auth: reg.auth,
      deviceId: reg.deviceId,
    });
  }

  for (const sub of pushSubs) {
    if (!targetMap.has(sub.endpoint)) {
      targetMap.set(sub.endpoint, {
        endpoint: sub.endpoint,
        p256dh: sub.p256dh,
        auth: sub.auth,
        deviceId: sub.deviceFingerprint || undefined,
      });
    }
  }

  for (const pwa of pwaSubs) {
    if (!targetMap.has(pwa.endpoint)) {
      targetMap.set(pwa.endpoint, {
        endpoint: pwa.endpoint,
        p256dh: pwa.p256dhKey,
        auth: pwa.authKey,
        deviceId: pwa.deviceType,
      });
    }
  }

  const targets = Array.from(targetMap.values());
  if (targets.length === 0) {
    console.info(`[NativePushDispatcher] User ${userId} has no active device sessions in the last 48 hours.`);
    return { sent: 0, failed: 0, eligible: 0 };
  }

  const payloadObj = typeof rawPayload === "string" ? { title: "SRT School Notification", body: rawPayload } : rawPayload;
  const targetUrl = payloadObj.url || "/dashboard";

  const stringifiedPayload = JSON.stringify({
    title: payloadObj.title,
    body: payloadObj.body,
    url: targetUrl,
    icon: payloadObj.icon || "/icons/icon-192x192.png",
    badge: payloadObj.badge || "/icons/icon-192x192.png",
    tag: payloadObj.tag || `notif-${Date.now()}`,
    data: {
      url: targetUrl,
      timestamp: Date.now(),
      ...payloadObj.data,
    },
  });

  const sendResults = await Promise.allSettled(
    targets.map(async (device) => {
      const subscription = {
        endpoint: device.endpoint,
        keys: {
          p256dh: device.p256dh,
          auth: device.auth,
        },
      };

      try {
        await webpush.sendNotification(subscription, stringifiedPayload, {
          TTL: 86400, // 24 hours delivery window
          urgency: "high",
        });
        return { success: true, endpoint: device.endpoint };
      } catch (error: any) {
        const statusCode = error?.statusCode || 500;

        // Auto-clean dead or uninstalled registrations on HTTP 404 or 410 Gone
        if (statusCode === 404 || statusCode === 410) {
          console.info(`[NativePushDispatcher] Removing dead subscription (${statusCode}): ${device.endpoint}`);
          await Promise.allSettled([
            prisma.deviceNotificationsRegistry.deleteMany({ where: { endpoint: device.endpoint } }),
            prisma.pushSubscription.deleteMany({ where: { endpoint: device.endpoint } }),
            prisma.pwaSubscription.deleteMany({ where: { endpoint: device.endpoint } }),
          ]);
        }

        throw { statusCode, error: error?.message || "Delivery failed" };
      }
    })
  );

  let sent = 0;
  let failed = 0;
  for (const r of sendResults) {
    if (r.status === "fulfilled") sent++;
    else failed++;
  }

  console.info(`[NativePushDispatcher] Dispatched 48h active notification to user ${userId}: ${sent} sent, ${failed} failed (${targets.length} eligible).`);
  return { sent, failed, eligible: targets.length };
}

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

