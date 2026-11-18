"use server";

import { prisma } from "@/backend/db/prisma";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { sendInstantPortalNotification } from "@/lib/pushDispatcher";

export async function createDisciplineRecordAction(formData: FormData) {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session || session.user.role !== 'ADMIN') return { error: "Unauthorized" };

    const studentId = formData.get("studentId") as string;
    const incident = formData.get("incident") as string;
    const description = formData.get("description") as string;
    const severity = formData.get("severity") as string;
    const actionTaken = formData.get("actionTaken") as string;
    const date = formData.get("date") as string;
    const status = formData.get("status") as string;

    if (!studentId || !incident || !description || !severity || !actionTaken || !date || !status) {
      return { error: "All fields are required." };
    }

    const record = await prisma.disciplineRecord.create({
      data: {
        studentId,
        incident,
        description,
        severity,
        actionTaken,
        date: new Date(date),
        status
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

    // Notify parents immediately via OneSignal and Push
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
      console.warn("[Discipline] Notification dispatch note:", notifErr);
    }

    revalidatePath("/dashboard/admin/discipline");
    return { success: true };
  } catch (error: unknown) {
    if (error instanceof Error) {
      return { error: error.message || "Failed to create discipline record." };
    }
    return { error: "Failed to create discipline record." };
  }
}

export async function deleteDisciplineRecordAction(id: string) {
  try {
    await prisma.disciplineRecord.delete({ where: { id } });
    revalidatePath("/dashboard/admin/discipline");
    return { success: true };
  } catch (error: unknown) {
    if (error instanceof Error) {
      return { error: error.message || "Failed to delete record." };
    }
    return { error: "Failed to delete record." };
  }
}
