"use server";

import { prisma } from "@/backend/db/prisma";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";

export async function adminUpdateAttendance(studentId: string, dateStr: string, status: string, remarks: string) {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session || session.user.role !== 'ADMIN') return { error: "Unauthorized" };

    if (!dateStr) return { error: "Date is required to mark attendance." };
    const [year, month, day] = dateStr.split("-").map(Number);
    const startOfDay = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
    const endOfDay = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));
    
    const student = await prisma.student.findUnique({ where: { id: studentId } });
    if (!student || !student.classId) return { error: 'Student or class not found' };

    // Add "Edited by Admin" flag to remarks if modified
    let finalRemarks = remarks;
    if (!finalRemarks?.includes("Edited by Admin")) {
      finalRemarks = finalRemarks ? `${finalRemarks} (Edited by Admin)` : "Edited by Admin";
    }

    const existing = await prisma.attendance.findFirst({
      where: {
        studentId,
        date: { gte: startOfDay, lte: endOfDay }
      }
    });

    if (existing) {
      await prisma.attendance.update({
        where: { id: existing.id },
        data: {
          status,
          date: startOfDay,
          remarks: finalRemarks
        }
      });
    } else {
      await prisma.attendance.create({
        data: {
          studentId,
          classId: student.classId,
          date: startOfDay,
          status,
          remarks: finalRemarks
        }
      });
    }

    revalidatePath("/dashboard/admin/attendance");
    revalidatePath("/dashboard/teacher/attendance");
    revalidatePath("/dashboard/parent/attendance");
    return { success: true };
  } catch (error: unknown) {
    if (error instanceof Error) {
      return { error: error.message || "Failed to update attendance." };
    }
    return { error: "Failed to update attendance." };
  }
}

export async function adminBulkAttendance(data: { studentId: string; date: string; status: string; classId?: string; remarks?: string }[]) {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session || session.user.role !== 'ADMIN') return { error: "Unauthorized" };

    for (const item of data) {
      const [year, month, day] = item.date.split("-").map(Number);
      const startOfDay = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
      const endOfDay = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));

      const existing = await prisma.attendance.findFirst({
        where: {
          studentId: item.studentId,
          date: { gte: startOfDay, lte: endOfDay }
        }
      });

      if (existing) {
        await prisma.attendance.update({
          where: { id: existing.id },
          data: {
            status: item.status,
            date: startOfDay,
            remarks: item.remarks !== undefined ? item.remarks : existing.remarks
          }
        });
      } else {
        let finalClassId = item.classId;
        if (!finalClassId) {
          const student = await prisma.student.findUnique({ where: { id: item.studentId }, select: { classId: true } });
          finalClassId = student?.classId || undefined;
        }

        await prisma.attendance.create({
          data: {
            studentId: item.studentId,
            classId: finalClassId,
            date: startOfDay,
            status: item.status,
            remarks: item.remarks || null
          }
        });
      }
    }

    revalidatePath("/dashboard/admin/attendance");
    revalidatePath("/dashboard/teacher/attendance");
    revalidatePath("/dashboard/parent/attendance");
    return { success: true };
  } catch (error: unknown) {
    if (error instanceof Error) {
      return { error: error.message || "Failed to save bulk attendance." };
    }
    return { error: "Failed to save bulk attendance." };
  }
}
