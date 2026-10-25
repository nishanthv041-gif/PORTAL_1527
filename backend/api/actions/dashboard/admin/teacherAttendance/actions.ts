"use server";

import { prisma } from "@/backend/db/prisma";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";

export async function adminUpdateTeacherAttendance(
  teacherId: string,
  dateStr: string,
  status: string,
  remarks?: string
) {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session || session.user.role !== "ADMIN") return { error: "Unauthorized" };

    if (!dateStr) return { error: "Date is required to mark teacher attendance." };
    const [year, month, day] = dateStr.split("-").map(Number);
    const startOfDay = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
    const endOfDay = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));

    const teacher = await prisma.teacher.findUnique({
      where: { id: teacherId },
      include: { user: true }
    });
    if (!teacher) return { error: "Teacher not found" };

    let finalRemarks = remarks;
    if (!finalRemarks?.includes("Marked by Admin")) {
      finalRemarks = finalRemarks ? `${finalRemarks} (Marked by Admin)` : "Marked by Admin";
    }

    const existing = await prisma.teacherAttendance.findFirst({
      where: {
        teacherId,
        date: { gte: startOfDay, lte: endOfDay }
      }
    });

    if (existing) {
      await prisma.teacherAttendance.update({
        where: { id: existing.id },
        data: {
          status,
          date: startOfDay,
          remarks: finalRemarks
        }
      });
    } else {
      await prisma.teacherAttendance.create({
        data: {
          teacherId,
          date: startOfDay,
          status,
          remarks: finalRemarks
        }
      });
    }

    revalidatePath("/dashboard/admin/teacher-attendance");
    revalidatePath("/dashboard/admin/attendance");
    revalidatePath("/dashboard/admin/teachers");
    return { success: true };
  } catch (error: unknown) {
    if (error instanceof Error) {
      return { error: error.message || "Failed to update teacher attendance." };
    }
    return { error: "Failed to update teacher attendance." };
  }
}

export async function adminBulkTeacherAttendance(
  data: { teacherId: string; date: string; status: string }[]
) {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session || session.user.role !== "ADMIN") return { error: "Unauthorized" };

    for (const item of data) {
      const [year, month, day] = item.date.split("-").map(Number);
      const startOfDay = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
      const endOfDay = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));

      const existing = await prisma.teacherAttendance.findFirst({
        where: {
          teacherId: item.teacherId,
          date: { gte: startOfDay, lte: endOfDay }
        }
      });

      if (existing) {
        await prisma.teacherAttendance.update({
          where: { id: existing.id },
          data: {
            status: item.status,
            date: startOfDay,
            remarks: "Admin Bulk Mark"
          }
        });
      } else {
        await prisma.teacherAttendance.create({
          data: {
            teacherId: item.teacherId,
            date: startOfDay,
            status: item.status,
            remarks: "Admin Bulk Mark"
          }
        });
      }
    }

    revalidatePath("/dashboard/admin/teacher-attendance");
    revalidatePath("/dashboard/admin/attendance");
    return { success: true, count: data.length };
  } catch (error: unknown) {
    if (error instanceof Error) {
      return { error: error.message || "Failed to perform bulk teacher attendance update." };
    }
    return { error: "Failed to perform bulk teacher attendance update." };
  }
}
