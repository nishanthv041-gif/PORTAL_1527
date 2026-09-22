"use server";

import { prisma } from "@/backend/db/prisma";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";

export async function updateComplaintStatusAction(id: string, status: string, remarks: string) {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session || session.user.role !== 'ADMIN') return { error: "Unauthorized" };

    await prisma.complaint.update({
      where: { id },
      data: { status, remarks }
    });

    revalidatePath("/dashboard/admin/complaints");
    return { success: true };
  } catch (error: unknown) {
    if (error instanceof Error) {
      return { error: error.message || "Failed to update complaint." };
    }
    return { error: "Failed to update complaint." };
  }
}

export async function replyToComplaintAction(complaintId: string, replyMessage: string, recipientUserId: string) {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session || session.user.role !== 'ADMIN') return { error: "Unauthorized" };

    const recipient = await prisma.user.findUnique({
      where: { id: recipientUserId },
      select: { notificationsEnabled: true }
    });

    if (recipient?.notificationsEnabled) {
      await prisma.notification.create({
        data: {
          userId: recipientUserId,
          title: "Reply to your Complaint",
          content: replyMessage,
          type: "SYSTEM",
          link: "/dashboard/teacher/complaints" // generic link
        }
      });
    }

    revalidatePath("/dashboard/admin/complaints");
    return { success: true };
  } catch (error: unknown) {
    if (error instanceof Error) {
      return { error: error.message || "Failed to send reply." };
    }
    return { error: "Failed to send reply." };
  }
}
