import { prisma } from "@/backend/db/prisma";
import webpush from "web-push";
import { invalidateUserNotifCache } from "@/backend/api/actions/notifications/unifiedNotificationActions";
import { sendOneSignalPush, ONESIGNAL_APP_ID } from "@/backend/services/push/oneSignalService";

// ============================================================================
// 1. Direct WebPush Configuration (VAPID)
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

let vapidReady = false;
try {
  if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    vapidReady = true;
  }
} catch (err) {
  console.warn("[Dispatcher] VAPID initialization warning:", err);
}

// ============================================================================
// 2. Types & Interfaces
// ============================================================================
export type NotificationEventType =
  | "MESSAGE"
  | "ANNOUNCEMENT"
  | "CIRCULAR"
  | "REPORT_CARD"
  | "EXAM"
  | "MARKS"
  | "ATTENDANCE"
  | "HOMEWORK"
  | "FEE"
  | "LEAVE"
  | "MEETING"
  | "BUS_UPDATE"
  | "BUS_MESSAGE"
  | "TIMETABLE"
  | "EVENT"
  | "ADMIN_ALERT"
  | "SECURITY_ALERT"
  | string;

export interface NotificationAudience {
  userIds?: string | string[];
  roles?: ("ADMIN" | "TEACHER" | "PARENT" | "STAFF")[];
  classId?: string;
  studentId?: string;
  all?: boolean;
}

export interface DispatchNotificationOptions {
  type: NotificationEventType;
  entityId?: string;
  recipients?: string | string[];
  audience?: NotificationAudience;
  excludeUserId?: string;
  title: string;
  body: string;
  url?: string;
  priority?: "HIGH" | "NORMAL" | "URGENT";
  tag?: string;
  data?: Record<string, any>;
  icon?: string;
  badge?: string;
  bypass48h?: boolean;
}

export interface DispatchNotificationResult {
  success: boolean;
  recipientCount: number;
  inAppCount: number;
  oneSignalCount: number;
  webPushCount: number;
  failedCount: number;
}

// Helper to sanitize error messages so raw secrets / tokens are never leaked
function sanitizeError(msg: any): string {
  if (!msg) return "";
  const str = typeof msg === "string" ? msg : JSON.stringify(msg);
  return str
    .replace(/(key=)[a-zA-Z0-9_\-]+/gi, "$1[REDACTED]")
    .replace(/(Authorization:\s*)[a-zA-Z0-9_\-\s]+/gi, "$1[REDACTED]")
    .replace(/(Bearer\s+)[a-zA-Z0-9_\.\-]+/gi, "$1[REDACTED]")
    .slice(0, 500);
}

// ============================================================================
// 3. Recipient Resolution
// ============================================================================
export async function resolveAudienceUserIds(
  audience?: NotificationAudience,
  directRecipients?: string | string[],
  excludeUserId?: string
): Promise<string[]> {
  const userIdsSet = new Set<string>();

  // 1. Direct Recipients
  if (directRecipients) {
    const list = Array.isArray(directRecipients) ? directRecipients : [directRecipients];
    list.forEach((id) => {
      if (id && typeof id === "string" && id.trim()) {
        userIdsSet.add(id.trim());
      }
    });
  }

  if (audience) {
    // 2. Direct Audience User IDs
    if (audience.userIds) {
      const list = Array.isArray(audience.userIds) ? audience.userIds : [audience.userIds];
      list.forEach((id) => {
        if (id && typeof id === "string" && id.trim()) {
          userIdsSet.add(id.trim());
        }
      });
    }

    // 3. All Active Users Broadcast
    if (audience.all) {
      try {
        const allUsers = await prisma.user.findMany({
          where: { status: "ACTIVE" },
          select: { id: true },
        });
        allUsers.forEach((u) => userIdsSet.add(u.id));
      } catch (err) {
        console.error("[Dispatcher] Error resolving all users:", err);
      }
    }

    // 4. Role-based Broadcast
    if (audience.roles && audience.roles.length > 0) {
      try {
        const roleUsers = await prisma.user.findMany({
          where: {
            status: "ACTIVE",
            role: { in: audience.roles as any },
          },
          select: { id: true },
        });
        roleUsers.forEach((u) => userIdsSet.add(u.id));
      } catch (err) {
        console.error("[Dispatcher] Error resolving role users:", err);
      }
    }

    // 5. Class-based Recipients (Parents of class students + Class Teacher)
    if (audience.classId) {
      try {
        const [parentsInClass, classRecord] = await Promise.all([
          prisma.parent.findMany({
            where: {
              children: {
                some: {
                  student: { classId: audience.classId },
                },
              },
            },
            select: { userId: true },
          }),
          prisma.class.findUnique({
            where: { id: audience.classId },
            select: {
              teacher: { select: { userId: true } },
              classTeacher: { select: { userId: true } },
            },
          }),
        ]);

        parentsInClass.forEach((p) => {
          if (p.userId) userIdsSet.add(p.userId);
        });

        if (classRecord?.classTeacher?.userId) {
          userIdsSet.add(classRecord.classTeacher.userId);
        }
        if (classRecord?.teacher?.userId) {
          userIdsSet.add(classRecord.teacher.userId);
        }
      } catch (err) {
        console.error("[Dispatcher] Error resolving class audience:", err);
      }
    }

    // 6. Student-based Recipients (All linked parents of student)
    if (audience.studentId) {
      try {
        const student = await prisma.student.findUnique({
          where: { id: audience.studentId },
          select: {
            parents: {
              select: {
                parent: {
                  select: { userId: true },
                },
              },
            },
          },
        });

        if (student?.parents) {
          student.parents.forEach((ps) => {
            if (ps.parent?.userId) {
              userIdsSet.add(ps.parent.userId);
            }
          });
        }
      } catch (err) {
        console.error("[Dispatcher] Error resolving student parents:", err);
      }
    }
  }

  // Exclude sender if requested
  if (excludeUserId) {
    userIdsSet.delete(excludeUserId);
  }

  return Array.from(userIdsSet);
}

// ============================================================================
// 4. Primary Universal Dispatcher: dispatchNotification()
// ============================================================================
export async function dispatchNotification(
  options: DispatchNotificationOptions
): Promise<DispatchNotificationResult> {
  const {
    type,
    entityId,
    recipients,
    audience,
    excludeUserId,
    title,
    body,
    url = "/dashboard",
    priority = "HIGH",
    data = {},
    icon = "/icon-192x192.png",
    badge = "/badge-72x72.png",
  } = options;

  if (!title || !body) {
    return {
      success: false,
      recipientCount: 0,
      inAppCount: 0,
      oneSignalCount: 0,
      webPushCount: 0,
      failedCount: 0,
    };
  }

  // 1. Resolve recipients strictly on the server
  const targetUserIds = await resolveAudienceUserIds(audience, recipients, excludeUserId);

  if (targetUserIds.length === 0) {
    return {
      success: true,
      recipientCount: 0,
      inAppCount: 0,
      oneSignalCount: 0,
      webPushCount: 0,
      failedCount: 0,
    };
  }

  const normalizedType = (type || "GENERAL").toUpperCase();
  const normalizedPriority = (priority || "HIGH").toUpperCase();
  const timestamp = Date.now();
  // Dynamic tag: ensures each notification is seen and alerts the device without silent browser replacement
  const deterministicTag = options.tag
    ? (options.tag.match(/-\d{10,}$/) ? options.tag : `${options.tag}-${timestamp}`)
    : `${normalizedType.toLowerCase()}-${entityId || "event"}-${timestamp}`;

  // 2. Insert In-App Notification records (PostgreSQL)
  let inAppCount = 0;
  try {
    const created = await prisma.notification.createMany({
      data: targetUserIds.map((uid) => ({
        userId: uid,
        title,
        content: body,
        body,
        category: normalizedType,
        type: normalizedType,
        priority: normalizedPriority,
        link: url,
        isRead: false,
        sentAt: new Date(),
        createdAt: new Date(),
      })),
    });
    inAppCount = created.count;

    // Invalidate user badge cache for in-app UI
    for (const uid of targetUserIds) {
      invalidateUserNotifCache(uid).catch(() => {});
    }
  } catch (err) {
    console.error("[Dispatcher] Error creating in-app notification rows:", err);
  }

  // 3. Insert Transactional Outbox entries for guaranteed delivery / retry
  try {
    await prisma.notificationOutbox.createMany({
      data: targetUserIds.map((uid) => ({
        eventType: normalizedType,
        entityId: entityId || null,
        idempotencyKey: `${normalizedType}-${entityId || "event"}-${uid}-${timestamp}`,
        recipientUserId: uid,
        title,
        body,
        url,
        priority: normalizedPriority,
        tag: deterministicTag,
        data: data || {},
        status: "PROCESSING",
        attempts: 1,
      })),
      skipDuplicates: true,
    });
  } catch (outboxErr) {
    console.warn("[Dispatcher] Outbox insert warning:", outboxErr);
  }

  // 4. Query Push Subscriptions across tables for target users
  let pushSubs: Array<{
    id: string;
    userId: string | null;
    endpoint: string;
    p256dh: string;
    auth: string;
    platform: string | null;
  }> = [];

  try {
    const [primarySubs, pwaSubs, registrySubs] = await Promise.all([
      prisma.pushSubscription.findMany({
        where: {
          userId: { in: targetUserIds },
          isActive: true,
        },
        select: {
          id: true,
          userId: true,
          endpoint: true,
          p256dh: true,
          auth: true,
          platform: true,
        },
      }),
      prisma.pwaSubscription.findMany({
        where: {
          userId: { in: targetUserIds },
        },
        select: {
          id: true,
          userId: true,
          endpoint: true,
          p256dhKey: true,
          authKey: true,
          deviceType: true,
        },
      }).catch(() => []),
      prisma.deviceNotificationsRegistry.findMany({
        where: {
          userId: { in: targetUserIds },
        },
        select: {
          id: true,
          userId: true,
          endpoint: true,
          p256dh: true,
          auth: true,
        },
      }).catch(() => []),
    ]);

    // Strict endpoint deduplication
    const endpointMap = new Map<string, typeof pushSubs[0]>();

    for (const sub of primarySubs) {
      if (sub.endpoint && sub.p256dh && sub.auth && !endpointMap.has(sub.endpoint)) {
        endpointMap.set(sub.endpoint, {
          id: sub.id,
          userId: sub.userId,
          endpoint: sub.endpoint,
          p256dh: sub.p256dh,
          auth: sub.auth,
          platform: sub.platform,
        });
      }
    }

    for (const pwa of pwaSubs) {
      if (pwa.endpoint && pwa.p256dhKey && pwa.authKey && !endpointMap.has(pwa.endpoint)) {
        endpointMap.set(pwa.endpoint, {
          id: pwa.id,
          userId: pwa.userId,
          endpoint: pwa.endpoint,
          p256dh: pwa.p256dhKey,
          auth: pwa.authKey,
          platform: pwa.deviceType?.toUpperCase() === "IOS" ? "IOS" : "WEB",
        });
      }
    }

    for (const reg of registrySubs) {
      if (reg.endpoint && reg.p256dh && reg.auth && !endpointMap.has(reg.endpoint)) {
        endpointMap.set(reg.endpoint, {
          id: reg.id,
          userId: reg.userId,
          endpoint: reg.endpoint,
          p256dh: reg.p256dh,
          auth: reg.auth,
          platform: "WEB",
        });
      }
    }

    pushSubs = Array.from(endpointMap.values());
  } catch (subErr) {
    console.error("[Dispatcher] Error querying push subscriptions:", subErr);
  }

  // 5. Concurrent Multi-Channel Delivery (Promise.allSettled)
  let oneSignalCount = 0;
  let webPushCount = 0;
  let failedCount = 0;

  const BATCH_SIZE = 2000; // OneSignal max batch size

  const dispatchTasks: Promise<any>[] = [];

  // --------------------------------------------------------------------------
  // BRANCH A: OneSignal REST API (targeted by external_id = userId)
  // --------------------------------------------------------------------------
  for (let i = 0; i < targetUserIds.length; i += BATCH_SIZE) {
    const chunk = targetUserIds.slice(i, i + BATCH_SIZE);

    dispatchTasks.push(
      (async () => {
        try {
          const osResult = await sendOneSignalPush({
            userId: chunk,
            title,
            body,
            url,
            unreadCount: 1,
            category: normalizedType,
            additionalData: {
              eventType: normalizedType,
              entityId,
              tag: deterministicTag,
              ...data,
            },
          });

          const recCount = osResult.recipients || 0;
          if (osResult.success && recCount > 0) {
            oneSignalCount += recCount;
          }

          // Record trace for each recipient in the batch
          await prisma.notificationDelivery.createMany({
            data: chunk.map((uid) => ({
              eventType: normalizedType,
              entityId: entityId || null,
              recipientUserId: uid,
              channel: "ONESIGNAL",
              status: osResult.success && recCount > 0 ? "DELIVERED" : (recCount === 0 ? "RECIPIENTS_ZERO" : "FAILED"),
              onesignalNotificationId: osResult.notificationId || null,
              httpStatus: osResult.success ? 200 : (osResult.details?.status || 500),
              recipientsCount: recCount,
              errorCode: osResult.error ? "ONESIGNAL_ERROR" : null,
              errorMessage: sanitizeError(osResult.error),
              attempts: 1,
              tag: deterministicTag,
              sentAt: osResult.success && recCount > 0 ? new Date() : null,
            })),
          }).catch(() => {});
        } catch (osErr: any) {
          failedCount += chunk.length;
          console.warn("[Dispatcher] OneSignal batch delivery note:", osErr);
          await prisma.notificationDelivery.createMany({
            data: chunk.map((uid) => ({
              eventType: normalizedType,
              entityId: entityId || null,
              recipientUserId: uid,
              channel: "ONESIGNAL",
              status: "FAILED",
              httpStatus: 500,
              recipientsCount: 0,
              errorCode: "EXCEPTION",
              errorMessage: sanitizeError(osErr?.message || "OneSignal dispatch error"),
              attempts: 1,
              tag: deterministicTag,
            })),
          }).catch(() => {});
        }
      })()
    );
  }

  // --------------------------------------------------------------------------
  // BRANCH B: Direct WebPush (VAPID) to all registered device subscriptions
  // --------------------------------------------------------------------------
  if (pushSubs.length > 0 && vapidReady) {
    const webPayload = JSON.stringify({
      title,
      body,
      url,
      unreadCount: 1,
      badgeCount: 1,
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
        category: normalizedType,
        eventType: normalizedType,
        entityId,
        timestamp,
        ...data,
      },
    });

    const webOptions = {
      TTL: 86400, // 24-hour persistence for sleeping/Doze devices
      urgency: "high" as const,
      headers: {
        Urgency: "high",
      },
    };

    dispatchTasks.push(
      (async () => {
        const results = await Promise.allSettled(
          pushSubs.map(async (sub) => {
            try {
              const res = await webpush.sendNotification(
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
              return { success: true, sub, statusCode: res.statusCode || 201 };
            } catch (pushErr: any) {
              const statusCode = pushErr?.statusCode || 500;
              // Clean up dead subscriptions on HTTP 404 / 410 Gone
              if (statusCode === 404 || statusCode === 410) {
                await Promise.allSettled([
                  prisma.pushSubscription.deleteMany({ where: { endpoint: sub.endpoint } }),
                  prisma.pwaSubscription.deleteMany({ where: { endpoint: sub.endpoint } }),
                  prisma.deviceNotificationsRegistry.deleteMany({ where: { endpoint: sub.endpoint } }),
                ]);
              }
              return {
                success: false,
                sub,
                statusCode,
                error: pushErr?.message || "WebPush failed",
              };
            }
          })
        );

        const deliveryRows: any[] = [];
        for (const r of results) {
          if (r.status === "fulfilled") {
            const { success, sub, statusCode, error } = r.value;
            if (success) {
              webPushCount++;
              if (sub.userId) {
                deliveryRows.push({
                  eventType: normalizedType,
                  entityId: entityId || null,
                  recipientUserId: sub.userId,
                  channel: "WEBPUSH",
                  status: "DELIVERED",
                  httpStatus: statusCode,
                  recipientsCount: 1,
                  tag: deterministicTag,
                  sentAt: new Date(),
                });
              }
            } else {
              failedCount++;
              if (sub.userId) {
                deliveryRows.push({
                  eventType: normalizedType,
                  entityId: entityId || null,
                  recipientUserId: sub.userId,
                  channel: "WEBPUSH",
                  status: statusCode === 410 || statusCode === 404 ? "EXPIRED" : "FAILED",
                  httpStatus: statusCode,
                  recipientsCount: 0,
                  errorCode: String(statusCode),
                  errorMessage: sanitizeError(error),
                  tag: deterministicTag,
                });
              }
            }
          }
        }

        if (deliveryRows.length > 0) {
          await prisma.notificationDelivery.createMany({
            data: deliveryRows,
          }).catch(() => {});
        }
      })()
    );
  }

  // Always record NO_DEVICES for direct web push layer if any recipient has no registered subscriptions
  const usersWithoutSubs = targetUserIds.filter(
    (uid) => !pushSubs.some((s) => s.userId === uid)
  );
  if (usersWithoutSubs.length > 0) {
    await prisma.notificationDelivery.createMany({
      data: usersWithoutSubs.map((uid) => ({
        eventType: normalizedType,
        entityId: entityId || null,
        recipientUserId: uid,
        channel: "WEBPUSH",
        status: "NO_DEVICES",
        recipientsCount: 0,
        errorMessage: "No active push subscriptions registered in database",
        tag: deterministicTag,
      })),
    }).catch(() => {});
  }

  // Await all concurrent tasks strictly so serverless lambdas never freeze mid-delivery
  await Promise.allSettled(dispatchTasks);

  // 6. Update Outbox records status
  try {
    const finalStatus =
      oneSignalCount > 0 || webPushCount > 0 ? "COMPLETED" : "FAILED";
    await prisma.notificationOutbox.updateMany({
      where: {
        recipientUserId: { in: targetUserIds },
        tag: deterministicTag,
      },
      data: {
        status: finalStatus,
        processedAt: new Date(),
      },
    });
  } catch (outboxUpdateErr) {
    console.debug("[Dispatcher] Outbox status update note:", outboxUpdateErr);
  }

  return {
    success: inAppCount > 0 || oneSignalCount > 0 || webPushCount > 0,
    recipientCount: targetUserIds.length,
    inAppCount,
    oneSignalCount,
    webPushCount,
    failedCount,
  };
}

// ============================================================================
// 5. Outbox Processor for Cron & Retries
// ============================================================================
export async function processNotificationOutbox(): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
}> {
  try {
    // Fetch pending or failed items with fewer than 5 attempts
    const pendingItems = await prisma.notificationOutbox.findMany({
      where: {
        status: { in: ["PENDING", "FAILED"] },
        attempts: { lt: 5 },
      },
      take: 50,
      orderBy: { createdAt: "asc" },
    });

    if (pendingItems.length === 0) {
      return { processed: 0, succeeded: 0, failed: 0 };
    }

    let succeeded = 0;
    let failed = 0;

    for (const item of pendingItems) {
      try {
        const result = await dispatchNotification({
          type: item.eventType,
          entityId: item.entityId || undefined,
          recipients: [item.recipientUserId],
          title: item.title,
          body: item.body,
          url: item.url,
          priority: item.priority as any,
          tag: item.tag || undefined,
          data: (item.data as any) || {},
        });

        if (result.success && (result.oneSignalCount > 0 || result.webPushCount > 0)) {
          succeeded++;
          await prisma.notificationOutbox.update({
            where: { id: item.id },
            data: {
              status: "COMPLETED",
              attempts: item.attempts + 1,
              processedAt: new Date(),
            },
          });
        } else {
          failed++;
          await prisma.notificationOutbox.update({
            where: { id: item.id },
            data: {
              status: "FAILED",
              attempts: item.attempts + 1,
              lastError: "Retry failed to reach device channels",
              processedAt: new Date(),
            },
          });
        }
      } catch (itemErr: any) {
        failed++;
        await prisma.notificationOutbox.update({
          where: { id: item.id },
          data: {
            status: "FAILED",
            attempts: item.attempts + 1,
            lastError: sanitizeError(itemErr?.message),
            processedAt: new Date(),
          },
        });
      }
    }

    return { processed: pendingItems.length, succeeded, failed };
  } catch (err) {
    console.error("[Dispatcher] Error processing notification outbox:", err);
    return { processed: 0, succeeded: 0, failed: 0 };
  }
}
