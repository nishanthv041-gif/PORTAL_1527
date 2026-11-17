# SRT PORTAL – COMPLETE PWA TECHNICAL AUDIT REPORT

**Project:** SRT Universal School Portal  
**Domain:** `https://main.d3bt7u4517jg0f.amplifyapp.com`  
**PWA Audit Date:** November 2026  
**Standards Evaluated:** W3C Web App Manifest, Service Workers 1.0, Push API, Badging API, iOS WebKit PWA Add-to-Home-Screen  

---

## 1. PWA Compliance Summary

The SRT Universal School Portal is a fully production-grade Progressive Web Application configured to deliver a native-app-like experience across **Android Chrome, iOS Safari (Home Screen PWA), Windows (Edge/Chrome), and macOS (Safari/Chrome)**.

| Criteria | Standard | Actual Status | Rating |
| :--- | :--- | :--- | :---: |
| **Manifest Registration** | Valid JSON / WebManifest with icons | `/manifest.webmanifest` & `/manifest.json` present | 100% |
| **Service Worker Scope** | Root `/` scope with bypass for APIs | `public/sw.js` & `OneSignalSDKWorker.js` active | 100% |
| **Display Mode** | `standalone` with fallback | `"display": "standalone"`, `display_override` | 100% |
| **App Badging API** | WhatsApp-style icon badge counter | IndexedDB + `navigator.setAppBadge` | 100% |
| **Offline Resilience** | Custom offline fallback page | `public/offline.html` precached | 100% |
| **iOS PWA Support** | Apple Touch Icons & Meta Tags | Cover safe areas, black-translucent, touch icons | 100% |
| **Security & Privacy** | No caching of authenticated data | `/api/`, NextAuth, session routes bypassed | 100% |

---

## 2. Manifest Audit (`manifest.webmanifest` / `manifest.json`)

### Validated Properties:
- **`id` & `start_url`:** Set to `"/"` ensuring consistent application identity.
- **`name` & `short_name`:**
  - Name: `"SRT Universal School Portal"`
  - Short Name: `"SRT Portal"` (prevents label truncation on mobile homescreens).
- **`display` & `display_override`:**
  - `"display": "standalone"`: Removes URL bar, navigation buttons, and browser chrome.
  - `"display_override": ["standalone", "window-controls-overlay", "minimal-ui"]`: Enables desktop PWA title-bar integration on Windows 11 and macOS.
- **Theme & Background Color:**
  - `theme_color`: `"#3b82f6"` (Institutional blue matching school crest).
  - `background_color`: `"#0f172a"` (Dark slate preventing white flicker on cold boot).
- **Icons Matrix:**
  - `192x192` (`any` + `maskable`)
  - `512x512` (`any` + `maskable`)
  - `apple-touch-icon.png` (180x180 for iOS springboard)
- **App Shortcuts:**
  - `/dashboard`: Direct jump to personalized user dashboard.
  - `/login`: Direct jump to portal login.

---

## 3. Service Worker Architecture Audit (`sw.js` & `OneSignalSDKWorker.js`)

### 3.1 Dual-Worker Strategy
1. **Primary Portal Service Worker (`/sw.js`):**
   - **Cache Version:** `srt-pwa-v10`
   - **Precaching:** Caches static shell (`/offline.html`, manifest, icons, crest logo).
   - **Dynamic Assets:** Stale-while-revalidate for static bundles (`/_next/static/*`), fonts, and logos.
   - **Strict Security Gate:** Passes all `/api/*`, `/auth/*`, `session`, and `token` requests directly to network—zero private data is ever stored in persistent cache.
   - **Push Event Handling:** Shows system notifications with sound, vibration `[200, 100, 200]`, and priority flags.
   - **Notification Click Navigation:** Reuses existing browser windows via `clients.matchAll()` and navigates directly to the target URL (e.g. `/messages` or `/attendance`).
   - **App Badging Engine:** Updates OS app icon badge in background via IndexedDB store (`badge_meta`).
2. **OneSignal Service Worker (`/OneSignalSDKWorker.js`):**
   - Registered at root `/` via `importScripts("https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js")`.
   - Enhanced with custom badging listener that extracts `unreadCount` and sets OS badge upon push arrival.

---

## 4. iOS Safari & iOS Home Screen PWA Compatibility

1. **Input Focus & Viewport Safe Areas:**
   - Global CSS enforces `font-size: 16px !important` on all inputs to prevent iOS Safari auto-zoom freeze.
   - Touch action is constrained to `touch-action: manipulation` for responsive tapping.
   - Viewport meta tag specifies `viewport-fit=cover` with `max-scale=5`.
2. **Apple Mobile Web App Meta Tags:**
   - `<meta name="apple-mobile-web-app-capable" content="yes" />`
   - `<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />`
   - `<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />`
3. **Web Push on iOS (iOS 16.4+):**
   - iOS supports Push API and Badging API exclusively when the app is installed to the Home Screen.
   - `IosInstallPrompt` component in `frontend/components/IosInstallPrompt.tsx` detects iOS Safari and shows a step-by-step banner explaining how to tap **Share -> Add to Home Screen** to unlock lock-screen notifications.

---

## 5. Desktop PWA (Windows & macOS)

- **Windows 10/11:** Fully installable via Edge and Chrome. Installs to Start Menu, Taskbar, and Windows Notification Center.
- **macOS (Sonoma / Sequoia):** Installable via Safari (*File -> Add to Dock*) and Chrome. Integrates with macOS Notification Center and Dock badges.
- **No Heavy Installers Required:** For schools, IT admins can distribute the PWA URL or deploy via Chrome Enterprise policies without requiring complex MSI or DMG installers.
