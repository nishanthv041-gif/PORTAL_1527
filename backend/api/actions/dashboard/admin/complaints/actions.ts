"use server";

import { prisma } from "@/backend/db/prisma";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { invalidateUserNotifCache } from "@/backend/api/actions/notifications/unifiedNotificationActions";
import { addComplaintMessageAction, getComplaintMessagesAction } from "@/backend/api/actions/dashboard/parent/complaints/actions";

export { addComplaintMessageAction, getComplaintMessagesAction };

/**
 * Admin action to create/describe a complaint for any student in the school
 * or log any other complaints directly to the system.
 * Automatically inserts notifications into the Notification database table for the student's parents.
 */
export async function createAdminComplaintAction(formData: FormData) {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session || session.user.role !== "ADMIN") {
      return { success: false, error: "Unauthorized. Admin privileges required." };
    }

    const studentId = (formData.get("studentId") as string)?.trim();
    const title = (formData.get("title") as string)?.trim();
    const category = ((formData.get("category") as string) || "OTHER").trim().toUpperCase();
    const severity = ((formData.get("severity") as string) || "MEDIUM").trim().toUpperCase();
    const description = (formData.get("description") as string)?.trim();
    const status = ((formData.get("status") as string) || "OPEN").trim().toUpperCase();
    const remarks = (formData.get("remarks") as string)?.trim() || null;
    const teacherId = ((formData.get("teacherId") as string) || "").trim() || null;

    if (!studentId) {
      return { success: false, error: "Please select a student for this complaint." };
    }

    if (!title) {
      return { success: false, error: "Please provide a title / subject for the complaint." };
    }

    if (!description) {
      return { success: false, error: "Please provide detailed description of the complaint." };
    }

    // Verify student exists
    const student = await prisma.student.findUnique({
      where: { id: studentId },
      include: {
        class: true,
        parents: {
          include: {
            parent: {
              include: { user: true }
            }
          }
        }
      }
    });

    if (!student) {
      return { success: false, error: "Student not found." };
    }

    // Create the complaint record and initial message atomically
    const complaint = await prisma.complaint.create({
      data: {
        title,
        description,
        category,
        severity,
        status,
        remarks,
        studentId,
        teacherId: teacherId || student.class?.classTeacherId || student.class?.teacherId || null,
        authorRole: "ADMIN",
        authorId: session.user.id,
        messages: {
          create: {
            userId: session.user.id,
            authorName: session.user.name || "School Administration",
            authorRole: "ADMIN",
            content: description
          }
        }
      }
    });

    // Connect to Notification database: Notify all linked parents of the student
    const parentUserIds = Array.from(new Set(
      student.parents.map(p => p.parent.userId).filter(Boolean)
    ));

    if (parentUserIds.length > 0) {
      await prisma.notification.createMany({
        data: parentUserIds.map(userId => ({
          userId,
          title: `School Notice / Complaint: ${title}`,
          content: `School Administration recorded a ${severity} priority complaint regarding ${student.firstName} ${student.lastName} (${category}): "${description}"`,
          type: "COMPLAINT",
          link: "/dashboard/parent/complaints"
        }))
      });

      await Promise.all(parentUserIds.map(uid => invalidateUserNotifCache(uid).catch(() => { })));
    }

    revalidatePath("/dashboard/admin/complaints");
    revalidatePath("/dashboard/parent/complaints");
    revalidatePath("/dashboard/parent/notifications");

    return { success: true, complaintId: complaint.id };
  } catch (error: unknown) {
    console.error("Error creating admin complaint:", error);
    return {
      success: false,
      error: (error instanceof Error ? error.message : String(error)) || "Failed to create complaint."
    };
  }
}

/**
 * Update complaint status & remarks by Admin.
 * Inserts a system update message into ComplaintMessage
 * and sends an update notification to the student's parents in the Notification table.
 */
export async function updateComplaintStatusAction(id: string, status: string, remarks: string) {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session || session.user.role !== "ADMIN") {
      return { error: "Unauthorized" };
    }

    const complaint = await prisma.complaint.findUnique({
      where: { id },
      include: {
        student: {
          include: {
            parents: { include: { parent: true } }
          }
        },
        parent: { include: { user: true } }
      }
    });

    if (!complaint) {
      return { error: "Complaint not found." };
    }

    await prisma.complaint.update({
      where: { id },
      data: {
        status,
        remarks: remarks?.trim() || null
      }
    });

    // Add a status change message in the conversation thread
    const statusNote = `📋 Status changed to **${status.replace("_", " ")}** by Administration.${remarks?.trim() ? `\n\n**Remarks:** ${remarks.trim()}` : ""}`;
    await prisma.complaintMessage.create({
      data: {
        complaintId: id,
        userId: session.user.id,
        authorName: "School Administration",
        authorRole: "ADMIN",
        content: statusNote
      }
    });

    // Connect to Notification database: Notify the parents of status update
    const parentUserIds = Array.from(new Set([
      complaint.parent?.userId,
      complaint.authorId,
      ...complaint.student.parents.map(p => p.parent.userId)
    ].filter(Boolean) as string[]));

    if (parentUserIds.length > 0) {
      await prisma.notification.createMany({
        data: parentUserIds.map(userId => ({
          userId,
          title: `Complaint Status: ${status.replace("_", " ")}`,
          content: `Your complaint "${complaint.title}" is now marked as ${status.replace("_", " ")}.${remarks?.trim() ? ` Remarks: ${remarks.trim()}` : ""}`,
          type: "COMPLAINT",
          link: "/dashboard/parent/complaints"
        }))
      });

      for (const uid of parentUserIds) {
        invalidateUserNotifCache(uid);
      }
    }

    revalidatePath("/dashboard/admin/complaints");
    revalidatePath("/dashboard/parent/complaints");
    return { success: true };
  } catch (error: unknown) {
    console.error("Error updating complaint status:", error);
    if (error instanceof Error) {
      return { error: error.message || "Failed to update complaint." };
    }
    return { error: "Failed to update complaint." };
  }
}

/**
 * Reply to complaint action with full conversation and notification support
 */
export async function replyToComplaintAction(complaintId: string, replyMessage: string, recipientUserId?: string) {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session || session.user.role !== "ADMIN") return { error: "Unauthorized" };

    const result = await addComplaintMessageAction(complaintId, replyMessage);
    if (!result.success) {
      return { error: result.error };
    }

    revalidatePath("/dashboard/admin/complaints");
    revalidatePath("/dashboard/parent/complaints");
    return { success: true };
  } catch (error: unknown) {
    if (error instanceof Error) {
      return { error: error.message || "Failed to send reply." };
    }
    return { error: "Failed to send reply." };
  }
}

/**
 * Delete a complaint by Admin
 */
export async function deleteComplaintAction(complaintId: string) {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session || session.user.role !== "ADMIN") {
      return { success: false, error: "Unauthorized" };
    }

    await prisma.complaint.delete({
      where: { id: complaintId }
    });

    revalidatePath("/dashboard/admin/complaints");
    revalidatePath("/dashboard/parent/complaints");
    return { success: true };
  } catch (error: unknown) {
    return {
      success: false,
      error: (error instanceof Error ? error.message : String(error)) || "Failed to delete complaint."
    };
  }
}
