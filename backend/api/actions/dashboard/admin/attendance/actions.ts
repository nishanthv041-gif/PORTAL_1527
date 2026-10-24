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
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return { error: "Invalid date format." };
    date.setHours(0, 0, 0, 0);
    
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
        date
      }
    });

    if (existing) {
      await prisma.attendance.update({
        where: { id: existing.id },
        data: {
          status,
          remarks: finalRemarks
        }
      });
    } else {
      await prisma.attendance.create({
        data: {
          studentId,
          classId: student.classId,
          date,
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

export async function adminBulkAttendance(data: { studentId: string; date: string; status: string; classId: string }[]) {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session || session.user.role !== 'ADMIN') return { error: "Unauthorized" };

    for (const item of data) {
      const date = new Date(item.date);
      date.setHours(0, 0, 0, 0);

      const existing = await prisma.attendance.findFirst({
        where: { studentId: item.studentId, date }
      });

      if (existing) {
        await prisma.attendance.update({
          where: { id: existing.id },
          data: { status: item.status, remarks: "Admin Bulk Mark" }
        });
      } else {
        await prisma.attendance.create({
          data: {
            studentId: item.studentId,
            classId: item.classId,
            date,
            status: item.status,
            remarks: "Admin Bulk Mark"
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

