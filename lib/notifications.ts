import {
  sendInstantPortalNotification,
  fireInstantPortalNotification,
  InstantNotificationParams,
  InstantNotificationResult,
  NotificationCategory,
} from "./pushDispatcher";

export {
  sendInstantPortalNotification,
  fireInstantPortalNotification,
};
export type {
  InstantNotificationParams,
  InstantNotificationResult,
  NotificationCategory,
};

export type PortalNotificationType =
  | "REPORT_CARD"
  | "HOMEWORK"
  | "MESSAGE"
  | "ANNOUNCEMENT"
  | "ATTENDANCE"
  | "MEETING"
  | "BUS_MESSAGE"
  | "GENERAL"
  | string;

export interface DispatchPortalNotificationOptions {
  userIds: string | string[];
  type: PortalNotificationType;
  title: string;
  message: string;
  link: string;
  tag?: string;
  priority?: "NORMAL" | "URGENT" | "HIGH";
  category?: string;
  icon?: string;
  badge?: string;
  bypass48h?: boolean;
}

export interface DispatchPortalNotificationResult {
  inAppCount: number;
  pushEligible: number;
  pushSent: number;
  pushFailed: number;
  prunedEndpoints: number;
}

/**
 * High-performance notification dispatch adapter.
 * Uses unified sendInstantPortalNotification under the hood.
 */
export async function dispatchPortalNotification(
  options: DispatchPortalNotificationOptions
): Promise<DispatchPortalNotificationResult> {
  const result = await sendInstantPortalNotification({
    targetUserIds: options.userIds,
    category: options.category || options.type,
    title: options.title,
    body: options.message,
    link: options.link,
    tag: options.tag,
    priority: options.priority === "NORMAL" ? "NORMAL" : "HIGH",
    bypass48h: options.bypass48h,
    icon: options.icon,
    badge: options.badge,
  });

  return {
    inAppCount: result.inAppCount,
    pushEligible: result.pushEligible,
    pushSent: result.pushSent,
    pushFailed: result.pushFailed,
    prunedEndpoints: result.prunedEndpoints,
  };
}

/**
 * Non-blocking convenience wrapper.
 */
export function firePortalNotification(options: DispatchPortalNotificationOptions): void {
  fireInstantPortalNotification({
    targetUserIds: options.userIds,
    category: options.category || options.type,
    title: options.title,
    body: options.message,
    link: options.link,
    tag: options.tag,
    priority: options.priority === "NORMAL" ? "NORMAL" : "HIGH",
    bypass48h: options.bypass48h,
    icon: options.icon,
    badge: options.badge,
  });
}
