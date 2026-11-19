"use server";

import { prisma } from "@/backend/db/prisma";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { getSessionDateTime, isForenoonRecord, isAfternoonRecord } from "@/backend/lib/services/attendanceCalculation";
import { sendInstantPortalNotification } from "@/lib/pushDispatcher";

function formatRemarksWithSession(remarks: string | undefined | null, session: "FORENOON" | "AFTERNOON"): string {
  const cleanRemarks = (remarks || "").replace(/\s*\((FORENOON|AFTERNOON)\)/gi, "").trim();
  const sessionTag = session === "FORENOON" ? "(Forenoon)" : "(Afternoon)";
  if (!cleanRemarks) return sessionTag;
  return `${cleanRemarks} ${sessionTag}`;
}

export async function adminUpdateAttendance(
  studentId: string,
  dateStr: string,
  status: string,
  remarks: string,
  sessionType: "FORENOON" | "AFTERNOON" = "FORENOON"
) {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session || session.user.role !== 'ADMIN') return { error: "Unauthorized" };

    if (!dateStr) return { error: "Date is required to mark attendance." };
    const sessionDate = getSessionDateTime(dateStr, sessionType);
    
    const student = await prisma.student.findUnique({ where: { id: studentId } });
    if (!student || !student.classId) return { error: 'Student or class not found' };

    let finalRemarks = formatRemarksWithSession(remarks, sessionType);
    if (!finalRemarks.includes("Edited by Admin")) {
      finalRemarks = `${finalRemarks} (Edited by Admin)`;
    }

    // Match exact session record
    const existing = await prisma.attendance.findFirst({
      where: {
        studentId,
        date: sessionDate,
      }
    });

    if (existing) {
      await prisma.attendance.update({
        where: { id: existing.id },
        data: {
          status,
          date: sessionDate,
          remarks: finalRemarks
        }
      });
    } else {
      await prisma.attendance.create({
        data: {
          studentId,
          classId: student.classId,
          date: sessionDate,
          status,
          remarks: finalRemarks
        }
      });
    }

    // Trigger instant Parent Attendance Notification on Absence
    if (status === "ABSENT") {
      try {
        const studentInfo = await prisma.student.findUnique({
          where: { id: studentId },
          select: {
            firstName: true,
            lastName: true,
            parents: { select: { parent: { select: { userId: true } } } },
          },
        });
        const studentName = `${studentInfo?.firstName || ""} ${studentInfo?.lastName || ""}`.trim() || "Student";
        const parentUserIds = studentInfo?.parents.map((p) => p.parent.userId).filter((id): id is string => Boolean(id)) || [];
        if (parentUserIds.length > 0) {
          await sendInstantPortalNotification({
            targetUserIds: parentUserIds,
            category: "ATTENDANCE",
            title: `Attendance Alert: ${studentName} Absent`,
            body: `${studentName} was marked absent for the ${sessionType.toLowerCase()} session on ${dateStr}.`,
            link: "/dashboard/parent/attendance",
            tag: `att-${studentId}-${dateStr}-${sessionType}-${Date.now()}`,
            priority: "URGENT",
            bypass48h: true,
          });
        }
      } catch (notifErr) {
        console.warn("[Admin Attendance] Notification dispatch note:", notifErr);
      }
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

export async function adminBulkAttendance(data: {
  studentId: string;
  date: string;
  status: string;
  session?: "FORENOON" | "AFTERNOON";
  classId?: string;
  remarks?: string;
}[]) {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session || session.user.role !== 'ADMIN') return { error: "Unauthorized" };

    for (const item of data) {
      const sessionType: "FORENOON" | "AFTERNOON" = item.session || 
        (item.remarks?.toUpperCase().includes("AFTERNOON") ? "AFTERNOON" : "FORENOON");
      
      const sessionDate = getSessionDateTime(item.date, sessionType);
      const finalRemarks = formatRemarksWithSession(item.remarks, sessionType);

      const existing = await prisma.attendance.findFirst({
        where: {
          studentId: item.studentId,
          date: sessionDate,
        }
      });

      if (existing) {
        await prisma.attendance.update({
          where: { id: existing.id },
          data: {
            status: item.status,
            date: sessionDate,
            remarks: item.remarks !== undefined ? finalRemarks : existing.remarks
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
            date: sessionDate,
            status: item.status,
            remarks: finalRemarks
          }
        });
      }
    }

    // Trigger instant Parent Attendance Notification for absent students
    const absentItems = data.filter((d) => d.status === "ABSENT");
    if (absentItems.length > 0) {
      try {
        for (const item of absentItems) {
          const sessionType: "FORENOON" | "AFTERNOON" = item.session ||
            (item.remarks?.toUpperCase().includes("AFTERNOON") ? "AFTERNOON" : "FORENOON");
          const studentInfo = await prisma.student.findUnique({
            where: { id: item.studentId },
            select: {
              firstName: true,
              lastName: true,
              parents: { select: { parent: { select: { userId: true } } } },
            },
          });
          const studentName = `${studentInfo?.firstName || ""} ${studentInfo?.lastName || ""}`.trim() || "Student";
          const parentUserIds = studentInfo?.parents.map((p) => p.parent.userId).filter((id): id is string => Boolean(id)) || [];
          if (parentUserIds.length > 0) {
            await sendInstantPortalNotification({
              targetUserIds: parentUserIds,
              category: "ATTENDANCE",
              title: `Attendance Alert: ${studentName} Absent`,
              body: `${studentName} was marked absent for the ${sessionType.toLowerCase()} session on ${item.date}.`,
              link: "/dashboard/parent/attendance",
              tag: `att-${item.studentId}-${item.date}-${sessionType}-${Date.now()}`,
              priority: "URGENT",
              bypass48h: true,
            });
          }
        }
      } catch (notifErr) {
        console.warn("[Admin Attendance] Bulk notification dispatch note:", notifErr);
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

