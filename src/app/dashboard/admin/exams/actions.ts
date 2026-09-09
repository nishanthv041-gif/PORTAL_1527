"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function toggleExamPublishAction(examId: string, isPublished: boolean) {
  try {
    await prisma.exam.update({
      where: { id: examId },
      data: { isPublished }
    });

    revalidatePath("/dashboard/admin/exams");
    return { success: true };
  } catch (error: unknown) {
    if (error instanceof Error) {
      return { error: error.message || "Failed to toggle publish status." };
    }
    return { error: "Failed to toggle publish status." };
  }
}

export async function acceptExamRequest(requestId: string) {
  try {
    const request = await prisma.examRequest.findUnique({
      where: { id: requestId },
      include: { subject: true }
    });

    if (!request) return { error: "Request not found." };

    await prisma.$transaction(async (tx) => {
      await tx.examRequest.update({
        where: { id: requestId },
        data: { status: "APPROVED" }
      });

      const examName = `${request.subject.name} Exam`;
      await tx.exam.create({
        data: {
          name: examName,
          date: request.date,
          classId: request.classId,
        }
      });
      
      const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
      const dayOfWeek = days[new Date(request.date).getDay()];
      
      await tx.timetable.create({
        data: {
          dayOfWeek,
          startTime: "09:00",
          endTime: "12:00",
          period: 1, // Using period 1 to indicate a morning exam slot
          isBreak: false,
          classId: request.classId,
          subjectId: request.subjectId
        }
      });
    });

    revalidatePath("/dashboard/admin/exams");
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
    await prisma.examRequest.update({
      where: { id: requestId },
      data: { 
        status: "DECLINED",
        declineReason: reason
      }
    });

    revalidatePath("/dashboard/admin/exams");
    return { success: true };
  } catch (error: unknown) {
    if (error instanceof Error) {
      return { error: error.message || "Failed to decline exam request." };
    }
    return { error: "Failed to decline exam request." };
  }
}
