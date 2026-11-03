"use server";

import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import { revalidatePath } from "next/cache";
import { calculateReportCardGrade } from "@/frontend/lib/constants";
import { sendStudentReportCardEmail, ReportCardEmailSubjectMark } from "@/backend/lib/services/emailService";
import { invalidateUserNotifCache } from "@/backend/api/actions/notifications/unifiedNotificationActions";
import { sendUnifiedNotification } from "@/backend/services/notifications/unifiedNotificationEngine";

export interface DispatchSubjectInput {
  subjectId: string;
  subjectName: string;
  score: number | "" | "AB";
  maxScore: number;
  passMarks: number;
  remarks?: string;
  absent?: boolean;
}

export interface SingleStudentDispatchInput {
  studentId: string;
  classId: string;
  examName: string;
  examDate: string; // YYYY-MM-DD
  academicYear?: string;
  attendance?: string;
  generalRemarks?: string;
  subjects: DispatchSubjectInput[];
  revisionReason?: string;
  idempotencyKey?: string;
}

export interface BulkDispatchInput {
  classId: string;
  examName: string;
  examDate: string;
  academicYear?: string;
  students: {
    studentId: string;
    attendance?: string;
    generalRemarks?: string;
    subjects: DispatchSubjectInput[];
    revisionReason?: string;
  }[];
}

export interface DispatchResultItem {
  studentId: string;
  studentName: string;
  rollNumber: string;
  success: boolean;
  error?: string;
  needsRevisionReason?: boolean;
  previousRevision?: number;
  reportCardId?: string;
  examId?: string;
  revision?: number;
  rank?: number;
  parentsNotifiedCount?: number;
  hasLinkedParents?: boolean;
}

export interface BulkDispatchSummary {
  success: boolean;
  examId?: string;
  totalRequested: number;
  dispatchedCount: number;
  failedCount: number;
  skippedCount: number;
  parentsNotifiedCount: number;
  missingParentsCount: number;
  missingParentStudentNames: string[];
  results: DispatchResultItem[];
}

/**
 * Recomputes all totals, percentages, grades, and pass/fail results server-side.
 * Rule: Never trust calculations received from the browser.
 */
function recomputeStudentCriteriaServer(subjects: DispatchSubjectInput[]) {
  let totalMarks = 0;
  let maxTotal = 0;
  let hasFail = false;
  let hasMissing = false;

  const processedSubjects = subjects.map((sub) => {
    const isAbsent = sub.score === "AB" || sub.absent === true;
    const isNumber = typeof sub.score === "number" && !isNaN(sub.score);
    const numericScore: number | null = isNumber ? (sub.score as number) : isAbsent ? 0 : null;

    const maxScore = Math.max(1, Number(sub.maxScore) || 100);
    const passMarks = Math.max(0, Number(sub.passMarks) || 35);
    const isSubjectFail = isAbsent || (numericScore !== null && numericScore < passMarks);

    if (numericScore === null) {
      hasMissing = true;
    } else if (isAbsent) {
      hasFail = true;
    } else {
      totalMarks += numericScore;
      if (numericScore < passMarks) {
        hasFail = true;
      }
    }
    maxTotal += maxScore;

    const percentage = numericScore !== null && maxScore > 0 ? (numericScore / maxScore) * 100 : 0;
    const grade = isAbsent ? "F" : numericScore !== null ? calculateReportCardGrade(percentage, isSubjectFail) : "-";
    const status = isAbsent ? "ABSENT" : numericScore === null ? "NEEDS_REVIEW" : numericScore >= passMarks ? "PASS" : "FAIL";

    return {
      subjectId: sub.subjectId,
      subjectName: sub.subjectName,
      marks: numericScore,
      maxMarks: maxScore,
      passMark: passMarks,
      grade,
      status,
      absent: isAbsent,
      remark: sub.remarks || null,
      isFail: isSubjectFail,
    };
  });

  const percentage = maxTotal > 0 && !hasMissing ? parseFloat(((totalMarks / maxTotal) * 100).toFixed(1)) : 0;
  const overallGrade = hasMissing ? "-" : calculateReportCardGrade(percentage, hasFail);
  const result: "PASS" | "FAIL" = hasFail || hasMissing ? "FAIL" : "PASS";

  return {
    totalMarks,
    maxTotal,
    percentage,
    overallGrade,
    result,
    hasMissing,
    processedSubjects,
  };
}

/**
 * Recomputes and updates ranks for all report cards belonging to an exam.
 * Tied totals share the same rank.
 */
async function updateExamRanks(examId: string) {
  try {
    const allCards = await prisma.reportCard.findMany({
      where: { examId, published: true },
      select: { id: true, totalMarks: true },
      orderBy: { totalMarks: "desc" },
    });

    if (allCards.length === 0) return;

    let currentRank = 1;
    let previousScore: number | null = null;
    let sameScoreCount = 0;

    for (let i = 0; i < allCards.length; i++) {
      const card = allCards[i];
      if (previousScore !== null && card.totalMarks === previousScore) {
        sameScoreCount++;
      } else {
        currentRank = i + 1;
        sameScoreCount = 0;
        previousScore = card.totalMarks;
      }

      await prisma.reportCard.update({
        where: { id: card.id },
        data: { rank: currentRank },
      });
    }
  } catch (rankErr) {
    console.warn("[updateExamRanks] Non-fatal rank computation error:", rankErr);
  }
}

/**
 * Checks authorization for the active user.
 * Must be admin or teacher assigned to the class.
 */
async function verifyTeacherClassPermission(userId: string, role: string, classId: string) {
  if (role === "ADMIN") return { authorized: true, teacherId: null };

  if (role !== "TEACHER") {
    return { authorized: false, error: "Only teachers or administrators can dispatch report cards." };
  }

  const teacher = await prisma.teacher.findUnique({
    where: { userId },
    include: { classes: true, classTeacherOf: true },
  });

  if (!teacher) {
    return { authorized: false, error: "Teacher profile not found." };
  }

  const isClassTeacher = teacher.classTeacherOf?.id === classId;
  const isSubjectTeacher = teacher.classes.some((c) => c.id === classId);

  if (!isClassTeacher && !isSubjectTeacher) {
    return { authorized: false, error: "You are not authorized to dispatch report cards for this class." };
  }

  return { authorized: true, teacherId: teacher.id };
}

/**
 * Dispatches a single student's report card in its own transaction.
 */
export async function dispatchSingleStudentReportCardAction(
  input: SingleStudentDispatchInput
): Promise<DispatchResultItem> {
  const session = await getServerSession(getAuthOptions());
  if (!session) {
    return { studentId: input.studentId, studentName: "", rollNumber: "", success: false, error: "Unauthorized" };
  }

  const { authorized, teacherId, error: authError } = await verifyTeacherClassPermission(
    session.user.id,
    session.user.role,
    input.classId
  );
  if (!authorized) {
    return { studentId: input.studentId, studentName: "", rollNumber: "", success: false, error: authError };
  }

  if (!input.studentId || !input.classId || !input.examName?.trim() || !input.examDate) {
    return {
      studentId: input.studentId,
      studentName: "",
      rollNumber: "",
      success: false,
      error: "Missing required fields (student, class, exam name, or exam date).",
    };
  }

  // 1. Fetch student and verify enrollment
  const student = await prisma.student.findUnique({
    where: { id: input.studentId },
    include: {
      class: true,
      parents: {
        include: {
          parent: {
            include: {
              user: { select: { id: true, name: true, email: true } },
            },
          },
        },
      },
    },
  });

  if (!student || student.classId !== input.classId) {
    return {
      studentId: input.studentId,
      studentName: "",
      rollNumber: "",
      success: false,
      error: "Student is not enrolled in the specified class.",
    };
  }

  const studentName = `${student.firstName} ${student.lastName}`.trim();
  const rollNumber = student.rollNumber;

  // 2. Server-side validation of marks and recalculation
  if (!input.subjects || input.subjects.length === 0) {
    return {
      studentId: input.studentId,
      studentName,
      rollNumber,
      success: false,
      error: "No subjects provided for student.",
    };
  }

  for (const sub of input.subjects) {
    if (typeof sub.score === "number") {
      if (sub.score < 0 || sub.score > (sub.maxScore || 100)) {
        return {
          studentId: input.studentId,
          studentName,
          rollNumber,
          success: false,
          error: `Invalid mark ${sub.score} for subject "${sub.subjectName}". Must be between 0 and ${sub.maxScore}.`,
        };
      }
    } else if (sub.score !== "AB" && !sub.absent) {
      return {
        studentId: input.studentId,
        studentName,
        rollNumber,
        success: false,
        error: `Missing mark for subject "${sub.subjectName}". Mark must not be empty.`,
      };
    }
  }

  const criteria = recomputeStudentCriteriaServer(input.subjects);
  if (criteria.hasMissing) {
    return {
      studentId: input.studentId,
      studentName,
      rollNumber,
      success: false,
      error: "One or more subjects have missing marks. All marks must be reviewed.",
    };
  }

  const trimmedExamName = input.examName.trim();
  const normalizedExamName = trimmedExamName.toLowerCase();
  const parsedDate = new Date(input.examDate);
  const examDate = isNaN(parsedDate.getTime()) ? new Date() : parsedDate;

  try {
    // A. Find or create Exam
    let exam = await prisma.exam.findFirst({
      where: {
        classId: input.classId,
        name: { equals: trimmedExamName, mode: "insensitive" },
      },
    });

    if (!exam) {
      exam = await prisma.exam.create({
        data: {
          name: trimmedExamName,
          normalizedName: normalizedExamName,
          date: examDate,
          classId: input.classId,
          isPublished: true,
          status: "PUBLISHED",
          dispatchedByStaffId: teacherId,
          dispatchedAt: new Date(),
        },
      });
    } else {
      await prisma.exam.update({
        where: { id: exam.id },
        data: {
          date: examDate,
          isPublished: true,
          status: "PUBLISHED",
          dispatchedByStaffId: teacherId || exam.dispatchedByStaffId,
          dispatchedAt: new Date(),
        },
      });
    }

    // B. Check for existing dispatched report card (Revision flow)
    const existing = await prisma.reportCard.findUnique({
      where: {
        studentId_examId: {
          studentId: input.studentId,
          examId: exam.id,
        },
      },
      include: {
        subjectMarks: true,
      },
    });

    let revision = 1;
    let isRevisionUpdate = false;

    if (existing && existing.published) {
      if (!input.revisionReason?.trim()) {
        return {
          studentId: input.studentId,
          studentName,
          rollNumber,
          success: false,
          needsRevisionReason: true,
          previousRevision: existing.revision || 1,
          examId: exam.id,
          error: "This student already has a dispatched report card for this exam. A revision reason is required to update it.",
        };
      }

      revision = (existing.revision || 1) + 1;
      isRevisionUpdate = true;
    }

    // C. Single atomic nested upsert for ReportCard and ReportCardSubject
    const subjectData = criteria.processedSubjects.map((sub) => ({
      subjectId: sub.subjectId || null,
      subjectName: sub.subjectName,
      marks: sub.marks,
      maxMarks: sub.maxMarks,
      passMark: sub.passMark,
      grade: sub.grade,
      status: sub.status,
      absent: sub.absent,
      remark: sub.remark,
    }));

    const reportCard = await prisma.reportCard.upsert({
      where: {
        studentId_examId: {
          studentId: input.studentId,
          examId: exam.id,
        },
      },
      update: {
        totalMarks: criteria.totalMarks,
        maxTotal: criteria.maxTotal,
        percentage: criteria.percentage,
        grade: criteria.overallGrade,
        overallGrade: criteria.overallGrade,
        result: criteria.result,
        attendance: input.attendance?.trim() || null,
        remarks: input.generalRemarks?.trim() || null,
        revision,
        published: true,
        dispatchedAt: new Date(),
        parentVerified: false,
        notifyStatus: "PENDING",
        subjectMarks: {
          deleteMany: {},
          create: subjectData,
        },
      },
      create: {
        studentId: input.studentId,
        examId: exam.id,
        totalMarks: criteria.totalMarks,
        maxTotal: criteria.maxTotal,
        percentage: criteria.percentage,
        grade: criteria.overallGrade,
        overallGrade: criteria.overallGrade,
        result: criteria.result,
        attendance: input.attendance?.trim() || null,
        remarks: input.generalRemarks?.trim() || null,
        revision: 1,
        published: true,
        dispatchedAt: new Date(),
        parentVerified: false,
        notifyStatus: "PENDING",
        subjectMarks: {
          create: subjectData,
        },
      },
    });

    // D. Sync standard Mark table if subjectId is a valid DB subject
    const markPromises = criteria.processedSubjects
      .filter((sub) => !!sub.subjectId)
      .map((sub) =>
        prisma.mark.upsert({
          where: {
            studentId_examId_subjectId: {
              studentId: input.studentId,
              examId: exam.id,
              subjectId: sub.subjectId!,
            },
          },
          update: {
            score: sub.marks !== null ? sub.marks : 0,
            maxScore: sub.maxMarks,
            marksObtained: sub.marks,
            isAbsent: sub.absent,
            remarks: sub.remark,
          },
          create: {
            studentId: input.studentId,
            examId: exam.id,
            subjectId: sub.subjectId!,
            score: sub.marks !== null ? sub.marks : 0,
            maxScore: sub.maxMarks,
            marksObtained: sub.marks,
            isAbsent: sub.absent,
            remarks: sub.remark,
            enteredByStaffId: teacherId,
          },
        }).catch((mErr) => console.warn("[MarkSync] Error syncing mark:", mErr))
      );

    if (markPromises.length > 0) {
      await Promise.allSettled(markPromises);
    }

    // E. If revision, write audit log
    if (isRevisionUpdate && existing) {
      await prisma.reportCardAuditLog.create({
        data: {
          reportCardId: reportCard.id,
          revision,
          changedBy: session.user.id,
          changedByName: session.user.name || "Teacher",
          reason: input.revisionReason?.trim() || "Marks updated",
          oldValues: {
            totalMarks: existing.totalMarks,
            percentage: existing.percentage,
            grade: existing.grade,
            result: existing.result,
            remarks: existing.remarks,
          },
          newValues: {
            totalMarks: criteria.totalMarks,
            percentage: criteria.percentage,
            grade: criteria.overallGrade,
            result: criteria.result,
            remarks: input.generalRemarks?.trim() || null,
          },
        },
      }).catch((logErr) => console.warn("[AuditLog] Error logging revision:", logErr));
    }

    // F. Recalculate ranks across the class for this exam
    await updateExamRanks(exam.id);

    // G. Update exam student count
    const totalStudentsCount = await prisma.reportCard.count({
      where: { examId: exam.id, published: true },
    });
    await prisma.exam.update({
      where: { id: exam.id },
      data: { studentCount: totalStudentsCount },
    }).catch((eErr) => console.warn("[ExamCount] Error updating count:", eErr));

    // 3. Deliver parent notifications outside transaction
    const linkedParents = student.parents || [];
    let notifiedParentsCount = 0;

    for (const p of linkedParents) {
      const parentUser = p.parent?.user;
      if (!parentUser) continue;

      try {
        await sendUnifiedNotification({
          userId: parentUser.id,
          title: `Report card available: ${trimmedExamName}`,
          content: `The official report card for ${studentName} (${rollNumber}) has been dispatched for ${trimmedExamName}. Total: ${criteria.totalMarks}/${criteria.maxTotal} (${criteria.percentage}% - Grade ${criteria.overallGrade}).`,
          type: "REPORT_CARD",
          category: "academic",
          link: "/dashboard/parent/report-cards",
          priority: "NORMAL",
        });
        notifiedParentsCount++;

        // Send email notification if parent has a valid email
        if (parentUser.email && parentUser.email.includes("@")) {
          const emailSubjectMarks: ReportCardEmailSubjectMark[] = criteria.processedSubjects.map((s) => ({
            subjectName: s.subjectName,
            score: s.marks || 0,
            maxScore: s.maxMarks,
            isFail: s.isFail,
            remarks: s.remark || undefined,
          }));

          sendStudentReportCardEmail({
            parentEmail: parentUser.email,
            parentName: parentUser.name || "Parent",
            studentName,
            rollNumber,
            className: student.class ? `${student.class.name} - ${student.class.section}` : "Class",
            examName: trimmedExamName,
            totalScore: criteria.totalMarks,
            maxTotal: criteria.maxTotal,
            percentage: criteria.percentage.toString(),
            grade: criteria.overallGrade,
            subjectMarks: emailSubjectMarks,
            reportCardUrl: `https://nipoportal.vercel.app/dashboard/parent/report-cards`,
            ccAdmin: false,
          }).catch((err) => console.warn("[EmailDispatch] Non-blocking parent email error:", err));
        }
      } catch (notifErr) {
        console.error("[Notification] Failed to notify parent:", notifErr);
      }
    }

    if (notifiedParentsCount > 0) {
      await prisma.reportCard.update({
        where: { id: reportCard.id },
        data: {
          parentNotifiedAt: new Date(),
          notifyStatus: "SENT",
        },
      }).catch((uErr) => console.warn("[ReportCardUpdate] Error updating parentNotifiedAt:", uErr));
    }

    // Fetch updated rank
    const updatedCard = await prisma.reportCard.findUnique({
      where: { id: reportCard.id },
      select: { rank: true },
    });

    revalidatePath("/dashboard/teacher/report-cards");
    revalidatePath("/dashboard/parent/report-cards");
    revalidatePath("/dashboard/admin/report-cards");

    return {
      studentId: input.studentId,
      studentName,
      rollNumber,
      success: true,
      reportCardId: reportCard.id,
      examId: exam.id,
      revision,
      rank: updatedCard?.rank || undefined,
      parentsNotifiedCount: notifiedParentsCount,
      hasLinkedParents: linkedParents.length > 0,
    };
  } catch (err: any) {
    console.error("[DispatchSingleStudent] Database error:", err);
    return {
      studentId: input.studentId,
      studentName,
      rollNumber,
      success: false,
      error: err.message || "Failed to dispatch report card due to server error.",
    };
  }
}

/**
 * Dispatches multiple ready students.
 * Each student is processed in its OWN transaction so that 1 failing student does NOT block others.
 */
export async function dispatchBulkReadyStudentsAction(
  input: BulkDispatchInput
): Promise<BulkDispatchSummary> {
  const session = await getServerSession(getAuthOptions());
  if (!session) {
    return {
      success: false,
      totalRequested: input.students.length,
      dispatchedCount: 0,
      failedCount: input.students.length,
      skippedCount: 0,
      parentsNotifiedCount: 0,
      missingParentsCount: 0,
      missingParentStudentNames: [],
      results: [],
    };
  }

  const results: DispatchResultItem[] = [];
  let dispatchedCount = 0;
  let failedCount = 0;
  let skippedCount = 0;
  let parentsNotifiedCount = 0;
  const missingParentStudentNames: string[] = [];

  for (const st of input.students) {
    const singleResult = await dispatchSingleStudentReportCardAction({
      studentId: st.studentId,
      classId: input.classId,
      examName: input.examName,
      examDate: input.examDate,
      academicYear: input.academicYear,
      attendance: st.attendance,
      generalRemarks: st.generalRemarks,
      subjects: st.subjects,
      revisionReason: st.revisionReason,
    });

    results.push(singleResult);

    if (singleResult.success) {
      dispatchedCount++;
      parentsNotifiedCount += singleResult.parentsNotifiedCount || 0;
      if (!singleResult.hasLinkedParents) {
        missingParentStudentNames.push(singleResult.studentName || st.studentId);
      }
    } else if (singleResult.needsRevisionReason) {
      skippedCount++;
    } else {
      failedCount++;
    }
  }

  // Get exam ID for export URLs
  let examId: string | undefined;
  if (dispatchedCount > 0) {
    const exam = await prisma.exam.findFirst({
      where: {
        classId: input.classId,
        name: { equals: input.examName.trim(), mode: "insensitive" },
      },
      select: { id: true },
    });
    examId = exam?.id;
  }

  return {
    success: dispatchedCount > 0,
    examId,
    totalRequested: input.students.length,
    dispatchedCount,
    failedCount,
    skippedCount,
    parentsNotifiedCount,
    missingParentsCount: missingParentStudentNames.length,
    missingParentStudentNames,
    results,
  };
}

/**
 * Checks which students already have a dispatched report card for this exam.
 */
export async function checkExistingDispatchesAction(params: {
  classId: string;
  examName: string;
  studentIds: string[];
}): Promise<Record<string, { isDispatched: boolean; revision: number; totalMarks?: number; grade?: string }>> {
  if (!params.classId || !params.examName?.trim() || params.studentIds.length === 0) {
    return {};
  }

  const exam = await prisma.exam.findFirst({
    where: {
      classId: params.classId,
      name: { equals: params.examName.trim(), mode: "insensitive" },
    },
    select: { id: true },
  });

  if (!exam) return {};

  const reportCards = await prisma.reportCard.findMany({
    where: {
      examId: exam.id,
      studentId: { in: params.studentIds },
      published: true,
    },
    select: {
      studentId: true,
      revision: true,
      totalMarks: true,
      grade: true,
    },
  });

  const record: Record<string, { isDispatched: boolean; revision: number; totalMarks?: number; grade?: string }> = {};
  reportCards.forEach((rc) => {
    record[rc.studentId] = {
      isDispatched: true,
      revision: rc.revision,
      totalMarks: rc.totalMarks,
      grade: rc.grade,
    };
  });

  return record;
}
