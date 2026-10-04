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
    return { success: true };
  } catch (error: unknown) {
    if (error instanceof Error) {
      return { error: error.message || "Failed to update attendance." };
    }
    return { error: "Failed to update attendance." };
  }
}

