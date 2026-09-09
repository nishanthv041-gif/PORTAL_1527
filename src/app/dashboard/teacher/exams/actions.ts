"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function createExamRequest(formData: FormData) {
  const teacherId = formData.get("teacherId") as string;
  const subjectId = formData.get("subjectId") as string;
  const date = formData.get("date") as string;
  const startTime = formData.get("startTime") as string;
  const endTime = formData.get("endTime") as string;
  const maxMarks = parseInt((formData.get("maxMarks") as string) || "100", 10);

  if (!teacherId || !subjectId || !date || !startTime || !endTime) {
    return { success: false, error: "Missing required fields" };
  }

  try {
    const subject = await prisma.subject.findUnique({
      where: { id: subjectId }
    });

    if (!subject) {
      return { success: false, error: "Subject not found." };
    }

    await prisma.examRequest.create({
      data: {
        teacherId,
        subjectId,
        classId: subject.classId,
        date: new Date(date),
        startTime,
        endTime,
        maxMarks,
        status: "PENDING"
      }
    });

    revalidatePath("/dashboard/teacher/exams");
    return { success: true };
  } catch (error: unknown) {
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to create exam request." };
  }
}
