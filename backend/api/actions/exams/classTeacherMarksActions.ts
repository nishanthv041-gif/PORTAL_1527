"use server";

import { prisma } from "@/backend/db/prisma";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";

/**
 * Helper to authenticate Class Teacher or Admin
 */
async function getAuthClassTeacherOrAdmin(classId?: string) {
  const session = await getServerSession(getAuthOptions());
  if (!session || !session.user) {
    throw new Error("Unauthorized. Please log in.");
  }

  const role = (session.user.role || "").toUpperCase();
  const isAdmin = role === "ADMIN";

  const teacher = await prisma.teacher.findUnique({
    where: { userId: session.user.id },
    include: {
      user: true,
      classTeacherOf: true,
    },
  });

  if (!isAdmin && !teacher) {
    throw new Error("Teacher profile not found.");
  }

  // If a classId is provided, verify ownership
  if (!isAdmin && classId) {
    const isClassTeacher = teacher?.classTeacherOf?.id === classId;
    if (!isClassTeacher) {
      // Also check if assigned via Class.classTeacherId directly
      const cls = await prisma.class.findUnique({
        where: { id: classId },
        select: { classTeacherId: true },
      });
      if (cls?.classTeacherId !== teacher?.id) {
        throw new Error("Access denied. Only the assigned Class Teacher can access or verify all marks for this class.");
      }
    }
  }

  return { session, role, isAdmin, teacher };
}

/**
 * 1. Fetch Consolidated Marks Grid for Class Teacher
 */
export async function getClassTeacherExamMarksGridAction(examId: string) {
  try {
    const exam = await prisma.exam.findUnique({
      where: { id: examId },
      include: {
        class: {
          include: {
            classTeacher: {
              include: { user: true },
            },
          },
        },
        academicYear: true,
        examSubjects: {
          include: {
            subject: true,
            teacher: {
              include: { user: true },
            },
            marks: {
              include: {
                student: true,
              },
            },
          },
          orderBy: { subject: { name: "asc" } },
        },
      },
    });

    if (!exam) {
      return { success: false, error: "Exam record not found." };
    }

    // Role check: Only Class Teacher of this class or Admin
    await getAuthClassTeacherOrAdmin(exam.classId);

    // Fetch all active students of this class, sorted by roll number
    const students = await prisma.student.findMany({
      where: {
        classId: exam.classId,
        isActive: true,
      },
      select: {
        id: true,
        rollNumber: true,
        admissionNo: true,
        firstName: true,
        lastName: true,
      },
      orderBy: [
        { rollNumber: "asc" },
        { firstName: "asc" },
      ],
    });

    // Create a map of examSubjectId -> studentId -> mark
    const subjectMarksMap = new Map<string, Map<string, any>>();
    for (const es of exam.examSubjects) {
      const studentMap = new Map<string, any>();
      for (const m of es.marks) {
        studentMap.set(m.studentId, m);
      }
      subjectMarksMap.set(es.id, studentMap);
    }

    // Compute student aggregate marks
    let totalMaxMarks = 0;
    for (const es of exam.examSubjects) {
      totalMaxMarks += es.maxMarks;
    }

    interface StudentRow {
      studentId: string;
      rollNumber: string;
      admissionNo: string;
      fullName: string;
      subjectScores: Record<string, {
        markId?: string;
        marksObtained: number | null;
        isAbsent: boolean;
        remark?: string | null;
        isPass: boolean;
        isHighest: boolean;
        isMissing: boolean;
      }>;
      totalObtained: number;
      percentage: number;
      result: "PASS" | "FAIL";
      rank: number;
      hasMissingMarks: boolean;
      hasFailedSubjects: boolean;
    }

    const rows: StudentRow[] = [];

    for (const s of students) {
      let totalObtained = 0;
      let hasFailed = false;
      let hasMissing = false;
      const subjectScores: StudentRow["subjectScores"] = {};

      for (const es of exam.examSubjects) {
        const mark = subjectMarksMap.get(es.id)?.get(s.id);
        const isAbsent = Boolean(mark?.isAbsent);
        const marksObtained = mark?.marksObtained ?? (mark?.score && !isAbsent ? mark.score : null);

        const isMissing = !isAbsent && (marksObtained === null || marksObtained === undefined);
        if (isMissing) {
          hasMissing = true;
        }

        const scoreVal = isAbsent ? 0 : (marksObtained ?? 0);
        totalObtained += scoreVal;

        const isPass = !isAbsent && marksObtained !== null && marksObtained >= es.passMark;
        if (!isPass) {
          hasFailed = true;
        }

        subjectScores[es.id] = {
          markId: mark?.id,
          marksObtained,
          isAbsent,
          remark: mark?.remark || mark?.remarks || null,
          isPass,
          isHighest: false, // Calculated in pass 2
          isMissing,
        };
      }

      const percentage = totalMaxMarks > 0
        ? Math.round((totalObtained / totalMaxMarks) * 10000) / 100
        : 0;

      rows.push({
        studentId: s.id,
        rollNumber: s.rollNumber,
        admissionNo: s.admissionNo,
        fullName: `${s.firstName} ${s.lastName}`.trim(),
        subjectScores,
        totalObtained,
        percentage,
        result: !hasFailed && !hasMissing ? "PASS" : "FAIL",
        rank: 0,
        hasMissingMarks: hasMissing,
        hasFailedSubjects: hasFailed,
      });
    }

    // Assign Ranks (sorted by percentage desc)
    const sorted = [...rows].sort((a, b) => b.percentage - a.percentage);
    sorted.forEach((row, idx) => {
      row.rank = idx + 1;
    });

    // Subject Statistics & Highest Scorer detection
    const subjectStats: Record<string, {
      average: number;
      highest: number;
      lowest: number;
      passPercentage: number;
      submittedCount: number;
      absentCount: number;
    }> = {};

    for (const es of exam.examSubjects) {
      let sum = 0;
      let highest = -1;
      let lowest = 999999;
      let passCount = 0;
      let validCount = 0;
      let absentCount = 0;
      let highestStudentId = "";

      for (const r of rows) {
        const sc = r.subjectScores[es.id];
        if (sc?.isAbsent) {
          absentCount++;
        } else if (sc?.marksObtained !== null && sc?.marksObtained !== undefined) {
          const val = sc.marksObtained;
          sum += val;
          validCount++;
          if (val > highest) {
            highest = val;
            highestStudentId = r.studentId;
          }
          if (val < lowest) {
            lowest = val;
          }
          if (val >= es.passMark) {
            passCount++;
          }
        }
      }

      // Mark the highest student
      if (highestStudentId) {
        const targetRow = rows.find((r) => r.studentId === highestStudentId);
        if (targetRow && targetRow.subjectScores[es.id]) {
          targetRow.subjectScores[es.id].isHighest = true;
        }
      }

      subjectStats[es.id] = {
        average: validCount > 0 ? Math.round((sum / validCount) * 10) / 10 : 0,
        highest: highest >= 0 ? highest : 0,
        lowest: lowest <= es.maxMarks ? lowest : 0,
        passPercentage: validCount > 0 ? Math.round((passCount / validCount) * 100) : 0,
        submittedCount: validCount,
        absentCount,
      };
    }

    // Counts for progress bar
    const totalSubjects = exam.examSubjects.length;
    const submittedCount = exam.examSubjects.filter((es) => es.status === "SUBMITTED").length;
    const verifiedCount = exam.examSubjects.filter((es) => es.status === "VERIFIED").length;
    const returnedCount = exam.examSubjects.filter((es) => es.status === "RETURNED").length;
    const pendingCount = exam.examSubjects.filter((es) => es.status === "PENDING" || es.status === "DRAFT").length;

    const canPublish = verifiedCount === totalSubjects && totalSubjects > 0;

    return {
      success: true,
      exam: {
        id: exam.id,
        name: exam.name,
        date: exam.date.toISOString(),
        status: exam.status, // MARKS_IN_PROGRESS | SUBMITTED | VERIFIED | PUBLISHED
        isPublished: exam.isPublished,
        classId: exam.classId,
        className: exam.class.name,
        section: exam.class.section,
        classTeacherName: exam.class.classTeacher?.user.name || "Unassigned",
        totalMaxMarks,
        totalSubjects,
        submittedCount,
        verifiedCount,
        returnedCount,
        pendingCount,
        canPublish,
      },
      subjects: exam.examSubjects.map((es) => ({
        id: es.id,
        subjectId: es.subjectId,
        subjectName: es.subject.name,
        subjectCode: es.subject.code,
        teacherId: es.teacherId,
        teacherName: es.teacher?.user.name || "Unassigned",
        maxMarks: es.maxMarks,
        passMark: es.passMark,
        status: es.status,
        submittedAt: es.submittedAt?.toISOString() || null,
        verifiedAt: es.verifiedAt?.toISOString() || null,
        returnRemark: es.returnRemark || null,
        stats: subjectStats[es.id],
      })),
      rows,
    };
  } catch (error: unknown) {
    console.error("getClassTeacherExamMarksGridAction error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to load marks review grid.",
    };
  }
}

/**
 * 2. Class Teacher Verifies Subject Marks
 */
export async function verifySubjectMarksAction(examSubjectId: string) {
  try {
    const examSubject = await prisma.examSubject.findUnique({
      where: { id: examSubjectId },
      include: {
        exam: {
          include: {
            class: true,
            examSubjects: true,
          },
        },
        subject: true,
        teacher: { include: { user: true } },
      },
    });

    if (!examSubject) {
      return { success: false, error: "Subject task not found." };
    }

    const { session, teacher } = await getAuthClassTeacherOrAdmin(examSubject.exam.classId);

    if (examSubject.status !== "SUBMITTED" && examSubject.status !== "RETURNED") {
      return {
        success: false,
        error: `Cannot verify subject with status ${examSubject.status}. Only SUBMITTED subjects can be verified.`,
      };
    }

    await prisma.$transaction(async (tx) => {
      // 1. Mark ExamSubject VERIFIED
      await tx.examSubject.update({
        where: { id: examSubjectId },
        data: {
          status: "VERIFIED",
          verifiedAt: new Date(),
          returnRemark: null,
        },
      });

      // 2. Check if all subjects in exam are now VERIFIED
      const allSubjects = await tx.examSubject.findMany({
        where: { examId: examSubject.examId },
      });

      const allVerified = allSubjects.every(
        (s) => s.id === examSubjectId || s.status === "VERIFIED"
      );

      if (allVerified) {
        await tx.exam.update({
          where: { id: examSubject.examId },
          data: { status: "VERIFIED" },
        });
      }

      // 3. Notify Subject Teacher
      if (examSubject.teacher?.user.id) {
        const verifierName = teacher?.user.name || session.user.name || "Class Teacher";
        await tx.notification.create({
          data: {
            userId: examSubject.teacher.user.id,
            title: `Marks Verified: ${examSubject.subject.name}`,
            content: `${verifierName} has verified marks for ${examSubject.subject.name} in ${examSubject.exam.name}.`,
            type: "EXAM",
            category: "ACADEMIC",
            priority: "NORMAL",
            link: `/dashboard/teacher/exams/tasks/${examSubject.id}`,
          },
        }).catch(() => {});
      }
    });

    revalidatePath(`/dashboard/teacher/exams/${examSubject.examId}/review`);
    revalidatePath(`/dashboard/teacher/exams/tasks/${examSubjectId}`);
    revalidatePath(`/dashboard/teacher/report-cards`);

    return { success: true };
  } catch (error: unknown) {
    console.error("verifySubjectMarksAction error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to verify subject marks.",
    };
  }
}

/**
 * 3. Class Teacher Returns Subject Marks to Subject Teacher
 */
export async function returnSubjectMarksAction(examSubjectId: string, reason: string) {
  try {
    if (!reason || !reason.trim()) {
      return { success: false, error: "Please provide a reason for returning marks." };
    }

    const examSubject = await prisma.examSubject.findUnique({
      where: { id: examSubjectId },
      include: {
        exam: {
          include: {
            class: true,
          },
        },
        subject: true,
        teacher: { include: { user: true } },
      },
    });

    if (!examSubject) {
      return { success: false, error: "Subject task not found." };
    }

    const { session, teacher } = await getAuthClassTeacherOrAdmin(examSubject.exam.classId);

    await prisma.$transaction(async (tx) => {
      // 1. Mark ExamSubject RETURNED
      await tx.examSubject.update({
        where: { id: examSubjectId },
        data: {
          status: "RETURNED",
          returnRemark: reason.trim(),
        },
      });

      // 2. Revert Exam status to MARKS_IN_PROGRESS if previously SUBMITTED or VERIFIED
      await tx.exam.update({
        where: { id: examSubject.examId },
        data: { status: "MARKS_IN_PROGRESS" },
      });

      // 3. Notify Subject Teacher
      if (examSubject.teacher?.user.id) {
        const returnerName = teacher?.user.name || session.user.name || "Class Teacher";
        await tx.notification.create({
          data: {
            userId: examSubject.teacher.user.id,
            title: `Marks Returned for Revision: ${examSubject.subject.name}`,
            content: `${returnerName} returned marks for ${examSubject.subject.name} in ${examSubject.exam.name}. Reason: "${reason.trim()}". Please update and resubmit.`,
            type: "EXAM",
            category: "ACADEMIC",
            priority: "HIGH",
            link: `/dashboard/teacher/exams/tasks/${examSubject.id}`,
          },
        }).catch(() => {});
      }
    });

    revalidatePath(`/dashboard/teacher/exams/${examSubject.examId}/review`);
    revalidatePath(`/dashboard/teacher/exams/tasks/${examSubjectId}`);
    revalidatePath(`/dashboard/teacher/report-cards`);

    return { success: true };
  } catch (error: unknown) {
    console.error("returnSubjectMarksAction error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to return subject marks.",
    };
  }
}

/**
 * 4. Bulk Verify All Submitted Subjects
 */
export async function bulkVerifyAllSubmittedSubjectsAction(examId: string) {
  try {
    const exam = await prisma.exam.findUnique({
      where: { id: examId },
      include: {
        examSubjects: {
          include: {
            subject: true,
            teacher: { include: { user: true } },
          },
        },
      },
    });

    if (!exam) {
      return { success: false, error: "Exam not found." };
    }

    const { session, teacher } = await getAuthClassTeacherOrAdmin(exam.classId);

    const submittedSubjects = exam.examSubjects.filter((es) => es.status === "SUBMITTED");
    if (submittedSubjects.length === 0) {
      return { success: false, error: "No subjects are currently awaiting verification." };
    }

    await prisma.$transaction(async (tx) => {
      // 1. Verify all submitted subjects
      for (const es of submittedSubjects) {
        await tx.examSubject.update({
          where: { id: es.id },
          data: {
            status: "VERIFIED",
            verifiedAt: new Date(),
            returnRemark: null,
          },
        });

        // Notify each teacher
        if (es.teacher?.user.id) {
          const verifierName = teacher?.user.name || session.user.name || "Class Teacher";
          await tx.notification.create({
            data: {
              userId: es.teacher.user.id,
              title: `Marks Verified: ${es.subject.name}`,
              content: `${verifierName} has verified marks for ${es.subject.name} in ${exam.name}.`,
              type: "EXAM",
              category: "ACADEMIC",
              priority: "NORMAL",
              link: `/dashboard/teacher/exams/tasks/${es.id}`,
            },
          }).catch(() => {});
        }
      }

      // 2. Check if all subjects in exam are now verified
      const allSubjects = await tx.examSubject.findMany({
        where: { examId },
      });

      const allVerified = allSubjects.every(
        (s) => s.status === "VERIFIED" || submittedSubjects.some((sub) => sub.id === s.id)
      );

      if (allVerified) {
        await tx.exam.update({
          where: { id: examId },
          data: { status: "VERIFIED" },
        });
      }
    });

    revalidatePath(`/dashboard/teacher/exams/${examId}/review`);
    revalidatePath(`/dashboard/teacher/report-cards`);

    return { success: true, count: submittedSubjects.length };
  } catch (error: unknown) {
    console.error("bulkVerifyAllSubmittedSubjectsAction error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to bulk verify subjects.",
    };
  }
}

/**
 * 5. Update Single Mark with Mandatory Audit Reason
 */
export async function updateSingleMarkAuditAction(input: {
  examSubjectId: string;
  studentId: string;
  newScore: number | null;
  isAbsent: boolean;
  reason: string;
}) {
  try {
    if (!input.reason || !input.reason.trim()) {
      return { success: false, error: "A valid reason is required to correct a student's marks." };
    }

    const examSubject = await prisma.examSubject.findUnique({
      where: { id: input.examSubjectId },
      include: { exam: true },
    });

    if (!examSubject) {
      return { success: false, error: "Exam subject not found." };
    }

    const { session, teacher } = await getAuthClassTeacherOrAdmin(examSubject.exam.classId);

    const isAbsent = Boolean(input.isAbsent);
    const validMarks = isAbsent ? null : Math.min(examSubject.maxMarks, Math.max(0, Number(input.newScore ?? 0)));

    await prisma.$transaction(async (tx) => {
      // Find existing mark
      const existing = await tx.mark.findUnique({
        where: {
          studentId_examId_subjectId: {
            studentId: input.studentId,
            examId: examSubject.examId,
            subjectId: examSubject.subjectId,
          },
        },
      });

      const updated = await tx.mark.upsert({
        where: {
          studentId_examId_subjectId: {
            studentId: input.studentId,
            examId: examSubject.examId,
            subjectId: examSubject.subjectId,
          },
        },
        create: {
          examSubjectId: examSubject.id,
          studentId: input.studentId,
          examId: examSubject.examId,
          subjectId: examSubject.subjectId,
          marksObtained: validMarks,
          score: validMarks ?? 0,
          maxScore: examSubject.maxMarks,
          isAbsent,
          remark: input.reason.trim(),
          remarks: input.reason.trim(),
          enteredByStaffId: teacher?.id || null,
        },
        update: {
          marksObtained: validMarks,
          score: validMarks ?? 0,
          maxScore: examSubject.maxMarks,
          isAbsent,
          remark: input.reason.trim(),
          remarks: input.reason.trim(),
        },
      });

      // Write to MarkAuditLog
      await tx.markAuditLog.create({
        data: {
          markId: updated.id,
          examSubjectId: examSubject.id,
          studentId: input.studentId,
          oldValue: existing?.marksObtained ?? null,
          newValue: validMarks,
          changedBy: session.user.id,
          reason: input.reason.trim(),
        },
      });
    });

    revalidatePath(`/dashboard/teacher/exams/${examSubject.examId}/review`);
    return { success: true };
  } catch (error: unknown) {
    console.error("updateSingleMarkAuditAction error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update mark.",
    };
  }
}

/**
 * 6. Publish Exam to Report Cards (Auto-fills ReportCard records & notifies parents)
 */
export async function publishExamToReportCardsAction(examId: string) {
  try {
    const exam = await prisma.exam.findUnique({
      where: { id: examId },
      include: {
        class: true,
        examSubjects: {
          include: {
            marks: true,
          },
        },
      },
    });

    if (!exam) {
      return { success: false, error: "Exam not found." };
    }

    await getAuthClassTeacherOrAdmin(exam.classId);

    // Validate that ALL subjects are verified
    const allVerified = exam.examSubjects.every((es) => es.status === "VERIFIED");
    if (!allVerified || exam.examSubjects.length === 0) {
      return {
        success: false,
        error: "All subjects must be verified before the exam can be published to report cards.",
      };
    }

    // Fetch active students of class
    const students = await prisma.student.findMany({
      where: { classId: exam.classId, isActive: true },
      include: {
        parents: {
          include: {
            parent: {
              include: { user: true },
            },
          },
        },
      },
    });

    let totalMaxMarks = 0;
    for (const es of exam.examSubjects) {
      totalMaxMarks += es.maxMarks;
    }

    await prisma.$transaction(async (tx) => {
      // 1. Mark Exam as PUBLISHED
      await tx.exam.update({
        where: { id: examId },
        data: {
          status: "PUBLISHED",
          isPublished: true,
        },
      });

      // 2. Compute and upsert ReportCard for each student
      for (const student of students) {
        let totalObtained = 0;
        let hasFailed = false;

        for (const es of exam.examSubjects) {
          const mark = es.marks.find((m) => m.studentId === student.id);
          const val = mark?.isAbsent ? 0 : (mark?.marksObtained ?? mark?.score ?? 0);
          totalObtained += val;

          if (mark?.isAbsent || (mark?.marksObtained !== null && mark?.marksObtained !== undefined && mark.marksObtained < es.passMark)) {
            hasFailed = true;
          }
        }

        const percentage = totalMaxMarks > 0
          ? Math.round((totalObtained / totalMaxMarks) * 10000) / 100
          : 0;

        let grade = "F";
        if (!hasFailed) {
          if (percentage >= 90) grade = "A+";
          else if (percentage >= 80) grade = "A";
          else if (percentage >= 70) grade = "B";
          else if (percentage >= 60) grade = "C";
          else if (percentage >= 50) grade = "D";
          else grade = "E";
        }

        const remarks = hasFailed
          ? "Needs focused revision in challenging subjects."
          : percentage >= 80
          ? "Outstanding academic performance!"
          : "Good overall progress.";

        // Find or create ReportCard
        const existingRC = await tx.reportCard.findFirst({
          where: {
            studentId: student.id,
            examId: exam.id,
          },
        });

        if (existingRC) {
          await tx.reportCard.update({
            where: { id: existingRC.id },
            data: {
              totalMarks: totalObtained,
              percentage,
              grade,
              remarks,
              published: true,
            },
          });
        } else {
          await tx.reportCard.create({
            data: {
              studentId: student.id,
              examId: exam.id,
              totalMarks: totalObtained,
              percentage,
              grade,
              remarks,
              published: true,
            },
          });
        }

        // 3. Dispatch Notification to Parents
        for (const ps of student.parents) {
          const parentUserId = ps.parent?.user?.id;
          if (parentUserId) {
            await tx.notification.create({
              data: {
                userId: parentUserId,
                title: `Report Card Published: ${exam.name}`,
                content: `Official report card and verified marks for ${student.firstName} in ${exam.name} are now available to view.`,
                type: "EXAM",
                category: "ACADEMIC",
                priority: "HIGH",
                link: `/dashboard/parent/report-cards/${student.id}`,
              },
            }).catch(() => {});
          }
        }
      }
    });

    revalidatePath(`/dashboard/teacher/exams/${examId}/review`);
    revalidatePath(`/dashboard/teacher/report-cards`);
    revalidatePath(`/dashboard/parent/exams`);
    revalidatePath(`/dashboard/parent/report-cards`);

    return { success: true, studentCount: students.length };
  } catch (error: unknown) {
    console.error("publishExamToReportCardsAction error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to publish exam to report cards.",
    };
  }
}
