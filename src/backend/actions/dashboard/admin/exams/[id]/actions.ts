"use server";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import { revalidatePath } from "next/cache";

export async function saveMarks(
  examId: string,
  subjectId: string,
  marks: { studentId: string; score: number; maxScore: number; remarks: string | null }[]
) {
  const session = await getServerSession(authOptions);
  if (!session) return { success: false, error: "Unauthorized" };

  try {
    for (const mark of marks) {
      const existing = await prisma.mark.findUnique({
        where: {
          studentId_examId_subjectId: {
            studentId: mark.studentId,
            examId,
            subjectId
          }
        }
      });

      if (existing) {
        if (existing.score !== mark.score || existing.remarks !== mark.remarks) {
          await prisma.mark.update({
            where: { id: existing.id },
            data: {
              score: mark.score,
              maxScore: mark.maxScore,
              remarks: mark.remarks
            }
          });

          await prisma.markHistory.create({
            data: {
              markId: existing.id,
              oldScore: existing.score,
              newScore: mark.score,
              changedBy: session.user.id
            }
          });
        }
      } else {
        await prisma.mark.create({
          data: {
            studentId: mark.studentId,
            examId,
            subjectId,
            score: mark.score,
            maxScore: mark.maxScore,
            remarks: mark.remarks
          }
        });
      }
    }

    revalidatePath(`/dashboard/admin/exams/${examId}`);
    return { success: true };
  } catch (error: unknown) {
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to save marks." };
  }
}
