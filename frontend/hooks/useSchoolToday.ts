"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  getSchoolNow,
  getSchoolToday,
  msUntilNextSchoolMidnight,
  formatSchoolDate,
  SchoolWeekday,
  SCHOOL_DAYS,
  SchoolDateTimeParts,
} from "@/lib/time";

export interface SchoolTodayState {
  today: string; // YYYY-MM-DD
  formattedDate: string; // e.g. "Wednesday, 4 Nov 2026"
  weekday: SchoolWeekday;
  isoDay: number; // 1 (Mon) .. 7 (Sun)
  sundayZero: number; // 0 (Sun) .. 6 (Sat)
  timeStr: string; // HH:mm
  currentMinutes: number; // 0..1439
  isSchoolDay: boolean;
}

const FULL_DATE_OPTIONS: Intl.DateTimeFormatOptions = {
  weekday: "long",
  day: "numeric",
  month: "short",
  year: "numeric",
};

export function useSchoolToday(options?: {
  onDayChange?: (newToday: string, newWeekday: SchoolWeekday) => void;
}): SchoolTodayState {
  const [state, setState] = useState<SchoolTodayState>(() => {
    const parts = getSchoolNow();
    return {
      today: parts.dateStr,
      formattedDate: formatSchoolDate(parts.dateStr, FULL_DATE_OPTIONS),
      weekday: parts.weekday,
      isoDay: parts.isoDay,
      sundayZero: parts.sundayZero,
      timeStr: parts.timeStr,
      currentMinutes: parts.minutesOfDay,
      isSchoolDay: SCHOOL_DAYS.includes(parts.weekday),
    };
  });

  const todayRef = useRef(state.today);
  const onDayChangeRef = useRef(options?.onDayChange);

  useEffect(() => {
    todayRef.current = state.today;
  }, [state.today]);

  useEffect(() => {
    onDayChangeRef.current = options?.onDayChange;
  }, [options?.onDayChange]);

  const applySchoolTime = useCallback(() => {
    const parts: SchoolDateTimeParts = getSchoolNow();
    const isNewDay = parts.dateStr !== todayRef.current;

    setState({
      today: parts.dateStr,
      formattedDate: formatSchoolDate(parts.dateStr, FULL_DATE_OPTIONS),
      weekday: parts.weekday,
      isoDay: parts.isoDay,
      sundayZero: parts.sundayZero,
      timeStr: parts.timeStr,
      currentMinutes: parts.minutesOfDay,
      isSchoolDay: SCHOOL_DAYS.includes(parts.weekday),
    });

    if (isNewDay) {
      todayRef.current = parts.dateStr;
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("school-day-changed", {
            detail: { today: parts.dateStr, weekday: parts.weekday },
          })
        );
      }
      if (onDayChangeRef.current) {
        onDayChangeRef.current(parts.dateStr, parts.weekday);
      }
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // 1. Initial sync to guarantee correct day immediately upon hydration
    applySchoolTime();

    // 2. Regular 30s tick for live period indicators (ongoing / completed / upcoming)
    const tickInterval = setInterval(applySchoolTime, 30000);

    // 3. Exact midnight switch (12:00:00 AM IST)
    let midnightTimer: NodeJS.Timeout | null = null;
    const scheduleMidnight = () => {
      const ms = msUntilNextSchoolMidnight();
      // Add a slight buffer (150ms) to ensure midnight has crossed in Asia/Kolkata
      midnightTimer = setTimeout(() => {
        applySchoolTime();
        scheduleMidnight(); // Schedule next day's midnight
      }, ms + 150);
    };
    scheduleMidnight();

    // 4. Tab / phone wake-up handlers (visibility change, window focus, online reconnect)
    const handleWakeUp = () => {
      applySchoolTime();
    };

    document.addEventListener("visibilitychange", handleWakeUp);
    window.addEventListener("focus", handleWakeUp);
    window.addEventListener("online", handleWakeUp);

    return () => {
      clearInterval(tickInterval);
      if (midnightTimer) clearTimeout(midnightTimer);
      document.removeEventListener("visibilitychange", handleWakeUp);
      window.removeEventListener("focus", handleWakeUp);
      window.removeEventListener("online", handleWakeUp);
    };
  }, [applySchoolTime]);

  return state;
}
