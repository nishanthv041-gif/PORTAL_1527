"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

export async function submitComplaintAction(formData: FormData) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return { error: "Unauthorized" };

    const studentId = formData.get("studentId") as string;
    const teacherId = formData.get("teacherId") as string;
    const title = formData.get("title") as string;
    const description = formData.get("description") as string;

    if (!studentId || !teacherId || !title || !description) {
      return { error: "Missing required fields" };
    }

    await prisma.complaint.create({
      data: {
        studentId,
        teacherId,
        title,
        description,
        category: "GENERAL",
        severity: "LOW",
        status: "OPEN",
      }
    });

    revalidatePath("/dashboard/parent/complaints");
    return { success: true };
  } catch (error) {
    return { error: (error instanceof Error ? error.message : String(error)) || "Failed to submit complaint" };
  }
}
