"use server";

import { prisma } from "@/backend/db/prisma";
import { revalidatePath } from "next/cache";

export async function logDisciplineAction(formData: FormData) {
  try {
    const studentId = formData.get("studentId") as string;
    const incident = formData.get("incident") as string;
    const severity = formData.get("severity") as string;
    const description = formData.get("description") as string;
    const actionTaken = formData.get("actionTaken") as string;

    if (!studentId || !incident || !severity || !description || !actionTaken) {
      return { error: "Missing required fields" };
    }

    await prisma.disciplineRecord.create({
      data: {
        studentId,
        incident,
        severity,
        description,
        actionTaken,
        status: "PENDING", // Wait for admin review or just log it
      }
    });

    revalidatePath("/dashboard/teacher/discipline");
    return { success: true };
  } catch (error) {
    return { error: (error instanceof Error ? error.message : String(error)) || "Failed to log discipline record" };
  }
}
