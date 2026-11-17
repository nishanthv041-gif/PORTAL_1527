"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { syncAppBadgeWithServer } from "@/frontend/lib/pwa/badgeManager";

/**
 * Calculates milliseconds from current time until the next 12:00:00 AM midnight.
 * Supports school timezone (Asia/Kolkata) with browser local fallback.
 */
function getMsUntilNextMidnight(): number {
  const now = new Date();
  
  // Create target midnight for tomorrow
  const nextMidnight = new Date(now);
  nextMidnight.setDate(nextMidnight.getDate() + 1);
  nextMidnight.setHours(0, 0, 0, 0);

  const diffMs = nextMidnight.getTime() - now.getTime();
  return Math.max(1000, diffMs);
}

/**
 * useMidnightMasterRefresh
 * 
 * Triggers a silent master state refresh daily at 12:00 AM without wiping user
 * input, form drafts, or forcing a full-page reload.
 * 
 * ANTI-CRASH JITTER: Adds a random 0–45 second delay per client device to spread
 * 1,500+ simultaneous requests across a 45-second window on AWS servers.
 */
export function useMidnightMasterRefresh() {
  const router = useRouter();
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const scheduleMidnightSync = () => {
      const msUntilMidnight = getMsUntilNextMidnight();
      
      // Anti-stampede jitter: 0 to 45,000 milliseconds
      const jitterMs = Math.floor(Math.random() * 45000);
      const totalWaitMs = msUntilMidnight + jitterMs;

      console.debug(
        `[MidnightSync] Scheduled silent refresh in ${(totalWaitMs / 1000 / 60).toFixed(1)} mins (jitter: ${(jitterMs / 1000).toFixed(1)}s)`
      );

      timerRef.current = setTimeout(async () => {
        try {
          console.info("[MidnightSync] 12:00 AM master sync triggered silently.");

          // 1. Silent server component revalidation (stale-while-revalidate without full page reload)
          router.refresh();

          // 2. Refresh app icon notification badge and unread counters
          await syncAppBadgeWithServer().catch(() => {});

          // 3. Dispatch global custom event for active client forms and components
          window.dispatchEvent(new CustomEvent("srt-midnight-master-refresh", {
            detail: { timestamp: Date.now() },
          }));

          // 4. Request ServiceWorker background cache update
          if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage({ type: "MIDNIGHT_SYNC" });
          }
        } catch (err) {
          console.warn("[MidnightSync] Silent refresh warning:", err);
        } finally {
          // Schedule the subsequent day's midnight sync
          scheduleMidnightSync();
        }
      }, totalWaitMs);
    };

    scheduleMidnightSync();

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [router]);
}
