"use server";

import { prisma } from "@/backend/db/prisma";
import { revalidatePath } from "next/cache";
import { sendInstantPortalNotification } from "@/lib/pushDispatcher";

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

    const record = await prisma.disciplineRecord.create({
      data: {
        studentId,
        incident,
        severity,
        description,
        actionTaken,
        status: "PENDING", // Wait for admin review or just log it
      },
      include: {
        student: {
          include: {
            parents: {
              include: {
                parent: {
                  select: { userId: true }
                }
              }
            }
          }
        }
      }
    });

    // Notify parents immediately
    try {
      const parentUserIds = record.student.parents
        .map(p => p.parent.userId)
        .filter(Boolean) as string[];

      if (parentUserIds.length > 0) {
        await sendInstantPortalNotification({
          targetUserIds: parentUserIds,
          category: "DISCIPLINE",
          title: `⚠️ Discipline Notice: ${record.student.firstName} ${record.student.lastName || ""}`.trim(),
          body: `${incident}: ${description}`,
          link: "/dashboard/parent/discipline",
          priority: "HIGH",
          bypass48h: true,
        });
      }
    } catch (notifErr) {
      console.warn("[TeacherDiscipline] Notification dispatch note:", notifErr);
    }

    revalidatePath("/dashboard/teacher/discipline");
    return { success: true };
  } catch (error) {
    return { error: (error instanceof Error ? error.message : String(error)) || "Failed to log discipline record" };
  }
}
