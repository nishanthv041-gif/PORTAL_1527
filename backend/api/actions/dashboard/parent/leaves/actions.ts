"use server";

import { prisma } from "@/backend/db/prisma";
import { revalidatePath } from "next/cache";
import { dispatchNotification } from "@/lib/dispatcher";

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

    const newLeave = await prisma.leaveRequest.create({
      data: {
        studentId,
        startDate,
        endDate,
        reason,
        status: "PENDING",
      },
    });

    // Notify Class Teacher via push
    const student = await prisma.student.findUnique({
      where: { id: studentId },
      include: {
        class: {
          include: {
            classTeacher: { select: { userId: true } },
            teacher: { select: { userId: true } },
          },
        },
      },
    });

    const teacherUserId = student?.class?.classTeacher?.userId || student?.class?.teacher?.userId;
    if (teacherUserId) {
      await dispatchNotification({
        type: "LEAVE",
        entityId: newLeave.id,
        recipients: [teacherUserId],
        title: `📝 New Leave Application: ${student?.firstName || "Student"}`,
        body: `Leave requested from ${startDateStr} to ${endDateStr}. Reason: ${reason.slice(0, 80)}`,
        url: "/dashboard/teacher/leaves",
        priority: "HIGH",
        tag: `leave-request-${newLeave.id}`,
      }).catch((err) => console.warn("[LeaveAction] Push notification error:", err));
    }

    revalidatePath("/dashboard/parent/leaves");
    return { success: true };
  } catch (error) {
    return { error: (error instanceof Error ? error.message : String(error)) || "Failed to submit leave request" };
  }
}
