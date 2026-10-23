"use server";

import { prisma } from "@/backend/db/prisma";
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

export async function bulkCreateTimetableSlotsAction(
  classId: string, 
  slots: Array<{ dayOfWeek: string; period: number; subjectId: string | null; startTime: string; endTime: string; classroom: string; isBreak: boolean }>
) {
  if (!classId) return { error: "Class ID is required" };
  if (!slots || slots.length === 0) return { error: "No slots to save." };

  try {
    // Deduplicate slots by dayOfWeek + period (prevents duplicate rows and ensures fast saving)
    const uniqueMap = new Map<string, typeof slots[0]>();
    for (const slot of slots) {
      if (!slot.dayOfWeek) continue;
      const normDay = slot.dayOfWeek.trim().toUpperCase();
      const period = Number(slot.period);
      if (isNaN(period) || period < 1 || period > 8) continue;

      const key = `${normDay}-${period}`;
      uniqueMap.set(key, {
        ...slot,
        dayOfWeek: normDay,
        period
      });
    }

    const deduplicatedSlots = Array.from(uniqueMap.values());
    if (deduplicatedSlots.length === 0) {
      return { error: "No valid timetable slots found to save." };
    }

    const daysToUpdate = Array.from(new Set(deduplicatedSlots.map(s => s.dayOfWeek)));

    // Perform atomic batch replacement in a single Prisma transaction (2 queries, < 200ms!)
    await prisma.$transaction(async (tx) => {
      // 1. Delete existing slots for these days for this class
      await tx.timetable.deleteMany({
        where: {
          classId,
          dayOfWeek: { in: daysToUpdate }
        }
      });

      // 2. Insert all deduplicated slots in ONE batch insert
      await tx.timetable.createMany({
        data: deduplicatedSlots.map(slot => ({
          classId,
          dayOfWeek: slot.dayOfWeek,
          period: slot.period,
          subjectId: slot.isBreak ? null : (slot.subjectId || null),
          startTime: slot.startTime || "08:00",
          endTime: slot.endTime || "08:45",
          classroom: slot.classroom || "",
          isBreak: Boolean(slot.isBreak)
        }))
      });
    });

    revalidatePath("/dashboard/admin/timetable");
    revalidatePath("/dashboard/parent/timetable");
    revalidatePath("/dashboard/teacher/timetable");
    return { success: true, count: deduplicatedSlots.length };
  } catch (error: unknown) {
    console.error("bulkCreateTimetableSlotsAction error:", error);
    if (error instanceof Error) {
      return { error: error.message };
    }
    return { error: "Failed to bulk save timetable slots." };
  }
}
