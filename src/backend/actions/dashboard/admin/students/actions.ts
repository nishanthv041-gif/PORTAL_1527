"use server";

import { prisma } from "@/backend/db/prisma";
import { revalidatePath } from "next/cache";

export async function deactivateStudent(id: string) {
  try {
    await prisma.student.update({
      where: { id },
      data: { isActive: false }
    });
    revalidatePath('/dashboard/admin/students');
    return { success: true };
  } catch (error: unknown) {
    if (error instanceof Error) return { error: error.message };
    return { error: "Failed to deactivate student." };
  }
}

export async function activateStudent(id: string) {
  try {
    await prisma.student.update({
      where: { id },
      data: { isActive: true }
    });
    revalidatePath('/dashboard/admin/students');
    return { success: true };
  } catch (error: unknown) {
    if (error instanceof Error) return { error: error.message };
    return { error: "Failed to activate student." };
  }
}

export async function deleteStudent(id: string) {
  try {
    const student = await prisma.student.findUnique({
      where: { id },
      include: {
        attendances: true,
        marks: true,
        reportCards: true
      }
    });

    if (!student) throw new Error("Student not found.");

    // Forcefully cascade academic history
    await prisma.attendance.deleteMany({ where: { studentId: id } });
    await prisma.mark.deleteMany({ where: { studentId: id } }); // MarkHistory will cascade automatically
    await prisma.reportCard.deleteMany({ where: { studentId: id } });

    // Safely cascade remaining dependencies
    await prisma.parentStudent.deleteMany({ where: { studentId: id } });
    await prisma.disciplineRecord.deleteMany({ where: { studentId: id } });
    await prisma.achievement.deleteMany({ where: { studentId: id } });
    await prisma.leaveRequest.deleteMany({ where: { studentId: id } });
    await prisma.complaint.deleteMany({ where: { studentId: id } });
    await prisma.submission.deleteMany({ where: { studentId: id } }); // Orphaned relation cleanup

    await prisma.student.delete({ where: { id } });

    revalidatePath('/dashboard/admin/students');
    return { success: true };
  } catch (error: unknown) {
    if (error instanceof Error) return { error: error.message };
    return { error: "Failed to delete student." };
  }
}
