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
  userId: string | string[];
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

  const userIds = Array.isArray(userId)
    ? userId.map((id) => String(id).trim()).filter(Boolean)
    : [String(userId).trim()].filter(Boolean);

  if (userIds.length === 0) {
    return {
      success: false,
      error: "No valid user IDs provided for OneSignal push.",
    };
  }

  const safeBadgeCount = Math.max(0, Number(unreadCount) || 1);
  const resolvedUrl = url || "https://main.d3bt7u4517jg0f.amplifyapp.com";

  const payload = {
    app_id: ONESIGNAL_APP_ID,
    target_channel: "push",
    include_aliases: {
      external_id: userIds,
    },
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

  const authHeader =
    apiKey.trim().startsWith("Key ") || apiKey.trim().startsWith("Basic ")
      ? apiKey.trim()
      : `Key ${apiKey.trim()}`;

  try {
    const res = await fetch("https://onesignal.com/api/v1/notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok || (data.errors && !data.id)) {
      console.error("[OneSignal] REST API push failure:", {
        status: res.status,
        errors: data.errors,
      });
      return {
        success: false,
        error: Array.isArray(data.errors)
          ? data.errors.join(", ")
          : JSON.stringify(data.errors || `HTTP ${res.status}`),
        details: data,
      };
    }

    console.log(
      `[OneSignal] Push dispatched successfully: notificationId=${data.id}, recipients=${data.recipients ?? "all-devices"}`
    );

    return {
      success: true,
      notificationId: data.id,
      recipients: data.recipients,
      details: data,
    };
  } catch (error: any) {
    console.error("[OneSignal] Network or execution error:", error);
    return {
      success: false,
      error: error?.message || "Unknown error during OneSignal push dispatch.",
    };
  }
}
