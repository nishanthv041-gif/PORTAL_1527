"use server";

import { prisma } from "@/backend/db/prisma";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";

export interface MarkEntryItem {
  studentId: string;
  marksObtained: number | null;
  isAbsent: boolean;
  remark?: string;
}

/**
 * Helper to get the current authenticated teacher or admin
 */
async function getAuthTeacherOrAdmin() {
  const session = await getServerSession(getAuthOptions());
  if (!session || !session.user) {
    throw new Error("Unauthorized. Please log in.");
  }

  const role = (session.user.role || "").toUpperCase();
  if (role !== "TEACHER" && role !== "ADMIN") {
    throw new Error("Access denied: only teachers and administrators can enter marks.");
  }

  const teacher = await prisma.teacher.findUnique({
    where: { userId: session.user.id },
    include: {
      user: true,
      classTeacherOf: true,
      classes: true,
      subjects: true,
    },
  });

  if (!teacher && role !== "ADMIN") {
    throw new Error("Teacher profile not found for this user account.");
  }

  return { session, role, teacher };
}

/**
 * 1. Returns only the logged-in subject teacher's assigned ExamSubject tasks
 */
export async function getTeacherMarksTasksAction() {
  try {
    const { role, teacher } = await getAuthTeacherOrAdmin();

    // If teacher, show their assigned subjects; if admin, show all
    const whereClause: any = {};
    if (role !== "ADMIN" && teacher) {
      whereClause.teacherId = teacher.id;
    }

    const examSubjects = await prisma.examSubject.findMany({
      where: whereClause,
      include: {
        exam: {
          include: {
            class: true,
            academicYear: true,
          },
        },
        subject: true,
        teacher: {
          include: {
            user: true,
          },
        },
        marks: {
          select: {
            id: true,
            studentId: true,
            marksObtained: true,
            isAbsent: true,
          },
        },
      },
      orderBy: [
        { exam: { date: "desc" } },
        { createdAt: "desc" },
      ],
    });

    // Compute progress stats for each task
    const tasks = await Promise.all(
      examSubjects.map(async (es) => {
        // Count total active students in that class
        const totalStudents = await prisma.student.count({
          where: {
            classId: es.exam.classId,
            isActive: true,
          },
        });

        // Count entered marks (either marksObtained != null or isAbsent === true)
        const enteredMarksCount = es.marks.filter(
          (m) => m.isAbsent || m.marksObtained !== null
        ).length;

        return {
          id: es.id,
          examId: es.examId,
          examName: es.exam.name,
          examDate: es.examDate ? es.examDate.toISOString() : es.exam.date.toISOString(),
          className: es.exam.class.name,
          section: es.exam.class.section,
          classId: es.exam.classId,
          subjectId: es.subjectId,
          subjectName: es.subject.name,
          subjectCode: es.subject.code,
          maxMarks: es.maxMarks,
          passMark: es.passMark,
          status: es.status, // PENDING | DRAFT | SUBMITTED | RETURNED | VERIFIED
          submittedAt: es.submittedAt?.toISOString() || null,
          verifiedAt: es.verifiedAt?.toISOString() || null,
          returnRemark: es.returnRemark || null,
          totalStudents,
          enteredMarksCount,
          isCompleted: totalStudents > 0 && enteredMarksCount >= totalStudents,
        };
      })
    );

    return { success: true, tasks };
  } catch (error: unknown) {
    console.error("getTeacherMarksTasksAction error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to load marks tasks.",
      tasks: [],
    };
  }
}

/**
 * 2. Get marks entry workspace data for a specific ExamSubject
 */
export async function getExamSubjectMarksDataAction(examSubjectId: string) {
  try {
    const { role, teacher } = await getAuthTeacherOrAdmin();

    const examSubject = await prisma.examSubject.findUnique({
      where: { id: examSubjectId },
      include: {
        exam: {
          include: {
            class: {
              include: {
                classTeacher: {
                  include: {
                    user: true,
                  },
                },
              },
            },
            academicYear: true,
          },
        },
        subject: true,
        teacher: {
          include: {
            user: true,
          },
        },
        marks: {
          include: {
            student: true,
          },
        },
      },
    });

    if (!examSubject) {
      return { success: false, error: "Exam subject task not found." };
    }

    // Role check: must be assigned subject teacher OR class teacher of class OR admin
    const isAssignedSubjectTeacher = teacher && examSubject.teacherId === teacher.id;
    const isClassTeacher = teacher && examSubject.exam.class.classTeacherId === teacher.id;
    const isAdmin = role === "ADMIN";

    if (!isAssignedSubjectTeacher && !isClassTeacher && !isAdmin) {
      return {
        success: false,
        error: "Access denied. You are not assigned to enter or view marks for this subject.",
      };
    }

    // Fetch active students in class, ordered by rollNumber ascending
    const students = await prisma.student.findMany({
      where: {
        classId: examSubject.exam.classId,
        isActive: true,
      },
      select: {
        id: true,
        rollNumber: true,
        admissionNo: true,
        firstName: true,
        lastName: true,
        photo: true,
      },
      orderBy: [
        { rollNumber: "asc" },
        { firstName: "asc" },
      ],
    });

    // Create a lookup for existing marks
    const markMap = new Map<string, (typeof examSubject.marks)[0]>();
    for (const m of examSubject.marks) {
      markMap.set(m.studentId, m);
    }

    // Merge student list with existing marks
    const entries = students.map((student) => {
      const existing = markMap.get(student.id);
      return {
        studentId: student.id,
        rollNumber: student.rollNumber,
        admissionNo: student.admissionNo,
        fullName: `${student.firstName} ${student.lastName}`.trim(),
        marksObtained: existing?.marksObtained ?? (existing?.score && !existing?.isAbsent ? existing.score : null),
        isAbsent: Boolean(existing?.isAbsent),
        remark: existing?.remark || existing?.remarks || "",
        updatedAt: existing?.updatedAt?.toISOString() || null,
      };
    });

    const isEditable =
      (isAssignedSubjectTeacher || isAdmin) &&
      (examSubject.status === "PENDING" ||
        examSubject.status === "DRAFT" ||
        examSubject.status === "RETURNED");

    return {
      success: true,
      task: {
        id: examSubject.id,
        examId: examSubject.examId,
        examName: examSubject.exam.name,
        examStatus: examSubject.exam.status,
        examDate: examSubject.examDate
          ? examSubject.examDate.toISOString()
          : examSubject.exam.date.toISOString(),
        classId: examSubject.exam.classId,
        className: examSubject.exam.class.name,
        section: examSubject.exam.class.section,
        classTeacherName: examSubject.exam.class.classTeacher?.user.name || "Unassigned",
        subjectId: examSubject.subjectId,
        subjectName: examSubject.subject.name,
        subjectCode: examSubject.subject.code,
        teacherId: examSubject.teacherId,
        assignedTeacherName: examSubject.teacher?.user.name || "Unassigned",
        maxMarks: examSubject.maxMarks,
        passMark: examSubject.passMark,
        status: examSubject.status,
        submittedAt: examSubject.submittedAt?.toISOString() || null,
        verifiedAt: examSubject.verifiedAt?.toISOString() || null,
        returnRemark: examSubject.returnRemark || null,
        isEditable,
      },
      entries,
    };
  } catch (error: unknown) {
    console.error("getExamSubjectMarksDataAction error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to load marks workspace.",
    };
  }
}

/**
 * 3. Save Marks Draft (Subject Teacher or Admin)
 */
export async function saveMarksDraftAction(
  examSubjectId: string,
  entries: MarkEntryItem[]
) {
  try {
    const { role, teacher } = await getAuthTeacherOrAdmin();

    const examSubject = await prisma.examSubject.findUnique({
      where: { id: examSubjectId },
      include: { exam: true },
    });

    if (!examSubject) {
      return { success: false, error: "Exam subject task not found." };
    }

    const isAssigned = teacher && examSubject.teacherId === teacher.id;
    if (!isAssigned && role !== "ADMIN") {
      return { success: false, error: "Only the assigned subject teacher can save marks." };
    }

    if (examSubject.status === "SUBMITTED" || examSubject.status === "VERIFIED") {
      return {
        success: false,
        error: `Marks are currently locked in ${examSubject.status} state. Changes cannot be saved.`,
      };
    }

    // Save marks in transaction
    await prisma.$transaction(async (tx) => {
      for (const entry of entries) {
        if (!entry.studentId) continue;

        // Clamp marks if entered
        let validMarks: number | null = null;
        if (entry.marksObtained !== null && entry.marksObtained !== undefined && !isNaN(entry.marksObtained)) {
          validMarks = Math.min(examSubject.maxMarks, Math.max(0, Number(entry.marksObtained)));
        }

        const isAbsent = Boolean(entry.isAbsent);

        await tx.mark.upsert({
          where: {
            studentId_examId_subjectId: {
              studentId: entry.studentId,
              examId: examSubject.examId,
              subjectId: examSubject.subjectId,
            },
          },
          create: {
            examSubjectId: examSubject.id,
            studentId: entry.studentId,
            examId: examSubject.examId,
            subjectId: examSubject.subjectId,
            marksObtained: isAbsent ? null : validMarks,
            score: isAbsent ? 0 : (validMarks ?? 0),
            maxScore: examSubject.maxMarks,
            isAbsent,
            remark: entry.remark?.trim() || null,
            remarks: entry.remark?.trim() || null,
            enteredByStaffId: teacher?.id || null,
          },
          update: {
            examSubjectId: examSubject.id,
            marksObtained: isAbsent ? null : validMarks,
            score: isAbsent ? 0 : (validMarks ?? 0),
            maxScore: examSubject.maxMarks,
            isAbsent,
            remark: entry.remark?.trim() || null,
            remarks: entry.remark?.trim() || null,
            enteredByStaffId: teacher?.id || null,
          },
        });
      }

      // Update ExamSubject status to DRAFT if it was PENDING
      if (examSubject.status === "PENDING") {
        await tx.examSubject.update({
          where: { id: examSubjectId },
          data: { status: "DRAFT" },
        });
      }
    });

    revalidatePath(`/dashboard/teacher/exams/tasks/${examSubjectId}`);
    revalidatePath(`/dashboard/teacher/exams/tasks`);

    return { success: true, count: entries.length };
  } catch (error: unknown) {
    console.error("saveMarksDraftAction error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to save marks draft.",
    };
  }
}

/**
 * 4. Submit Marks to Class Teacher
 * Validates all students have marks or are marked absent, then locks the task and notifies class teacher.
 */
export async function submitMarksToClassTeacherAction(
  examSubjectId: string,
  entries: MarkEntryItem[]
) {
  try {
    const { session, role, teacher } = await getAuthTeacherOrAdmin();

    const examSubject = await prisma.examSubject.findUnique({
      where: { id: examSubjectId },
      include: {
        exam: {
          include: {
            class: {
              include: {
                classTeacher: {
                  include: {
                    user: true,
                  },
                },
              },
            },
          },
        },
        subject: true,
        teacher: {
          include: { user: true },
        },
      },
    });

    if (!examSubject) {
      return { success: false, error: "Exam subject task not found." };
    }

    const isAssigned = teacher && examSubject.teacherId === teacher.id;
    if (!isAssigned && role !== "ADMIN") {
      return { success: false, error: "Only the assigned subject teacher can submit marks." };
    }

    if (examSubject.status === "SUBMITTED" || examSubject.status === "VERIFIED") {
      return {
        success: false,
        error: `Marks are already submitted or verified (${examSubject.status}).`,
      };
    }

    // Get all active students for this class
    const activeStudents = await prisma.student.findMany({
      where: {
        classId: examSubject.exam.classId,
        isActive: true,
      },
      select: {
        id: true,
        rollNumber: true,
        firstName: true,
        lastName: true,
      },
      orderBy: { rollNumber: "asc" },
    });

    // Check completeness
    const entryMap = new Map<string, MarkEntryItem>();
    for (const e of entries) {
      entryMap.set(e.studentId, e);
    }

    const missingStudents: Array<{ rollNumber: string; name: string }> = [];

    for (const student of activeStudents) {
      const e = entryMap.get(student.id);
      const isAbsent = Boolean(e?.isAbsent);
      const hasScore =
        e?.marksObtained !== null &&
        e?.marksObtained !== undefined &&
        !isNaN(Number(e.marksObtained));

      if (!isAbsent && !hasScore) {
        missingStudents.push({
          rollNumber: student.rollNumber,
          name: `${student.firstName} ${student.lastName}`.trim(),
        });
      }
    }

    if (missingStudents.length > 0) {
      return {
        success: false,
        error: `Cannot submit: ${missingStudents.length} student(s) have missing marks. All students must have a mark or be marked as Absent.`,
        missingStudents,
      };
    }

    // Run submission in transaction
    await prisma.$transaction(async (tx) => {
      // 1. Upsert all marks
      for (const entry of entries) {
        if (!entry.studentId) continue;

        const isAbsent = Boolean(entry.isAbsent);
        const marksObtained = isAbsent ? null : Math.min(examSubject.maxMarks, Math.max(0, Number(entry.marksObtained)));

        // Retrieve existing mark if any to log audit if previously returned
        const existingMark = await tx.mark.findUnique({
          where: {
            studentId_examId_subjectId: {
              studentId: entry.studentId,
              examId: examSubject.examId,
              subjectId: examSubject.subjectId,
            },
          },
        });

        const updatedMark = await tx.mark.upsert({
          where: {
            studentId_examId_subjectId: {
              studentId: entry.studentId,
              examId: examSubject.examId,
              subjectId: examSubject.subjectId,
            },
          },
          create: {
            examSubjectId: examSubject.id,
            studentId: entry.studentId,
            examId: examSubject.examId,
            subjectId: examSubject.subjectId,
            marksObtained,
            score: marksObtained ?? 0,
            maxScore: examSubject.maxMarks,
            isAbsent,
            remark: entry.remark?.trim() || null,
            remarks: entry.remark?.trim() || null,
            enteredByStaffId: teacher?.id || null,
          },
          update: {
            examSubjectId: examSubject.id,
            marksObtained,
            score: marksObtained ?? 0,
            maxScore: examSubject.maxMarks,
            isAbsent,
            remark: entry.remark?.trim() || null,
            remarks: entry.remark?.trim() || null,
            enteredByStaffId: teacher?.id || null,
          },
        });

        // If returned previously and changed, create audit log
        if (examSubject.status === "RETURNED" && existingMark) {
          if (existingMark.marksObtained !== marksObtained || existingMark.isAbsent !== isAbsent) {
            await tx.markAuditLog.create({
              data: {
                markId: updatedMark.id,
                examSubjectId: examSubject.id,
                studentId: entry.studentId,
                oldValue: existingMark.marksObtained,
                newValue: marksObtained,
                changedBy: session.user.id,
                reason: "Revised marks after return from Class Teacher",
              },
            });
          }
        }
      }

      // 2. Lock ExamSubject: SUBMITTED
      await tx.examSubject.update({
        where: { id: examSubjectId },
        data: {
          status: "SUBMITTED",
          submittedAt: new Date(),
          returnRemark: null, // clear previous return remark
        },
      });

      // 3. Notify Class Teacher
      const classTeacherUserId = examSubject.exam.class.classTeacher?.user.id;
      const teacherName = teacher?.user.name || session.user.name || "Subject Teacher";
      const subjectName = examSubject.subject.name;
      const examName = examSubject.exam.name;
      const classInfo = `${examSubject.exam.class.name}-${examSubject.exam.class.section}`;

      if (classTeacherUserId) {
        await tx.notification.create({
          data: {
            userId: classTeacherUserId,
            title: `Marks Submitted for Verification: ${subjectName}`,
            content: `${teacherName} has submitted marks for ${subjectName} in ${examName} (${classInfo}). Please review and verify.`,
            type: "EXAM",
            category: "ACADEMIC",
            priority: "HIGH",
            link: `/dashboard/teacher/exams/${examSubject.examId}/review`,
            isRead: false,
          },
        }).catch((err) => console.warn("Failed to notify class teacher:", err));
      }

      // Notify Admins as well
      const admins = await tx.user.findMany({
        where: { role: "ADMIN", status: "ACTIVE" },
        select: { id: true },
      });
      for (const admin of admins) {
        await tx.notification.create({
          data: {
            userId: admin.id,
            title: `Marks Submitted: ${subjectName} (${classInfo})`,
            content: `${teacherName} submitted ${subjectName} marks for ${examName}.`,
            type: "EXAM",
            category: "ACADEMIC",
            priority: "NORMAL",
            link: `/dashboard/admin/exams`,
            isRead: false,
          },
        }).catch(() => {});
      }
    });

    revalidatePath(`/dashboard/teacher/exams/tasks/${examSubjectId}`);
    revalidatePath(`/dashboard/teacher/exams/tasks`);
    revalidatePath(`/dashboard/teacher/exams/${examSubject.examId}/review`);
    revalidatePath(`/dashboard/teacher/report-cards`);

    return { success: true };
  } catch (error: unknown) {
    console.error("submitMarksToClassTeacherAction error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to submit marks to class teacher.",
    };
  }
}

