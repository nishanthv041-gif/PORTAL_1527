"use client";

import { Capacitor } from "@capacitor/core";

const SESSION_KEY = "srt_native_auth_session";

async function getPreferences() {
  if (typeof window === "undefined" || !Capacitor.isNativePlatform()) return null;
  try {
    const { Preferences } = await import("@capacitor/preferences");
    return Preferences;
  } catch {
    return null;
  }
}

export interface PersistedUserSession {
  userId: string;
  role: string;
  name?: string;
  email?: string;
  loginTimestamp: number;
}

/**
 * Persist authentication session to native device storage (never auto-logout)
 */
export async function persistNativeSession(session: PersistedUserSession): Promise<void> {
  if (typeof window === "undefined" || !Capacitor.isNativePlatform()) {
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } catch {}
    return;
  }

  try {
    const Preferences = await getPreferences();
    if (Preferences) {
      await Preferences.set({
        key: SESSION_KEY,
        value: JSON.stringify(session),
      });
      console.log("[AuthPersistence] Session saved to native device storage for user:", session.userId);
    }
  } catch (err) {
    console.debug("[AuthPersistence] Failed to persist native session:", err);
  }
}

/**
 * Retrieve persisted session from native storage
 */
export async function getPersistedNativeSession(): Promise<PersistedUserSession | null> {
  if (typeof window === "undefined") return null;

  if (Capacitor.isNativePlatform()) {
    try {
      const Preferences = await getPreferences();
      if (Preferences) {
        const result = await Preferences.get({ key: SESSION_KEY });
        if (result && result.value) {
          return JSON.parse(result.value);
        }
      }
    } catch (err) {
      console.debug("[AuthPersistence] Failed to get native session:", err);
    }
  }

  try {
    const val = localStorage.getItem(SESSION_KEY);
    return val ? JSON.parse(val) : null;
  } catch {
    return null;
  }
}

/**
 * Clear persisted session on explicit logout
 */
export async function clearPersistedNativeSession(): Promise<void> {
  if (typeof window === "undefined") return;

  if (Capacitor.isNativePlatform()) {
    try {
      const Preferences = await getPreferences();
      if (Preferences) {
        await Preferences.remove({ key: SESSION_KEY });
        console.log("[AuthPersistence] Native session cleared.");
      }
    } catch (err) {
      console.debug("[AuthPersistence] Failed to remove native session:", err);
    }
  }

  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {}
}
