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

// 0ms cached query across serverless requests with 5 min TTL
export const getSystemSettings = unstable_cache(
  async (): Promise<Record<string, string>> => {
    try {
      const settings = await prisma.systemSetting.findMany({
        select: { key: true, value: true }
      });
      const settingsMap: Record<string, string> = {};
      settings.forEach(s => { settingsMap[s.key] = s.value; });
      return settingsMap;
    } catch (e) {
      console.error("Failed to load system settings:", e);
      return {};
    }
  },
  ["system-settings-map"],
  { revalidate: 300, tags: ["system-settings"] }
);

export async function getSystemSetting(key: string, defaultValue: string = "") {
  const settings = await getSystemSettings();
  return settings[key] || defaultValue;
}
