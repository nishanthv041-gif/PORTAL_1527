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

export async function setUserExpiry(id: string, hours: number) {
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + hours);
  
  await prisma.user.update({
    where: { id },
    data: { expiresAt }
  });
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
        teacher: true,
        parent: true,
        staff: true
      }
    });

    if (!user) return { error: "User not found." };
    if (user.role === 'ADMIN') return { error: "Cannot delete ADMIN users." };

    await prisma.$transaction(async (tx) => {
      // 1. Dependency cleanup for TEACHER
      if (user.teacher) {
        const teacherId = user.teacher.id;

        // Disconnect from classes (both classTeacher and subject teacher)
        await tx.class.updateMany({ where: { classTeacherId: teacherId }, data: { classTeacherId: null } });
        await tx.class.updateMany({ where: { teacherId: teacherId }, data: { teacherId: null } });
        await tx.subject.updateMany({ where: { teacherId: teacherId }, data: { teacherId: null } });

        // Disconnect meetings
        const meetingsWithTeacher = await tx.meeting.findMany({
          where: { teachers: { some: { id: teacherId } } },
          select: { id: true }
        });
        for (const m of meetingsWithTeacher) {
          await tx.meeting.update({
            where: { id: m.id },
            data: { teachers: { disconnect: { id: teacherId } } }
          });
        }

        // Submissions & assignments
        const assignments = await tx.assignment.findMany({ where: { teacherId }, select: { id: true } });
        const assignmentIds = assignments.map(a => a.id);
        if (assignmentIds.length > 0) {
          await tx.submission.deleteMany({ where: { assignmentId: { in: assignmentIds } } });
        }
        await tx.assignment.deleteMany({ where: { teacherId } });
        await tx.complaint.deleteMany({ where: { teacherId } });
        await tx.examRequest.deleteMany({ where: { teacherId } });

        await tx.teacher.delete({ where: { id: teacherId } });
      }

      // 2. Dependency cleanup for PARENT
      if (user.parent) {
        const parentId = user.parent.id;

        // Disconnect meetings
        const meetingsWithParent = await tx.meeting.findMany({
          where: { parents: { some: { id: parentId } } },
          select: { id: true }
        });
        for (const m of meetingsWithParent) {
          await tx.meeting.update({
            where: { id: m.id },
            data: { parents: { disconnect: { id: parentId } } }
          });
        }

        await tx.parentStudent.deleteMany({ where: { parentId } });
        await tx.parent.delete({ where: { id: parentId } });
      }

      // 3. Dependency cleanup for STAFF
      if (user.staff) {
        await tx.staff.delete({ where: { id: user.staff.id } });
      }

      // 4. Base User records & logs
      await tx.message.deleteMany({ where: { OR: [{ senderId: id }, { receiverId: id }] } });
      await tx.notification.deleteMany({ where: { userId: id } });
      await tx.rating.deleteMany({ where: { userId: id } });
      await tx.auditLog.deleteMany({ where: { OR: [{ userId: id }, { targetId: id }] } });
      await tx.announcement.deleteMany({ where: { authorId: id } });
      await tx.loginAttempt.deleteMany({ where: { email: user.email } });

      // 5. Delete the User
      await tx.user.delete({ where: { id } });
    });

    revalidatePath('/dashboard/admin/users');
    return { success: true, message: "User deleted successfully." };
  } catch (error: unknown) {
    console.error("Delete user error:", error);
    if (error && typeof error === 'object' && 'code' in error) {
      const prismaError = error as { code: string; message: string };
      if (prismaError.code === 'P2003') {
        return { error: "Cannot delete user due to unresolved database relation constraint." };
      }
      if (prismaError.code === 'P2025') {
        return { error: "User or related record was already removed." };
      }
      return { error: `Database error (${prismaError.code}): ${prismaError.message.split('\n')[0]}` };
    }
    if (error instanceof Error) {
      return { error: error.message };
    }
    return { error: "An unexpected error occurred while deleting the user." };
  }
}
