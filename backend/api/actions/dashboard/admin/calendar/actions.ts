"use server";

import { prisma } from "@/backend/db/prisma";
import { revalidatePath } from "next/cache";
import { parseDateString } from "@/backend/lib/services/attendanceCalculation";

function revalidateAllCalendarAndAttendancePaths() {
  revalidatePath("/dashboard/admin/calendar");
  revalidatePath("/dashboard/teacher/calendar");
  revalidatePath("/dashboard/parent/calendar");
  revalidatePath("/dashboard/admin/attendance");
  revalidatePath("/dashboard/admin/teacher-attendance");
  revalidatePath("/dashboard/teacher/attendance");
  revalidatePath("/dashboard/parent/attendance");
  revalidatePath("/dashboard/parent");
  revalidatePath("/dashboard");
}

/**
 * Admin action to mark a day as School Working Day or School Leave Day anytime.
 */
export async function setSchoolDayStatusAction(payload: {
  date: string; // YYYY-MM-DD
  status: "WORKING_DAY" | "LEAVE_DAY";
  title?: string;
  reason?: string;
  targetClassType?: "ALL" | "SPECIFIC";
  targetClassIds?: string[];
  targetClassNames?: string;
}) {
  try {
    const targetDate = parseDateString(payload.date);
    const targetClassType = payload.targetClassType || "ALL";
    const targetClassIds =
      targetClassType === "SPECIFIC" && payload.targetClassIds && payload.targetClassIds.length > 0
        ? payload.targetClassIds.join(",")
        : "ALL";
    const targetClassNames =
      payload.targetClassNames || (targetClassType === "ALL" ? "All Classes" : "");

    await prisma.schoolDaySchedule.upsert({
      where: { date: targetDate },
      update: {
        status: payload.status,
        title: payload.title || (payload.status === "WORKING_DAY" ? "Working Day" : "Leave Day"),
        reason: payload.reason || null,
        targetClassType,
        targetClassIds,
        targetClassNames,
        isCustom: true,
      },
      create: {
        date: targetDate,
        status: payload.status,
        title: payload.title || (payload.status === "WORKING_DAY" ? "Working Day" : "Leave Day"),
        reason: payload.reason || null,
        targetClassType,
        targetClassIds,
        targetClassNames,
        isCustom: true,
      },
    });

    revalidateAllCalendarAndAttendancePaths();
    return { success: true };
  } catch (error: unknown) {
    console.error("Error setting school day status:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update school day status",
    };
  }
}

/**
 * Admin action to reset a day back to default calendar rule.
 */
export async function deleteSchoolDayStatusAction(dateStr: string) {
  try {
    const targetDate = parseDateString(dateStr);
    await prisma.schoolDaySchedule.deleteMany({
      where: { date: targetDate },
    });

    revalidateAllCalendarAndAttendancePaths();
    return { success: true };
  } catch (error: unknown) {
    console.error("Error resetting school day status:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to reset school day status",
    };
  }
}

/**
 * Admin batch mark action (e.g. set multiple days at once like vacations or weekends).
 */
export async function batchSetSchoolDaysAction(
  days: { date: string; status: "WORKING_DAY" | "LEAVE_DAY"; title?: string; reason?: string }[]
) {
  try {
    for (const item of days) {
      const targetDate = parseDateString(item.date);
      await prisma.schoolDaySchedule.upsert({
        where: { date: targetDate },
        update: {
          status: item.status,
          title: item.title || (item.status === "WORKING_DAY" ? "Working Day" : "Leave Day"),
          reason: item.reason || null,
          isCustom: true,
        },
        create: {
          date: targetDate,
          status: item.status,
          title: item.title || (item.status === "WORKING_DAY" ? "Working Day" : "Leave Day"),
          reason: item.reason || null,
          isCustom: true,
        },
      });
    }

    revalidateAllCalendarAndAttendancePaths();
    return { success: true, count: days.length };
  } catch (error: unknown) {
    console.error("Error batch setting school days:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to batch update school days",
    };
  }
}

export async function createEventAction(formData: FormData) {
  try {
    const title = formData.get("title") as string;
    const type = formData.get("type") as string;
    const date = formData.get("date") as string;
    const endDate = formData.get("endDate") as string;
    const startTime = (formData.get("startTime") as string) || "09:00";
    const endTime = (formData.get("endTime") as string) || "16:00";
    const location = formData.get("location") as string;
    const description = formData.get("description") as string;
    const targetClass = formData.get("targetClass") as string;
    const targetSection = formData.get("targetSection") as string;
    const organizer = formData.get("organizer") as string;
    const status = formData.get("status") as string;
    const audience = formData.get("audience") as string;

    const eventDate = parseDateString(date);

    await prisma.calendarEvent.create({
      data: {
        title,
        type: type || "OTHER",
        date: eventDate,
        startTime,
        endTime,
        location,
        description,
        targetClass,
        targetSection,
        organizer,
        audience: audience || "ALL",
        endDate: endDate ? parseDateString(endDate) : null,
        status: status || "UPCOMING",
        isPublished: true,
      },
    });

    revalidateAllCalendarAndAttendancePaths();
    return { success: true };
  } catch (error: unknown) {
    console.error("Error creating event:", error);
    if (error instanceof Error) {
      return { error: error.message };
    }
    return { error: "Failed to create event" };
  }
}

export async function deleteEventAction(id: string) {
  try {
    await prisma.calendarEvent.delete({ where: { id } });
    revalidateAllCalendarAndAttendancePaths();
    return { success: true };
  } catch (error: unknown) {
    console.error("Error deleting event:", error);
    if (error instanceof Error) {
      return { error: error.message };
    }
    return { error: "Failed to delete event" };
  }
}
