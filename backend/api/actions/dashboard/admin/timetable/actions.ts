"use server";

import { prisma } from "@/backend/db/prisma";
import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { revalidatePath } from "next/cache";

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
  const status = (formData.get("status") as string) || "DRAFT";

  if (!classId || !dayOfWeek || isNaN(period) || (!isBreak && !subjectId)) {
    return { error: "Missing required fields." };
  }

  try {
    let finalSubjectId: string | null = isBreak ? null : subjectId;

    if (finalSubjectId) {
      if (finalSubjectId.startsWith("fallback-")) {
        const subName = finalSubjectId.replace("fallback-", "").toUpperCase();
        let sub = await prisma.subject.findFirst({
          where: { classId, name: { equals: subName, mode: "insensitive" } }
        });
        if (!sub) {
          sub = await prisma.subject.create({
            data: {
              name: subName,
              code: subName.slice(0, 3) + "001",
              classId,
              isActive: true
            }
          });
        }
        finalSubjectId = sub.id;
      } else {
        const sub = await prisma.subject.findUnique({
          where: { id: finalSubjectId },
          select: { id: true, teacherId: true, name: true, code: true, classId: true }
        });
        if (!sub) {
          const fallbackSub = await prisma.subject.findFirst({ where: { classId } });
          finalSubjectId = fallbackSub ? fallbackSub.id : null;
        } else if (sub.classId !== classId) {
          let classSub = await prisma.subject.findFirst({
            where: { classId, name: { equals: sub.name, mode: "insensitive" } }
          });
          if (!classSub) {
            classSub = await prisma.subject.create({
              data: {
                name: sub.name,
                code: sub.code || (sub.name.slice(0, 3) + "001"),
                classId,
                isActive: true
              }
            });
          }
          finalSubjectId = classSub.id;
        }
      }
    }

    // If teacherId is not passed, auto-populate from subject's assigned teacher
    if (!teacherId && finalSubjectId && !isBreak) {
      const subject = await prisma.subject.findUnique({
        where: { id: finalSubjectId },
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
          subjectId: isBreak ? null : finalSubjectId,
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
          subjectId: isBreak ? null : finalSubjectId,
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
    const updated = await prisma.timetable.updateMany({
      data: { status: "PUBLISHED" }
    });

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
    const updated = await prisma.timetable.updateMany({
      data: { status: "DRAFT" }
    });

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
    const updated = await prisma.timetable.updateMany({
      where: { classId },
      data: { status: "PUBLISHED" }
    });

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

    // Use sequential non-interactive operations to avoid Neon connection-pooler
    // transaction timeouts (interactive $transaction holds the connection too long
    // on serverless / Neon PgBouncer).
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

    revalidatePath("/dashboard/admin/timetable");
    return { success: true, count: sourceSlots.length * targetDays.length };
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to copy day schedule." };
  }
}
