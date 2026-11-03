"use server";

import { prisma } from "@/backend/db/prisma";
import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { revalidatePath } from "next/cache";
import { calculateFreePeriodStaff } from "@/backend/lib/timetable/timetableCalculations";
import type { DayFreeStaffSummary } from "@/backend/lib/timetable/timetableTypes";

/**
 * Safe executor that retries on transient connection or transaction pool errors
 */
async function runWithPoolRetry<T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> {
  let lastErr: any;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastErr = err;
      const msg = err?.message || "";
      const isPoolOrTxError =
        msg.includes("Transaction not found") ||
        msg.includes("Transaction API error") ||
        msg.includes("closed transaction") ||
        msg.includes("disconnecting") ||
        msg.includes("Connection pool") ||
        msg.includes("Timed out fetching a new connection");
      if (isPoolOrTxError && attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

export async function createTimetableSlotAction(formData: FormData) {
  const session = await getServerSession(getAuthOptions());
  const userId = session?.user?.id || "admin";

  const classId = formData.get("classId") as string;
  const dayOfWeek = (formData.get("dayOfWeek") as string || "").toUpperCase();
  const period = parseInt(formData.get("period") as string, 10);
  const subjectId = (formData.get("subjectId") as string) || "";
  let teacherId = (formData.get("teacherId") as string) || null;
  if (teacherId === "" || teacherId === "null" || teacherId === "undefined") {
    teacherId = null;
  }
  const startTime = (formData.get("startTime") as string) || "08:00";
  const endTime = (formData.get("endTime") as string) || "08:45";
  const classroom = (formData.get("classroom") as string) || "";
  const isBreak = formData.get("isBreak") === "true";
  const slotType = (formData.get("slotType") as string) || (isBreak ? "BREAK" : "LESSON");
  const status = (formData.get("status") as string) || "PUBLISHED";

  const isNonTeachingOrFree =
    isBreak ||
    slotType === "BREAK" ||
    slotType === "LUNCH" ||
    slotType === "FREE" ||
    slotType === "ASSEMBLY";

  if (!classId || !dayOfWeek || isNaN(period) || (!isNonTeachingOrFree && !subjectId)) {
    return { error: "Missing required fields. Please specify class, day, period and subject." };
  }

  try {
    let finalSubjectId: string | null = isNonTeachingOrFree ? null : subjectId;

    if (finalSubjectId) {
      const sub = await prisma.subject.findUnique({
        where: { id: finalSubjectId },
        select: { id: true, teacherId: true, name: true, code: true, classId: true }
      });
      if (!sub) {
        return { error: "Subject not found in database." };
      }
      if (sub.classId !== classId) {
        let classSub = await prisma.subject.findFirst({
          where: { classId, name: { equals: sub.name, mode: "insensitive" } }
        });
        if (!classSub) {
          const safeCode = `${(sub.code || sub.name.slice(0, 3)).toUpperCase()}-${classId.slice(-4)}`;
          classSub = await prisma.subject.create({
            data: {
              name: sub.name,
              code: safeCode,
              classId,
              isActive: true,
              teacherId: sub.teacherId || null
            }
          });
        }
        finalSubjectId = classSub.id;
      }
    }

    // If teacherId is not passed, auto-populate from subject's assigned teacher
    if (!teacherId && finalSubjectId && !isNonTeachingOrFree) {
      const subject = await prisma.subject.findUnique({
        where: { id: finalSubjectId },
        select: { teacherId: true }
      });
      if (subject?.teacherId) {
        teacherId = subject.teacherId;
      }
    }

    const effectiveIsBreak = isBreak || slotType === "BREAK" || slotType === "LUNCH";
    const effectiveTeacherId = (effectiveIsBreak || slotType === "FREE") ? (teacherId || null) : teacherId;

    await runWithPoolRetry(async () => {
      const existing = await prisma.timetable.findFirst({
        where: { classId, dayOfWeek, period }
      });

      if (existing) {
        await prisma.timetable.update({
          where: { id: existing.id },
          data: {
            subjectId: effectiveIsBreak ? null : finalSubjectId,
            teacherId: effectiveIsBreak ? null : effectiveTeacherId,
            startTime,
            endTime,
            classroom,
            isBreak: effectiveIsBreak,
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
            subjectId: effectiveIsBreak ? null : finalSubjectId,
            teacherId: effectiveIsBreak ? null : effectiveTeacherId,
            startTime,
            endTime,
            classroom,
            isBreak: effectiveIsBreak,
            slotType,
            status
          }
        });
      }

      await prisma.timetableAudit.create({
        data: {
          action: existing ? "UPDATE" : "CREATE",
          classId,
          userId,
          details: `${dayOfWeek} Period ${period}: ${effectiveIsBreak ? 'Break' : slotType === 'FREE' ? 'Free Period' : subjectId}`
        }
      }).catch(err => console.warn("Audit log warning:", err));
    });

    revalidatePath("/dashboard/admin/timetable");
    revalidatePath("/dashboard/admin/timetable/substitution");
    revalidatePath("/dashboard/parent/timetable");
    revalidatePath("/dashboard/teacher/timetable");
    revalidatePath("/dashboard/teacher");
    revalidatePath("/dashboard/parent");
    revalidatePath("/dashboard/student");

    return { success: true };
  } catch (error: unknown) {
    console.error("createTimetableSlotAction error:", error);
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
    await runWithPoolRetry(async () => {
      const slot = await prisma.timetable.findUnique({ where: { id } });
      if (!slot) return;

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
    });

    revalidatePath("/dashboard/admin/timetable");
    revalidatePath("/dashboard/admin/timetable/substitution");
    revalidatePath("/dashboard/parent/timetable");
    revalidatePath("/dashboard/teacher/timetable");
    revalidatePath("/dashboard/teacher");
    revalidatePath("/dashboard/parent");
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
  publishStatus: "DRAFT" | "PUBLISHED" = "DRAFT"
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

    // 3. Perform atomic batch replacement with connection pool retry
    await runWithPoolRetry(async () => {
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
    revalidatePath("/dashboard/admin/timetable/substitution");
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

/**
 * PART 3: ONE button "Publish All".
 * Publishes every class timetable in a single action. Never blocked.
 */
export async function publishAllTimetablesAction() {
  const session = await getServerSession(getAuthOptions());
  const userId = session?.user?.id || "admin";

  if (!session || session.user.role !== "ADMIN") {
    return { success: false, error: "Unauthorized: Admin access required." };
  }

  try {
    const updated = await runWithPoolRetry(() =>
      prisma.timetable.updateMany({
        data: { status: "PUBLISHED" }
      })
    );

    const now = new Date();
    await prisma.timetableAudit.create({
      data: {
        action: "PUBLISH_ALL",
        userId,
        details: `Published all ${updated.count} timetable slots school-wide on ${now.toISOString()}`
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
      publishedAt: now.toISOString()
    };
  } catch (error: any) {
    console.error("publishAllTimetablesAction error:", error);
    return { success: false, error: error.message || "Failed to publish all timetables." };
  }
}

/**
 * Unpublish option: sets all slots back to DRAFT
 */
export async function unpublishAllTimetablesAction() {
  const session = await getServerSession(getAuthOptions());
  const userId = session?.user?.id || "admin";

  if (!session || session.user.role !== "ADMIN") {
    return { success: false, error: "Unauthorized: Admin access required." };
  }

  try {
    const updated = await runWithPoolRetry(() =>
      prisma.timetable.updateMany({
        data: { status: "DRAFT" }
      })
    );

    await prisma.timetableAudit.create({
      data: {
        action: "UNPUBLISH_ALL",
        userId,
        details: `Unpublished all ${updated.count} timetable slots school-wide.`
      }
    }).catch(err => console.warn("Audit log warning:", err));

    revalidatePath("/dashboard/admin/timetable");
    revalidatePath("/dashboard/parent/timetable");
    revalidatePath("/dashboard/teacher/timetable");
    revalidatePath("/dashboard/teacher");
    revalidatePath("/dashboard/parent");

    return { success: true, count: updated.count };
  } catch (error: any) {
    console.error("unpublishAllTimetablesAction error:", error);
    return { success: false, error: error.message || "Failed to unpublish timetables." };
  }
}

/**
 * Publishes a single class timetable without any blocking rules
 */
export async function publishTimetableAction(classId: string) {
  const session = await getServerSession(getAuthOptions());
  const userId = session?.user?.id || "admin";

  if (!classId) return { success: false, error: "Class ID is required" };

  try {
    const updated = await runWithPoolRetry(() =>
      prisma.timetable.updateMany({
        where: { classId },
        data: { status: "PUBLISHED" }
      })
    );

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
      count: updated.count
    };
  } catch (error: any) {
    console.error("publishTimetableAction error:", error);
    return { success: false, error: error.message || "Failed to publish timetable" };
  }
}

export async function clearClassTimetableAction(classId: string) {
  const session = await getServerSession(getAuthOptions());
  const userId = session?.user?.id || "admin";

  if (!classId) return { success: false, error: "Class ID required" };

  try {
    let deletedCount = 0;
    await runWithPoolRetry(async () => {
      const deleted = await prisma.timetable.deleteMany({
        where: { classId }
      });
      deletedCount = deleted.count;

      await prisma.timetableAudit.create({
        data: {
          action: "DELETE",
          classId,
          userId,
          details: `Cleared all ${deleted.count} timetable slots`
        }
      }).catch(err => console.warn("Audit log warning:", err));
    });

    revalidatePath("/dashboard/admin/timetable");
    revalidatePath("/dashboard/parent/timetable");
    revalidatePath("/dashboard/teacher/timetable");

    return { success: true, count: deletedCount };
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to clear timetable" };
  }
}

/**
 * Copies an entire day's slots to target days for a class
 */
export async function copyDaySlotsAction(classId: string, sourceDay: string, targetDays: string[]) {
  const session = await getServerSession(getAuthOptions());
  if (!session || session.user.role !== "ADMIN") {
    return { success: false, error: "Unauthorized." };
  }

  try {
    const sourceSlots = await prisma.timetable.findMany({
      where: { classId, dayOfWeek: sourceDay }
    });

    if (sourceSlots.length === 0) {
      return { success: false, error: `No slots found on ${sourceDay} to copy.` };
    }

    // Wrap sequential operations in connection retry wrapper
    await runWithPoolRetry(async () => {
      for (const tDay of targetDays) {
        if (tDay === sourceDay) continue;

        // Delete existing slots on the target day first
        await prisma.timetable.deleteMany({
          where: { classId, dayOfWeek: tDay }
        });

        // Insert copied slots
        await prisma.timetable.createMany({
          data: sourceSlots.map(s => ({
            classId,
            dayOfWeek: tDay,
            period: s.period,
            subjectId: s.subjectId,
            teacherId: s.teacherId,
            startTime: s.startTime,
            endTime: s.endTime,
            classroom: s.classroom,
            isBreak: s.isBreak,
            slotType: s.slotType,
            status: s.status
          }))
        });
      }
    });

    revalidatePath("/dashboard/admin/timetable");
    revalidatePath("/dashboard/parent/timetable");
    revalidatePath("/dashboard/teacher/timetable");
    return { success: true, count: sourceSlots.length * targetDays.length };
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to copy day schedule." };
  }
}

/**
 * Real-time calculation action for Free Period Staff on a target day of the week
 */
export async function getFreePeriodStaffAction(
  dayOfWeek: string,
  targetDateStr?: string
): Promise<{ success: boolean; data?: DayFreeStaffSummary; error?: string }> {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session || (session.user.role !== "ADMIN" && session.user.role !== "TEACHER")) {
      return { success: false, error: "Unauthorized" };
    }

    const normDay = (dayOfWeek || "MONDAY").trim().toUpperCase();

    // 1. Fetch period slots
    const periodSlots = await prisma.periodSlot.findMany({
      where: { classId: null },
      orderBy: { order: "asc" }
    });

    // 2. Fetch all school timetable slots for this day
    const allSchoolSlots = await prisma.timetable.findMany({
      where: { dayOfWeek: normDay },
      include: {
        subject: true,
        teacher: { include: { user: true } },
        class: { select: { id: true, name: true, section: true } }
      }
    });

    // 3. Fetch active teachers
    const teachers = await prisma.teacher.findMany({
      where: { isActive: true },
      include: {
        user: true,
        subjects: { select: { name: true } }
      },
      orderBy: { user: { name: "asc" } }
    });

    // 4. Fetch classes
    const classes = await prisma.class.findMany({
      where: { isActive: true },
      select: { id: true, name: true, section: true }
    });

    // 5. If date is provided, check absences
    let absencesToday: Array<{ teacherId: string; fullDay: boolean; periodNumbers?: number[]; reason?: string }> = [];
    if (targetDateStr) {
      const d = new Date(targetDateStr);
      d.setUTCHours(0, 0, 0, 0);
      const absRecords = await prisma.teacherAbsence.findMany({
        where: { date: d, status: "ACTIVE" }
      });
      absencesToday = absRecords.map(a => ({
        teacherId: a.teacherId,
        fullDay: a.fullDay,
        periodNumbers: a.periodNumbers ? a.periodNumbers.split(",").map(Number).filter(n => !isNaN(n)) : [],
        reason: a.reason || undefined
      }));
    }

    const summary = calculateFreePeriodStaff({
      dayOfWeek: normDay,
      periodSlots: periodSlots.map(p => ({
        order: p.order,
        label: p.label,
        startTime: p.startTime,
        endTime: p.endTime,
        type: p.type as any
      })),
      allSchoolSlots,
      allTeachers: teachers.map(t => ({
        id: t.id,
        name: t.user.name || "Teacher",
        email: t.user.email || undefined,
        maxPeriodsPerDay: t.maxPeriodsPerDay,
        subjects: t.subjects.map(s => s.name)
      })),
      classes,
      absencesToday
    });

    return { success: true, data: summary };
  } catch (error: any) {
    console.error("getFreePeriodStaffAction error:", error);
    return { success: false, error: error.message || "Failed to calculate free period staff." };
  }
}
