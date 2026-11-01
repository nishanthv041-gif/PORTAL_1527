"use server";

import { prisma } from "@/backend/db/prisma";
import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import bcrypt from "bcryptjs";
import { revalidatePath, updateTag } from "next/cache";

export interface UpdateProfileInput {
  name: string;
  phone?: string;
  alternatePhone?: string;
  qualification?: string;
}

export async function updateUserProfile(input: UpdateProfileInput) {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session?.user?.id) {
      return { success: false, error: "Unauthorized. Please log in." };
    }

    const userId = session.user.id;
    const name = input.name?.trim();

    if (!name) {
      return { success: false, error: "Full Name is required." };
    }

    // Update user display name
    await prisma.user.update({
      where: { id: userId },
      data: { name },
    });

    // Update role-specific phone/profile
    const [teacher, parent, staff] = await Promise.all([
      prisma.teacher.findUnique({ where: { userId } }),
      prisma.parent.findUnique({ where: { userId } }),
      prisma.staff.findUnique({ where: { userId } }),
    ]);

    if (teacher) {
      await prisma.teacher.update({
        where: { id: teacher.id },
        data: {
          phone: input.phone?.trim() || null,
          alternatePhone: input.alternatePhone?.trim() || null,
          qualification: input.qualification?.trim() || teacher.qualification,
        },
      });
    } else if (parent) {
      await prisma.parent.update({
        where: { id: parent.id },
        data: {
          phone: input.phone?.trim() || null,
          alternatePhone: input.alternatePhone?.trim() || null,
        },
      });
    } else if (staff) {
      await prisma.staff.update({
        where: { id: staff.id },
        data: {
          phone: input.phone?.trim() || null,
        },
      });
    }

    revalidatePath("/settings");
    revalidatePath("/dashboard/admin/settings");
    revalidatePath("/dashboard/teacher/settings");
    revalidatePath("/dashboard/parent/settings");

    return { success: true, message: "Profile updated successfully." };
  } catch (err: unknown) {
    console.error("updateUserProfile error:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to update profile.",
    };
  }
}

export interface ChangePasswordInput {
  currentPassword?: string;
  newPassword: string;
}

export async function changeUserPassword(input: ChangePasswordInput) {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session?.user?.id) {
      return { success: false, error: "Unauthorized. Please log in." };
    }

    const userId = session.user.id;
    const newPassword = input.newPassword?.trim();

    if (!newPassword || newPassword.length < 6) {
      return { success: false, error: "New password must be at least 6 characters long." };
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { password: true },
    });

    if (!user) {
      return { success: false, error: "User not found." };
    }

    // If user has an existing password, verify current password
    if (user.password) {
      if (!input.currentPassword) {
        return { success: false, error: "Current password is required." };
      }
      const isMatch = await bcrypt.compare(input.currentPassword, user.password);
      if (!isMatch) {
        return { success: false, error: "Incorrect current password." };
      }
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { id: userId },
      data: {
        password: hashedPassword,
        sessionVersion: { increment: 1 },
      },
    });

    return { success: true, message: "Password changed successfully." };
  } catch (err: unknown) {
    console.error("changeUserPassword error:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to change password.",
    };
  }
}

export async function logoutAllSessions() {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session?.user?.id) {
      return { success: false, error: "Unauthorized." };
    }

    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        sessionVersion: { increment: 1 },
      },
    });

    return {
      success: true,
      message: "All other sessions logged out successfully.",
    };
  } catch (err: unknown) {
    console.error("logoutAllSessions error:", err);
    return { success: false, error: "Failed to logout other sessions." };
  }
}

export interface UpdatePreferencesInput {
  theme: "light" | "dark" | "system";
  notificationsEnabled: boolean;
  busAlertsSMS?: boolean;
  busAlertsEmail?: boolean;
  busAlertsApp?: boolean;
}

export async function updateUserPreferences(input: UpdatePreferencesInput) {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session?.user?.id) {
      return { success: false, error: "Unauthorized." };
    }

    const themeToSave = input.theme === "system" ? "light" : input.theme;

    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        theme: themeToSave,
        notificationsEnabled: input.notificationsEnabled,
      },
    });

    revalidatePath("/settings");
    return { success: true, message: "Preferences saved successfully." };
  } catch (err: unknown) {
    console.error("updateUserPreferences error:", err);
    return { success: false, error: "Failed to save preferences." };
  }
}

export interface SaveSchoolDefaultsInput {
  schoolName: string;
  tagline?: string;
  address?: string;
  contact?: string;
  email?: string;
  website?: string;
  academicYear?: string;
  busAlertPriority?: string;
}

export async function saveSchoolDefaultsAction(input: SaveSchoolDefaultsInput) {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session || session.user?.role !== "ADMIN") {
      return { success: false, error: "Only administrators can configure school defaults." };
    }

    const settingsToUpsert = [
      { key: "SCHOOL_NAME", value: input.schoolName.trim(), category: "SCHOOL" },
      { key: "SCHOOL_TAGLINE", value: input.tagline?.trim() || "", category: "SCHOOL" },
      { key: "SCHOOL_ADDRESS", value: input.address?.trim() || "", category: "SCHOOL" },
      { key: "SCHOOL_CONTACT", value: input.contact?.trim() || "", category: "SCHOOL" },
      { key: "SCHOOL_EMAIL", value: input.email?.trim() || "", category: "SCHOOL" },
      { key: "SCHOOL_WEBSITE", value: input.website?.trim() || "", category: "SCHOOL" },
      { key: "ACADEMIC_YEAR", value: input.academicYear?.trim() || "2024-2025", category: "ACADEMIC" },
      { key: "BUS_ALERT_DEFAULT_PRIORITY", value: input.busAlertPriority?.trim() || "NORMAL", category: "BUS" },
    ];

    const operations = settingsToUpsert.map((s) =>
      prisma.systemSetting.upsert({
        where: { key: s.key },
        update: { value: s.value, category: s.category },
        create: { key: s.key, value: s.value, category: s.category },
      })
    );

    await prisma.$transaction(operations);

    try {
      updateTag("system-settings");
    } catch {
      // cache update tag
    }

    revalidatePath("/settings");
    revalidatePath("/dashboard/admin/settings");

    return { success: true, message: "School profile & defaults saved successfully." };
  } catch (err: unknown) {
    console.error("saveSchoolDefaultsAction error:", err);
    return { success: false, error: "Failed to save school defaults." };
  }
}

