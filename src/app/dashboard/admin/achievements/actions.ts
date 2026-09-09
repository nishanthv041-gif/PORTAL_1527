"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

export async function toggleAchievementVerificationAction(id: string, isVerified: boolean) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'ADMIN') return { error: "Unauthorized" };

    await prisma.achievement.update({
      where: { id },
      data: { isVerified }
    });

    revalidatePath("/dashboard/admin/achievements");
    return { success: true };
  } catch (error: unknown) {
    if (error instanceof Error) {
      return { error: error.message || "Failed to update verification status." };
    }
    return { error: "Failed to update verification status." };
  }
}
