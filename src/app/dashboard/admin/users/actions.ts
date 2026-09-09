"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function deactivateUser(id: string) {
  await prisma.user.update({
    where: { id },
    data: { status: 'INACTIVE' }
  });
  
  // also deactivate associated teacher/parent if needed
  const user = await prisma.user.findUnique({ where: { id }, include: { teacher: true, parent: true } });
  if (user?.teacher) {
    await prisma.teacher.update({ where: { id: user.teacher.id }, data: { isActive: false } });
  }
  if (user?.parent) {
    await prisma.parent.update({ where: { id: user.parent.id }, data: { isActive: false } });
  }

  revalidatePath('/dashboard/admin/users');
}

export async function activateAllUsers() {
  await prisma.user.updateMany({
    where: { status: 'INACTIVE' },
    data: { status: 'ACTIVE' }
  });
  
  await prisma.teacher.updateMany({
    where: { isActive: false },
    data: { isActive: true }
  });
  
  await prisma.parent.updateMany({
    where: { isActive: false },
    data: { isActive: true }
  });

  revalidatePath('/dashboard/admin/users');
}

export async function deleteUser(id: string) {
  try {
    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        teacher: { include: { classTeacherOf: true, classes: true, subjects: true, examRequests: true, complaints: true, assignments: true } },
        parent: true,
        staff: true
      }
    });

    if (!user) throw new Error("User not found.");
    if (user.role === 'ADMIN') throw new Error("Cannot delete ADMIN users.");

    // Dependency blocks
    if (user.teacher) {
      if (
        user.teacher.classTeacherOf ||
        user.teacher.classes.length > 0 ||
        user.teacher.subjects.length > 0 ||
        user.teacher.examRequests.length > 0 ||
        user.teacher.complaints.length > 0 ||
        user.teacher.assignments.length > 0
      ) {
        throw new Error("Cannot delete Teacher with active assignments or history (classes, subjects, exams, complaints). Please reassign them or use Deactivate instead.");
      }
      await prisma.teacher.delete({ where: { id: user.teacher.id } });
    }

    if (user.parent) {
      await prisma.parentStudent.deleteMany({ where: { parentId: user.parent.id } });
      await prisma.parent.delete({ where: { id: user.parent.id } });
    }

    if (user.staff) {
      await prisma.staff.delete({ where: { id: user.staff.id } });
    }

    // Delete base User records
    await prisma.message.deleteMany({ where: { OR: [{ senderId: id }, { receiverId: id }] } });
    await prisma.notification.deleteMany({ where: { userId: id } });
    await prisma.rating.deleteMany({ where: { userId: id } });
    await prisma.user.delete({ where: { id } });

    revalidatePath('/dashboard/admin/users');
    return { success: true };
  } catch (error: unknown) {
    if (error instanceof Error) return { error: error.message };
    return { error: "Failed to delete user." };
  }
}
