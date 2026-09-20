"use server";

import { prisma } from "@/backend/db/prisma";
import { revalidatePath } from "next/cache";

export async function raiseComplaintAction(formData: FormData) {
  try {
    const teacherId = formData.get("teacherId") as string;
    const studentId = formData.get("studentId") as string;
    const title = formData.get("title") as string;
    const category = formData.get("category") as string;
    const severity = formData.get("severity") as string;
    const description = formData.get("description") as string;

    if (!teacherId || !studentId || !title || !category || !severity || !description) {
      return { error: "Missing required fields" };
    }

    await prisma.complaint.create({
      data: {
        teacherId,
        studentId,
        title,
        category,
        severity,
        description,
        status: "OPEN",
      }
    });

    revalidatePath("/dashboard/teacher/complaints");
    return { success: true };
  } catch (error) {
    return { error: (error instanceof Error ? error.message : String(error)) || "Failed to raise complaint" };
  }
}
