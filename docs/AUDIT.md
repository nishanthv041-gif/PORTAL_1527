# Comprehensive Portal Audit (Phase 0)

Date: November 22, 2026  
Status: In Progress (Phase 0 Audit Complete -> Moving to Phase 1 Fixes)  
Scope: Entire Portal (Admin, Teacher, Parent, Mobile PWA, Database, Notification Engine)

---

## 1. Notification System Audit & Root Cause Analysis

### 1.1 Root Causes of Endless Notification Looping & Repeating Alerts
1. **Aggressive Client Polling Loop in `NotificationPopupModal.tsx`**:
   - Every 5 seconds (`setInterval(..., 5000)`), the component called `getUnifiedNotificationsAction({ unreadOnly: true })`.
   - When tab focus changed or visibility triggered, an additional immediate request was fired.
2. **Synthetic Notification Generation Without DB Persistence**:
   - `unifiedNotificationActions.ts` synthesized notifications on the fly from multiple disparate tables (`Announcement`, `Meeting`, `ReportCard`, `Homework`).
   - Because these synthesized items had IDs like `ann-<id>` or `meeting-<id>`, marking them as "seen" in `markNotificationsAsSeenInPopupAction` attempted fragile heuristics. If matching failed or if new synthetic notifications were created, `getUnifiedNotificationsAction` returned them as unread on the very next 5-second poll!
   - This caused the popup modal and browser notifications to re-trigger endlessly.
3. **Cache-Busting Notification Tags in Dispatcher & Service Worker**:
   - In `lib/dispatcher.ts` and `public/sw.js`, notification tags included `-Date.now()` or `-${timestamp}`.
   - Because every dispatched push received a unique timestamped tag instead of a stable deduplication tag, the operating system (Android, Windows, macOS, iOS) could not collapse or replace existing notifications, resulting in an endless cascade of notifications in the phone notification shade.
4. **Multi-Channel Push Collision**:
   - Devices subscribed to both OneSignal and native Web Push received two separate push messages for every single event.
   - Service worker lacked an in-memory / IndexedDB deduplication barrier to discard identical notification IDs received within a 60-second window.
5. **Database Model Gaps in `prisma/schema.prisma`**:
   - `Notification` model lacked `dedupeKey`, `readAt` (DateTime), `deliveredAt` (DateTime), and `data` (JSON).
   - Absence of a unique index or upsert logic on `dedupeKey` allowed multiple domain events (e.g. repeated attendance saves or mark updates) to insert duplicate `Notification` rows.

---

## 2. API & Endpoint Architecture Audit

### 2.1 Current Endpoints vs Standard REST Contract
- Existing:
  - `GET /api/notifications/unread-count`: Exists, but only checks `Notification` and `Message` tables.
  - `POST /api/notifications/mark-read`: Exists, handles single ID.
  - `POST /api/notifications/push/subscribe`: Exists in multiple fragmented formats across `/api/push/*` and `/api/notifications/push/*`.
- Missing or Incomplete:
  - `GET /api/notifications`: Needs unified paginated endpoint with cursor/page, category filter, and unread toggle.
  - `PATCH /api/notifications/[id]/read`: Standard REST endpoint needed.
  - `PATCH /api/notifications/read-all`: Standard REST endpoint needed for mark all read.
  - `DELETE /api/notifications/[id]`: Standard REST endpoint needed for soft/hard delete.
  - `POST /api/push/unsubscribe`: Endpoint to deactivate device endpoints cleanly.
  - `GET /api/notification-preferences` & `PUT /api/notification-preferences`: Unified REST endpoints for category-level push preferences.

---

## 3. Mobile PWA & Phone-Ready UI Audit

### 3.1 Viewport & Layout
- Top and bottom navigation bars recently updated with dynamic system/dark mode theming, but several inner dashboard pages have tables with fixed minimum widths (`min-w-[650px]`, `min-w-[800px]`) that can cause horizontal scrolling on smaller mobile screens (< 380px) if not wrapped in overflow containers or switched to responsive cards.
- Mobile bottom navigation needs safe-area insets (`padding-bottom: env(safe-area-inset-bottom)`).
- Mobile modals need bottom sheet behavior on small viewports with pull handle and swipe down dismissal.

### 3.2 Touch Targets & Inputs
- Inputs must enforce `font-size: 16px` to avoid iOS Safari automatic viewport zooming on focus.
- Touch targets on icons and buttons should satisfy `>= 44x44px`.
- Need pull-to-refresh on mobile dashboards.
- Need offline indicator banner with network detection (`navigator.onLine`).

---

## 4. Role-by-Role Feature & Page Audit

### 4.1 Admin Portal
- **Dashboard**: Needs live database counts (active students, teachers, parents, bus routes, attendance percentage today).
- **Students Management**: CRUD operations, search, class filter, pagination, status badge, loading skeletons.
- **Teachers Management**: Class assignments, subject assignments, live list.
- **Parents Management**: Linked children listing, search, phone/email contact.
- **Classes & Subjects**: Class creation, section assignment, timetable schedule.
- **Bus Management**: Route listing, student assignment, live driver status.
- **Announcements & Circulars**: Creation modal with target audience (All, Role, Class), automatic notification trigger.
- **Settings**: Password gate protection and OTP reset verification.

### 4.2 Teacher Portal
- **My Classes & Attendance**: Daily attendance mark/save, absent trigger firing parent notification with `dedupeKey`.
- **Assignments / Homework**: Create homework, attach deadline, automatic notification to enrolled students/parents.
- **Marks Entry**: Exam marks entry with validation (0 <= marks <= maxMarks), draft and publish states.
- **Report Cards**: Consolidated report card verification and batch publishing with intimation triggers.
- **Calendar & Meetings**: View school calendar, create parent-teacher meetings.

### 4.3 Parent Portal
- **Child Switcher**: Clean selector if parent has multiple children enrolled.
- **Report Cards**: View published marks, download PDF report card.
- **Attendance**: Calendar view of present/absent/late days.
- **Assignments**: View due dates, status, instructions.
- **Bus Tracking & Alerts**: Route details, stop timing, emergency bus alerts.
- **Notifications Center**: Full notification history, filter by category ("All", "Unread", "Important"), mark read, clear.

---

## 5. Security & Session Integrity Audit
- Single device active session validation via session token tracking.
- Inactivity timeout: 6-hour automatic session expiration on idle.
- Role-based authorization on all API routes (`/api/*`) verifying `token.role`.
- No raw secrets or sensitive tokens exposed in frontend bundles.

---

## 6. Implementation Action Plan
1. **Schema Update**: Update `prisma/schema.prisma` with `dedupeKey`, `readAt`, `deliveredAt`, `data` on `Notification`. Run `npx prisma generate` & migrate.
2. **Central Notification Engine**: Refactor `backend/services/notifications/NotificationService.ts` to be the single entry point.
3. **Standardize API Routes**: Implement `/api/notifications`, `/api/notifications/[id]/read`, `/api/notifications/read-all`, `/api/notifications/[id]`, `/api/push/subscribe`, `/api/push/unsubscribe`, `/api/notification-preferences`.
4. **Fix Service Worker & Deduplication**: Eliminate cache-busting tags; use stable event deduplication in `sw.js`.
5. **Unified Frontend Notification Provider**: Implement `NotificationProvider` at root layout with bell badge in all topbars and in-app toast for foreground pushes.
6. **Mobile UX Hardening**: Bottom sheets, safe area insets, responsive card views for tables, pull to refresh.
7. **Complete Role Flows**: Audit and verify every button, form, and page across Admin, Teacher, and Parent portals with real DB data.
8. **Testing & Verification**: Comprehensive test suite, AWS Amplify deployment verification, test report in `docs/TEST_REPORT.md`.
