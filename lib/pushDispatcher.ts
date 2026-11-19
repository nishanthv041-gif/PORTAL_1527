import { dispatchNotification, DispatchNotificationOptions, DispatchNotificationResult } from "./dispatcher";
export { dispatchNotification };
export type { DispatchNotificationOptions, DispatchNotificationResult };

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
 * sendInstantPortalNotification
 * 
 * Standardized multi-recipient notification dispatch adapter.
 * Uses unified, reliable, awaited dispatchNotification engine with full audit trace.
 */
export async function sendInstantPortalNotification(
  params: InstantNotificationParams
): Promise<InstantNotificationResult> {
  const result = await dispatchNotification({
    type: params.category || "GENERAL",
    audience: {
      userIds: params.targetUserIds,
      roles: params.targetRoles as any,
      all: params.targetAllUsers,
    },
    title: params.title,
    body: params.body,
    url: params.link || "/dashboard",
    priority: params.priority || "HIGH",
    tag: params.tag,
    icon: params.icon,
    badge: params.badge,
    bypass48h: params.bypass48h,
  });

  const totalSent = result.oneSignalCount + result.webPushCount;

  return {
    success: result.success,
    recipientCount: result.recipientCount,
    inAppCount: result.inAppCount,
    pushEligible: result.recipientCount,
    pushSent: totalSent,
    pushFailed: result.failedCount,
    prunedEndpoints: 0,
  };
}

/**
 * Awaited convenience wrapper.
 */
export async function fireInstantPortalNotification(params: InstantNotificationParams): Promise<void> {
  try {
    await sendInstantPortalNotification(params);
  } catch (err) {
    console.error("[PushDispatcher] Error during push notification dispatch:", err);
  }
}
