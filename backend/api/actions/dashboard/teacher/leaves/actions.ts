"use server";

import { prisma } from "@/backend/db/prisma";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";

export async function getTeacherLeaveRequests() {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session || session.user.role !== "TEACHER") {
      return { success: false, error: "Unauthorized", data: [] };
    }

    const teacher = await prisma.teacher.findUnique({
      where: { userId: session.user.id },
      include: {
        classTeacherOf: {
          include: {
            students: {
              select: { id: true }
            }
          }
        }
      }
    });

    if (!teacher || !teacher.classTeacherOf) {
      return { success: false, error: "Not assigned as Class Teacher.", data: [] };
    }

    const studentIds = teacher.classTeacherOf.students.map(s => s.id);

    const leaves = await prisma.leaveRequest.findMany({
      where: {
        studentId: { in: studentIds }
      },
      include: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            rollNumber: true,
            classId: true
          }
        }
      },
      orderBy: { startDate: "desc" }
    });

    return { success: true, data: leaves };
  } catch (error) {
    console.error("Error fetching teacher leave requests:", error);
    return { success: false, error: "Failed to load leave requests.", data: [] };
  }
}

export async function acceptLeaveRequest(leaveRequestId: string) {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session || (session.user.role !== "TEACHER" && session.user.role !== "ADMIN")) {
      return { success: false, error: "Unauthorized" };
    }

    const leave = await prisma.leaveRequest.findUnique({
      where: { id: leaveRequestId },
      include: {
        student: {
          select: { id: true, classId: true }
        }
      }
    });

    if (!leave) {
      return { success: false, error: "Leave request not found." };
    }

    // Update leave request status to APPROVED
    await prisma.leaveRequest.update({
      where: { id: leaveRequestId },
      data: { status: "APPROVED" }
    });

    // Automatically register / upsert Attendance records as LEAVE for every day in the range
    const start = new Date(leave.startDate);
    const end = new Date(leave.endDate);
    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);

    const cur = new Date(start);
    while (cur <= end) {
      const curDate = new Date(cur);
      // Skip Sundays (0) if desired, but register all working days as LEAVE
      const dayOfWeek = curDate.getDay();
      if (dayOfWeek !== 0) { // Don't mark Sunday
        const existing = await prisma.attendance.findFirst({
          where: {
            studentId: leave.studentId,
            date: curDate
          }
        });

        if (existing) {
          await prisma.attendance.update({
            where: { id: existing.id },
            data: {
              status: "LEAVE",
              remarks: "Leave Approved by Class Teacher"
            }
          });
        } else {
          await prisma.attendance.create({
            data: {
              studentId: leave.studentId,
              classId: leave.student.classId,
              date: curDate,
              status: "LEAVE",
              remarks: "Leave Approved by Class Teacher"
            }
          });
        }
      }

      cur.setDate(cur.getDate() + 1);
    }

    revalidatePath("/dashboard/teacher/leaves");
    revalidatePath("/dashboard/teacher/attendance");
    revalidatePath("/dashboard/parent/leaves");
    revalidatePath("/dashboard/parent/attendance");
    revalidatePath("/dashboard/admin/attendance");

    return { success: true };
  } catch (error: unknown) {
    console.error("Error accepting leave request:", error);
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to accept leave request." };
  }
}

export async function rejectLeaveRequest(leaveRequestId: string) {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session || (session.user.role !== "TEACHER" && session.user.role !== "ADMIN")) {
      return { success: false, error: "Unauthorized" };
    }

    await prisma.leaveRequest.update({
      where: { id: leaveRequestId },
      data: { status: "REJECTED" }
    });

    revalidatePath("/dashboard/teacher/leaves");
    revalidatePath("/dashboard/parent/leaves");
    return { success: true };
  } catch (error: unknown) {
    console.error("Error rejecting leave request:", error);
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to reject leave request." };
  }
}
