# AWS High-Concurrency Architecture Blueprint (1,500+ Concurrent Users)
## SRT Universal School Portal — PWA, ElastiCache Redis & RDS Proxy

This document outlines the cloud infrastructure topology, service worker badging engine, and operational runbook for running the SRT Universal School Portal under peak loads of **1,500+ simultaneous concurrent users** with zero lag, sub-100ms response times, and resilient PWA push notification delivery.

---

## 1. Cloud Architecture Topology

```
                  [ 1,500+ Concurrent Client Devices ]
            (PC Browsers, iOS Safari PWA, Android App)
                                │
                                ▼
                 [ Amazon Route 53 (DNS) ]
                                │
                                ▼
           [ Amazon CloudFront CDN (Global Edge) ]
           ├─ Static Assets /_next/static/ ──> Amazon S3 (Origin)
           ├─ PWA Shell (/sw.js, manifest) ──> Cache-Control: no-cache
           └─ Dynamic Routes / APIs ─────────┐
                                              ▼
               [ Application Load Balancer (ALB) ]
                     (SSL Offload, HTTP/2)
                                │
         ┌──────────────────────┴──────────────────────┐
         ▼                                             ▼
[ ECS Fargate Task 1 ]                       [ ECS Fargate Task N ]
(Next.js 16 Standalone)                     (Next.js 16 Standalone)
   2 vCPU / 4 GB RAM                           2 vCPU / 4 GB RAM
   Autoscaling: Min 2, Max 10 (Target: 65% CPU, 70% RAM)
         │                                             │
         ├──────────────────────┬──────────────────────┤
         ▼                      ▼                      ▼
[ AWS ElastiCache Redis ]  [ AWS RDS Proxy ]   [ AWS SNS / FCM / VAPID ]
  cache.t4g.medium           PostgreSQL Pool     High-Throughput Push
  Sub-10ms Read Cache        Max 100 Conn Pool   Fan-out to 1,500 Devices
  (Timetables, Sessions)     (No DB Overload)    (WhatsApp App Icon Badges)
```

---

## 2. Core Upgrades Implemented

### A. WhatsApp-Style App Icon Badging API
* **Service Worker (`public/sw.js`)**:
  - Embedded **IndexedDB (`srt-portal-pwa-badging`)** engine inside the Service Worker scope.
  - When push notifications arrive while the browser/app is completely closed, `sw.js` increments the counter in IndexedDB and calls `self.registration.setAppBadge(count)`.
  - App icon on Android, iOS Safari 16.4+, and Windows Desktop dynamically displays the unread counter badge.
  - When the user taps a notification or reads messages, `clearAppBadge()` decrements or resets the badge count.
* **Client App (`frontend/lib/pwa/badgeManager.ts`)**:
  - Direct browser invocation via `navigator.setAppBadge()` and `navigator.clearAppBadge()`.
  - Bidirectional communication with Service Worker via `postMessage({ type: "SET_BADGE" })`.
  - Integrated into [frontend/components/Topbar.tsx](file:///c:/Users/rpnis/OneDrive/Desktop/PORTAL_1527/frontend/components/Topbar.tsx) unread-counter polling.

### B. Permanent Session (Never Auto-Logout)
* **Configuration (`backend/lib/session-config.ts` & `backend/auth/authOptions.ts`)**:
  - Set `IDLE_TIMEOUT_HOURS = 8760` (1 full year) and cookie `maxAge = 31,536,000s`.
  - Removed idle-revocation logic from `backend/lib/session-manager.ts`.
  - Added [frontend/components/auth/SilentSessionRefresher.tsx](file:///c:/Users/rpnis/OneDrive/Desktop/PORTAL_1527/frontend/components/auth/SilentSessionRefresher.tsx) to silently touch and rotate JWT tokens in the background every 3 hours and on window focus.
  - Users remain signed in indefinitely until they explicitly click "Log Out" or uninstall the PWA.

### C. 12:00 AM Silent Master Refresh (Zero Data Loss)
* **IndexedDB Draft Vault (`frontend/lib/storage/indexedDbStore.ts`)**:
  - Saves all active form drafts (homework submissions, marks entries, complaint drafts, messages) to IndexedDB with localStorage fallback.
* **Jittered Midnight Refresh (`frontend/hooks/useMidnightMasterRefresh.ts`)**:
  - Schedules a silent background refresh daily at **12:00:00 AM**.
  - **Anti-Stampede Jitter**: Adds a randomized **0 to 45 second spread** (`Math.floor(Math.random() * 45000)`) per client device.
  - Prevents 1,500 simultaneous devices from hitting AWS infrastructure at the exact same millisecond.
  - Calls Next.js `router.refresh()` and `syncAppBadgeWithServer()` without full-page reloads, preserving all user inputs.

### D. AWS Server Boost & High Concurrency (1,500+ Users)
* **Redis Caching Engine (`backend/lib/cache.ts`)**:
  - Connects to AWS ElastiCache Redis (`REDIS_URL` or `ELASTICACHE_HOST`) for sub-10ms response times on timetables, announcements, and attendance lookups.
  - Transparent fallback to an in-memory LRU cache when Redis is not configured.
* **Batch Push Fan-Out (`lib/notify.ts`)**:
  - Chunked execution in batches of 50 concurrent requests to prevent socket exhaustion when broadcasting announcements to 1,500 parents.
* **Reverse Proxy Tuning (`deploy/nginx.conf`)**:
  - HTTP/2, Gzip/Brotli compression, connection keepalives (`keepalive 64`), and rate limiting (50 req/sec per IP with burst of 100).

---

## 3. Recommended AWS Sizing for 1,500 Concurrent Users

| Resource | Recommended Service & SKU | Target Metrics / Settings |
| :--- | :--- | :--- |
| **Compute** | **AWS ECS Fargate** (Linux X86_64) | 2 vCPU, 4 GB RAM per task. Min: 2 tasks, Max: 10 tasks. Auto-scale at 65% CPU. |
| **Caching** | **AWS ElastiCache Redis** | `cache.t4g.medium` (3.09 GB RAM) or `cache.m6g.large`. Cluster mode disabled, 1 read replica. |
| **Database Pool** | **AWS RDS Proxy** (PostgreSQL) | Max pool: 100 connections. Idle client timeout: 1800s. Targets Neon / RDS Postgres. |
| **Edge CDN** | **Amazon CloudFront** | Price Class: All (Global). Compress: Yes. Forward headers: `Authorization`, `Cookie`, `X-Forwarded-*`. |
| **Storage** | **Amazon S3** | Standard storage with CloudFront OAI for PDFs, report cards, and avatars. |
| **Push Delivery**| **Web Push (VAPID) + FCM** | Batch chunk size: 50. Handled via AWS Lambda / ECS background queue. |

---

## 4. Environment Variables Reference

Add the following to your AWS ECS Task Definition or AWS Amplify environment variables:

```bash
# Redis / AWS ElastiCache
REDIS_URL="redis://your-elasticache-cluster.cache.amazonaws.com:6379"

# Database & RDS Proxy Connection (with pooling parameters)
DATABASE_URL="postgresql://user:password@your-rds-proxy.proxy-xxxx.us-east-1.rds.amazonaws.com:5432/dbname?sslmode=require&connection_limit=30&pool_timeout=20"

# NextAuth & Persistent Session
NEXTAUTH_URL="https://your-domain.com"
NEXTAUTH_SECRET="your-high-entropy-32-character-secret"

# VAPID Keys for Web Push
NEXT_PUBLIC_VAPID_PUBLIC_KEY="BBIHzbc-DVhlpPB_plCE0gUMpCSsHiqA1Y5FVyP-ax6p0HWnFZILFISth4FYfyAp0gywswCBxz4GfDnXm_c-Agk"
VAPID_PRIVATE_KEY="your-private-vapid-key"
VAPID_SUBJECT="mailto:admin@your-school.com"
```
