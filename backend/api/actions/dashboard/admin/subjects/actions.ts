"use server";

import { prisma } from "@/backend/db/prisma";
import { revalidatePath } from "next/cache";

export async function createSubjectAction(formData: FormData) {
  try {
    const name = formData.get("name") as string;
    const code = formData.get("code") as string;
    const maxMarks = parseInt(formData.get("maxMarks") as string || "100", 10);
    const passMarks = parseInt(formData.get("passMarks") as string || "35", 10);
    const teacherId = formData.get("teacherId") as string;
    const classIdsInput = formData.get("classIds") as string;

    if (!name || !code || !classIdsInput) {
      return { error: "Subject Name, Code, and at least one Class are required." };
    }

    const classIds = classIdsInput.split(',').filter(Boolean);

    // Create a subject document for each selected class
    for (const classId of classIds) {
      // Check if it already exists for this class
      const exists = await prisma.subject.findFirst({
        where: { name, classId }
      });

      if (exists) {
        return { error: `Subject ${name} already exists for one of the selected classes.` };
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
      include: {
        marks: { take: 1 },
        timetable: { take: 1 },
        examRequests: { take: 1 }
      }
    });

    if (!subject) return { error: "Subject not found." };

    const hasMarks = subject.marks.length > 0;
    const hasTimetable = subject.timetable.length > 0;
    const hasExamRequests = subject.examRequests.length > 0;

    if (hasMarks || hasTimetable || hasExamRequests) {
      return { error: "Cannot delete Subject with existing Marks, Timetable slots, or Exam Requests. Please use Deactivate instead." };
    }

    // Hard delete
    await prisma.subject.delete({
      where: { id }
    });
    revalidatePath("/dashboard/admin/subjects");
    return { success: true, message: "Subject deleted successfully." };
  } catch (error: unknown) {
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
