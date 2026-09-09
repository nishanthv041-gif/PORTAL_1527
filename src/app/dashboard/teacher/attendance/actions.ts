"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

export async function saveBulkAttendance(data: { studentId: string; status: string; date: string; classId: string }[]) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'TEACHER') {
      return { success: false, error: "Unauthorized" };
    }

    const teacher = await prisma.teacher.findUnique({
      where: { userId: session.user.id },
      include: { classTeacherOf: true }
    });

    if (!teacher || !teacher.classTeacherOf) {
      return { success: false, error: "Only assigned Class Teachers can mark attendance." };
    }

    const classTeacherClassId = teacher.classTeacherOf.id;

    for (const record of data) {
      if (record.classId !== classTeacherClassId) {
        return { success: false, error: "You can only mark attendance for your assigned class." };
      }

      const date = new Date(record.date);
      date.setHours(0, 0, 0, 0);

      const existing = await prisma.attendance.findFirst({
        where: {
          studentId: record.studentId,
          date
        }
      });

      if (existing) {
        await prisma.attendance.update({
          where: { id: existing.id },
          data: { status: record.status }
        });
      } else {
        await prisma.attendance.create({
          data: {
            studentId: record.studentId,
            classId: record.classId,
            date,
            status: record.status
          }
        });
      }
    }

    revalidatePath("/dashboard/teacher/attendance");
    return { success: true };
  } catch (error: unknown) {
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to save attendance." };
  }
}
