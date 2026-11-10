import webpush from "web-push";
import { prisma } from "@/backend/db/prisma";

// Default verified fallback key pair
const DEFAULT_VAPID_PUBLIC_KEY =
  "BBIHzbc-DVhlpPB_plCE0gUMpCSsHiqA1Y5FVyP-ax6p0HWnFZILFISth4FYfyAp0gywswCBxz4GfDnXm_c-Agk";
const DEFAULT_VAPID_PRIVATE_KEY =
  "ExZi6lTrD-JWJN9cqk88AA6Y8-vxTYaxwhaY4AUwMFc";
const DEFAULT_VAPID_SUBJECT =
  "mailto:admin@nipoportal.com";

function cleanEnvString(val?: string | null): string {
  if (!val || typeof val !== "string") return "";
  return val.trim().replace(/^["']|["']$/g, "").trim();
}

function resolveVapidCredentials(): {
  publicKey: string;
  privateKey: string;
  subject: string;
} {
  const envPub = cleanEnvString(
    process.env.VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  );
  const envPriv = cleanEnvString(process.env.VAPID_PRIVATE_KEY);
  const envSub = cleanEnvString(process.env.VAPID_SUBJECT);

  let publicKey = DEFAULT_VAPID_PUBLIC_KEY;
  if (envPub) {
    try {
      const buf = Buffer.from(envPub, "base64");
      // Public key must be 65 uncompressed bytes (87 base64 chars)
      if (buf.length === 65) {
        publicKey = envPub;
      } else {
        console.warn("[WebPush] Provided public key is not 65 bytes, using default key.");
      }
    } catch {
      console.warn("[WebPush] Provided public key invalid, using default key.");
    }
  }

  let privateKey = DEFAULT_VAPID_PRIVATE_KEY;
  if (envPriv) {
    try {
      const buf = Buffer.from(envPriv, "base64");
      // Private key must be 32 bytes (43 base64 chars)
      if (buf.length === 32) {
        privateKey = envPriv;
      } else {
        console.warn("[WebPush] Provided private key is not 32 bytes, using default key.");
      }
    } catch {
      console.warn("[WebPush] Provided private key invalid, using default key.");
    }
  }

  let subject = DEFAULT_VAPID_SUBJECT;
  if (envSub && (envSub.startsWith("mailto:") || envSub.startsWith("https://"))) {
    subject = envSub;
  }

  return { publicKey, privateKey, subject };
}

const { publicKey: VAPID_PUBLIC_KEY, privateKey: VAPID_PRIVATE_KEY, subject: VAPID_SUBJECT } =
  resolveVapidCredentials();

try {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
} catch (err) {
  console.warn("[WebPush] Failed to initialize VAPID credentials:", err);
}

export function getVapidPublicKey(): string {
  return VAPID_PUBLIC_KEY;
}

export interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  url?: string;
  tag?: string;
  data?: Record<string, unknown>;
  priority?: "NORMAL" | "URGENT";
  category?: string;
}

/**
 * Send a push notification to a single PushSubscription record.
 * Automatically cleans up expired/unregistered subscriptions (404 / 410 Gone).
 */
export async function sendPushToSubscription(
  sub: {
    id: string;
    userId?: string | null;
    endpoint: string;
    p256dh: string;
    auth: string;
  },
  payload: PushPayload,
  notificationId?: string
): Promise<{ success: boolean; statusCode?: number; error?: string }> {
  const pushSubscription = {
    endpoint: sub.endpoint,
    keys: {
      p256dh: sub.p256dh,
      auth: sub.auth,
    },
  };

  const payloadString = JSON.stringify({
    title: payload.title,
    body: payload.body,
    icon: payload.icon || "/icons/icon-192x192.png",
    badge: payload.badge || "/icons/icon-192x192.png",
    url: payload.url || "/dashboard",
    tag: payload.tag || `notif-${Date.now()}`,
    data: {
      url: payload.url || "/dashboard",
      notificationId: notificationId || null,
      ...payload.data,
    },
  });

  try {
    const response = await webpush.sendNotification(
      pushSubscription,
      payloadString,
      {
        TTL: 86400,
        urgency: "high",
      }
    );

    // Record successful delivery attempt
    if (notificationId && sub.userId) {
      await prisma.notificationDeliveryLog.create({
        data: {
          notificationId,
          userId: sub.userId,
          subscriptionId: sub.id,
          status: "SENT",
          statusCode: response.statusCode,
        },
      }).catch(() => {});
    }

    return { success: true, statusCode: response.statusCode };
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    const statusCode = err.statusCode || 500;
    const errorMsg = err.message || "Failed to deliver push";

    // Subscription expired, unregistered, or invalid (HTTP 404 Not Found or 410 Gone)
    if (statusCode === 404 || statusCode === 410) {
      console.info(`[WebPush] Subscription expired or unsubscribed (${statusCode}). Removing: ${sub.id}`);
      await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
    }

    // Record failed delivery attempt
    if (notificationId && sub.userId) {
      await prisma.notificationDeliveryLog.create({
        data: {
          notificationId,
          userId: sub.userId,
          subscriptionId: sub.id,
          status: statusCode === 410 || statusCode === 404 ? "EXPIRED" : "FAILED",
          statusCode,
          error: errorMsg,
        },
      }).catch(() => {});
    }

    return { success: false, statusCode, error: errorMsg };
  }
}

/**
 * Dispatch push notifications to multiple recipients based on user preferences.
 * Runs in parallel batches to avoid blocking server operations.
 */
export async function dispatchPushToRecipients(
  userIds: string[],
  payload: PushPayload,
  notificationId?: string,
  categoryKey: "general" | "account" | "alerts" | "academic" | "admin" | "maintenance" = "general"
): Promise<{ sent: number; failed: number; totalSubscriptions: number }> {
  if (!userIds || userIds.length === 0) {
    return { sent: 0, failed: 0, totalSubscriptions: 0 };
  }

  // 1. Fetch user notification preferences for the targeted users
  const preferences = await prisma.notificationPreference.findMany({
    where: { userId: { in: userIds } },
  });

  const preferenceMap = new Map(preferences.map((p) => [p.userId, p]));

  // 2. Filter users who haven't disabled notifications or this specific category
  const allowedUserIds = userIds.filter((uid) => {
    const pref = preferenceMap.get(uid);
    if (!pref) return true; // Default is enabled
    if (!pref.enabled) return false;
    return pref[categoryKey] ?? true;
  });

  if (allowedUserIds.length === 0) {
    return { sent: 0, failed: 0, totalSubscriptions: 0 };
  }

  // 3. Find active push subscriptions for qualifying recipients
  // Real-time Push Delivery: Delivers instant push notifications to all registered devices of target users
  // (e.g. Android phone notification drawer, Windows desktop, iOS PWA) like WhatsApp/Gmail
  const isBroadcastOrAlert =
    payload.category === "general" ||
    payload.priority === "URGENT" ||
    categoryKey === "alerts" ||
    categoryKey === "general";

  let subscriptions = await prisma.pushSubscription.findMany({
    where: {
      isActive: true,
      OR: [
        { userId: { in: allowedUserIds } },
        // For general announcements & emergency alerts, also deliver to anonymous PWA subscriptions
        ...(isBroadcastOrAlert ? [{ userId: null }] : []),
      ],
    },
    orderBy: { lastUsedAt: "desc" },
    select: {
      id: true,
      userId: true,
      endpoint: true,
      p256dh: true,
      auth: true,
    },
  });

  // If no direct subscription matched for the target users, only fallback to anonymous subscriptions
  // for general public broadcasts / emergency alerts — NEVER leak student/parent private data to other users' devices
  if (subscriptions.length === 0 && isBroadcastOrAlert) {
    const fallbackSubs = await prisma.pushSubscription.findMany({
      where: {
        isActive: true,
        userId: null, // Only anonymous public device subscriptions
        lastUsedAt: { gte: new Date(Date.now() - 48 * 60 * 60 * 1000) },
      },
      orderBy: { lastUsedAt: "desc" },
      take: 10,
      select: {
        id: true,
        userId: true,
        endpoint: true,
        p256dh: true,
        auth: true,
      },
    });
    if (fallbackSubs.length > 0) {
      subscriptions = fallbackSubs;
    }
  }

  if (subscriptions.length === 0) {
    return { sent: 0, failed: 0, totalSubscriptions: 0 };
  }

  // 5. Batch push delivery (chunks of 20 to avoid exhausting connection pool)
  let sent = 0;
  let failed = 0;
  const CHUNK_SIZE = 20;

  for (let i = 0; i < subscriptions.length; i += CHUNK_SIZE) {
    const chunk = subscriptions.slice(i, i + CHUNK_SIZE);
    const results = await Promise.all(
      chunk.map((sub) => sendPushToSubscription(sub, payload, notificationId))
    );

    for (const res of results) {
      if (res.success) sent++;
      else failed++;
    }
  }

  return { sent, failed, totalSubscriptions: subscriptions.length };
}

/**
 * Core Requirement: Target and send push notifications ONLY to devices/browser sessions
 * that have actively logged into an account within the last 24 hours.
 * Uses Promise.allSettled for concurrent, resilient delivery.
 * Automatically deletes 410 Gone / 404 Not Found expired subscriptions from PostgreSQL.
 */
export async function dispatchPushToActiveDevicesLast24Hours(
  payload: PushPayload,
  options?: {
    userIds?: string[];
    role?: string;
    notificationId?: string;
    maxAgeHours?: number;
  }
): Promise<{
  totalEligible: number;
  sent: number;
  failed: number;
  prunedExpired: number;
  details: Array<{ subscriptionId: string; status: "fulfilled" | "rejected"; statusCode?: number; error?: string }>;
}> {
  const maxAgeHours = options?.maxAgeHours ?? 24;
  const cutoffTime = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);

  // 1. Query: WHERE is_active = true AND last_login_at >= NOW() - INTERVAL '24 hours'
  const activeSubscriptions = await prisma.pushSubscription.findMany({
    where: {
      isActive: true,
      lastLoginAt: { gte: cutoffTime },
      ...(options?.userIds && options.userIds.length > 0
        ? { userId: { in: options.userIds } }
        : {}),
      ...(options?.role
        ? { user: { role: options.role as any } }
        : {}),
    },
    select: {
      id: true,
      userId: true,
      endpoint: true,
      p256dh: true,
      auth: true,
      deviceFingerprint: true,
      lastLoginAt: true,
    },
    orderBy: { lastLoginAt: "desc" },
  });

  if (activeSubscriptions.length === 0) {
    return { totalEligible: 0, sent: 0, failed: 0, prunedExpired: 0, details: [] };
  }

  // 2. Dispatch concurrently using Promise.allSettled
  const results = await Promise.allSettled(
    activeSubscriptions.map(async (sub) => {
      const res = await sendPushToSubscription(sub, payload, options?.notificationId);
      if (!res.success) {
        throw { statusCode: res.statusCode, error: res.error, subId: sub.id };
      }
      return { subId: sub.id, statusCode: res.statusCode };
    })
  );

  let sent = 0;
  let failed = 0;
  let prunedExpired = 0;
  const details: Array<{ subscriptionId: string; status: "fulfilled" | "rejected"; statusCode?: number; error?: string }> = [];

  for (let i = 0; i < results.length; i++) {
    const outcome = results[i];
    const sub = activeSubscriptions[i];

    if (outcome.status === "fulfilled") {
      sent++;
      details.push({
        subscriptionId: sub.id,
        status: "fulfilled",
        statusCode: outcome.value.statusCode,
      });
    } else {
      failed++;
      const reason = outcome.reason as { statusCode?: number; error?: string };
      const statusCode = reason?.statusCode || 500;
      const isExpired = statusCode === 410 || statusCode === 404;

      if (isExpired) {
        prunedExpired++;
      }

      details.push({
        subscriptionId: sub.id,
        status: "rejected",
        statusCode,
        error: reason?.error || "Push delivery failed",
      });
    }
  }

  return {
    totalEligible: activeSubscriptions.length,
    sent,
    failed,
    prunedExpired,
    details,
  };
}

