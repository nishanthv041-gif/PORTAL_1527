# SRT PORTAL – PUSH NOTIFICATION SETUP & ARCHITECTURE GUIDE

**App ID (OneSignal):** `721f0fa5-683c-4edc-93ce-35a8786d655b`  
**Native App Identifier:** `com.srtportal.app`  
**Hosted Domain:** `https://main.d3bt7u4517jg0f.amplifyapp.com`  

---

## 1. Multi-Channel Notification Architecture

The SRT Universal School Portal implements a dual-layer, multi-channel push notification architecture designed for 100% reliable lock-screen delivery across all operating systems:

```
[System Event / Teacher Message / Bus Alert]
                       │
                       ▼
            lib/notify.ts (Universal Dispatcher)
                       │
         ┌─────────────┼─────────────┐
         ▼             ▼             ▼
   OneSignal API   Web Push API   Firebase Admin SDK
   (REST API v1)    (RFC 8291)       (FCM v1)
         │             │             │
   ┌─────┴─────┐       │             │
   ▼           ▼       ▼             ▼
iOS Native  Android  PWA/Browsers  Native Android
 (APNs)      (FCM)   (Desktop/iOS)  (Background)
```

---

## 2. Environment Variables Configuration

Set these variables in your `.env` (local development) and in the **AWS Amplify Console -> App settings -> Environment variables** (production):

| Variable Name | Required For | Description / Example |
| :--- | :--- | :--- |
| `ONESIGNAL_APP_ID` | All Platforms | `721f0fa5-683c-4edc-93ce-35a8786d655b` |
| `NEXT_PUBLIC_ONESIGNAL_APP_ID` | Client SDK | `721f0fa5-683c-4edc-93ce-35a8786d655b` |
| `ONESIGNAL_REST_API_KEY` | Backend REST API | Found in OneSignal Console -> Settings -> Keys & IDs -> REST API Key |
| `VAPID_PUBLIC_KEY` | Web & iOS PWA | Public VAPID EC P-256 key |
| `VAPID_PRIVATE_KEY` | Web & iOS PWA | Private VAPID key for server-side push signing |
| `VAPID_SUBJECT` | Web Push | `mailto:admin@nipoportal.com` |
| `FIREBASE_SERVICE_ACCOUNT` | Native Android FCM | JSON string of Firebase Admin Service Account |

---

## 3. Client-Side Device Registration Flow

1. **User Authentication:**
   When an Admin, Teacher, or Parent logs in:
   - Client calls `initPushNotifications(userId)`.
   - `loginToPushService(userId)` binds the PostgreSQL `user.id` as `external_id` in OneSignal.
   - On native Android/iOS, `@capacitor/push-notifications` registers device token to `POST /api/push/register`.
2. **Permission Gate (`NotificationPermissionGate`):**
   - 0ms instant check: If permission was already granted or user dismissed the prompt in the current session, it unlocks instantly without any loading screen or delay.
   - If unprompted, displays an institutional permission banner highlighting attendance, urgent alerts, and WhatsApp badging.
   - User clicking "Enable Notifications" triggers native browser or OS permission prompt.
3. **Dead Endpoint Cleanup:**
   - When a user uninstalls the app or revokes permissions, push servers respond with HTTP 404 or 410 Gone.
   - `lib/notify.ts` automatically deactivates or purges dead subscriptions across `push_subscriptions`, `pwa_subscriptions`, and `device_notifications_registry` to preserve high delivery performance.

---

## 4. WhatsApp-Style App Icon Badging

- **Web / Desktop PWA / Safari PWA:** Synchronizes through `navigator.setAppBadge(count)` and Service Worker IndexedDB persistence (`BADGE_DB_NAME = "srt-portal-pwa-badging"`).
- **Native Android & iOS:** Synchronizes through `@capawesome/capacitor-badge`:
  ```ts
  import { Badge } from "@capawesome/capacitor-badge";
  await Badge.set({ count: unreadCount });
  ```
- **Auto-Clear:** Opening notifications or marking items as read triggers `clearAppBadgeCount()`, instantly resetting the OS badge to zero.

---

## 5. Testing & Verification

1. **Admin Test Push Button:**
   - Log into the portal as an **Admin** user.
   - In the top header bar, click the blue **"Test Push"** button.
   - The server will dispatch a high-priority test alert through OneSignal and WebPush, displaying an interactive diagnostic summary including delivery ID, recipient user ID, and active devices.
2. **Automated Test Scripts:**
   Run the test suite in Windows PowerShell:
   ```powershell
   npx tsx tests/verify-onesignal-web-push.test.ts
   npx tsx tests/verify-system-push-and-permission-gate.test.ts
   ```
