/**
 * Central Session & Device Configuration
 * Configures Single-Device Enforcement and Auto-Logout rules.
 */

export const SINGLE_DEVICE_ROLES: readonly string[] = ["PARENT", "TEACHER"];

export const IDLE_TIMEOUT_HOURS = 6;

export const MAX_SESSION_HOURS: number | null = null;

export const ACTIVITY_UPDATE_INTERVAL_MIN = 5;

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
  IDLE_TIMEOUT: "Your session has expired due to 6 hours of inactivity. Please log in again.",
  MAX_TIME: "Your session has reached its maximum allowed duration. Please log in again.",
  LOGOUT: "You have been signed out successfully.",
  PASSWORD_CHANGED: "Your password was changed. Please log in again with your new credentials.",
  ADMIN_FORCED: "Your session was ended by an administrator.",
};

