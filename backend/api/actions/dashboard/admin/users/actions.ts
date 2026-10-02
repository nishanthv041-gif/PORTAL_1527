"use server";

import { prisma } from "@/backend/db/prisma";
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

export async function activateUser(id: string) {
  await prisma.user.update({
    where: { id },
    data: { status: 'ACTIVE' }
  });
  
  const user = await prisma.user.findUnique({ where: { id }, include: { teacher: true, parent: true } });
  if (user?.teacher) {
    await prisma.teacher.update({ where: { id: user.teacher.id }, data: { isActive: true } });
  }
  if (user?.parent) {
    await prisma.parent.update({ where: { id: user.parent.id }, data: { isActive: true } });
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
      // Disconnect from classes and subjects
      await prisma.class.updateMany({ where: { classTeacherId: user.teacher.id }, data: { classTeacherId: null } });
      await prisma.class.updateMany({ where: { teacherId: user.teacher.id }, data: { teacherId: null } });
      await prisma.subject.updateMany({ where: { teacherId: user.teacher.id }, data: { teacherId: null } });

      // Delete nested dependencies
      await prisma.submission.deleteMany({ where: { assignment: { teacherId: user.teacher.id } } });
      await prisma.assignment.deleteMany({ where: { teacherId: user.teacher.id } });
      await prisma.complaint.deleteMany({ where: { teacherId: user.teacher.id } });
      await prisma.examRequest.deleteMany({ where: { teacherId: user.teacher.id } });

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
