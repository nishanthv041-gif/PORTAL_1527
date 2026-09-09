"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function applyLeaveAction(formData: FormData) {
  try {
    const studentId = formData.get("studentId") as string;
    const startDateStr = formData.get("startDate") as string;
    const endDateStr = formData.get("endDate") as string;
    const reason = formData.get("reason") as string;

    if (!studentId || !startDateStr || !endDateStr || !reason) {
      return { error: "Missing required fields" };
    }

    const startDate = new Date(startDateStr);
    const endDate = new Date(endDateStr);

    if (endDate < startDate) {
      return { error: "End date cannot be before start date" };
    }

    await prisma.leaveRequest.create({
      data: {
        studentId,
        startDate,
        endDate,
        reason,
        status: "PENDING",
      }
    });

    revalidatePath("/dashboard/parent/leaves");
    return { success: true };
  } catch (error) {
    return { error: (error instanceof Error ? error.message : String(error)) || "Failed to submit leave request" };
  }
}
