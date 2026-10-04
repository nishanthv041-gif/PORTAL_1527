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
    });

    if (!student) return { error: `Student not found (ID: ${id}). Please refresh the page.` };

    await prisma.$transaction(async (tx) => {
      // Forcefully cascade academic history
      await tx.attendance.deleteMany({ where: { studentId: id } });
      await tx.mark.deleteMany({ where: { studentId: id } });
      await tx.reportCard.deleteMany({ where: { studentId: id } });

      // Safely cascade remaining dependencies
      await tx.parentStudent.deleteMany({ where: { studentId: id } });
      await tx.disciplinary.deleteMany({ where: { studentId: id } });
      await tx.achievement.deleteMany({ where: { studentId: id } });
      await tx.leaveRequest.deleteMany({ where: { studentId: id } });
      await tx.complaint.deleteMany({ where: { studentId: id } });

      await tx.student.delete({ where: { id } });
    });

    revalidatePath('/dashboard/admin/students');
    return { success: true };
  } catch (error: any) {
    return { error: `Failed to delete student: ${error.message || "Unknown error"}` };
  }
}
