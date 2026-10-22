"use server";

import { prisma } from "@/backend/db/prisma";
import { revalidatePath } from "next/cache";

export async function createSubjectAction(formData: FormData) {
  try {
    const name = (formData.get("name") as string)?.trim();
    const code = (formData.get("code") as string)?.trim();
    const { getSystemSetting } = await import("@/backend/api/actions/dashboard/admin/settings/actions");
    const defaultPassSetting = await getSystemSetting("DEFAULT_PASSING_MARKS", "40");
    
    const maxMarks = parseInt(formData.get("maxMarks") as string || "100", 10);
    const passMarks = parseInt(formData.get("passMarks") as string || defaultPassSetting, 10);
    
    // Per-class teacher assignments: [{ classId: string, teacherId?: string | null }]
    const classAssignmentsRaw = formData.get("classAssignments") as string;
    let assignments: { classId: string; teacherId?: string | null }[] = [];

    if (classAssignmentsRaw) {
      try {
        assignments = JSON.parse(classAssignmentsRaw);
      } catch (err) {
        console.error("Failed to parse classAssignments JSON:", err);
      }
    }

    if (assignments.length === 0) {
      const classIdsInput = formData.get("classIds") as string;
      const defaultTeacherId = (formData.get("teacherId") as string) || null;
      const classIds = classIdsInput ? classIdsInput.split(',').filter(Boolean) : [];
      assignments = classIds.map(cid => ({ classId: cid, teacherId: defaultTeacherId }));
    }

    if (!name || !code || assignments.length === 0) {
      return { error: "Subject Name, Code, and at least one Class are required." };
    }

    // Create a subject document for each selected class with its assigned staff
    for (const item of assignments) {
      const { classId, teacherId } = item;
      if (!classId) continue;

      // Check if it already exists for this class
      const exists = await prisma.subject.findFirst({
        where: { name, classId }
      });

      if (exists) {
        return { error: `Subject "${name}" already exists for one of the selected classes.` };
      }

      await prisma.subject.create({
        data: {
          name,
          code,
          maxMarks,
          passMarks,
          classId,
          teacherId: teacherId || null
        }
      });
    }

    revalidatePath("/dashboard/admin/subjects");
    return { success: true, message: "Subjects created successfully." };
  } catch (error: unknown) {
    if (error instanceof Error) {
      return { error: error.message || "Failed to create subject." };
    }
    return { error: "Failed to create subject." };
  }
}

export async function deactivateSubject(id: string) {
  try {
    await prisma.subject.update({
      where: { id },
      data: { isActive: false }
    });
    revalidatePath("/dashboard/admin/subjects");
    return { success: true };
  } catch (error: unknown) {
    if (error instanceof Error) return { error: error.message };
    return { error: "Failed to deactivate subject." };
  }
}

export async function deleteSubject(id: string) {
  try {
    const subject = await prisma.subject.findUnique({
      where: { id },
      select: { id: true, name: true }
    });

    if (!subject) return { error: "Subject not found." };

    await prisma.$transaction(async (tx) => {
      // 1. Cascade Marks & MarkHistory
      const marks = await tx.mark.findMany({
        where: { subjectId: id },
        select: { id: true }
      });
      const markIds = marks.map(m => m.id);

      if (markIds.length > 0) {
        await tx.markHistory.deleteMany({
          where: { markId: { in: markIds } }
        });
        await tx.mark.deleteMany({
          where: { id: { in: markIds } }
        });
      }

      // 2. Cascade Timetable slots
      await tx.timetable.deleteMany({
        where: { subjectId: id }
      });

      // 3. Cascade Exam Requests
      await tx.examRequest.deleteMany({
        where: { subjectId: id }
      });

      // 4. Delete Subject record
      await tx.subject.delete({
        where: { id }
      });
    });

    revalidatePath("/dashboard/admin/subjects");
    revalidatePath("/dashboard/admin/timetable");
    return { success: true, message: "Subject deleted successfully." };
  } catch (error: unknown) {
    console.error("Delete subject error:", error);
    if (error instanceof Error) {
      return { error: error.message || "Failed to delete subject." };
    }
    return { error: "Failed to delete subject." };
  }
}

export async function deleteSubjectGroupByName(name: string) {
  try {
    const subjects = await prisma.subject.findMany({
      where: { name },
      select: { id: true }
    });

    if (subjects.length === 0) return { error: "Subject not found." };
    const subjectIds = subjects.map(s => s.id);

    await prisma.$transaction(async (tx) => {
      // 1. Cascade Marks & MarkHistory
      const marks = await tx.mark.findMany({
        where: { subjectId: { in: subjectIds } },
        select: { id: true }
      });
      const markIds = marks.map(m => m.id);

      if (markIds.length > 0) {
        await tx.markHistory.deleteMany({
          where: { markId: { in: markIds } }
        });
        await tx.mark.deleteMany({
          where: { id: { in: markIds } }
        });
      }

      // 2. Cascade Timetable slots
      await tx.timetable.deleteMany({
        where: { subjectId: { in: subjectIds } }
      });

      // 3. Cascade Exam Requests
      await tx.examRequest.deleteMany({
        where: { subjectId: { in: subjectIds } }
      });

      // 4. Delete all subjects with this name
      await tx.subject.deleteMany({
        where: { id: { in: subjectIds } }
      });
    });

    revalidatePath("/dashboard/admin/subjects");
    revalidatePath("/dashboard/admin/timetable");
    return { success: true, message: `Subject "${name}" deleted successfully.` };
  } catch (error: unknown) {
    console.error("Delete subject group error:", error);
    if (error instanceof Error) {
      return { error: error.message || "Failed to delete subject." };
    }
    return { error: "Failed to delete subject." };
  }
}

export async function assignSubjectTeacher(subjectId: string, teacherId: string) {
  try {
    if (!teacherId) {
      await prisma.subject.update({
        where: { id: subjectId },
        data: {
          teacher: {
            disconnect: true
          }
        }
      });
    } else {
      await prisma.subject.update({
        where: { id: subjectId },
        data: {
          teacher: {
            connect: { id: teacherId }
          }
        }
      });
    }
    revalidatePath("/dashboard/admin/subjects");
    return { success: true };
  } catch (error: unknown) {
    if (error instanceof Error) {
      return { error: error.message || "Failed to assign teacher." };
    }
    return { error: "Failed to assign teacher." };
  }
}
