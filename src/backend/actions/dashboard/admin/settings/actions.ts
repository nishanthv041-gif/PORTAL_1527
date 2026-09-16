"use server";

import { prisma } from "@/backend/db/prisma";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/backend/auth/authOptions";

export async function saveSystemSettingAction(formData: FormData) {
  try {
    const session = await getServerSession(authOptions);
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

export async function deleteSystemSettingAction(key: string) {
  try {
    const session = await getServerSession(authOptions);
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
