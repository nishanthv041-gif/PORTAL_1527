"use server";

import { prisma } from "@/backend/db/prisma";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";

export type ExamType = "UNIT_TEST" | "QUARTERLY" | "HALF_YEARLY" | "ANNUAL" | "MODEL" | "OTHER";

export type CreateExamRequestInput = {
  name: string;
  type: ExamType;
  classId: string;
  section?: string;
  subjects: Array<{
    subjectId: string;
    maxMarks?: number;
    passMark?: number;
    examDate?: string;
  }>;
  remarks?: string;
};

/**
 * 1. CLASS TEACHER or SUBJECT TEACHER creates an Exam/Test Request
 */
export async function createExamRequestWorkflowAction(input: CreateExamRequestInput) {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session || !session.user) {
      return { success: false, error: "Unauthorized. Please log in." };
    }

    const role = (session.user.role || "").toUpperCase();
    if (role !== "TEACHER" && role !== "ADMIN") {
      return { success: false, error: "Only teachers or administrators can raise exam requests." };
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
      return { success: false, error: "Teacher profile not found." };
    }

    const targetClass = await prisma.class.findUnique({
      where: { id: input.classId },
      include: {
        classTeacher: true,
        subjects: {
          include: {
            teacher: { include: { user: true } },
          },
        },
        batch: true,
      },
    });

    if (!targetClass) {
      return { success: false, error: "Selected class does not exist." };
    }

    // Role check: Only class teacher of that class or subject teacher teaching that class (or ADMIN)
    if (role !== "ADMIN") {
      const isClassTeacher = targetClass.classTeacherId === teacher?.id;
      const teachesSubjectInClass = targetClass.subjects.some((s) => s.teacherId === teacher?.id);

      if (!isClassTeacher && !teachesSubjectInClass) {
        return {
          success: false,
          error: "You can only request exams for classes where you are the Class Teacher or a Subject Teacher.",
        };
      }
    }

    const examTitle = input.name.trim();
    if (!examTitle) {
      return { success: false, error: "Exam name is required." };
    }

    if (!input.subjects || input.subjects.length === 0) {
      return { success: false, error: "At least one subject must be selected for the examination." };
    }

    // Check duplicate exam for same class, name and academic year
    const academicBatchId = targetClass.batchId || (await prisma.academicBatch.findFirst({ where: { isCurrent: true } }))?.id || null;

    const existingExam = await prisma.exam.findFirst({
      where: {
        classId: input.classId,
        name: { equals: examTitle, mode: "insensitive" },
        ...(academicBatchId ? { academicYearId: academicBatchId } : {}),
      },
    });

    if (existingExam) {
      return {
        success: false,
        error: `An exam named "${examTitle}" already exists for ${targetClass.name}-${targetClass.section} in the current academic year.`,
      };
    }

    const existingPendingRequest = await prisma.examRequest.findFirst({
      where: {
        classId: input.classId,
        title: { equals: examTitle, mode: "insensitive" },
        status: "PENDING_ADMIN",
      },
    });

    if (existingPendingRequest) {
      return {
        success: false,
        error: `A pending request named "${examTitle}" already exists for this class awaiting admin approval.`,
      };
    }

    // Prepare subjects with mapped subject teachers
    const requestSubjectsData = input.subjects.map((subInput) => {
      const dbSubject = targetClass.subjects.find((s) => s.id === subInput.subjectId);
      const maxMarks = subInput.maxMarks && subInput.maxMarks > 0 ? subInput.maxMarks : dbSubject?.maxMarks || 100;
      const passMark = subInput.passMark && subInput.passMark > 0 ? subInput.passMark : dbSubject?.passMarks || 35;
      const assignedTeacherId = dbSubject?.teacherId || teacher?.id || null;
      const examDate = subInput.examDate ? new Date(subInput.examDate) : null;

      return {
        subjectId: subInput.subjectId,
        teacherId: assignedTeacherId,
        maxMarks,
        passMark,
        examDate,
      };
    });

    // Run transaction
    const newRequest = await prisma.$transaction(async (tx) => {
      const createdRequest = await tx.examRequest.create({
        data: {
          title: examTitle,
          examType: input.type,
          classId: input.classId,
          sectionId: input.section || targetClass.section,
          requestedByStaffId: teacher?.id || null,
          teacherId: teacher?.id || null, // backward compatibility
          status: "PENDING_ADMIN",
          remarks: input.remarks || null,
          maxMarks: requestSubjectsData[0]?.maxMarks || 100,
          passMark: requestSubjectsData[0]?.passMark || 35,
          requestSubjects: {
            create: requestSubjectsData,
          },
        },
      });

      // Dispatch notifications to all active Admins
      const admins = await tx.user.findMany({
        where: { role: "ADMIN", status: "ACTIVE" },
        select: { id: true },
      });

      const requesterName = teacher?.user.name || session.user.name || "Teacher";
      const notifContent = `${requesterName} raised an exam request for "${examTitle}" (${targetClass.name}-${targetClass.section}) with ${requestSubjectsData.length} subjects.`;

      for (const admin of admins) {
        await tx.notification.create({
          data: {
            userId: admin.id,
            title: "New Exam Request Awaiting Approval",
            content: notifContent,
            type: "EXAM",
            category: "ACADEMIC",
            priority: "NORMAL",
            link: "/dashboard/admin/exams/requests",
            isRead: false,
          },
        }).catch((err) => console.warn("Admin exam request notif failed:", err));
      }

      return createdRequest;
    });

    revalidatePath("/dashboard/admin/exams");
    revalidatePath("/dashboard/admin/exams/requests");
    revalidatePath("/dashboard/teacher/exams");
    revalidatePath("/dashboard/teacher/report-cards");

    return { success: true, requestId: newRequest.id };
  } catch (error: unknown) {
    console.error("createExamRequestWorkflowAction error:", error);
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to create exam request." };
  }
}

/**
 * 2. ADMIN APPROVES EXAM REQUEST
 * Creates Exam, marks-entry tasks (ExamSubject) for each subject teacher,
 * and notifies all stakeholders.
 */
export async function adminApproveExamRequestWorkflowAction(
  requestId: string,
  edits?: {
    title?: string;
    examType?: string;
    subjects?: Array<{
      subjectId: string;
      maxMarks: number;
      passMark: number;
      examDate?: string;
    }>;
  }
) {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session || !session.user || (session.user.role || "").toUpperCase() !== "ADMIN") {
      return { success: false, error: "Unauthorized. Only administrators can approve exam requests." };
    }

    const request = await prisma.examRequest.findUnique({
      where: { id: requestId },
      include: {
        class: {
          include: {
            classTeacher: { include: { user: true } },
            subjects: {
              include: {
                teacher: { include: { user: true } },
              },
            },
            batch: true,
          },
        },
        requestedByStaff: { include: { user: true } },
        requestSubjects: {
          include: {
            subject: true,
            teacher: { include: { user: true } },
          },
        },
      },
    });

    if (!request) {
      return { success: false, error: "Exam request not found." };
    }

    if (request.status === "APPROVED") {
      return { success: false, error: "This request has already been approved." };
    }

    const examTitle = edits?.title?.trim() || request.title || "Examination";
    const academicBatchId = request.class.batchId || (await prisma.academicBatch.findFirst({ where: { isCurrent: true } }))?.id || null;

    // Check duplicate exam
    const existingExam = await prisma.exam.findFirst({
      where: {
        classId: request.classId,
        name: { equals: examTitle, mode: "insensitive" },
        ...(academicBatchId ? { academicYearId: academicBatchId } : {}),
      },
    });

    if (existingExam) {
      return {
        success: false,
        error: `An approved exam named "${examTitle}" already exists for ${request.class.name}-${request.class.section}.`,
      };
    }

    // Determine subjects to populate: from requestSubjects or fallback to class subjects
    let subjectsToCreate = request.requestSubjects;
    if (subjectsToCreate.length === 0 && request.class.subjects.length > 0) {
      // Fallback for legacy requests: map all class subjects
      subjectsToCreate = request.class.subjects.map((s) => ({
        id: `gen-${s.id}`,
        requestId: request.id,
        subjectId: s.id,
        subject: s,
        teacherId: s.teacherId,
        teacher: s.teacher,
        maxMarks: s.maxMarks || 100,
        passMark: s.passMarks || 35,
        examDate: request.date,
      }));
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1. Mark request APPROVED
      await tx.examRequest.update({
        where: { id: requestId },
        data: {
          status: "APPROVED",
          title: examTitle,
          decidedBy: session.user.id,
          decidedAt: new Date(),
        },
      });

      // 2. Create official Exam record
      const exam = await tx.exam.create({
        data: {
          name: examTitle,
          requestId: request.id,
          classId: request.classId,
          sectionId: request.sectionId || request.class.section,
          academicYearId: academicBatchId,
          date: request.date || new Date(),
          status: "MARKS_IN_PROGRESS",
          isPublished: false,
        },
      });

      // 3. Create ExamSubject tasks for every subject assigned to the subject teacher
      const createdSubjects = [];
      const teacherNotifications = new Map<string, { teacherName: string; subjectNames: string[] }>();

      for (const reqSub of subjectsToCreate) {
        // Find assigned teacher from request or subject master
        const assignedTeacherId = reqSub.teacherId || request.class.subjects.find((s) => s.id === reqSub.subjectId)?.teacherId || null;
        const assignedTeacher = request.class.subjects.find((s) => s.id === reqSub.subjectId)?.teacher || reqSub.teacher;

        const maxMarks = edits?.subjects?.find((es) => es.subjectId === reqSub.subjectId)?.maxMarks || reqSub.maxMarks || 100;
        const passMark = edits?.subjects?.find((es) => es.subjectId === reqSub.subjectId)?.passMark || reqSub.passMark || 35;
        const examDate = reqSub.examDate || request.date || null;

        const examSubject = await tx.examSubject.create({
          data: {
            examId: exam.id,
            subjectId: reqSub.subjectId,
            teacherId: assignedTeacherId,
            maxMarks,
            passMark,
            examDate,
            status: "PENDING",
          },
        });
        createdSubjects.push(examSubject);

        // Group notifications by teacher
        if (assignedTeacher && assignedTeacher.user?.id) {
          const uId = assignedTeacher.user.id;
          if (!teacherNotifications.has(uId)) {
            teacherNotifications.set(uId, {
              teacherName: assignedTeacher.user.name || "Teacher",
              subjectNames: [],
            });
          }
          teacherNotifications.get(uId)!.subjectNames.push(reqSub.subject.name);
        }
      }

      // 4. Send marks-entry task notifications to Subject Teachers
      for (const [userId, info] of teacherNotifications.entries()) {
        await tx.notification.create({
          data: {
            userId,
            title: "Marks Entry Task Assigned",
            content: `You have been assigned to enter marks for ${info.subjectNames.join(", ")} in "${examTitle}" (${request.class.name}-${request.class.section}).`,
            type: "EXAM",
            category: "ACADEMIC",
            priority: "NORMAL",
            link: "/dashboard/teacher/exams",
            isRead: false,
          },
        }).catch((err) => console.warn("Subject teacher exam task notif failed:", err));
      }

      // 5. Notify the Requester / Class Teacher
      const requesterUserId = request.requestedByStaff?.user?.id || request.class.classTeacher?.user?.id;
      if (requesterUserId) {
        await tx.notification.create({
          data: {
            userId: requesterUserId,
            title: "Exam Request Approved",
            content: `Your exam request "${examTitle}" for ${request.class.name}-${request.class.section} has been approved. Marks entry tasks are now open for subject teachers.`,
            type: "EXAM",
            category: "ACADEMIC",
            priority: "NORMAL",
            link: "/dashboard/teacher/exams",
            isRead: false,
          },
        }).catch((err) => console.warn("Class teacher approval notif failed:", err));
      }

      return { exam, createdSubjects };
    });

    revalidatePath("/dashboard/admin/exams");
    revalidatePath("/dashboard/admin/exams/requests");
    revalidatePath("/dashboard/teacher/exams");
    revalidatePath("/dashboard/teacher/report-cards");
    revalidatePath("/dashboard/parent/exams");

    return { success: true, examId: result.exam.id };
  } catch (error: unknown) {
    console.error("adminApproveExamRequestWorkflowAction error:", error);
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to approve exam request." };
  }
}

/**
 * 3. ADMIN REJECTS EXAM REQUEST
 */
export async function adminRejectExamRequestWorkflowAction(requestId: string, reason: string) {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session || !session.user || (session.user.role || "").toUpperCase() !== "ADMIN") {
      return { success: false, error: "Unauthorized. Only administrators can reject exam requests." };
    }

    const request = await prisma.examRequest.findUnique({
      where: { id: requestId },
      include: {
        class: true,
        requestedByStaff: { include: { user: true } },
      },
    });

    if (!request) {
      return { success: false, error: "Exam request not found." };
    }

    if (request.status === "APPROVED") {
      return { success: false, error: "Cannot reject an already approved request." };
    }

    await prisma.$transaction(async (tx) => {
      await tx.examRequest.update({
        where: { id: requestId },
        data: {
          status: "REJECTED",
          adminRemark: reason || "Declined by administrator.",
          declineReason: reason || "Declined by administrator.",
          decidedBy: session.user.id,
          decidedAt: new Date(),
        },
      });

      // Notify the requester
      const requesterUserId = request.requestedByStaff?.user?.id;
      if (requesterUserId) {
        await tx.notification.create({
          data: {
            userId: requesterUserId,
            title: "Exam Request Declined",
            content: `Your exam request "${request.title}" for ${request.class.name}-${request.class.section} was declined. Reason: ${reason || "Not specified."}`,
            type: "EXAM",
            category: "ACADEMIC",
            priority: "NORMAL",
            link: "/dashboard/teacher/exams",
            isRead: false,
          },
        }).catch((err) => console.warn("Rejection notif failed:", err));
      }
    });

    revalidatePath("/dashboard/admin/exams");
    revalidatePath("/dashboard/admin/exams/requests");
    revalidatePath("/dashboard/teacher/exams");

    return { success: true };
  } catch (error: unknown) {
    console.error("adminRejectExamRequestWorkflowAction error:", error);
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to reject exam request." };
  }
}

/**
 * 4. ADMIN EDITS EXAM REQUEST (before approval)
 */
export async function adminEditExamRequestWorkflowAction(
  requestId: string,
  data: {
    title?: string;
    examType?: ExamType;
    remarks?: string;
    subjects?: Array<{
      subjectId: string;
      maxMarks: number;
      passMark: number;
      examDate?: string;
    }>;
  }
) {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session || !session.user || (session.user.role || "").toUpperCase() !== "ADMIN") {
      return { success: false, error: "Unauthorized. Only administrators can edit exam requests." };
    }

    const request = await prisma.examRequest.findUnique({
      where: { id: requestId },
    });

    if (!request) {
      return { success: false, error: "Exam request not found." };
    }

    if (request.status === "APPROVED") {
      return { success: false, error: "Cannot edit an already approved request." };
    }

    await prisma.$transaction(async (tx) => {
      await tx.examRequest.update({
        where: { id: requestId },
        data: {
          ...(data.title ? { title: data.title.trim() } : {}),
          ...(data.examType ? { examType: data.examType } : {}),
          ...(data.remarks !== undefined ? { remarks: data.remarks } : {}),
        },
      });

      if (data.subjects && data.subjects.length > 0) {
        for (const sub of data.subjects) {
          await tx.examRequestSubject.upsert({
            where: {
              requestId_subjectId: {
                requestId,
                subjectId: sub.subjectId,
              },
            },
            update: {
              maxMarks: sub.maxMarks,
              passMark: sub.passMark,
              ...(sub.examDate ? { examDate: new Date(sub.examDate) } : {}),
            },
            create: {
              requestId,
              subjectId: sub.subjectId,
              maxMarks: sub.maxMarks,
              passMark: sub.passMark,
              ...(sub.examDate ? { examDate: new Date(sub.examDate) } : {}),
            },
          });
        }
      }
    });

    revalidatePath("/dashboard/admin/exams");
    revalidatePath("/dashboard/admin/exams/requests");

    return { success: true };
  } catch (error: unknown) {
    console.error("adminEditExamRequestWorkflowAction error:", error);
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to edit exam request." };
  }
}
