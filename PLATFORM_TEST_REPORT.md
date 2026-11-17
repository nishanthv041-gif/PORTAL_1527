# SRT PORTAL – CROSS-PLATFORM COMPATIBILITY & TEST REPORT

**Project:** SRT Universal School Portal  
**Test Date:** November 2026  
**Test Environment:** Windows 11 Node 20+, Capacitor 8.6, Next.js 16.3.4, React 19  
**Test Suites:**
- `tests/verify-onesignal-web-push.test.ts` (31 assertions)
- `tests/verify-system-push-and-permission-gate.test.ts` (32 assertions)
- `npx tsc --noEmit` (TypeScript strict mode compilation)
- `npx cap sync` (Android & iOS platform synchronization)

---

## 1. Test Suite Results Summary

| Suite / Test Group | Total Checks | Passed | Failed | Status |
| :--- | :---: | :---: | :---: | :---: |
| **TypeScript Strict Compilation** | 1 | 1 | 0 | **PASS** |
| **Capacitor Sync (`cap sync`)** | 2 Platforms (Android, iOS) | 2 | 0 | **PASS** |
| **OneSignal Web Push & Badging** | 31 Checks | 31 | 0 | **PASS** |
| **System Push & Permission Gate** | 32 Checks | 32 | 0 | **PASS** |
| **PWA Web App Manifest Validity** | 6 Checks | 6 | 0 | **PASS** |
| **Service Worker Security & Scope** | 8 Checks | 8 | 0 | **PASS** |
| **Total Test Assertions** | **80** | **80** | **0** | **100% PASS** |

---

## 2. Detailed Platform Matrix Verification

### 2.1 Android (Capacitor Native)
- **App ID & Name:** `com.srtportal.app` / `SRT Portal` verified in `android/app/build.gradle` and `strings.xml`.
- **Permissions:** `INTERNET`, `ACCESS_NETWORK_STATE`, `POST_NOTIFICATIONS` (Android 13+), `VIBRATE`, and `WAKE_LOCK` verified in `AndroidManifest.xml`.
- **Deep Linking:** Intent filters configured for `com.srtportal.app://` and `https://main.d3bt7u4517jg0f.amplifyapp.com`.
- **Cookies & Sessions:** `CookieManager.setAcceptThirdPartyCookies` active in `MainActivity.java`.
- **Plugins:** `@capacitor/preferences`, `@capacitor/push-notifications`, `@capawesome/capacitor-badge`, `onesignal-cordova-plugin` synchronized.

### 2.2 iOS (Capacitor Native & Safari PWA)
- **Bundle ID & Name:** `com.srtportal.app` / `SRT Portal` verified in `Info.plist`.
- **Background Modes:** `remote-notification` verified.
- **URL Scheme:** `CFBundleURLTypes` includes `com.srtportal.app`.
- **AppDelegate Callbacks:** APNs token forwarding (`capacitorDidRegisterForRemoteNotifications`) and deep-link proxies (`ApplicationDelegateProxy.shared.application`) verified in `AppDelegate.swift`.
- **PWA Safari Support:** Touch icons (180x180), `apple-mobile-web-app-capable`, `viewport-fit=cover`, and `touch-action: manipulation` verified.

### 2.3 Desktop (Windows & macOS)
- **Display Mode:** `standalone` with `display_override` (`window-controls-overlay`, `minimal-ui`).
- **Offline Fallback:** `public/offline.html` precached and validated with automatic reconnect polling.
- **Badging API:** Browser `navigator.setAppBadge` + Service Worker IndexedDB verified.
- **Security Guard:** Strict network bypass on all `/api/`, NextAuth, session, and token endpoints verified.

---

## 3. Functional Workflow Verification

| Feature / Workflow | Tested Path | Behavior & Result | Status |
| :--- | :--- | :--- | :---: |
| **Google Authentication** | NextAuth OAuth + `/api/auth/session` | Native `@capacitor/preferences` session persistence. Indefinite session lifetime across app launches. | **PASS** |
| **Permission Gate** | `NotificationPermissionGate.tsx` | 0ms instant display. Bypasses immediately if already granted or dismissed; never hangs on spinners. | **PASS** |
| **Push Notification Registration** | `/api/push/register` & `/api/push/subscribe` | Upserts subscription to PostgreSQL, records device fingerprint and platform. | **PASS** |
| **Push Dispatch (Admin Only)** | Topbar `Test Push` -> `/api/push/test` | Multi-channel dispatch via OneSignal + WebPush with detailed diagnostic feedback. | **PASS** |
| **WhatsApp-Style App Badge** | `setAppBadgeCount` / `clearAppBadgeCount` | Updates OS app icon badge across Web, Android launcher, and iOS APNs. Resets to 0 upon opening notifications. | **PASS** |
| **Role-Based Routing** | Admin, Teacher, Parent, Staff | Correctly redirects to role-specific dashboard upon login. | **PASS** |
| **Explicit Logout** | `logoutFromPushService` + `clearPersistedNativeSession` | Unlinks device, clears session preferences, and unregisters push channels cleanly. | **PASS** |
