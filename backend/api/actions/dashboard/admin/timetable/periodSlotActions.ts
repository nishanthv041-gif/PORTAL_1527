"use server";

import { prisma } from "@/backend/db/prisma";
import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { revalidatePath } from "next/cache";
import { validatePeriodSlots, generateQuickPeriodSlots } from "@/backend/lib/timetable/timetableCalculations";
import type { PeriodSlotData } from "@/backend/lib/timetable/timetableTypes";

const DEFAULT_SLOTS_DATA: PeriodSlotData[] = [
  { order: 1, label: "Period 1", startTime: "08:00", endTime: "08:45", type: "LESSON" },
  { order: 2, label: "Period 2", startTime: "08:45", endTime: "09:30", type: "LESSON" },
  { order: 3, label: "Morning Break", startTime: "09:30", endTime: "09:45", type: "BREAK" },
  { order: 4, label: "Period 3", startTime: "09:45", endTime: "10:30", type: "LESSON" },
  { order: 5, label: "Period 4", startTime: "10:30", endTime: "11:15", type: "LESSON" },
  { order: 6, label: "Period 5", startTime: "11:15", endTime: "12:00", type: "LESSON" },
  { order: 7, label: "Lunch Break", startTime: "12:00", endTime: "12:45", type: "LUNCH" },
  { order: 8, label: "Period 6", startTime: "12:45", endTime: "13:30", type: "LESSON" },
  { order: 9, label: "Period 7", startTime: "13:30", endTime: "14:15", type: "LESSON" },
  { order: 10, label: "Period 8", startTime: "14:15", endTime: "15:00", type: "LESSON" }
];

export async function getPeriodSlotsAction(classId?: string): Promise<{ success: boolean; slots: PeriodSlotData[]; error?: string }> {
  try {
    let slots = await prisma.periodSlot.findMany({
      where: classId ? { classId } : { classId: null },
      orderBy: { order: "asc" }
    });

    // If specific class has no override, fall back to school-wide slots
    if (slots.length === 0 && classId) {
      slots = await prisma.periodSlot.findMany({
        where: { classId: null },
        orderBy: { order: "asc" }
      });
    }

    // If school has no slots initialized yet, seed standard defaults
    if (slots.length === 0) {
      await prisma.periodSlot.createMany({
        data: DEFAULT_SLOTS_DATA.map(s => ({
          classId: null,
          order: s.order,
          label: s.label,
          startTime: s.startTime,
          endTime: s.endTime,
          type: s.type
        }))
      });

      slots = await prisma.periodSlot.findMany({
        where: { classId: null },
        orderBy: { order: "asc" }
      });
    }

    return {
      success: true,
      slots: slots.map(s => ({
        id: s.id,
        classId: s.classId,
        order: s.order,
        label: s.label,
        startTime: s.startTime,
        endTime: s.endTime,
        type: s.type as PeriodSlotData["type"]
      }))
    };
  } catch (error: any) {
    console.error("Failed to fetch period slots:", error);
    return { success: false, slots: DEFAULT_SLOTS_DATA, error: error.message };
  }
}

export async function savePeriodSlotsAction(
  slots: PeriodSlotData[],
  classId?: string | null
): Promise<{ success: boolean; error?: string; slots?: PeriodSlotData[] }> {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session || session.user.role !== "ADMIN") {
      return { success: false, error: "Unauthorized: Admin access required." };
    }

    // 1. Validate slots
    const validation = validatePeriodSlots(slots);
    if (!validation.valid) {
      return { success: false, error: validation.errors.join(" ") };
    }

    // 2. Replace period slots for this scope using sequential non-interactive
    //    operations to avoid Neon connection-pooler transaction timeouts.
    //    Interactive $transaction holds the TCP connection open too long on
    //    serverless Neon/PgBouncer, causing "Transaction not found" errors.
    const targetClassId = classId || null;

    // Delete old slots then recreate in one batch
    await prisma.periodSlot.deleteMany({
      where: targetClassId ? { classId: targetClassId } : { classId: null }
    });

    await prisma.periodSlot.createMany({
      data: slots.map((s, idx) => ({
        classId: targetClassId,
        order: idx + 1,
        label: s.label || `Period ${idx + 1}`,
        startTime: s.startTime,
        endTime: s.endTime,
        type: s.type || "LESSON"
      }))
    });

    // 3. Update existing timetable slot times to match the new period configuration.
    // Execute sequentially so we don't saturate Neon/PgBouncer connection pooler
    // which caused "Transaction not found" errors when executed via Promise.all.
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      const isNonTeaching = slot.type === "BREAK" || slot.type === "LUNCH";
      try {
        await prisma.timetable.updateMany({
          where: {
            period: i + 1,
            ...(targetClassId ? { classId: targetClassId } : {})
          },
          data: {
            startTime: slot.startTime,
            endTime: slot.endTime,
            slotType: slot.type,
            isBreak: isNonTeaching
          }
        });
      } catch (err: any) {
        console.warn(`Warning updating slot period ${i + 1}:`, err?.message);
        // Retry once on transient transaction error
        try {
          await new Promise((r) => setTimeout(r, 200));
          await prisma.timetable.updateMany({
            where: {
              period: i + 1,
              ...(targetClassId ? { classId: targetClassId } : {})
            },
            data: {
              startTime: slot.startTime,
              endTime: slot.endTime,
              slotType: slot.type,
              isBreak: isNonTeaching
            }
          });
        } catch (retryErr) {
          console.warn(`Retry failed for slot period ${i + 1}:`, retryErr);
        }
      }
    }

    revalidatePath("/dashboard/admin/timetable");
    revalidatePath("/dashboard/teacher/timetable");
    revalidatePath("/dashboard/parent/timetable");
    revalidatePath("/dashboard/teacher");
    revalidatePath("/dashboard/parent");

    return { success: true };
  } catch (error: any) {
    console.error("Failed to save period slots:", error);
    return { success: false, error: error.message || "Failed to update period slots." };
  }
}

export async function quickGenerateSlotsAction(config: {
  startTime: string;
  lessonDurationMinutes: number;
  totalPeriods: number;
  breakAfterPeriod?: number;
  breakDurationMinutes?: number;
  lunchAfterPeriod?: number;
  lunchDurationMinutes?: number;
  classId?: string | null;
}): Promise<{ success: boolean; slots?: PeriodSlotData[]; error?: string }> {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session || session.user.role !== "ADMIN") {
      return { success: false, error: "Unauthorized: Admin access required." };
    }

    const generated = generateQuickPeriodSlots(config);
    const saveResult = await savePeriodSlotsAction(generated, config.classId);
    if (!saveResult.success) {
      return { success: false, error: saveResult.error };
    }

    return { success: true, slots: generated };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
