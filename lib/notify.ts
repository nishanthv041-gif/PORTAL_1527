import { prisma } from "@/backend/db/prisma";
import webpush from "web-push";
import { initializeApp, getApps, cert, type App } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import { invalidateUserNotifCache } from "@/backend/api/actions/notifications/unifiedNotificationActions";
import { sendOneSignalPush, OneSignalPushResult } from "@/backend/services/push/oneSignalService";
import { dispatchNotification, DispatchNotificationOptions, DispatchNotificationResult } from "./dispatcher";

export { dispatchNotification, sendOneSignalPush };
export type { DispatchNotificationOptions, DispatchNotificationResult };

export const BATCH_CHUNK_SIZE = 50;

// 48-hour active device window for push delivery
export const ACTIVE_DEVICE_WINDOW_MS = 48 * 60 * 60 * 1000;

// ============================================================================
// 1. VAPID Configuration for Web & iOS Safari PWA Push
// ============================================================================
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
  } else {
    console.warn("[Notify] VAPID keys not configured. Web/iOS push will be disabled.");
  }
} catch (err) {
  console.warn("[Notify] VAPID initialization warning:", err);
}

// ============================================================================
// 2. Firebase Admin Configuration for Native Android Capacitor Push
// ============================================================================
let firebaseApp: App | null = null;
let firebaseInitialized = false;

function getFirebaseAdmin(): App | null {
  if (firebaseApp) return firebaseApp;
  const existingApps = getApps();
  if (existingApps.length > 0) {
    firebaseApp = existingApps[0]!;
    return firebaseApp;
  }

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!serviceAccountJson) {
    if (!firebaseInitialized) {
      console.warn(
        "[Notify] FIREBASE_SERVICE_ACCOUNT env var not provided. Android native FCM push disabled."
      );
      firebaseInitialized = true;
    }
    return null;
  }

  try {
    const serviceAccount = JSON.parse(serviceAccountJson);
    firebaseApp = initializeApp({
      credential: cert(serviceAccount),
    });
    return firebaseApp;
  } catch (e) {
    console.warn("[Notify] Failed to parse FIREBASE_SERVICE_ACCOUNT JSON:", e);
    return null;
  }
}

export interface UniversalNotificationOptions {
  userId: string;
  title: string;
  body: string;
  content?: string;
  url?: string;
  tag?: string;
  category?: string;
  priority?: "HIGH" | "NORMAL" | "URGENT";
  icon?: string;
  badge?: string;
  entityId?: string;
  eventType?: string;
}

export interface UniversalNotificationResult {
  success: boolean;
  notificationId: string;
  inAppCreated: boolean;
  oneSignalCount: number;
  webPushCount: number;
  androidPushCount: number;
  failedCount: number;
  prunedCount: number;
}

/**
 * sendUniversalNotification
 * 
 * Centralized, multi-platform notification pipeline delivering:
 * 1. PostgreSQL In-App Notification (Notification table)
 * 2. PC Desktop & iOS Safari PWA Web Push (via web-push with VAPID)
 * 3. Android Capacitor App Native Push (via firebase-admin FCM)
 * 4. OneSignal REST API (external_id targeting)
 * 
 * Automatically purges stale/expired tokens (HTTP 410 or FCM not-registered).
 * Strictly awaited to ensure reliable delivery in Vercel/serverless environments.
 */
export async function sendUniversalNotification(
  options: UniversalNotificationOptions
): Promise<UniversalNotificationResult> {
  const {
    userId,
    title,
    body,
    content,
    url = "/dashboard",
    tag,
    category = "MESSAGE",
    priority = "HIGH",
    icon = "/icons/icon-192x192.png",
    badge = "/icons/icon-192x192.png",
  } = options;

  let notificationId = "";
  let inAppCreated = false;
  let oneSignalCount = 0;
  let webPushCount = 0;
  let androidPushCount = 0;
  let failedCount = 0;
  let prunedCount = 0;

  // 1. In-App Notification (PostgreSQL Record)
  // Deduplicate: If an identical notification was created for this user in the last 60 seconds, reuse it
  try {
    const recentCutoff = new Date(Date.now() - 60000);
    const existingNotif = await prisma.notification.findFirst({
      where: {
        userId,
        title,
        content: content || body,
        createdAt: { gte: recentCutoff },
      },
      select: { id: true },
    });

    if (existingNotif) {
      notificationId = existingNotif.id;
      inAppCreated = true;
    } else {
      const notif = await prisma.notification.create({
        data: {
          userId,
          title,
          content: content || body,
          body: body || content || "",
          type: category,
          category,
          priority,
          link: url,
          isRead: false,
          dedupeKey: tag || null,
        },
      });
      notificationId = notif.id;
      inAppCreated = true;
      await invalidateUserNotifCache(userId);
    }
  } catch (err) {
    console.error("[Notify] In-app notification creation error:", err);
  }

  // Calculate unread count for OS lock-screen app icon badge
  let unreadCount = 1;
  try {
    const unreadFromDb = await prisma.notification.count({
      where: { userId, isRead: false },
    });
    unreadCount = Math.max(1, unreadFromDb);
  } catch {
    unreadCount = 1;
  }

  // Stable deterministic tag
  const deterministicTag = tag || `notif-${options.entityId || notificationId || Date.now()}`;

  // 2. Dispatch OneSignal Push
  try {
    const osResult = await sendOneSignalPush({
      userId,
      title,
      body,
      url,
      unreadCount,
      category,
      additionalData: {
        tag: deterministicTag,
        notificationId,
      },
    });
    if (osResult.success && osResult.recipients) {
      oneSignalCount = osResult.recipients;
    }
  } catch (osErr) {
    console.warn("[Notify] OneSignal dispatch note:", osErr);
  }

  // 3. Query Active Push Subscriptions across tables
  const [primarySubs, pwaSubs, registrySubs] = await Promise.all([
    prisma.pushSubscription.findMany({
      where: { userId, isActive: true },
      select: { id: true, endpoint: true, p256dh: true, auth: true, platform: true, token: true },
    }),
    prisma.pwaSubscription.findMany({
      where: { userId },
      select: { id: true, endpoint: true, p256dhKey: true, authKey: true, deviceType: true },
    }).catch(() => []),
    prisma.deviceNotificationsRegistry.findMany({
      where: { userId },
      select: { id: true, endpoint: true, p256dh: true, auth: true },
    }).catch(() => []),
  ]);

  const targetMap = new Map<string, any>();
  for (const s of primarySubs) {
    if (s.endpoint) targetMap.set(s.endpoint, s);
  }
  for (const s of pwaSubs) {
    if (s.endpoint && !targetMap.has(s.endpoint)) {
      targetMap.set(s.endpoint, {
        id: s.id,
        endpoint: s.endpoint,
        p256dh: s.p256dhKey,
        auth: s.authKey,
        platform: s.deviceType === "IOS" ? "IOS" : "WEB",
      });
    }
  }
  for (const s of registrySubs) {
    if (s.endpoint && !targetMap.has(s.endpoint)) {
      targetMap.set(s.endpoint, {
        id: s.id,
        endpoint: s.endpoint,
        p256dh: s.p256dh,
        auth: s.auth,
        platform: "WEB",
      });
    }
  }

  const subscriptions = Array.from(targetMap.values());

  if (subscriptions.length > 0) {
    const webPayload = JSON.stringify({
      title,
      body,
      url,
      unreadCount,
      badgeCount: unreadCount,
      icon: icon || "/icon-192x192.png",
      badge: badge || "/badge-72x72.png",
      tag: deterministicTag,
      renotify: true,
      vibrate: [200, 100, 200],
      requireInteraction: true,
      priority: "high",
      data: {
        url,
        tag: deterministicTag,
        collapseKey: deterministicTag,
        notificationId,
        category,
        unreadCount,
        timestamp: Date.now(),
      },
    });

    const webOptions = {
      TTL: 60,
      urgency: "high" as const,
      headers: {
        Urgency: "high",
      },
    };

    const fb = getFirebaseAdmin();

    for (let i = 0; i < subscriptions.length; i += BATCH_CHUNK_SIZE) {
      const chunk = subscriptions.slice(i, i + BATCH_CHUNK_SIZE);
      await Promise.allSettled(
        chunk.map(async (sub) => {
          const isWebPush = Boolean(sub.endpoint && sub.p256dh && sub.auth);

          if (isWebPush && vapidConfigured) {
            try {
              await webpush.sendNotification(
                {
                  endpoint: sub.endpoint,
                  keys: {
                    p256dh: sub.p256dh!,
                    auth: sub.auth!,
                  },
                },
                webPayload,
                webOptions
              );
              webPushCount++;
            } catch (pushErr: any) {
              failedCount++;
              const statusCode = pushErr?.statusCode;
              if (statusCode === 404 || statusCode === 410) {
                await Promise.allSettled([
                  prisma.pushSubscription.deleteMany({ where: { endpoint: sub.endpoint } }),
                  prisma.pwaSubscription.deleteMany({ where: { endpoint: sub.endpoint } }),
                  prisma.deviceNotificationsRegistry.deleteMany({ where: { endpoint: sub.endpoint } }),
                ]);
                prunedCount++;
              }
            }
          } else if (fb && (sub.platform === "ANDROID" || sub.endpoint.startsWith("fcm:") || (sub.token && !sub.p256dh))) {
            const fcmToken = sub.token || sub.endpoint.replace(/^fcm:/, "");
            if (!fcmToken) return;

            try {
              const messaging = getMessaging(fb);
              await messaging.send({
                token: fcmToken,
                notification: {
                  title,
                  body,
                },
                data: {
                  url,
                  notificationId,
                  tag: deterministicTag,
                  collapseKey: deterministicTag,
                  category,
                  badgeCount: String(unreadCount),
                },
                android: {
                  priority: "high",
                  collapseKey: deterministicTag,
                  notification: {
                    tag: deterministicTag,
                    channelId: "srt_school_alerts",
                    sound: "default",
                    priority: "high",
                    visibility: "public",
                    notificationCount: unreadCount,
                  },
                },
              });
              androidPushCount++;
            } catch (fcmErr: any) {
              failedCount++;
              const code = fcmErr?.code;
              if (
                code === "messaging/registration-token-not-registered" ||
                code === "messaging/invalid-registration-token"
              ) {
                await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
                prunedCount++;
              }
            }
          }
        })
      );
    }
  }

  return {
    success: inAppCreated || oneSignalCount > 0 || webPushCount > 0 || androidPushCount > 0,
    notificationId,
    inAppCreated,
    oneSignalCount,
    webPushCount,
    androidPushCount,
    failedCount,
    prunedCount,
  };
}
