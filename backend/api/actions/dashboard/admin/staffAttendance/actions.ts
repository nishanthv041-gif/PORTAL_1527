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

export async function adminUpdateStaffAttendance(
  staffId: string,
  dateStr: string,
  status: string,
  remarks?: string,
  sessionType: "FORENOON" | "AFTERNOON" = "FORENOON"
) {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session || session.user.role !== "ADMIN") return { error: "Unauthorized" };

    if (!dateStr) return { error: "Date is required to mark staff attendance." };
    const sessionDate = getSessionDateTime(dateStr, sessionType);

    const staff = await prisma.staff.findUnique({
      where: { id: staffId },
      include: { user: true }
    });
    if (!staff) return { error: "Staff member not found" };

    let finalRemarks = formatRemarksWithSession(remarks, sessionType);
    if (!finalRemarks.includes("Marked by Admin")) {
      finalRemarks = `${finalRemarks} (Marked by Admin)`;
    }

    const existing = await prisma.staffAttendance.findFirst({
      where: {
        staffId,
        date: sessionDate,
      }
    });

    if (existing) {
      await prisma.staffAttendance.update({
        where: { id: existing.id },
        data: {
          status,
          date: sessionDate,
          remarks: finalRemarks
        }
      });
    } else {
      await prisma.staffAttendance.create({
        data: {
          staffId,
          date: sessionDate,
          status,
          remarks: finalRemarks
        }
      });
    }

    revalidatePath("/dashboard/admin/staff-attendance");
    revalidatePath("/dashboard/admin/attendance");
    return { success: true };
  } catch (error: unknown) {
    if (error instanceof Error) {
      return { error: error.message || "Failed to update staff attendance." };
    }
    return { error: "Failed to update staff attendance." };
  }
}

export async function adminBulkStaffAttendance(
  data: {
    staffId: string;
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

      const existing = await prisma.staffAttendance.findFirst({
        where: {
          staffId: item.staffId,
          date: sessionDate,
        }
      });

      if (existing) {
        await prisma.staffAttendance.update({
          where: { id: existing.id },
          data: {
            status: item.status,
            date: sessionDate,
            remarks: item.remarks !== undefined ? finalRemarks : existing.remarks
          }
        });
      } else {
        await prisma.staffAttendance.create({
          data: {
            staffId: item.staffId,
            date: sessionDate,
            status: item.status,
            remarks: finalRemarks
          }
        });
      }
    }

    revalidatePath("/dashboard/admin/staff-attendance");
    revalidatePath("/dashboard/admin/attendance");
    return { success: true, count: data.length };
  } catch (error: unknown) {
    if (error instanceof Error) {
      return { error: error.message || "Failed to perform bulk staff attendance update." };
    }
    return { error: "Failed to perform bulk staff attendance update." };
  }
}

