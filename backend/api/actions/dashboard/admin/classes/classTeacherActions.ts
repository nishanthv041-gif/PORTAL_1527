"use server";

import { prisma } from "@/backend/db/prisma";
import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { revalidatePath } from "next/cache";

export interface SetClassTeacherOptions {
  confirmReplace?: boolean;
}

export interface SetClassTeacherResult {
  success?: boolean;
  needsConfirmation?: boolean;
  currentTeacher?: { id: string; name: string };
  error?: string;
  class?: {
    id: string;
    name: string;
    section: string;
    classTeacherId: string | null;
    teacherName?: string | null;
  };
}

/**
 * Canonical Single Source of Truth Mutator for Class Teacher assignments.
 * Used by:
 * 1. Admin > Classes & Sections
 * 2. Teacher create/edit forms
 * 3. Teacher bulk import
 * 4. Admin quick reconciliation panel
 * 5. Teacher request approval workflow
 */
export async function setClassTeacher(
  sectionId: string,
  teacherId: string | null,
  options?: SetClassTeacherOptions
): Promise<SetClassTeacherResult> {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session || (session.user.role !== "ADMIN" && session.user.role !== "TEACHER")) {
      return { error: "Unauthorized: Administrator or authorized user session required." };
    }

    if (!sectionId) {
      return { error: "Class/Section ID is required." };
    }

    // 1. Fetch current class record
    const targetClass = await prisma.class.findUnique({
      where: { id: sectionId },
      include: {
        classTeacher: {
          include: {
            user: { select: { id: true, name: true, email: true } }
          }
        },
        teacher: {
          include: {
            user: { select: { id: true, name: true, email: true } }
          }
        }
      }
    });

    if (!targetClass) {
      return { error: "Target class not found." };
    }

    const currentAssignedId = targetClass.classTeacherId || targetClass.teacherId;
    const currentAssignedName = targetClass.classTeacher?.user?.name || targetClass.teacher?.user?.name || "Current Teacher";

    // 2. Check for replacement conflict if teacher is changing
    if (
      currentAssignedId &&
      teacherId &&
      currentAssignedId !== teacherId &&
      !options?.confirmReplace
    ) {
      return {
        needsConfirmation: true,
        currentTeacher: {
          id: currentAssignedId,
          name: currentAssignedName
        },
        error: `Class ${targetClass.name} - ${targetClass.section} already has a designated Class Teacher: ${currentAssignedName}. Please confirm replacing.`
      };
    }

    // 3. Verify new teacher if provided
    let newTeacherName: string | null = null;
    if (teacherId) {
      const teacher = await prisma.teacher.findUnique({
        where: { id: teacherId },
        include: { user: { select: { name: true, email: true } } }
      });
      if (!teacher) {
        return { error: "Selected teacher does not exist." };
      }
      newTeacherName = teacher.user.name;
    }

    // 4. Update the Class record: canonical classTeacherId + mirrored teacherId for backwards compatibility
    const updatedClass = await prisma.$transaction(async (tx) => {
      const cls = await tx.class.update({
        where: { id: sectionId },
        data: {
          classTeacherId: teacherId,
          teacherId: teacherId // Mirror for legacy queries
        },
        select: {
          id: true,
          name: true,
          section: true,
          classTeacherId: true
        }
      });

      // Write Audit Log
      await tx.auditLog.create({
        data: {
          userId: session.user.id,
          action: "SET_CLASS_TEACHER",
          targetModel: "Class",
          targetId: sectionId,
          details: teacherId
            ? `Assigned teacher ${newTeacherName} (${teacherId}) as Class Teacher for ${cls.name} - ${cls.section}`
            : `Removed Class Teacher assignment for ${cls.name} - ${cls.section}`
        }
      });

      return cls;
    });

    // 5. Invalidate relevant caches
    revalidatePath("/dashboard/admin/classes");
    revalidatePath("/dashboard/admin/classes/reconciliation");
    revalidatePath("/dashboard/admin/teachers");
    revalidatePath("/dashboard/admin/birthdays/missing");
    revalidatePath("/dashboard/admin/settings/birthdays");
    revalidatePath("/dashboard/teacher");
    revalidatePath("/dashboard/teacher/classes");
    revalidatePath("/dashboard/teacher/attendance");
    revalidatePath("/dashboard/teacher/birthdays");
    revalidatePath("/dashboard/teacher/birthdays/missing");

    return {
      success: true,
      class: {
        id: updatedClass.id,
        name: updatedClass.name,
        section: updatedClass.section,
        classTeacherId: updatedClass.classTeacherId,
        teacherName: newTeacherName
      }
    };
  } catch (err: unknown) {
    console.error("setClassTeacher error:", err);
    return { error: err instanceof Error ? err.message : "Failed to update Class Teacher." };
  }
}

export interface ClassReconciliationItem {
  id: string;
  name: string;
  section: string;
  displayName: string;
  studentCount: number;
  sourceATeacherId: string | null;
  sourceATeacherName: string | null;
  sourceBTeacherId: string | null;
  sourceBTeacherName: string | null;
  status: "MATCH" | "A_ONLY" | "B_ONLY" | "CONFLICT" | "BOTH_EMPTY";
  suggestedAction: "CONFIRM_A" | "ASSIGN_TEACHER" | "RESOLVE_CONFLICT" | "IN_SYNC";
}

/**
 * Returns comprehensive reconciliation data across all classes for Admin inspection.
 */
export async function getClassTeacherReconciliationData(): Promise<{
  classes: ClassReconciliationItem[];
  unassignedCount: number;
  discrepancyCount: number;
  matchedCount: number;
  availableTeachers: Array<{ id: string; name: string; email: string }>;
}> {
  const session = await getServerSession(getAuthOptions());
  if (!session || session.user.role !== "ADMIN") {
    throw new Error("Unauthorized: Admin access required.");
  }

  const [allClasses, allTeachers] = await Promise.all([
    prisma.class.findMany({
      where: { isActive: true },
      include: {
        teacher: { include: { user: { select: { id: true, name: true, email: true } } } },
        classTeacher: { include: { user: { select: { id: true, name: true, email: true } } } },
        _count: { select: { students: { where: { isActive: true } } } }
      },
      orderBy: [{ name: "asc" }, { section: "asc" }]
    }),
    prisma.teacher.findMany({
      where: { isActive: true },
      include: {
        user: { select: { id: true, name: true, email: true } }
      },
      orderBy: { user: { name: "asc" } }
    })
  ]);

  let unassignedCount = 0;
  let discrepancyCount = 0;
  let matchedCount = 0;

  const items: ClassReconciliationItem[] = allClasses.map((cls) => {
    const aId = cls.teacherId;
    const aName = cls.teacher?.user?.name || null;
    const bId = cls.classTeacherId;
    const bName = cls.classTeacher?.user?.name || null;

    let status: ClassReconciliationItem["status"] = "BOTH_EMPTY";
    let suggestedAction: ClassReconciliationItem["suggestedAction"] = "ASSIGN_TEACHER";

    if (aId && bId && aId === bId) {
      status = "MATCH";
      suggestedAction = "IN_SYNC";
      matchedCount++;
    } else if (aId && !bId) {
      status = "A_ONLY";
      suggestedAction = "CONFIRM_A";
      discrepancyCount++;
    } else if (!aId && bId) {
      status = "B_ONLY";
      suggestedAction = "IN_SYNC";
      matchedCount++;
    } else if (aId && bId && aId !== bId) {
      status = "CONFLICT";
      suggestedAction = "RESOLVE_CONFLICT";
      discrepancyCount++;
    } else {
      status = "BOTH_EMPTY";
      suggestedAction = "ASSIGN_TEACHER";
      unassignedCount++;
    }

    return {
      id: cls.id,
      name: cls.name,
      section: cls.section,
      displayName: `${cls.name} - ${cls.section}`,
      studentCount: cls._count.students,
      sourceATeacherId: aId,
      sourceATeacherName: aName,
      sourceBTeacherId: bId,
      sourceBTeacherName: bName,
      status,
      suggestedAction
    };
  });

  return {
    classes: items,
    unassignedCount,
    discrepancyCount,
    matchedCount,
    availableTeachers: allTeachers.map((t) => ({
      id: t.id,
      name: t.user.name,
      email: t.user.email
    }))
  };
}

/**
 * Admin action to confirm reconciliation or manually set a class teacher.
 */
export async function reconcileClassTeacherAction(
  classId: string,
  teacherId: string | null
): Promise<{ success: boolean; message: string }> {
  const result = await setClassTeacher(classId, teacherId, { confirmReplace: true });
  if (result.error) {
    throw new Error(result.error);
  }
  return {
    success: true,
    message: teacherId
      ? `Successfully linked ${result.class?.teacherName || "teacher"} as Class Teacher.`
      : "Class Teacher assignment cleared."
  };
}
