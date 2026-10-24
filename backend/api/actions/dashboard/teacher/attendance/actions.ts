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

    const date = new Date(data.date);
    date.setHours(0, 0, 0, 0);

    const existing = await prisma.attendance.findFirst({
      where: {
        studentId: data.studentId,
        date,
      },
    });

    if (existing) {
      await prisma.attendance.update({
        where: { id: existing.id },
        data: {
          status: data.status,
          remarks: data.remarks !== undefined ? data.remarks : existing.remarks,
        },
      });
    } else {
      await prisma.attendance.create({
        data: {
          studentId: data.studentId,
          classId: data.classId,
          date,
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
 * Bulk auto-registers attendance (e.g. Quick Mark: All Present / All Absent).
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
      const date = new Date(record.date);
      date.setHours(0, 0, 0, 0);

      const existing = await prisma.attendance.findFirst({
        where: {
          studentId: record.studentId,
          date,
        },
      });

      if (existing) {
        await prisma.attendance.update({
          where: { id: existing.id },
          data: {
            status: record.status,
            remarks: record.remarks !== undefined ? record.remarks : existing.remarks,
          },
        });
      } else {
        await prisma.attendance.create({
          data: {
            studentId: record.studentId,
            classId: record.classId,
            date,
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
 */
export async function getClassAttendanceDetails(classId: string, dateStr: string) {
  try {
    const targetDate = new Date(dateStr);
    targetDate.setHours(0, 0, 0, 0);

    const nextDay = new Date(targetDate);
    nextDay.setDate(nextDay.getDate() + 1);

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

    // 2. Fetch existing attendance for this date
    const attendances = await prisma.attendance.findMany({
      where: {
        studentId: { in: studentIds },
        date: { gte: targetDate, lt: nextDay },
      },
    });

    // 3. Fetch approved leave requests that cover this date
    const approvedLeaves = await prisma.leaveRequest.findMany({
      where: {
        studentId: { in: studentIds },
        status: "APPROVED",
        startDate: { lte: nextDay },
        endDate: { gte: targetDate },
      },
    });

    const approvedLeaveStudentIds = new Set(approvedLeaves.map((l) => l.studentId));

    // Map each student's current status:
    // If student has an approved leave request covering today, their status is LEAVE.
    // Otherwise use recorded attendance, or default to PRESENT.
    const attendanceMap: Record<string, { status: string; isLeaveApproved: boolean; remarks?: string }> = {};

    for (const student of students) {
      const hasApprovedLeave = approvedLeaveStudentIds.has(student.id);
      const existing = attendances.find((a) => a.studentId === student.id);

      if (existing) {
        attendanceMap[student.id] = {
          status: existing.status,
          isLeaveApproved: hasApprovedLeave || existing.status === "LEAVE",
          remarks: existing.remarks || (hasApprovedLeave ? "Leave Approved by Class Teacher" : undefined),
        };
      } else if (hasApprovedLeave) {
        attendanceMap[student.id] = {
          status: "LEAVE",
          isLeaveApproved: true,
          remarks: "Leave Approved by Class Teacher",
        };
      } else {
        // Unmarked -> default to PRESENT
        attendanceMap[student.id] = {
          status: "PRESENT",
          isLeaveApproved: false,
        };
      }
    }

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
