"use server";

import { prisma } from "@/backend/db/prisma";
import { revalidatePath } from "next/cache";

export async function deactivateTeacher(id: string) {
  try {
    await prisma.teacher.update({
      where: { id },
      data: { isActive: false }
    });
    
    const teacher = await prisma.teacher.findUnique({ where: { id } });
    if (teacher) {
      await prisma.user.update({
        where: { id: teacher.userId },
        data: { status: 'INACTIVE' }
      });
    }

    revalidatePath('/dashboard/admin/teachers');
    revalidatePath('/dashboard/admin/users');
  } catch (error: unknown) {
    if (error instanceof Error) {
      return { error: error.message || "Failed to deactivate teacher." };
    }
    return { error: "Failed to deactivate teacher." };
  }
}

export async function assignClassTeacher(teacherId: string, classId: string) {
  try {
    if (!classId) {
      // Disconnect
      await prisma.teacher.update({
        where: { id: teacherId },
        data: {
          classTeacherOf: {
            disconnect: true
          }
        }
      });
    } else {
      await prisma.teacher.update({
        where: { id: teacherId },
        data: {
          classTeacherOf: {
            connect: { id: classId }
          }
        }
      });
    }

    revalidatePath('/dashboard/admin/teachers');
    return { success: true };
  } catch (error: unknown) {
    if (error instanceof Error) {
      return { error: error.message || "Failed to assign class teacher." };
    }
    return { error: "Failed to assign class teacher." };
  }
}

export async function deleteTeacher(id: string) {
  try {
    const teacher = await prisma.teacher.findUnique({
      where: { id },
    });

    if (!teacher) return { error: `Teacher not found (ID: ${id}). Please refresh the page.` };

    await prisma.$transaction(async (tx) => {
      // Disconnect class teacher
      await tx.class.updateMany({
        where: { classTeacherId: id },
        data: { classTeacherId: null }
      });

      // Cascade delete exam requests and complaints
      await tx.examRequest.deleteMany({ where: { teacherId: id } });
      await tx.complaint.deleteMany({ where: { teacherId: id } });

      // Cascade delete assignments and their submissions
      const assignments = await tx.assignment.findMany({ where: { teacherId: id }, select: { id: true } });
      const assignmentIds = assignments.map(a => a.id);
      if (assignmentIds.length > 0) {
        await tx.submission.deleteMany({ where: { assignmentId: { in: assignmentIds } } });
        await tx.assignment.deleteMany({ where: { teacherId: id } });
      }

      // Disconnect from meetings via individual updates
      const teacherMeetings = await tx.meeting.findMany({
        where: { teachers: { some: { id } } },
        select: { id: true }
      });
      for (const meeting of teacherMeetings) {
        await tx.meeting.update({
          where: { id: meeting.id },
          data: { teachers: { disconnect: [{ id }] } }
        });
      }

      // Cascade dependent data tied to the user/teacher
      await tx.announcement.deleteMany({ where: { authorId: teacher.userId } });
      await tx.message.deleteMany({ where: { OR: [{ senderId: teacher.userId }, { receiverId: teacher.userId }] } });
      await tx.notification.deleteMany({ where: { userId: teacher.userId } });
      await tx.rating.deleteMany({ where: { userId: teacher.userId } });
      await tx.auditLog.deleteMany({ where: { userId: teacher.userId } });
      
      // Delete the teacher record first, then the user
      await tx.teacher.delete({ where: { id } });
      await tx.user.delete({ where: { id: teacher.userId } });
    });

    revalidatePath('/dashboard/admin/teachers');
    revalidatePath('/dashboard/admin/users');
    return { success: true };
  } catch (error: any) {
    return { error: `Failed to delete teacher: ${error.message || "Unknown error"}` };
  }
}
