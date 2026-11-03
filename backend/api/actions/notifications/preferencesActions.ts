"use server";

import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import { revalidatePath } from "next/cache";

export interface UserNotificationPreferences {
  enabled: boolean;
  general: boolean;
  account: boolean;
  alerts: boolean;
  academic: boolean;
  admin: boolean;
  maintenance: boolean;
}

export async function getUserNotificationPreferencesAction() {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session || !session.user?.id) {
      return { error: "Unauthorized" };
    }

    const userId = session.user.id;
    let pref = await prisma.notificationPreference.findUnique({
      where: { userId },
    });

    if (!pref) {
      pref = await prisma.notificationPreference.create({
        data: {
          userId,
          enabled: true,
          general: true,
          account: true,
          alerts: true,
          academic: true,
          admin: true,
          maintenance: true,
        },
      });
    }

    // Get active subscriptions for this user
    const subscriptions = await prisma.pushSubscription.findMany({
      where: { userId },
      select: {
        id: true,
        endpoint: true,
        deviceName: true,
        userAgent: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return {
      preferences: {
        enabled: pref.enabled,
        general: pref.general,
        account: pref.account,
        alerts: pref.alerts,
        academic: pref.academic,
        admin: pref.admin,
        maintenance: pref.maintenance,
      },
      subscriptions,
    };
  } catch (error: unknown) {
    console.error("[Preferences] Error fetching:", error);
    return { error: "Failed to load preferences." };
  }
}

export async function updateUserNotificationPreferencesAction(
  updates: Partial<UserNotificationPreferences>
) {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session || !session.user?.id) {
      return { error: "Unauthorized" };
    }

    const userId = session.user.id;

    const updated = await prisma.notificationPreference.upsert({
      where: { userId },
      create: {
        userId,
        enabled: updates.enabled ?? true,
        general: updates.general ?? true,
        account: updates.account ?? true,
        alerts: updates.alerts ?? true,
        academic: updates.academic ?? true,
        admin: updates.admin ?? true,
        maintenance: updates.maintenance ?? true,
      },
      update: {
        ...updates,
      },
    });

    revalidatePath("/dashboard");
    return { success: true, preferences: updated };
  } catch (error: unknown) {
    console.error("[Preferences] Error updating:", error);
    return { error: "Failed to update preferences." };
  }
}

export async function deleteUserPushSubscriptionAction(subscriptionId: string) {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session || !session.user?.id) {
      return { error: "Unauthorized" };
    }

    await prisma.pushSubscription.deleteMany({
      where: {
        id: subscriptionId,
        userId: session.user.id,
      },
    });

    return { success: true };
  } catch (error: unknown) {
    console.error("[Preferences] Error removing subscription:", error);
    return { error: "Failed to remove device." };
  }
}

