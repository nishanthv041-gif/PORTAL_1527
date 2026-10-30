"use server";

import { prisma } from "@/backend/db/prisma";
import { revalidatePath, unstable_cache, updateTag } from "next/cache";
import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";

export async function invalidateSettingsCache() {
  try {
    updateTag("system-settings");
  } catch {}
}

export async function saveSystemSettingAction(formData: FormData) {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session || session.user.role !== 'ADMIN') return { error: "Unauthorized" };

    const key = formData.get("key") as string;
    const value = formData.get("value") as string;
    const category = formData.get("category") as string || "GENERAL";

    if (!key || !value) {
      return { error: "Key and value are required." };
    }

    await prisma.systemSetting.upsert({
      where: { key },
      update: { value, category },
      create: { key, value, category }
    });

    try { updateTag("system-settings"); } catch {}
    revalidatePath("/dashboard/admin/settings");
    return { success: true };
  } catch (error: unknown) {
    if (error instanceof Error) {
      return { error: error.message || "Failed to save setting." };
    }
    return { error: "Failed to save setting." };
  }
}

export async function saveSystemSettingsBatchAction(settings: { key: string; value: string; category: string }[]) {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session || session.user.role !== 'ADMIN') return { error: "Unauthorized" };

    const upserts = settings
      .filter(s => s.key)
      .map(setting => 
        prisma.systemSetting.upsert({
          where: { key: setting.key },
          update: { value: setting.value, category: setting.category },
          create: { key: setting.key, value: setting.value, category: setting.category }
        })
      );

    await prisma.$transaction(upserts);

    try { updateTag("system-settings"); } catch {}
    revalidatePath("/dashboard/admin/settings");
    return { success: true };
  } catch (error: unknown) {
    return { error: "Failed to save settings batch." };
  }
}

export async function deleteSystemSettingAction(key: string) {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session || session.user.role !== 'ADMIN') return { error: "Unauthorized" };

    await prisma.systemSetting.delete({ where: { key } });
    try { updateTag("system-settings"); } catch {}
    revalidatePath("/dashboard/admin/settings");
    return { success: true };
  } catch (error: unknown) {
    if (error instanceof Error) {
      return { error: error.message || "Failed to delete setting." };
    }
    return { error: "Failed to delete setting." };
  }
}

const DEFAULT_SYSTEM_SETTINGS: Record<string, string> = {
  ALLOW_ADMIN_REGISTRATION: "false",
  ALLOW_TEACHER_REGISTRATION: "true",
  ALLOW_PARENT_REGISTRATION: "true",
  ALLOW_STUDENT_REGISTRATION: "true",
  REQUIRE_APPROVAL_NEW_USERS: "true",
  TEACHER_MANAGE_ATTENDANCE: "true",
  TEACHER_MANAGE_MARKS: "true",
  PARENT_VIEW_ANALYTICS: "false",
  PARENT_ADMIN_PERMISSIONS: "false",
  ACADEMIC_YEAR: "2026-2027",
  TERMS_SEMESTERS: "2",
  DEFAULT_PASSING_MARKS: "40",
  ATTENDANCE_TYPE: "Daily",
  PARENT_ATTENDANCE_VISIBILITY: "true",
  ATTENDANCE_NOTIFICATIONS: "true",
  EMAIL_NOTIFICATIONS: "true",
  SMS_NOTIFICATIONS: "false",
  APP_NOTIFICATIONS: "true",
  EXAM_RESULT_ALERTS: "true",
  GRADE_SYSTEM: "Percentage (0-100)",
  RESULT_VISIBILITY: "false",
  PASSWORD_POLICY: "true",
  SESSION_TIMEOUT: "120",
  TWO_FACTOR_AUTH: "false",
  LANGUAGE: "English",
  TIME_ZONE: "UTC",
  DATE_FORMAT: "DD/MM/YYYY",
  THEME_MODE: "System",
  MAINTENANCE_MODE: "false",
  SYSTEM_LOGS: "false",
  SCHOOL_NAME: "Modern School Portal",
  SCHOOL_LOGO: "",
  SCHOOL_ADDRESS: "123 Education Lane, Knowledge Park",
  SCHOOL_CONTACT: "+1 (555) 019-2834",
  SCHOOL_EMAIL: "admin@schoolportal.edu",
  SCHOOL_WEBSITE: "https://schoolportal.edu",
  PRINCIPAL_NAME: "Dr. Eleanor Vance"
};

// 0ms cached query across serverless requests with 5 min TTL
export const getSystemSettings = unstable_cache(
  async (): Promise<Record<string, string>> => {
    try {
      const settings = await prisma.systemSetting.findMany({
        select: { key: true, value: true }
      });
      const settingsMap: Record<string, string> = { ...DEFAULT_SYSTEM_SETTINGS };
      settings.forEach(s => { settingsMap[s.key] = s.value; });
      return settingsMap;
    } catch (e) {
      console.error("Failed to load system settings:", e);
      return DEFAULT_SYSTEM_SETTINGS;
    }
  },
  ["system-settings-map"],
  { revalidate: 300, tags: ["system-settings"] }
);

export async function getSystemSetting(key: string, defaultValue: string = "") {
  const settings = await getSystemSettings();
  return settings[key] || defaultValue;
}

export const getSchoolInfo = unstable_cache(
  async (includeLogo: boolean = false): Promise<Record<string, string>> => {
    try {
      const settings = await prisma.systemSetting.findMany({
        where: {
          category: "SCHOOL",
          ...(includeLogo ? {} : { key: { not: "SCHOOL_LOGO" } })
        },
        select: { key: true, value: true }
      });
      const map: Record<string, string> = {
        SCHOOL_NAME: DEFAULT_SYSTEM_SETTINGS.SCHOOL_NAME,
        SCHOOL_ADDRESS: DEFAULT_SYSTEM_SETTINGS.SCHOOL_ADDRESS,
        SCHOOL_CONTACT: DEFAULT_SYSTEM_SETTINGS.SCHOOL_CONTACT,
        SCHOOL_EMAIL: DEFAULT_SYSTEM_SETTINGS.SCHOOL_EMAIL,
        SCHOOL_WEBSITE: DEFAULT_SYSTEM_SETTINGS.SCHOOL_WEBSITE,
        PRINCIPAL_NAME: DEFAULT_SYSTEM_SETTINGS.PRINCIPAL_NAME,
        ACADEMIC_YEAR: DEFAULT_SYSTEM_SETTINGS.ACADEMIC_YEAR,
        SCHOOL_LOGO: ""
      };
      settings.forEach(s => { map[s.key] = s.value; });
      return map;
    } catch (e) {
      console.error("Failed to load school info:", e);
      return DEFAULT_SYSTEM_SETTINGS;
    }
  },
  ["school-info-cache"],
  { revalidate: 300, tags: ["system-settings"] }
);

export async function getSchoolLogo(): Promise<string> {
  try {
    const setting = await prisma.systemSetting.findUnique({
      where: { key: "SCHOOL_LOGO" },
      select: { value: true }
    });
    return setting?.value || "";
  } catch {
    return "";
  }
}

