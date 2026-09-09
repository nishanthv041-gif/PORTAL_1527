"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function createTimetableSlotAction(formData: FormData) {
  const classId = formData.get("classId") as string;
  const dayOfWeek = formData.get("dayOfWeek") as string;
  const period = parseInt(formData.get("period") as string, 10);
  const subjectId = formData.get("subjectId") as string;
  const startTime = formData.get("startTime") as string;
  const endTime = formData.get("endTime") as string;
  const classroom = formData.get("classroom") as string;
  const isBreak = formData.get("isBreak") === "true";

  if (!classId || !dayOfWeek || isNaN(period) || (!isBreak && !subjectId)) {
    return { error: "Missing required fields." };
  }

  try {
    const existing = await prisma.timetable.findFirst({
      where: { classId, dayOfWeek, period }
    });

    if (existing) {
      await prisma.timetable.update({
        where: { id: existing.id },
        data: {
          subjectId: isBreak ? null : subjectId,
          startTime,
          endTime,
          classroom,
          isBreak
        }
      });
    } else {
      await prisma.timetable.create({
        data: {
          classId,
          dayOfWeek,
          period,
          subjectId: isBreak ? null : subjectId,
          startTime,
          endTime,
          classroom,
          isBreak
        }
      });
    }

    revalidatePath("/dashboard/admin/timetable");
    return { success: true };
  } catch (error: unknown) {
    if (error instanceof Error) {
      return { error: error.message };
    }
    return { error: "Failed to save timetable slot." };
  }
}

export async function deleteTimetableSlotAction(id: string) {
  try {
    await prisma.timetable.delete({
      where: { id }
    });
    revalidatePath("/dashboard/admin/timetable");
    return { success: true };
  } catch (error: unknown) {
    if (error instanceof Error) {
      return { error: error.message };
    }
    return { error: "Failed to delete timetable slot." };
  }
}

export async function bulkCreateTimetableSlotsAction(classId: string, slots: Array<{ dayOfWeek: string; period: number; subjectId: string | null; startTime: string; endTime: string; classroom: string; isBreak: boolean }>) {
  try {
    for (const slot of slots) {
      const existing = await prisma.timetable.findFirst({
        where: { classId, dayOfWeek: slot.dayOfWeek, period: slot.period }
      });

      if (existing) {
        await prisma.timetable.update({
          where: { id: existing.id },
          data: {
            subjectId: slot.isBreak ? null : slot.subjectId,
            startTime: slot.startTime,
            endTime: slot.endTime,
            classroom: slot.classroom,
            isBreak: slot.isBreak
          }
        });
      } else {
        await prisma.timetable.create({
          data: {
            classId,
            dayOfWeek: slot.dayOfWeek,
            period: slot.period,
            subjectId: slot.isBreak ? null : slot.subjectId,
            startTime: slot.startTime,
            endTime: slot.endTime,
            classroom: slot.classroom,
            isBreak: slot.isBreak
          }
        });
      }
    }
    revalidatePath("/dashboard/admin/timetable");
    return { success: true };
  } catch (error: unknown) {
    if (error instanceof Error) {
      return { error: error.message };
    }
    return { error: "Failed to bulk save timetable slots." };
  }
}
