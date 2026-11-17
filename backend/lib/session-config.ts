/**
 * Central Session & Device Configuration
 * Configures Single-Device Enforcement and Persistent Login rules.
 * Indefinite Session Persistence: users remain authenticated permanently
 * until explicit logout or admin revocation.
 */

export const SINGLE_DEVICE_ROLES: readonly string[] = ["PARENT", "TEACHER"];

// 1 Year (8,760 hours) indefinite session persistence - never auto-logouts
export const IDLE_TIMEOUT_HOURS = 8760;

export const MAX_SESSION_HOURS: number | null = null;

export const ACTIVITY_UPDATE_INTERVAL_MIN = 15;

export const STATUS_POLL_SECONDS = 60;

export type SessionRevocationReason =
  | "LOGIN_ELSEWHERE"
  | "IDLE_TIMEOUT"
  | "MAX_TIME"
  | "LOGOUT"
  | "PASSWORD_CHANGED"
  | "ADMIN_FORCED";

export const REVOCATION_MESSAGES: Record<SessionRevocationReason | string, string> = {
  LOGIN_ELSEWHERE: "You were logged out because your account was signed in on another device.",
  IDLE_TIMEOUT: "Your session has expired. Please log in again.",
  MAX_TIME: "Your session has reached its maximum allowed duration. Please log in again.",
  LOGOUT: "You have been signed out successfully.",
  PASSWORD_CHANGED: "Your password was changed. Please log in again with your new credentials.",
  ADMIN_FORCED: "Your session was ended by an administrator.",
};

