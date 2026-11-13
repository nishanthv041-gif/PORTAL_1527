import { prisma } from "@/backend/db/prisma";
import webpush from "web-push";
import { initializeApp, getApps, cert, type App } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import { invalidateUserNotifCache } from "@/backend/api/actions/notifications/unifiedNotificationActions";

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
}

export interface UniversalNotificationResult {
  success: boolean;
  notificationId: string;
  inAppCreated: boolean;
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
  let webPushCount = 0;
  let androidPushCount = 0;
  let failedCount = 0;
  let prunedCount = 0;

  // 1. In-App Notification (PostgreSQL Record)
  try {
    const notif = await prisma.notification.create({
      data: {
        userId,
        title,
        content: content || body,
        body,
        type: category.toUpperCase(),
        category: category.toUpperCase(),
        priority: priority.toUpperCase(),
        link: url,
        isRead: false,
        sentAt: new Date(),
        createdAt: new Date(),
      },
      select: { id: true },
    });
    notificationId = notif.id;
    inAppCreated = true;

    // Invalidate user cache for instant in-app badge update
    await invalidateUserNotifCache(userId).catch(() => {});
  } catch (err) {
    console.error("[Notify] Error creating in-app notification:", err);
  }

  // 2. Query Multi-Device Subscriptions (PC, iPhone Safari PWA, Android Capacitor)
  // Deduplicate endpoints and device fingerprints so users never receive duplicate pushes on the same phone
  let subscriptions: Array<{
    id: string;
    endpoint: string;
    token: string | null;
    platform: string | null;
    p256dh: string | null;
    auth: string | null;
  }> = [];

  try {
    const rawSubs = await prisma.pushSubscription.findMany({
      where: {
        userId,
        isActive: true,
      },
      select: {
        id: true,
        endpoint: true,
        token: true,
        platform: true,
        p256dh: true,
        auth: true,
        deviceFingerprint: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: "desc" },
    });

    const seenEndpoints = new Set<string>();
    const seenFingerprints = new Set<string>();
    const staleIdsToDeactivate: string[] = [];

    for (const sub of rawSubs) {
      const endpointKey = (sub.token || sub.endpoint).trim();
      if (!endpointKey || seenEndpoints.has(endpointKey)) {
        staleIdsToDeactivate.push(sub.id);
        continue;
      }
      seenEndpoints.add(endpointKey);

      // If a device fingerprint is associated with this subscription,
      // ensure only the most recently updated subscription for that device is targeted.
      if (sub.deviceFingerprint) {
        if (seenFingerprints.has(sub.deviceFingerprint)) {
          staleIdsToDeactivate.push(sub.id);
          continue;
        }
        seenFingerprints.add(sub.deviceFingerprint);
      }

      subscriptions.push(sub);
    }

    if (staleIdsToDeactivate.length > 0) {
      prisma.pushSubscription.updateMany({
        where: { id: { in: staleIdsToDeactivate } },
        data: { isActive: false },
      }).catch(() => {});
    }
  } catch (dbErr) {
    console.error("[Notify] Error querying push subscriptions:", dbErr);
  }

  // 3. Dispatch Push Notifications
  if (subscriptions.length > 0) {
    const deterministicTag =
      tag || `notif-${category.toLowerCase()}-${notificationId || Date.now().toString().slice(-6)}`;

    // Prepare Web Push Payload
    const webPayload = JSON.stringify({
      title,
      body,
      url,
      icon,
      badge,
      tag: deterministicTag,
      renotify: true,
      vibrate: [200, 100, 200],
      requireInteraction: true,
      priority: "high",
      data: {
        url,
        tag: deterministicTag,
        notificationId,
        category,
        timestamp: Date.now(),
      },
    });

    const webOptions = {
      TTL: 86400,
      urgency: "high" as const,
      headers: {
        Urgency: "high",
      },
    };

    const fb = getFirebaseAdmin();

    await Promise.allSettled(
      subscriptions.map(async (sub) => {
        const isAndroidFCM =
          sub.platform === "ANDROID" ||
          (sub.token && !sub.p256dh) ||
          sub.endpoint.startsWith("fcm:");

        if (isAndroidFCM) {
          // Native Android Push via FCM (Capacitor)
          const fcmToken = sub.token || sub.endpoint.replace(/^fcm:/, "");
          if (!fcmToken || !fb) return;

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
                category,
              },
              android: {
                priority: "high",
                notification: {
                  channelId: "srt_school_alerts",
                  sound: "default",
                  priority: "high",
                  visibility: "public",
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
              // Stale Android token: delete from database
              await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
              prunedCount++;
            } else {
              console.warn(`[Notify] FCM send note for device ${sub.id}:`, fcmErr?.message);
            }
          }
        } else if (vapidConfigured && sub.endpoint && sub.p256dh && sub.auth) {
          // Web & iOS Safari PWA Push via web-push
          try {
            await webpush.sendNotification(
              {
                endpoint: sub.endpoint,
                keys: {
                  p256dh: sub.p256dh,
                  auth: sub.auth,
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
              // Stale Web Push endpoint: delete from database
              await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
              prunedCount++;
            } else {
              console.warn(`[Notify] WebPush send note for device ${sub.id}:`, pushErr?.message);
            }
          }
        }
      })
    );
  }

  return {
    success: inAppCreated || webPushCount > 0 || androidPushCount > 0,
    notificationId,
    inAppCreated,
    webPushCount,
    androidPushCount,
    failedCount,
    prunedCount,
  };
}
