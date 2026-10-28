"use server";

import { prisma } from "@/backend/db/prisma";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { invalidateUserNotifCache } from "@/backend/api/actions/notifications/unifiedNotificationActions";

/**
 * Submit one or more complaints by a Parent with multi-child selection,
 * category, severity, title, and description.
 * Automatically inserts notifications into the Notification table for all Admins.
 */
export async function submitParentComplaintAction(formData: FormData) {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session?.user) {
      return { success: false, error: "Unauthorized. Please sign in." };
    }

    const parent = await prisma.parent.findUnique({
      where: { userId: session.user.id },
      include: {
        user: true,
        children: {
          include: { student: { include: { class: true } } }
        }
      }
    });

    if (!parent) {
      return { success: false, error: "Parent profile not found." };
    }

    // Extract studentIds: could be multiple selected checkboxes or comma-separated string
    const rawStudentIds = formData.getAll("studentIds") as string[];
    let studentIds: string[] = [];

    if (rawStudentIds.length > 0) {
      studentIds = rawStudentIds.flatMap(s => s.split(",")).map(s => s.trim()).filter(Boolean);
    }

    // Fallback if submitted as single studentId
    if (studentIds.length === 0) {
      const singleStudentId = (formData.get("studentId") as string)?.trim();
      if (singleStudentId) studentIds = [singleStudentId];
    }

    if (studentIds.length === 0) {
      return { success: false, error: "Please select at least one student for this complaint." };
    }

    const title = (formData.get("title") as string)?.trim();
    const category = ((formData.get("category") as string) || "OTHER").trim().toUpperCase();
    const severity = ((formData.get("severity") as string) || "MEDIUM").trim().toUpperCase();
    const description = (formData.get("description") as string)?.trim();
    const teacherId = ((formData.get("teacherId") as string) || "").trim() || null;

    if (!title) {
      return { success: false, error: "Please provide a subject / title for the complaint." };
    }

    if (!description) {
      return { success: false, error: "Please provide detailed description of the complaint." };
    }

    // Fetch details of selected students
    const students = await prisma.student.findMany({
      where: { id: { in: studentIds } },
      include: { class: true }
    });

    if (students.length === 0) {
      return { success: false, error: "No valid students found for the selected IDs." };
    }

    // Find all active admins to notify in the database
    const admins = await prisma.user.findMany({
      where: { role: "ADMIN", status: "ACTIVE" },
      select: { id: true }
    });

    const createdComplaints = [];

    for (const student of students) {
      // Create the complaint record
      const complaint = await prisma.complaint.create({
        data: {
          title,
          description,
          category,
          severity,
          status: "OPEN",
          studentId: student.id,
          parentId: parent.id,
          teacherId: teacherId || student.class?.classTeacherId || student.class?.teacherId || null,
          authorRole: "PARENT",
          authorId: session.user.id,
          messages: {
            create: {
              userId: session.user.id,
              authorName: session.user.name || parent.user.name || "Parent",
              authorRole: "PARENT",
              content: description
            }
          }
        }
      });

      createdComplaints.push(complaint);
    }

    // Connect to Notification database: insert notification records for Admins
    if (admins.length > 0) {
      const studentNames = students.map(s => `${s.firstName} ${s.lastName}`).join(", ");
      const notifData = admins.map(admin => ({
        userId: admin.id,
        title: `New Parent Complaint: ${title}`,
        content: `${session.user.name || "Parent"} filed a ${severity} severity complaint regarding ${studentNames} (${category}): "${title}"`,
        type: "COMPLAINT",
        link: "/dashboard/admin/complaints"
      }));

      await prisma.notification.createMany({
        data: notifData
      });

      // Invalidate notification cache for admins concurrently
      await Promise.all(admins.map(admin => invalidateUserNotifCache(admin.id).catch(() => { })));
    }

    revalidatePath("/dashboard/parent/complaints");
    revalidatePath("/dashboard/admin/complaints");
    revalidatePath("/dashboard/parent/notifications");
    revalidatePath("/dashboard/admin/notifications");

    return {
      success: true,
      count: createdComplaints.length,
      complaintIds: createdComplaints.map(c => c.id)
    };
  } catch (error) {
    console.error("Error submitting parent complaint:", error);
    return {
      success: false,
      error: (error instanceof Error ? error.message : String(error)) || "Failed to submit complaint"
    };
  }
}

/**
 * Backwards compatibility wrapper for submitComplaintAction
 */
export async function submitComplaintAction(formData: FormData) {
  const res = await submitParentComplaintAction(formData);
  if (!res.success) {
    return { error: res.error };
  }
  return { success: true };
}

/**
 * Add a message to a complaint conversation thread.
 * Works for both Parents and Admins (and Teachers).
 * Automatically notifies the other party in the Notification table.
 */
export async function addComplaintMessageAction(complaintId: string, content: string) {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session?.user) {
      return { success: false, error: "Unauthorized." };
    }

    const cleanContent = content?.trim();
    if (!complaintId || !cleanContent) {
      return { success: false, error: "Message content cannot be empty." };
    }

    // Verify complaint exists
    const complaint = await prisma.complaint.findUnique({
      where: { id: complaintId },
      include: {
        student: {
          include: {
            class: true,
            parents: { include: { parent: true } }
          }
        },
        parent: { include: { user: true } },
        teacher: { include: { user: true } }
      }
    });

    if (!complaint) {
      return { success: false, error: "Complaint not found." };
    }

    // Authorization check
    const userRole = session.user.role;
    if (userRole === "PARENT") {
      const isParentOfStudent = complaint.student.parents.some(p => p.parent.userId === session.user.id);
      const isAuthor = complaint.authorId === session.user.id || complaint.parent?.userId === session.user.id;
      if (!isParentOfStudent && !isAuthor) {
        return { success: false, error: "You are not authorized to message on this complaint." };
      }
    }

    const authorName = session.user.name || (userRole === "ADMIN" ? "School Administration" : userRole === "PARENT" ? "Parent" : "Teacher");

    // Create the message in ComplaintMessage table
    const message = await prisma.complaintMessage.create({
      data: {
        complaintId,
        userId: session.user.id,
        authorName,
        authorRole: userRole,
        content: cleanContent
      }
    });

    // Notify the other party in the Notification database table
    try {
      if (userRole === "ADMIN") {
        // Admin replied -> Notify all linked parents of the student
        const parentUserIds = Array.from(new Set([
          complaint.parent?.userId,
          complaint.authorId,
          ...complaint.student.parents.map(p => p.parent.userId)
        ].filter(Boolean) as string[]));

        if (parentUserIds.length > 0) {
          await prisma.notification.createMany({
            data: parentUserIds.map(userId => ({
              userId,
              title: `Admin Reply: ${complaint.title}`,
              content: `${authorName}: ${cleanContent.length > 120 ? cleanContent.substring(0, 117) + "..." : cleanContent}`,
              type: "COMPLAINT",
              link: "/dashboard/parent/complaints"
            }))
          });

          for (const uid of parentUserIds) {
            invalidateUserNotifCache(uid);
          }
        }
      } else {
        // Parent or Teacher replied -> Notify all active Admins
        const admins = await prisma.user.findMany({
          where: { role: "ADMIN", status: "ACTIVE" },
          select: { id: true }
        });

        if (admins.length > 0) {
          await prisma.notification.createMany({
            data: admins.map(admin => ({
              userId: admin.id,
              title: `${userRole === "PARENT" ? "Parent" : "Teacher"} Reply: ${complaint.title}`,
              content: `${authorName} on ${complaint.student.firstName} ${complaint.student.lastName}'s complaint: "${cleanContent.length > 120 ? cleanContent.substring(0, 117) + "..." : cleanContent}"`,
              type: "COMPLAINT",
              link: "/dashboard/admin/complaints"
            }))
          });

          for (const admin of admins) {
            invalidateUserNotifCache(admin.id);
          }
        }
      }
    } catch (notifErr) {
      console.warn("Could not dispatch complaint reply notification:", notifErr);
    }

    revalidatePath("/dashboard/parent/complaints");
    revalidatePath("/dashboard/admin/complaints");

    return {
      success: true,
      message: {
        id: message.id,
        content: message.content,
        createdAt: message.createdAt.toISOString(),
        authorName: message.authorName,
        authorRole: message.authorRole,
        userId: message.userId
      }
    };
  } catch (error) {
    console.error("Error adding complaint message:", error);
    return {
      success: false,
      error: (error instanceof Error ? error.message : String(error)) || "Failed to post message"
    };
  }
}

/**
 * Fetch all conversation messages for a complaint
 */
export async function getComplaintMessagesAction(complaintId: string) {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session?.user) return [];

    const messages = await prisma.complaintMessage.findMany({
      where: { complaintId },
      orderBy: { createdAt: "asc" }
    });

    return messages.map(m => ({
      id: m.id,
      content: m.content,
      createdAt: m.createdAt.toISOString(),
      authorName: m.authorName,
      authorRole: m.authorRole,
      userId: m.userId
    }));
  } catch (err) {
    console.error("Error fetching complaint messages:", err);
    return [];
  }
}

/**
 * Delete a complaint (only if parent owns it and status is still OPEN, or admin)
 */
export async function deleteParentComplaintAction(complaintId: string) {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session?.user) return { success: false, error: "Unauthorized" };

    const complaint = await prisma.complaint.findUnique({
      where: { id: complaintId },
      include: { parent: true }
    });

    if (!complaint) return { success: false, error: "Complaint not found" };

    const isAdmin = session.user.role === "ADMIN";
    const isOwner = complaint.authorId === session.user.id || complaint.parent?.userId === session.user.id;

    if (!isAdmin && !isOwner) {
      return { success: false, error: "You are not authorized to delete this complaint." };
    }

    if (!isAdmin && complaint.status !== "OPEN") {
      return { success: false, error: "Cannot delete a complaint that is already under review or resolved." };
    }

    await prisma.complaint.delete({
      where: { id: complaintId }
    });

    revalidatePath("/dashboard/parent/complaints");
    revalidatePath("/dashboard/admin/complaints");

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: (error instanceof Error ? error.message : String(error)) || "Failed to delete complaint"
    };
  }
}
