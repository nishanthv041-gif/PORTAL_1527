"use server";

import { prisma } from "@/backend/db/prisma";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";

import { isDateInCurrentWeek } from "@/frontend/utils/attendanceDateUtils";

/**
 * Auto-registers / updates attendance for a single student immediately (no save button needed).
 * Enforces that Class Teachers can only edit attendance within the current week.
 * Admins can edit anytime in the academic year.
 */
export async function updateSingleAttendance(data: {
  studentId: string;
  classId: string;
  date: string;
  status: string;
  remarks?: string;
}) {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session || (session.user.role !== "TEACHER" && session.user.role !== "ADMIN")) {
      return { success: false, error: "Unauthorized" };
    }

    // Role-based weekly restriction: Class Teachers can only edit within the current week
    if (session.user.role === "TEACHER") {
      if (!isDateInCurrentWeek(data.date)) {
        return {
          success: false,
          error: "Attendance editing is locked for past and future weeks. Class Teachers can only edit the current week.",
        };
      }

      // Verify teacher is assigned to this class
      const teacher = await prisma.teacher.findUnique({
        where: { userId: session.user.id },
        include: { classTeacherOf: true },
      });

      if (!teacher || !teacher.classTeacherOf || teacher.classTeacherOf.id !== data.classId) {
        return { success: false, error: "You can only mark attendance for your assigned class." };
      }
    }

    const [year, month, day] = data.date.split("-").map(Number);
    const startOfDay = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
    const endOfDay = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));

    const existing = await prisma.attendance.findFirst({
      where: {
        studentId: data.studentId,
        date: { gte: startOfDay, lte: endOfDay },
      },
    });

    if (existing) {
      await prisma.attendance.update({
        where: { id: existing.id },
        data: {
          status: data.status,
          date: startOfDay,
          remarks: data.remarks !== undefined ? data.remarks : existing.remarks,
        },
      });
    } else {
      await prisma.attendance.create({
        data: {
          studentId: data.studentId,
          classId: data.classId,
          date: startOfDay,
          status: data.status,
          remarks: data.remarks || null,
        },
      });
    }

    revalidatePath("/dashboard/teacher/attendance");
    revalidatePath("/dashboard/parent/attendance");
    revalidatePath("/dashboard/admin/attendance");

    return { success: true };
  } catch (error: unknown) {
    console.error("Error in updateSingleAttendance:", error);
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to update attendance." };
  }
}

/**
 * Bulk auto-registers attendance (e.g. Quick Mark: All Present).
 */
export async function saveBulkAttendance(
  data: { studentId: string; status: string; date: string; classId: string; remarks?: string }[]
) {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session || (session.user.role !== "TEACHER" && session.user.role !== "ADMIN")) {
      return { success: false, error: "Unauthorized" };
    }

    if (data.length === 0) return { success: true };

    const firstDate = data[0].date;

    // Check weekly restriction for Teachers
    if (session.user.role === "TEACHER") {
      if (!isDateInCurrentWeek(firstDate)) {
        return {
          success: false,
          error: "Attendance editing is locked for past and future weeks. Class Teachers can only edit the current week.",
        };
      }

      const teacher = await prisma.teacher.findUnique({
        where: { userId: session.user.id },
        include: { classTeacherOf: true },
      });

      if (!teacher || !teacher.classTeacherOf) {
        return { success: false, error: "Only assigned Class Teachers can mark attendance." };
      }

      const classTeacherClassId = teacher.classTeacherOf.id;
      for (const record of data) {
        if (record.classId !== classTeacherClassId) {
          return { success: false, error: "You can only mark attendance for your assigned class." };
        }
      }
    }

    for (const record of data) {
      const [year, month, day] = record.date.split("-").map(Number);
      const startOfDay = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
      const endOfDay = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));

      const existing = await prisma.attendance.findFirst({
        where: {
          studentId: record.studentId,
          date: { gte: startOfDay, lte: endOfDay },
        },
      });

      if (existing) {
        await prisma.attendance.update({
          where: { id: existing.id },
          data: {
            status: record.status,
            date: startOfDay,
            remarks: record.remarks !== undefined ? record.remarks : existing.remarks,
          },
        });
      } else {
        await prisma.attendance.create({
          data: {
            studentId: record.studentId,
            classId: record.classId,
            date: startOfDay,
            status: record.status,
            remarks: record.remarks || null,
          },
        });
      }
    }

    revalidatePath("/dashboard/teacher/attendance");
    revalidatePath("/dashboard/parent/attendance");
    revalidatePath("/dashboard/admin/attendance");

    return { success: true };
  } catch (error: unknown) {
    console.error("Error in saveBulkAttendance:", error);
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to save bulk attendance." };
  }
}

/**
 * Fetches attendance records, approved leave requests, and student data for a class on a specific date.
 * Accurately calculates leaves for that specific day only.
 */
export async function getClassAttendanceDetails(classId: string, dateStr: string) {
  try {
    const [year, month, day] = dateStr.split("-").map(Number);
    const startOfDay = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
    const endOfDay = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));

    // 1. Fetch Students in class
    const students = await prisma.student.findMany({
      where: { classId, isActive: true },
      orderBy: { rollNumber: "asc" },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        rollNumber: true,
      },
    });

    const studentIds = students.map((s) => s.id);

    // 2. Fetch existing attendance records strictly for this date
    const attendances = await prisma.attendance.findMany({
      where: {
        studentId: { in: studentIds },
        date: { gte: startOfDay, lte: endOfDay },
      },
    });

    // 3. Fetch approved leave requests that cover this exact date
    const approvedLeaves = await prisma.leaveRequest.findMany({
      where: {
        studentId: { in: studentIds },
        status: "APPROVED",
        startDate: { lte: endOfDay },
        endDate: { gte: startOfDay },
      },
    });

    const approvedLeaveStudentIds = new Set(approvedLeaves.map((l) => l.studentId));

    // Map each student's status for this date:
    // Any existing ABSENT is normalized to LEAVE (since Absent option is removed)
    const attendanceMap: Record<string, { status: string; isLeaveApproved: boolean; remarks?: string }> = {};

    for (const student of students) {
      const hasApprovedLeave = approvedLeaveStudentIds.has(student.id);
      const existing = attendances.find((a) => a.studentId === student.id);

      if (existing) {
        // Normalize: if legacy status was ABSENT or LEAVE, treat as LEAVE
        const effectiveStatus = (existing.status === "LEAVE" || existing.status === "ABSENT") ? "LEAVE" : "PRESENT";
        attendanceMap[student.id] = {
          status: effectiveStatus,
          isLeaveApproved: hasApprovedLeave || effectiveStatus === "LEAVE",
          remarks: existing.remarks || (hasApprovedLeave ? "Leave Approved by Class Teacher" : undefined),
        };
      } else if (hasApprovedLeave) {
        attendanceMap[student.id] = {
          status: "LEAVE",
          isLeaveApproved: true,
          remarks: "Leave Approved by Class Teacher",
        };
      } else {
        // Unmarked default to PRESENT
        attendanceMap[student.id] = {
          status: "PRESENT",
          isLeaveApproved: false,
        };
      }
    }

    // Leave count for this specific selected day ONLY
    const calculatedLeaveCount = Object.values(attendanceMap).filter(
      (a) => a.status === "LEAVE"
    ).length;

    return {
      success: true,
      students,
      attendanceMap,
      leaveCountToday: calculatedLeaveCount,
      isEditable: isDateInCurrentWeek(dateStr),
    };
  } catch (error) {
    console.error("Error in getClassAttendanceDetails:", error);
    return { success: false, error: "Failed to load attendance details." };
  }
}
