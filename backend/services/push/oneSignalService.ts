/**
 * OneSignal Web & Mobile Push Notification Dispatcher
 * SRT Universal School Portal
 * App ID: 721f0fa5-683c-4edc-93ce-35a8786d655b
 */

export const ONESIGNAL_APP_ID =
  process.env.ONESIGNAL_APP_ID ||
  process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID ||
  "721f0fa5-683c-4edc-93ce-35a8786d655b";

export interface OneSignalPushOptions {
  userId?: string | string[];
  broadcast?: boolean; // When true, sends to all subscribed devices across the entire school app
  title: string;
  body: string;
  url?: string;
  unreadCount?: number;
  category?: string;
  additionalData?: Record<string, any>;
}

export interface OneSignalPushResult {
  success: boolean;
  notificationId?: string;
  recipients?: number;
  error?: string;
  details?: any;
}

/**
 * sendOneSignalPush
 * 
 * Sends high-priority push notifications to OneSignal targets matched by their PostgreSQL `user.id` (external_id).
 * Supports WhatsApp-style app badges, iOS Safari PWA, Android Chrome/PWA, and Windows desktop.
 */
export async function sendOneSignalPush(
  options: OneSignalPushOptions
): Promise<OneSignalPushResult> {
    const {
      userId,
      broadcast = false,
      title,
      body,
      url = "https://main.d3bt7u4517jg0f.amplifyapp.com",
      unreadCount = 1,
      category = "MESSAGE",
      additionalData = {},
    } = options;

    const apiKey = process.env.ONESIGNAL_REST_API_KEY;

    if (!apiKey || apiKey.trim() === "" || apiKey.includes("your_onesignal_rest_api_key")) {
      console.warn(
        "[OneSignal] ONESIGNAL_REST_API_KEY is not configured in .env. Skipping OneSignal push dispatch."
      );
      return {
        success: false,
        error: "ONESIGNAL_REST_API_KEY is missing in environment variables.",
      };
    }

    const userIds = broadcast
      ? []
      : Array.isArray(userId)
      ? userId.map((id) => String(id).trim()).filter(Boolean)
      : [String(userId || "").trim()].filter(Boolean);

    if (!broadcast && userIds.length === 0) {
      return {
        success: false,
        error: "No valid user IDs provided for OneSignal push.",
      };
    }

    const safeBadgeCount = Math.max(0, Number(unreadCount) || 1);
    const resolvedUrl = url || "https://main.d3bt7u4517jg0f.amplifyapp.com";

    const payload: any = {
      app_id: ONESIGNAL_APP_ID,
      target_channel: "push",
      ...(broadcast
        ? { included_segments: ["Total Subscriptions", "Subscribed Users"] }
        : {
            include_aliases: {
              external_id: userIds,
            },
          }),
      headings: { en: title },
      contents: { en: body },
      url: resolvedUrl,
      ios_badgeType: "SetTo",
      ios_badgeCount: safeBadgeCount,
      data: {
        unreadCount: safeBadgeCount,
        url: resolvedUrl,
        category,
        ...additionalData,
      },
      web_buttons: [
        {
          id: "open-portal",
          text: "Open Portal",
          url: resolvedUrl,
        },
      ],
    };

  const authHeaders = [
    apiKey.trim().startsWith("Key ") || apiKey.trim().startsWith("Basic ")
      ? apiKey.trim()
      : `Key ${apiKey.trim()}`,
    apiKey.trim().startsWith("Key ") || apiKey.trim().startsWith("Basic ")
      ? apiKey.trim()
      : `Basic ${apiKey.trim()}`,
  ];

  const endpoints = [
    "https://api.onesignal.com/notifications",
    "https://onesignal.com/api/v1/notifications",
  ];

  let lastError: any = null;
  let lastData: any = null;

  for (const endpoint of endpoints) {
    for (const authHeader of authHeaders) {
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: authHeader,
          },
          body: JSON.stringify(payload),
        });

        const data = await res.json().catch(() => ({}));

        if (res.ok && data.id) {
          console.log(
            `[OneSignal] Push dispatched successfully via ${endpoint}: notificationId=${data.id}, recipients=${data.recipients ?? "all-devices"}`
          );
          return {
            success: true,
            notificationId: data.id,
            recipients: data.recipients,
            details: data,
          };
        }

        lastError = data.errors || `HTTP ${res.status}`;
        lastData = data;
      } catch (err: any) {
        lastError = err?.message || "Fetch failure";
      }
    }
  }

  console.error("[OneSignal] REST API push failure across endpoints:", {
    errors: lastError,
    details: lastData,
  });

  return {
    success: false,
    error: Array.isArray(lastError)
      ? lastError.join(", ")
      : JSON.stringify(lastError || "OneSignal REST API error"),
    details: lastData,
  };
}
