"use server";

import { prisma } from "@/backend/db/prisma";
import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { revalidatePath } from "next/cache";
import { analyzeTimetableConflicts } from "@/backend/lib/timetable/timetableConflictEngine";
import { solveTimetableSlots } from "@/backend/lib/timetable/timetableSolver";
import { calculateTeacherLoads, calculateSubjectSummaries } from "@/backend/lib/timetable/timetableCalculations";
import type { TimetableSlotEntry, PeriodSlotData } from "@/backend/lib/timetable/timetableTypes";

export async function createTimetableSlotAction(formData: FormData) {
  const session = await getServerSession(getAuthOptions());
  const userId = session?.user?.id || "admin";

  const classId = formData.get("classId") as string;
  const dayOfWeek = (formData.get("dayOfWeek") as string || "").toUpperCase();
  const period = parseInt(formData.get("period") as string, 10);
  const subjectId = formData.get("subjectId") as string;
  let teacherId = formData.get("teacherId") as string | null;
  const startTime = formData.get("startTime") as string;
  const endTime = formData.get("endTime") as string;
  const classroom = formData.get("classroom") as string;
  const isBreak = formData.get("isBreak") === "true";
  const slotType = (formData.get("slotType") as string) || (isBreak ? "BREAK" : "LESSON");
  const status = (formData.get("status") as string) || "PUBLISHED";

  if (!classId || !dayOfWeek || isNaN(period) || (!isBreak && !subjectId)) {
    return { error: "Missing required fields." };
  }

  try {
    // If teacherId is not passed, auto-populate from subject's assigned teacher
    if (!teacherId && subjectId && !isBreak) {
      const subject = await prisma.subject.findUnique({
        where: { id: subjectId },
        select: { teacherId: true }
      });
      if (subject?.teacherId) {
        teacherId = subject.teacherId;
      }
    }

    const existing = await prisma.timetable.findFirst({
      where: { classId, dayOfWeek, period }
    });

    if (existing) {
      await prisma.timetable.update({
        where: { id: existing.id },
        data: {
          subjectId: isBreak ? null : subjectId,
          teacherId: isBreak ? null : (teacherId || null),
          startTime,
          endTime,
          classroom,
          isBreak,
          slotType,
          status
        }
      });
    } else {
      await prisma.timetable.create({
        data: {
          classId,
          dayOfWeek,
          period,
          subjectId: isBreak ? null : subjectId,
          teacherId: isBreak ? null : (teacherId || null),
          startTime,
          endTime,
          classroom,
          isBreak,
          slotType,
          status
        }
      });
    }

    // Log audit
    await prisma.timetableAudit.create({
      data: {
        action: existing ? "UPDATE" : "CREATE",
        classId,
        userId,
        details: `${dayOfWeek} Period ${period}: ${isBreak ? 'Break' : subjectId}`
      }
    }).catch(err => console.warn("Audit log warning:", err));

    revalidatePath("/dashboard/admin/timetable");
    revalidatePath("/dashboard/parent/timetable");
    revalidatePath("/dashboard/teacher/timetable");
    revalidatePath("/dashboard/teacher");
    revalidatePath("/dashboard/parent");

    return { success: true };
  } catch (error: unknown) {
    if (error instanceof Error) {
      return { error: error.message };
    }
    return { error: "Failed to save timetable slot." };
  }
}

export async function deleteTimetableSlotAction(id: string) {
  const session = await getServerSession(getAuthOptions());
  const userId = session?.user?.id || "admin";

  try {
    const slot = await prisma.timetable.findUnique({ where: { id } });
    if (!slot) return { error: "Slot not found" };

    await prisma.timetable.delete({
      where: { id }
    });

    await prisma.timetableAudit.create({
      data: {
        action: "DELETE",
        classId: slot.classId,
        userId,
        details: `Deleted ${slot.dayOfWeek} Period ${slot.period}`
      }
    }).catch(err => console.warn("Audit log warning:", err));

    revalidatePath("/dashboard/admin/timetable");
    revalidatePath("/dashboard/parent/timetable");
    revalidatePath("/dashboard/teacher/timetable");
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
  slots: Array<{
    dayOfWeek: string;
    period: number;
    subjectId: string | null;
    teacherId?: string | null;
    startTime: string;
    endTime: string;
    classroom?: string;
    isBreak: boolean;
    slotType?: string;
    status?: string;
  }>,
  publishStatus: "DRAFT" | "PUBLISHED" = "PUBLISHED"
) {
  const session = await getServerSession(getAuthOptions());
  const userId = session?.user?.id || "admin";

  if (!classId) return { error: "Class ID is required" };
  if (!slots || slots.length === 0) return { error: "No slots to save." };

  try {
    // 1. Fetch class subjects to auto-fill teacherId if not provided
    const classSubjects = await prisma.subject.findMany({
      where: { classId },
      select: { id: true, teacherId: true }
    });
    const subjectTeacherMap = new Map<string, string | null>();
    classSubjects.forEach(s => subjectTeacherMap.set(s.id, s.teacherId));

    // 2. Deduplicate slots by dayOfWeek + period
    const uniqueMap = new Map<string, typeof slots[0]>();
    for (const slot of slots) {
      if (!slot.dayOfWeek) continue;
      const normDay = slot.dayOfWeek.trim().toUpperCase();
      const period = Number(slot.period);
      if (isNaN(period) || period < 1 || period > 10) continue;

      const key = `${normDay}-${period}`;
      const isBreak = Boolean(slot.isBreak);
      const subId = isBreak ? null : (slot.subjectId || null);

      // Auto-assign teacherId if missing
      let teacherId = slot.teacherId || null;
      if (!teacherId && subId && subjectTeacherMap.has(subId)) {
        teacherId = subjectTeacherMap.get(subId) || null;
      }

      uniqueMap.set(key, {
        ...slot,
        dayOfWeek: normDay,
        period,
        subjectId: subId,
        teacherId: isBreak ? null : teacherId,
        classroom: slot.classroom || "",
        slotType: slot.slotType || (isBreak ? "BREAK" : "LESSON"),
        status: slot.status || publishStatus
      });
    }

    const deduplicatedSlots = Array.from(uniqueMap.values());
    if (deduplicatedSlots.length === 0) {
      return { error: "No valid timetable slots found to save." };
    }

    const daysToUpdate = Array.from(new Set(deduplicatedSlots.map(s => s.dayOfWeek)));

    // 3. Perform atomic batch replacement
    await prisma.$transaction(async (tx) => {
      await tx.timetable.deleteMany({
        where: {
          classId,
          dayOfWeek: { in: daysToUpdate }
        }
      });

      await tx.timetable.createMany({
        data: deduplicatedSlots.map(slot => ({
          classId,
          dayOfWeek: slot.dayOfWeek,
          period: slot.period,
          subjectId: slot.subjectId,
          teacherId: slot.teacherId || null,
          startTime: slot.startTime || "08:00",
          endTime: slot.endTime || "08:45",
          classroom: slot.classroom || "",
          isBreak: Boolean(slot.isBreak),
          slotType: slot.slotType || (slot.isBreak ? "BREAK" : "LESSON"),
          status: slot.status || publishStatus
        }))
      });
    });

    // 4. Log audit entry
    await prisma.timetableAudit.create({
      data: {
        action: "IMPORT",
        classId,
        userId,
        details: `Saved ${deduplicatedSlots.length} slots for ${daysToUpdate.join(", ")} with status ${publishStatus}`
      }
    }).catch(err => console.warn("Audit log warning:", err));

    revalidatePath("/dashboard/admin/timetable");
    revalidatePath("/dashboard/parent/timetable");
    revalidatePath("/dashboard/teacher/timetable");
    revalidatePath("/dashboard/teacher");
    revalidatePath("/dashboard/parent");

    return { success: true, count: deduplicatedSlots.length };
  } catch (error: unknown) {
    console.error("bulkCreateTimetableSlotsAction error:", error);
    if (error instanceof Error) {
      return { error: error.message };
    }
    return { error: "Failed to bulk save timetable slots." };
  }
}

export async function publishTimetableAction(classId: string) {
  const session = await getServerSession(getAuthOptions());
  const userId = session?.user?.id || "admin";

  if (!classId) return { success: false, error: "Class ID is required" };

  try {
    // 1. Fetch period slots
    let periodSlots = await prisma.periodSlot.findMany({
      where: { OR: [{ classId }, { classId: null }] },
      orderBy: { order: "asc" }
    });
    const periodSlotsData: PeriodSlotData[] = periodSlots.map(p => ({
      order: p.order,
      label: p.label,
      startTime: p.startTime,
      endTime: p.endTime,
      type: p.type as any
    }));

    // 2. Fetch all school slots to run comprehensive conflict checks
    const allSlots = await prisma.timetable.findMany({
      include: {
        subject: true,
        teacher: { include: { user: true } },
        class: true
      }
    });

    const mappedSlots: TimetableSlotEntry[] = allSlots.map(s => ({
      id: s.id,
      classId: s.classId,
      dayOfWeek: s.dayOfWeek,
      period: s.period,
      subjectId: s.subjectId,
      subjectName: s.subject?.name,
      subjectCode: s.subject?.code,
      teacherId: s.teacherId || s.subject?.teacherId,
      teacherName: s.teacher?.user?.name,
      classroom: s.classroom,
      startTime: s.startTime,
      endTime: s.endTime,
      isBreak: s.isBreak,
      slotType: (s.slotType as any) || (s.isBreak ? "BREAK" : "LESSON"),
      status: s.status as any
    }));

    // 3. Fetch teachers and subject requirements
    const allTeachers = await prisma.teacher.findMany({
      include: { user: true }
    });
    const classSubjects = await prisma.subject.findMany({
      where: { classId, isActive: true },
      include: { teacher: { include: { user: true } } }
    });

    const teacherLoads = calculateTeacherLoads({
      allSchoolSlots: mappedSlots,
      teachers: allTeachers.map(t => ({
        id: t.id,
        name: t.user.name || "Teacher",
        maxPeriodsPerDay: t.maxPeriodsPerDay || 6,
        maxPeriodsPerWeek: t.maxPeriodsPerWeek || 30
      }))
    });

    const subjectSummaries = calculateSubjectSummaries({
      classSubjects: classSubjects.map(s => ({
        id: s.id,
        name: s.name,
        code: s.code,
        requiredPeriodsPerWeek: s.requiredPeriodsPerWeek || 5,
        teacherId: s.teacherId,
        teacherName: s.teacher?.user?.name
      })),
      classSlots: mappedSlots.filter(s => s.classId === classId)
    });

    // 4. Run deterministic conflict engine
    const analysis = analyzeTimetableConflicts({
      targetClassId: classId,
      allSchoolSlots: mappedSlots,
      periodSlots: periodSlotsData,
      teacherLoads,
      subjectSummaries
    });

    if (!analysis.canPublish) {
      return {
        success: false,
        error: `Cannot publish timetable: ${analysis.publishBlockReasons.join(". ")}`,
        hardConflicts: analysis.hardConflicts,
        softWarnings: analysis.softWarnings
      };
    }

    // 5. Update all slots for this class to PUBLISHED
    const updated = await prisma.timetable.updateMany({
      where: { classId },
      data: { status: "PUBLISHED" }
    });

    // 6. Log audit entry
    await prisma.timetableAudit.create({
      data: {
        action: "PUBLISH",
        classId,
        userId,
        details: `Published ${updated.count} slots for class ${classId}`
      }
    }).catch(err => console.warn("Audit log warning:", err));

    revalidatePath("/dashboard/admin/timetable");
    revalidatePath("/dashboard/parent/timetable");
    revalidatePath("/dashboard/teacher/timetable");
    revalidatePath("/dashboard/teacher");
    revalidatePath("/dashboard/parent");

    return {
      success: true,
      count: updated.count,
      warnings: analysis.softWarnings
    };
  } catch (error: any) {
    console.error("publishTimetableAction error:", error);
    return { success: false, error: error.message || "Failed to publish timetable" };
  }
}

export async function suggestFillTimetableAction(classId: string) {
  if (!classId) return { success: false, message: "Class ID required" };

  try {
    const classSubjects = await prisma.subject.findMany({
      where: { classId, isActive: true },
      include: { teacher: { include: { user: true } } }
    });

    const existingSlots = await prisma.timetable.findMany({
      where: { classId },
      include: { subject: true, teacher: { include: { user: true } } }
    });

    const allOtherSlots = await prisma.timetable.findMany({
      where: { classId: { not: classId } },
      include: { subject: true, teacher: { include: { user: true } } }
    });

    const periodSlots = await prisma.periodSlot.findMany({
      where: { OR: [{ classId }, { classId: null }] },
      orderBy: { order: "asc" }
    });

    const mappedClassSlots: TimetableSlotEntry[] = existingSlots.map(s => ({
      id: s.id,
      classId: s.classId,
      dayOfWeek: s.dayOfWeek,
      period: s.period,
      subjectId: s.subjectId,
      subjectName: s.subject?.name,
      teacherId: s.teacherId || s.subject?.teacherId,
      isBreak: s.isBreak,
      slotType: (s.slotType as any) || (s.isBreak ? "BREAK" : "LESSON")
    }));

    const mappedOtherSlots: TimetableSlotEntry[] = allOtherSlots.map(s => ({
      id: s.id,
      classId: s.classId,
      dayOfWeek: s.dayOfWeek,
      period: s.period,
      subjectId: s.subjectId,
      subjectName: s.subject?.name,
      teacherId: s.teacherId || s.subject?.teacherId,
      isBreak: s.isBreak,
      slotType: (s.slotType as any) || (s.isBreak ? "BREAK" : "LESSON")
    }));

    const result = solveTimetableSlots({
      classId,
      classSubjects: classSubjects.map(s => ({
        id: s.id,
        name: s.name,
        code: s.code,
        teacherId: s.teacherId,
        teacherName: s.teacher?.user?.name,
        requiredPeriodsPerWeek: s.requiredPeriodsPerWeek || 5
      })),
      existingClassSlots: mappedClassSlots,
      allOtherSchoolSlots: mappedOtherSlots,
      periodSlots: periodSlots.map(p => ({
        order: p.order,
        label: p.label,
        startTime: p.startTime,
        endTime: p.endTime,
        type: p.type as any
      }))
    });

    return {
      success: result.success,
      suggestedSlots: result.suggestedSlots,
      unfilledDeficits: result.unfilledDeficits,
      message: result.message
    };
  } catch (error: any) {
    console.error("suggestFillTimetableAction error:", error);
    return { success: false, message: error.message || "Failed to generate suggestions" };
  }
}

export async function clearClassTimetableAction(classId: string) {
  const session = await getServerSession(getAuthOptions());
  const userId = session?.user?.id || "admin";

  if (!classId) return { success: false, error: "Class ID required" };

  try {
    const deleted = await prisma.timetable.deleteMany({
      where: { classId }
    });

    await prisma.timetableAudit.create({
      data: {
        action: "DELETE",
        classId,
        userId,
        details: `Cleared all ${deleted.count} timetable slots`
      }
    }).catch(err => console.warn("Audit log warning:", err));

    revalidatePath("/dashboard/admin/timetable");
    revalidatePath("/dashboard/parent/timetable");
    revalidatePath("/dashboard/teacher/timetable");

    return { success: true, count: deleted.count };
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to clear timetable" };
  }
}
