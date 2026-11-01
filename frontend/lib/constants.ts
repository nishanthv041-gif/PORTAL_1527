/**
 * Central application constants for SRT Universal School Portal.
 * Clean, verified single source of truth across all components and pages.
 */

export const SCHOOL_NAME = "SRT UNIVERSAL SCHOOL";
export const SCHOOL_TAGLINE = "Seeing Righteousness & Truth";
export const CANONICAL_URL = "https://nipoportal.vercel.app";

export const SCHOOL_LOGO_SVG = "/logo/srt-logo.svg";
export const SCHOOL_LOGO_PNG = "/logo/srt-logo.png";
export const SCHOOL_LOGO_CREST = "/logo/srt-logo.svg";

export const SCHOOL_CONTACT = {
  EMAIL: "contact@srtuniversalschool.edu",
  PHONE: "+91 98765 43210",
  ADDRESS: "SRT Universal School Campus, Tamil Nadu, India",
  WORKING_HOURS: "Monday – Saturday: 8:30 AM – 4:30 PM",
} as const;

export const BRAND_COLORS = {
  NAVY: "#0b1329",
  NAVY_DARK: "#070c1b",
  NAVY_LIGHT: "#142247",
  GOLD: "#f2b84b",
  GOLD_HOVER: "#e5a835",
  GOLD_LIGHT: "#fdf4df",
  SLATE_BG: "#0f172a",
  SLATE_CARD: "#1e293b",
  SUCCESS: "#10b981",
  WARNING: "#f59e0b",
  DANGER: "#ef4444",
} as const;

export const USER_ROLES = {
  ADMIN: "Admin",
  TEACHER: "Teacher",
  STAFF: "Staff",
  PARENT: "Parent",
  STUDENT: "Student",
} as const;

export const DEFAULT_ACADEMIC_YEAR = "2024-2025";

export const NOTIFICATION_CATEGORIES = {
  BUS: "BUS",
  ACADEMIC: "ACADEMIC",
  ATTENDANCE: "ATTENDANCE",
  FEE: "FEE",
  ANNOUNCEMENT: "ANNOUNCEMENT",
} as const;

