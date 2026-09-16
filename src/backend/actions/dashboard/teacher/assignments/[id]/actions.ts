"use server";

import { prisma } from "@/backend/db/prisma";
import { revalidatePath } from "next/cache";

export async function gradeSubmission(submissionId: string, remarks: string) {
  try {
    const submission = await prisma.submission.update({
      where: { id: submissionId },
      data: {
        status: "GRADED",
        remarks
      }
    });

    revalidatePath(`/dashboard/teacher/assignments/${submission.assignmentId}`);
    return { success: true };
  } catch (error: unknown) {
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to grade submission." };
  }
}
