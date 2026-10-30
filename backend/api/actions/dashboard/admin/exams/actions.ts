"use server";

import { prisma } from "@/backend/db/prisma";
import { revalidatePath } from "next/cache";
import { normalizeDateToUTC, formatSchoolDate } from "@/backend/lib/timetable/getEffectiveTimetable";

export async function toggleExamPublishAction(examId: string, isPublished: boolean) {
  try {
    await prisma.exam.update({
      where: { id: examId },
      data: { isPublished }
    });

    revalidatePath("/dashboard/admin/exams");
    revalidatePath("/dashboard/parent/exams");
    revalidatePath("/dashboard/teacher/exams");
    return { success: true };
  } catch (error: unknown) {
    if (error instanceof Error) {
      return { error: error.message || "Failed to toggle publish status." };
    }
    return { error: "Failed to toggle publish status." };
  }
}

/**
 * Accepts an exam request submitted by a teacher:
 * 1. Updates ExamRequest to APPROVED
 * 2. Creates the official Exam record
 * 3. Overlays into the Timetable as an EXAM slot on that date
 * 4. Dispatches notification to class parents and teachers
 */
export async function acceptExamRequest(requestId: string) {
  try {
    const request = await prisma.examRequest.findUnique({
      where: { id: requestId },
      include: {
        subject: true,
        teacher: { include: { user: true } },
        class: {
          include: {
            students: {
              select: {
                parents: {
                  select: {
                    parent: { select: { userId: true } }
                  }
                }
              }
            }
          }
        }
      }
    });

    if (!request) return { error: "Request not found." };

    const examName = `${request.subject.name} Exam`;
    const targetDate = normalizeDateToUTC(request.date);
    const formattedDate = formatSchoolDate(targetDate);
    const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
    const dayOfWeek = days[targetDate.getUTCDay()];

    await prisma.$transaction(async (tx) => {
      // 1. Mark request APPROVED
      await tx.examRequest.update({
        where: { id: requestId },
        data: { status: "APPROVED" }
      });

      // 2. Create official Exam record
      const exam = await tx.exam.create({
        data: {
          name: examName,
          date: targetDate,
          classId: request.classId,
          isPublished: true
        }
      });

      // 3. Create timetable slot with slotType EXAM so it overlaps and is visible on timetable
      await tx.timetable.create({
        data: {
          dayOfWeek,
          startTime: request.startTime || "09:00",
          endTime: request.endTime || "12:00",
          period: 1,
          isBreak: false,
          slotType: "EXAM",
          status: "PUBLISHED",
          classId: request.classId,
          subjectId: request.subjectId,
          teacherId: request.teacherId,
          classroom: "Exam Hall",
          effectiveFrom: targetDate,
          effectiveTo: targetDate
        }
      });

      // 4. Send notification to teacher
      if (request.teacher?.user?.id) {
        await tx.notification.create({
          data: {
            userId: request.teacher.user.id,
            title: "Exam Request Approved",
            content: `Your exam request for ${request.subject.name} (${request.class.name}-${request.class.section}) on ${formattedDate} has been approved and added to the schedule.`,
            type: "EXAM",
            link: "/dashboard/teacher/exams",
            isRead: false
          }
        }).catch(err => console.warn("Teacher exam notif warning:", err));
      }

      // 5. Send notification to parents
      for (const st of request.class.students) {
        for (const ps of st.parents) {
          if (ps.parent?.userId) {
            await tx.notification.create({
              data: {
                userId: ps.parent.userId,
                title: "Exam Scheduled",
                content: `${request.subject.name} Exam for ${request.class.name}-${request.class.section} is scheduled on ${formattedDate} (${request.startTime || "09:00"} - ${request.endTime || "12:00"}).`,
                type: "EXAM",
                link: "/dashboard/parent/exams",
                isRead: false
              }
            }).catch(err => console.warn("Parent exam notif warning:", err));
          }
        }
      }
    });

    revalidatePath("/dashboard/admin/exams");
    revalidatePath("/dashboard/admin/timetable");
    revalidatePath("/dashboard/teacher/exams");
    revalidatePath("/dashboard/parent/exams");
    revalidatePath("/dashboard/parent/timetable");
    revalidatePath("/dashboard/teacher/timetable");

    return { success: true };
  } catch (error: unknown) {
    if (error instanceof Error) {
      return { error: error.message || "Failed to accept exam request." };
    }
    return { error: "Failed to accept exam request." };
  }
}

export async function declineExamRequest(requestId: string, reason: string) {
  try {
    const request = await prisma.examRequest.findUnique({
      where: { id: requestId },
      include: {
        subject: true,
        teacher: { include: { user: true } },
        class: true
      }
    });

    await prisma.examRequest.update({
      where: { id: requestId },
      data: {
        status: "DECLINED",
        declineReason: reason
      }
    });

    if (request?.teacher?.user?.id) {
      await prisma.notification.create({
        data: {
          userId: request.teacher.user.id,
          title: "Exam Request Declined",
          content: `Your exam request for ${request.subject.name} on ${new Date(request.date).toLocaleDateString()} was declined. Reason: ${reason || "Not specified"}`,
          type: "EXAM",
          link: "/dashboard/teacher/exams",
          isRead: false
        }
      }).catch(err => console.warn("Decline notif warning:", err));
    }

    revalidatePath("/dashboard/admin/exams");
    return { success: true };
  } catch (error: unknown) {
    if (error instanceof Error) {
      return { error: error.message || "Failed to decline exam request." };
    }
    return { error: "Failed to decline exam request." };
  }
}
