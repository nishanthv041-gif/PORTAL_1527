"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

export async function createDisciplineRecordAction(formData: FormData) {
  try {
    const session = await getServerSession(authOptions);
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

    await prisma.disciplineRecord.create({
      data: {
        studentId,
        incident,
        description,
        severity,
        actionTaken,
        date: new Date(date),
        status
      }
    });

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
