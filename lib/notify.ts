import { dispatchNotification, DispatchNotificationOptions, DispatchNotificationResult } from "./dispatcher";
export { dispatchNotification };
export type { DispatchNotificationOptions, DispatchNotificationResult };
export { sendOneSignalPush } from "@/backend/services/push/oneSignalService";

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
 * Standardized single-recipient notification dispatch adapter.
 * Uses unified, reliable, awaited dispatchNotification engine with full audit trace.
 */
export async function sendUniversalNotification(
  options: UniversalNotificationOptions
): Promise<UniversalNotificationResult> {
  const result = await dispatchNotification({
    type: options.eventType || options.category || "MESSAGE",
    entityId: options.entityId,
    recipients: [options.userId],
    title: options.title,
    body: options.body || options.content || "",
    url: options.url || "/dashboard",
    priority: options.priority || "HIGH",
    tag: options.tag,
    icon: options.icon,
    badge: options.badge,
  });

  return {
    success: result.success,
    notificationId: options.entityId || "",
    inAppCreated: result.inAppCount > 0,
    oneSignalCount: result.oneSignalCount,
    webPushCount: result.webPushCount,
    androidPushCount: 0,
    failedCount: result.failedCount,
    prunedCount: 0,
  };
}
