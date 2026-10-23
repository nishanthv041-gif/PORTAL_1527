"use server";

import { prisma } from "@/backend/db/prisma";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";

// In-memory cache for system settings (0ms response, 5 min TTL)
let cachedSettings: { data: Record<string, string>; expiresAt: number } | null = null;

export async function invalidateSettingsCache() {
  cachedSettings = null;
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

    cachedSettings = null;
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

    cachedSettings = null;
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
    cachedSettings = null;
    revalidatePath("/dashboard/admin/settings");
    return { success: true };
  } catch (error: unknown) {
    if (error instanceof Error) {
      return { error: error.message || "Failed to delete setting." };
    }
    return { error: "Failed to delete setting." };
  }
}

export async function getSystemSettings(): Promise<Record<string, string>> {
  const now = Date.now();
  if (cachedSettings && cachedSettings.expiresAt > now) {
    return cachedSettings.data;
  }

  const settings = await prisma.systemSetting.findMany({
    select: { key: true, value: true }
  });
  const settingsMap: Record<string, string> = {};
  settings.forEach(s => { settingsMap[s.key] = s.value; });
  cachedSettings = { data: settingsMap, expiresAt: now + 300_000 }; // 5 min TTL
  return settingsMap;
}

export async function getSystemSetting(key: string, defaultValue: string = "") {
  const settings = await getSystemSettings();
  return settings[key] || defaultValue;
}
