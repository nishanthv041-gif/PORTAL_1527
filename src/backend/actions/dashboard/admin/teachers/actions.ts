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
      include: {
        classes: true,
        subjects: true,
        examRequests: true,
        complaints: true,
        assignments: true,
        classTeacherOf: true,
        user: true
      }
    });

    if (!teacher) throw new Error("Teacher not found.");

    // Disconnect class teacher
    await prisma.class.updateMany({
      where: { classTeacherId: id },
      data: { classTeacherId: null }
    });

    // Cascade delete exam requests and complaints
    await prisma.examRequest.deleteMany({ where: { teacherId: id } });
    await prisma.complaint.deleteMany({ where: { teacherId: id } });

    // Cascade delete assignments and their submissions
    const assignments = await prisma.assignment.findMany({ where: { teacherId: id }, select: { id: true } });
    const assignmentIds = assignments.map(a => a.id);
    if (assignmentIds.length > 0) {
      await prisma.submission.deleteMany({ where: { assignmentId: { in: assignmentIds } } });
      await prisma.assignment.deleteMany({ where: { teacherId: id } });
    }

    // Disconnect from meetings via individual updates
    const teacherMeetings = await prisma.meeting.findMany({
      where: { teachers: { some: { id } } },
      select: { id: true }
    });
    for (const meeting of teacherMeetings) {
      await prisma.meeting.update({
        where: { id: meeting.id },
        data: { teachers: { disconnect: [{ id }] } }
      });
    }

    // Cascade dependent data tied to the user/teacher
    await prisma.announcement.deleteMany({ where: { authorId: teacher.userId } });
    await prisma.message.deleteMany({ where: { OR: [{ senderId: teacher.userId }, { receiverId: teacher.userId }] } });
    await prisma.notification.deleteMany({ where: { userId: teacher.userId } });
    await prisma.rating.deleteMany({ where: { userId: teacher.userId } });
    
    // Delete the teacher record first, then the user
    await prisma.teacher.delete({ where: { id } });
    await prisma.user.delete({ where: { id: teacher.userId } });

    revalidatePath('/dashboard/admin/teachers');
    revalidatePath('/dashboard/admin/users');
    return { success: true };
  } catch (error: unknown) {
    if (error instanceof Error) return { error: error.message };
    return { error: "Failed to delete teacher." };
  }
}
