"use server";

import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import { createAndSendReportCardAction } from "@/backend/lib/services/reportCardActions";

export interface RecordUploadAuditPayload {
  classId: string;
  fileName: string;
  fileSize: number;
  examName: string;
  status: "EXTRACTED" | "FAILED" | "PENDING";
  fileUrl?: string;
  studentCount: number;
  subjectCount: number;
}

export async function recordReportCardUploadAudit(payload: RecordUploadAuditPayload) {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session || (session.user.role !== "TEACHER" && session.user.role !== "ADMIN")) {
      return { success: false, error: "Unauthorized" };
    }

    const audit = await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: "REPORT_CARD_DOCUMENT_UPLOAD",
        targetModel: "ReportCardUpload",
        targetId: payload.classId,
        details: JSON.stringify({
          fileName: payload.fileName,
          fileSize: payload.fileSize,
          fileUrl: payload.fileUrl || null,
          uploadedBy: session.user.name || session.user.email,
          examName: payload.examName,
          status: payload.status,
          studentCount: payload.studentCount,
          subjectCount: payload.subjectCount,
          createdAt: new Date().toISOString()
        })
      }
    });

    return { success: true, auditId: audit.id };
  } catch (err: any) {
    console.error("Failed to record upload audit:", err);
    return { success: false, error: err?.message || "Audit error" };
  }
}

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

    // Record audit of batch save
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: "REPORT_CARD_BULK_SAVE",
        targetModel: "ReportCard",
        targetId: classId,
        details: JSON.stringify({
          examName: examName.trim(),
          savedCount,
          totalAttempted: students.length,
          errorsCount: errors.length,
          savedReportCardIds
        })
      }
    });

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
