# SRT PORTAL – COMPLETE CAPACITOR TECHNICAL AUDIT REPORT

**Project:** SRT Universal School Portal  
**Domain / Live URL:** `https://main.d3bt7u4517jg0f.amplifyapp.com`  
**Package / Bundle ID:** `com.srtportal.app`  
**Framework:** Next.js 16 (App Router) + React 19 + TypeScript + Capacitor 8  
**Audit Date:** November 2026  
**Auditor:** Senior Cross-Platform Mobile Architect & Capacitor Engineer  

---

## 1. Executive Summary

This audit assesses the state of the **SRT Universal School Portal** for deployment as a native mobile application on **Android (Google Play / APK / AAB)** and **iOS (Apple App Store / TestFlight)** using Capacitor 8, alongside its production Progressive Web App (PWA) deployment on AWS Amplify.

The codebase represents an existing, live school management portal serving Admins, Teachers, Parents, and Staff with:
- Role-based access control (Admin, Teacher, Parent, Staff/Non-Teaching Staff)
- Live NextAuth authentication with Google OAuth & Credentials
- Real-time bus tracking, attendance tracking, chat messaging, and academic report cards
- PostgreSQL database via Prisma ORM with comprehensive notification and subscription schemas

---

## 2. Comprehensive Inventory & Configuration Audit

| Component | Target Standard | Current Status | Finding / Action |
| :--- | :--- | :--- | :--- |
| **Capacitor Core** | `@capacitor/core@^8.6.0` | Installed (`8.6.0`) | Validated compatible with Node 20+ & Android Gradle 8.13. |
| **Capacitor CLI** | `@capacitor/cli@^8.6.0` | Installed (`8.6.0`) | CLI correctly configured. |
| **Android Platform** | `@capacitor/android@^8.6.0` | Installed (`8.6.0`) | Target SDK 34/35, Min SDK 22. |
| **iOS Platform** | `@capacitor/ios@^8.6.2` | Installed (`8.6.2`) | iOS target 14.0+, Swift Package Manager enabled. |
| **capacitor.config.ts** | `appId: "com.srtportal.app"` | Configured (`com.srtportal.app`) | Live hosted URL configured with `cleartext: false`. |
| **Server Navigation** | Allow Amplify, Google, OneSignal | Configured | All OAuth domains & CDN endpoints whitelisted. |
| **Offline Shell (`webDir`)** | Fallback offline landing page | `www/index.html` Present | Verified standalone fallback with retry mechanism. |
| **Push Notifications** | `@capacitor/push-notifications` | Installed (`8.1.3`) | FCM / APNs registration pipeline available. |
| **OneSignal Plugin** | `onesignal-cordova-plugin` | Installed (`5.6.3`) | Dual-pipeline OneSignal push bridge installed. |
| **App Badging** | `@capawesome/capacitor-badge` | Installed (`8.0.4`) | WhatsApp-style native unread badge sync installed. |
| **Auth Persistence** | `@capacitor/preferences` | Installed (`8.0.1`) | Native storage for indefinite session survival installed. |

---

## 3. Detailed Audit Findings by Category

### 3.1 Android Configuration Analysis
1. **Application Package Identifier:**
   - `android/app/build.gradle` has been updated to `applicationId "com.srtportal.app"`.
   - `android/app/src/main/res/values/strings.xml` reflects `app_name: "SRT Portal"`.
2. **Missing Android Permissions (CRITICAL):**
   - Android 13+ (API level 33+) requires the runtime permission `android.permission.POST_NOTIFICATIONS`. It was missing from `AndroidManifest.xml`.
   - Vibration alert permission `android.permission.VIBRATE` was missing from `AndroidManifest.xml`.
   - **Remediation:** Add `<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />` and `<uses-permission android:name="android.permission.VIBRATE" />`.
3. **Android Deep-Linking & OAuth Callbacks:**
   - `AndroidManifest.xml` lacked intent-filters for custom scheme (`com.srtportal.app://`) and App Links (`https://main.d3bt7u4517jg0f.amplifyapp.com`).
   - **Remediation:** Add intent-filter with `<data android:scheme="com.srtportal.app" />` and `<data android:scheme="https" android:host="main.d3bt7u4517jg0f.amplifyapp.com" />`.
4. **WebView Cookie Handling in `MainActivity.java`:**
   - Google OAuth and cross-origin authentication redirects in Android WebViews require explicit permission for third-party cookies via `CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true)`.
   - **Remediation:** Add `setAcceptThirdPartyCookies` in `MainActivity.java`.
5. **Firebase Configuration (`google-services.json`):**
   - `android/app/google-services.json` is currently not checked into Git (expected for security/client-specific credentials).
   - Gradle gracefully detects absence: `google-services plugin not applied when missing`.
   - **Remediation:** Document exact location for placing client `google-services.json`.

---

### 3.2 iOS Configuration Analysis
1. **Bundle Identifier & Display Name:**
   - `ios/App/App/Info.plist` has `CFBundleDisplayName = "SRT Portal"`.
   - `UIBackgroundModes` includes `remote-notification`.
2. **Missing iOS AppDelegate Forwarding (CRITICAL):**
   - `ios/App/App/AppDelegate.swift` lacked native callbacks for remote notifications (`didRegisterForRemoteNotificationsWithDeviceToken` and `didFailToRegisterForRemoteNotificationsWithError`).
   - Deep linking handler (`application(_:open:options:)` and `continue userActivity`) was missing, preventing OAuth redirects from returning to the app on iOS.
   - **Remediation:** Add notification center events and `ApplicationDelegateProxy` calls in `AppDelegate.swift`.
3. **Missing iOS Custom URL Scheme (`Info.plist`):**
   - `CFBundleURLTypes` was missing `com.srtportal.app` scheme for Google Sign-In and deep links.
   - **Remediation:** Add `CFBundleURLTypes` entry to `Info.plist`.

---

### 3.3 Capacitor Web-to-Native Bridge Architecture
1. **Hosted Server Mode vs. Local Bundle:**
   - `capacitor.config.ts` points to `https://main.d3bt7u4517jg0f.amplifyapp.com`.
   - **Benefit:** Instant updates without requiring app store re-submissions for frontend and business logic changes.
   - **Resilience:** Fallback shell in `www/index.html` renders if device is offline upon boot, presenting an institutional offline screen with automated reconnection polling.
2. **Server AllowNavigation Whitelist:**
   - Fully covers AWS Amplify subdomains, Vercel fallback, Google OAuth endpoints, and OneSignal CDNs.

---

### 3.4 Push Notification Pipeline Audit
1. **Multi-Channel Architecture:**
   - **Web / iOS Safari PWA:** Uses standard VAPID Web Push (RFC 8291/8292) + OneSignal Web SDK v16.
   - **Native Android:** Firebase Cloud Messaging (FCM) + OneSignal Native.
   - **Native iOS:** Apple Push Notification service (APNs) + OneSignal Native.
2. **Backend Dispatch Services:**
   - `backend/services/push/oneSignalService.ts`: Direct OneSignal REST API dispatcher targeting `external_id` (PostgreSQL `user.id`).
   - `lib/notify.ts`: Universal dispatcher fanning out to OneSignal, WebPush, and FCM Admin SDK.
   - `backend/services/push/nativePushDispatcher.ts`: In-database registry management with auto-cleanup of dead endpoints (404/410).
3. **App Badging Pipeline:**
   - Desktop/PWA: `navigator.setAppBadge` / `navigator.clearAppBadge` + Service Worker IndexedDB cache.
   - Native: `@capawesome/capacitor-badge` via `Badge.set({ count })` / `Badge.clear()`.

---

### 3.5 Authentication & Session Persistence Audit
1. **Google OAuth & Credentials:**
   - Implemented via NextAuth with JWT session strategy.
   - In native mobile apps, webview process death can cause cookie loss.
   - **Remediation Implemented:** `@capacitor/preferences` stores session state permanently on native devices, and `SilentSessionRefresher` refreshes tokens silently every 3 hours.

---

### 3.6 Security & Vulnerability Review
- **Credentials Isolation:** No Firebase private keys or OneSignal REST API keys are bundled into frontend client bundles.
- **Content Security Policy (CSP):** `next.config.ts` enforces strict CSP restricting `connect-src`, `script-src`, and `worker-src` to authorized domains.
- **API Cache Headers:** All `/api/*` routes set `Cache-Control: no-store, no-cache, must-revalidate` to prevent caching of sensitive pupil or academic records.

---

## 4. Audit Checklist Matrix

| Audit Item | Status | Action Required |
| :--- | :---: | :--- |
| Missing Android permissions in Manifest | ⚠️ Incomplete | Add `POST_NOTIFICATIONS`, `VIBRATE`, deep link filters |
| Missing iOS AppDelegate token forwarding | ⚠️ Incomplete | Add APNs and OAuth proxies in `AppDelegate.swift` |
| Missing iOS URL scheme in `Info.plist` | ⚠️ Incomplete | Add `CFBundleURLTypes` for `com.srtportal.app` |
| Capacitor native push dual-registration | ⚠️ Incomplete | Wire `@capacitor/push-notifications` listener alongside OneSignal |
| Android third-party cookie support | ⚠️ Incomplete | Enable in `MainActivity.java` |
| Offline shell in `www/` | ✅ Complete | `www/index.html` present and tested |
| App Badging API cross-platform | ✅ Complete | `@capawesome/capacitor-badge` + Web Badging API |
| Google OAuth persistence | ✅ Complete | `@capacitor/preferences` storage active |
| Database Push subscription tables | ✅ Complete | 7 Prisma models active in PostgreSQL |
| Role-based dashboards | ✅ Complete | Admin, Teacher, Parent, Staff preserved |
