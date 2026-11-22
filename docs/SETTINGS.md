# SRT Universal School Portal - Complete Settings Reference

**Date**: November 22, 2026  
**Status**: Production Standard  
**Audience**: Administrators, Developers, QA Engineers, Support Staff

---

## 1. Overview & Architecture

Settings across the SRT Universal School Portal are divided into two primary tiers:
1. **System & School-Wide Configuration** (Stored in `SystemSetting` table in PostgreSQL / Neon / Supabase): Managed exclusively by verified Administrators.
2. **User Preferences & Device Subscriptions** (Stored in `User`, `NotificationPreference`, and `PushSubscription` tables): Configured independently by each authenticated user (Admin, Teacher, Parent, Staff).

---

## 2. Global System Settings (Admin Only)

Stored in the `SystemSetting` key-value table (`model SystemSetting { key String @id, value String }`).

| Setting Key | Default Value | Description | Live System Effect |
| :--- | :--- | :--- | :--- |
| `SCHOOL_NAME` | `SRT UNIVERSAL SCHOOL` | Official school name | Displayed on portal header, mobile splash screen, login screens, report cards, and email headers. |
| `SCHOOL_TAGLINE` | `Seeing Righteousness & Truth` | School motto & tagline | Displayed under logo on landing and splash screens. |
| `SCHOOL_LOGO` | `/logo/srt-logo.svg` | URL / Path to official crest | Rendered in navigation bar, report card headers, PWA icons, and email templates. |
| `SCHOOL_ADDRESS` | `123 Education Lane, Knowledge Park` | Physical school address | Printed on official PDF report cards, invoices, and structured JSON-LD schema. |
| `SCHOOL_CONTACT` | `+1 (555) 019-2834` | Main school telephone | Displayed on support cards and parent communication channels. |
| `SCHOOL_EMAIL` | `admin@schoolportal.edu` | Inbound administrative email | Default `reply-to` address for automated notifications and parent circulars. |
| `SCHOOL_WEBSITE` | `https://schoolportal.edu` | Canonical school website | Linked in footer and educational metadata. |
| `PRINCIPAL_NAME` | `Dr. Eleanor Vance` | Principal / Head of School | Signatory on student terminal report cards and official circulars. |
| `ACADEMIC_YEAR` | `2026-2027` | Active school session | Default filter across attendance, timetable, marksheets, and batch enrollments. |
| `THEME_MODE` | `System` (`Light` / `Dark` / `System`) | Default school theme | Initial theme applied to unauthenticated landing and login pages. |
| `BUS_ALERT_DEFAULT_PRIORITY`| `NORMAL` (`NORMAL` / `URGENT`) | Bus delay notification level | Controls whether bus delays trigger sound/vibration popups on parent devices. |

---

## 3. User Preferences & Theming (All Roles)

Stored on the `User` model (`model User`) and cached locally in `localStorage["theme-cache"]`.

| Field Name | Type | Options | Live System Effect |
| :--- | :--- | :--- | :--- |
| `theme` | `String` | `light`, `dark`, `system` | Synchronously sets `data-theme` on `<html>`, updates `<meta name="theme-color">`, and controls Capacitor `StatusBar` background and style. |
| `notificationsEnabled` | `Boolean` | `true`, `false` | Master account-level switch. When `false`, completely suppresses all in-app toasts and push dispatches. |

---

## 4. Notification & Web Push Preferences (All Roles)

Stored in `NotificationPreference` and `PushSubscription` tables.

### 4.1 Master Toggle & The 3 Honest States

| State | Condition | UI Behavior | System Action |
| :--- | :--- | :--- | :--- |
| **ON** | `Notification.permission === "granted"` && active `PushSubscription` && `preference.enabled === true` | Green active badge, toggle checked | Device receives real-time OS lock-screen push and foreground alerts. |
| **OFF** | User flips switch off (or `preference.enabled === false`) | Neutral toggle unchecked, category switches disabled | 1. Calls `pushSubscription.unsubscribe()` on device.<br>2. Posts to `/api/push/unsubscribe`.<br>3. Sets `pushSubscription.isActive = false` in DB.<br>4. Suppresses all push dispatches and in-app toasts. |
| **BLOCKED** | `Notification.permission === "denied"` | Warning banner with padlock instructions; switch locked | Prompts user to unblock notifications in browser address bar / site settings. |

### 4.2 Category Preferences

| Category Column | Corresponding Notification Types | Description |
| :--- | :--- | :--- |
| `general` | `ANNOUNCEMENT`, `GENERAL` | School events, cultural programs, and general circulars. |
| `account` | `PASSWORD`, `SECURITY`, `ACCOUNT` | Password changes, login from new device, and session revocations. |
| `alerts` | `BUS`, `URGENT`, `DISCIPLINE` | High-priority safety notices, emergency bus delays, discipline intimations. |
| `academic` | `REPORT_CARD`, `MARKS`, `ASSIGNMENT`, `ATTENDANCE` | Daily absent alerts, homework assignments, terminal marks, report card publishing. |
| `admin` | `ADMIN`, `BATCH` | Administrative alerts, batch migrations, and staff notices. |
| `maintenance` | `MAINTENANCE`, `SYSTEM` | Scheduled downtime, platform updates, and health alerts. |

---

## 5. Security Gate & Settings Protection

Administrators accessing `/dashboard/admin/settings` are protected by a dedicated password gate:
- Default master gate password: `SRT_SETTINGS_ADMIN_PASS` or configured master secret.
- Unlock session: On verification, an encrypted HTTP-only session cookie is issued for 30 minutes.
- Manual Lock: Clicking "Lock Settings" immediately destroys the unlock cookie.
- Automatic Lockout: 5 failed unlock attempts lock the settings panel for 15 minutes to prevent brute-force attacks.

---

## 6. Verification Checklist
- [x] Changing theme updates `theme-color` meta tag and Capacitor status bar in <50ms.
- [x] Toggling Master Notification OFF immediately unsubscribes the browser PushManager.
- [x] Backend `NotificationService.send()` checks recipient `NotificationPreference` and `User.notificationsEnabled` before querying push endpoints.
- [x] All preference updates persist across browser reloads and multiple devices.
