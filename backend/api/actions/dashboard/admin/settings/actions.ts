"use server";

import { prisma } from "@/backend/db/prisma";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";

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

    // Run sequentially or use a transaction
    for (const setting of settings) {
      if (!setting.key) continue;
      await prisma.systemSetting.upsert({
        where: { key: setting.key },
        update: { value: setting.value, category: setting.category },
        create: { key: setting.key, value: setting.value, category: setting.category }
      });
    }

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
    revalidatePath("/dashboard/admin/settings");
    return { success: true };
  } catch (error: unknown) {
    if (error instanceof Error) {
      return { error: error.message || "Failed to delete setting." };
    }
    return { error: "Failed to delete setting." };
  }
}

export async function getSystemSettings() {
  const settings = await prisma.systemSetting.findMany();
  const settingsMap: Record<string, string> = {};
  settings.forEach(s => { settingsMap[s.key] = s.value; });
  return settingsMap;
}

export async function getSystemSetting(key: string, defaultValue: string = "") {
  const setting = await prisma.systemSetting.findUnique({ where: { key } });
  return setting?.value || defaultValue;
}
