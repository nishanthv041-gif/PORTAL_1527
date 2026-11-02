"use server";

import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import { createAndSendReportCardAction } from "@/backend/lib/services/reportCardActions";

export interface BulkSaveStudentEntry {
  studentId: string;
  marks: Array<{
    subjectId: string;
    score: number;
    maxScore: number;
    passMarks: number;
    remarks?: string;
  }>;
  remarks?: string;
}

export interface BulkSavePayload {
  classId: string;
  examName: string;
  examDate: string;
  students: BulkSaveStudentEntry[];
}

/**
 * Saves verified report card values for all ready students in the class.
 * Never receives, saves, or processes file objects; operates exclusively on
 * teacher-reviewed final values.
 */
export async function bulkSaveReportCardsAction(payload: BulkSavePayload) {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session || (session.user.role !== "TEACHER" && session.user.role !== "ADMIN")) {
      return { success: false, error: "Unauthorized: Teacher access required" };
    }

    const { classId, examName, examDate, students } = payload;
    if (!classId || !examName?.trim() || students.length === 0) {
      return { success: false, error: "Missing required class, exam, or student data." };
    }

    // Verify teacher teaches this class
    if (session.user.role === "TEACHER") {
      const teacher = await prisma.teacher.findUnique({
        where: { userId: session.user.id },
        include: { classes: true, classTeacherOf: true }
      });
      const teachesClass =
        teacher?.classes.some(c => c.id === classId) ||
        teacher?.classTeacherOf?.id === classId;

      if (!teachesClass) {
        return { success: false, error: "Unauthorized: You do not teach or manage this class." };
      }
    }

    let savedCount = 0;
    const errors: string[] = [];
    const savedReportCardIds: string[] = [];

    // Save each student using the existing verified report card transaction
    for (const studentEntry of students) {
      try {
        const res = await createAndSendReportCardAction({
          studentId: studentEntry.studentId,
          classId,
          examName: examName.trim(),
          examDate,
          marks: studentEntry.marks,
          remarks: studentEntry.remarks
        });

        if (res.success && res.reportCardId) {
          savedCount++;
          savedReportCardIds.push(res.reportCardId);
        } else {
          errors.push(`Student (${studentEntry.studentId}): ${res.error || "Save failed"}`);
        }
      } catch (stErr: any) {
        errors.push(`Student (${studentEntry.studentId}): ${stErr?.message || "Transaction error"}`);
      }
    }

    return {
      success: savedCount > 0,
      savedCount,
      errors: errors.length > 0 ? errors : undefined
    };
  } catch (err: any) {
    console.error("Bulk save error:", err);
    return { success: false, error: err?.message || "Internal server error" };
  }
}
