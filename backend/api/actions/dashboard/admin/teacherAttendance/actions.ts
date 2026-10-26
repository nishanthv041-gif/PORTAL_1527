"use server";

import { prisma } from "@/backend/db/prisma";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { getSessionDateTime } from "@/backend/lib/services/attendanceCalculation";

function formatRemarksWithSession(remarks: string | undefined | null, session: "FORENOON" | "AFTERNOON"): string {
  const cleanRemarks = (remarks || "").replace(/\s*\((FORENOON|AFTERNOON)\)/gi, "").trim();
  const sessionTag = session === "FORENOON" ? "(Forenoon)" : "(Afternoon)";
  if (!cleanRemarks) return sessionTag;
  return `${cleanRemarks} ${sessionTag}`;
}

export async function adminUpdateTeacherAttendance(
  teacherId: string,
  dateStr: string,
  status: string,
  remarks?: string,
  sessionType: "FORENOON" | "AFTERNOON" = "FORENOON"
) {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session || session.user.role !== "ADMIN") return { error: "Unauthorized" };

    if (!dateStr) return { error: "Date is required to mark teacher attendance." };
    const sessionDate = getSessionDateTime(dateStr, sessionType);

    const teacher = await prisma.teacher.findUnique({
      where: { id: teacherId },
      include: { user: true }
    });
    if (!teacher) return { error: "Teacher not found" };

    let finalRemarks = formatRemarksWithSession(remarks, sessionType);
    if (!finalRemarks.includes("Marked by Admin")) {
      finalRemarks = `${finalRemarks} (Marked by Admin)`;
    }

    const existing = await prisma.teacherAttendance.findFirst({
      where: {
        teacherId,
        date: sessionDate,
      }
    });

    if (existing) {
      await prisma.teacherAttendance.update({
        where: { id: existing.id },
        data: {
          status,
          date: sessionDate,
          remarks: finalRemarks
        }
      });
    } else {
      await prisma.teacherAttendance.create({
        data: {
          teacherId,
          date: sessionDate,
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
  data: {
    teacherId: string;
    date: string;
    status: string;
    session?: "FORENOON" | "AFTERNOON";
    remarks?: string;
  }[]
) {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session || session.user.role !== "ADMIN") return { error: "Unauthorized" };

    for (const item of data) {
      const sessionType: "FORENOON" | "AFTERNOON" = item.session || 
        (item.remarks?.toUpperCase().includes("AFTERNOON") ? "AFTERNOON" : "FORENOON");
      
      const sessionDate = getSessionDateTime(item.date, sessionType);
      const finalRemarks = formatRemarksWithSession(item.remarks, sessionType);

      const existing = await prisma.teacherAttendance.findFirst({
        where: {
          teacherId: item.teacherId,
          date: sessionDate,
        }
      });

      if (existing) {
        await prisma.teacherAttendance.update({
          where: { id: existing.id },
          data: {
            status: item.status,
            date: sessionDate,
            remarks: item.remarks !== undefined ? finalRemarks : existing.remarks
          }
        });
      } else {
        await prisma.teacherAttendance.create({
          data: {
            teacherId: item.teacherId,
            date: sessionDate,
            status: item.status,
            remarks: finalRemarks
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

