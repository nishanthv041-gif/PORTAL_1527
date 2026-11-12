"use server";

import { prisma } from "@/backend/db/prisma";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { sendUnifiedBroadcast } from "@/backend/services/notifications/unifiedNotificationEngine";
import { sendInstantPortalNotification } from "@/lib/pushDispatcher";
import path from "path";
import fs from "fs/promises";

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB

const ALLOWED_EXTENSIONS = new Set([
  // Documents
  "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "csv",
  // Images
  "jpg", "jpeg", "png", "gif", "webp"
]);

async function saveHomeworkFile(file: File): Promise<string> {
  const originalName = file.name || "homework_file";
  const ext = (path.extname(originalName).slice(1) || "bin").toLowerCase();

  const cleanBaseName = path.basename(originalName, path.extname(originalName))
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 40);
  const uniqueFileName = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}-${cleanBaseName}.${ext}`;

  // 1. Try Vercel Blob if configured
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      const { put } = await import("@vercel/blob");
      const blob = await put(`homework/${uniqueFileName}`, file, {
        access: "public",
        contentType: file.type || undefined,
      });
      return blob.url;
    } catch (blobErr) {
      console.warn("Vercel Blob upload failed, falling back to local/data-uri storage:", blobErr);
    }
  }

  // 2. Local filesystem write if not serverless
  const isServerless = Boolean(
    process.env.VERCEL ||
    process.env.AWS_LAMBDA_FUNCTION_NAME ||
    process.env.LAMBDA_TASK_ROOT
  );

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const mime = file.type || "application/octet-stream";

  if (!isServerless) {
    try {
      const uploadDir = path.join(process.cwd(), "public", "uploads", "homework");
      await fs.mkdir(uploadDir, { recursive: true });
      const filePath = path.join(uploadDir, uniqueFileName);
      await fs.writeFile(filePath, buffer);
      return `/uploads/homework/${uniqueFileName}`;
    } catch (localErr) {
      console.warn("Local filesystem write failed, using data URI fallback:", localErr);
    }
  }

  // 3. Universal serverless Data URI fallback (safe for images & PDF)
  const base64 = buffer.toString("base64");
  return `data:${mime};base64,${base64}`;
}

/**
 * Automatically deletes all homework records whose deadline has passed.
 * Deletes associated comments and submissions, then the homework itself.
 */
export async function autoDeleteExpiredHomework() {
  try {
    const now = new Date();
    const expired = await prisma.assignment.findMany({
      where: {
        deadline: {
          lt: now
        }
      },
      select: { id: true, title: true }
    });

    if (expired.length > 0) {
      const expiredIds = expired.map(a => a.id);

      await prisma.homeworkComment.deleteMany({
        where: { assignmentId: { in: expiredIds } }
      });

      await prisma.submission.deleteMany({
        where: { assignmentId: { in: expiredIds } }
      });

      await prisma.assignment.deleteMany({
        where: { id: { in: expiredIds } }
      });

      console.log(`[AutoDelete] Successfully cleaned up ${expired.length} expired homework assignments.`);
    }

    return { success: true, count: expired.length };
  } catch (err) {
    console.error("Auto delete expired homework error:", err);
    return { success: false, error: "Failed to auto-delete expired homework" };
  }
}

export async function createAssignment(formData: FormData) {
  // First clean up any expired homework
  await autoDeleteExpiredHomework();

  const title = (formData.get("title") as string)?.trim();
  const description = (formData.get("description") as string)?.trim();
  const deadline = formData.get("deadline") as string;
  const classId = formData.get("classId") as string;
  const subjectId = (formData.get("subjectId") as string) || null;
  const teacherId = formData.get("teacherId") as string;
  const startConversation = formData.get("startConversation") !== "false";
  const file = formData.get("file") as File | null;

  if (!title || !deadline || !classId || !teacherId) {
    return { success: false, error: "Missing required fields (Title, Deadline, Class, or Teacher)" };
  }

  try {
    const session = await getServerSession(getAuthOptions());
    if (!session?.user) {
      return { success: false, error: "Unauthorized" };
    }

    if (!subjectId) {
      return { success: false, error: "Please select your assigned subject for this class." };
    }

    // Verify subject and strict staff assignment
    const subject = await prisma.subject.findUnique({
      where: { id: subjectId },
      select: { id: true, name: true, teacherId: true, classId: true }
    });

    if (!subject) {
      return { success: false, error: "Subject not found." };
    }

    if (subject.classId !== classId) {
      return { success: false, error: "Selected subject does not belong to the selected class." };
    }

    // Strict Subject Teacher Check: Only the assigned subject staff (or ADMIN) can create homework
    // (This page is for subject assigning staff, not class teacher concept)
    if (session.user.role !== "ADMIN") {
      const currentTeacher = await prisma.teacher.findUnique({
        where: { userId: session.user.id },
        select: { id: true }
      });

      const isSubjectTeacher = subject.teacherId === currentTeacher?.id;
      const isTimetableStaff = currentTeacher?.id ? (await prisma.timetable.count({
        where: { subjectId: subject.id, teacherId: currentTeacher.id }
      })) > 0 : false;

      if (!currentTeacher || (!isSubjectTeacher && !isTimetableStaff)) {
        return {
          success: false,
          error: "Only the assigned subject staff can send home work for this subject. Class teachers cannot create homework for subjects taught by other teachers."
        };
      }
    }

    // Optional File Upload Processing
    let fileUrl: string | null = null;
    if (file && typeof file === "object" && "size" in file && file.size > 0) {
      if (file.size > MAX_FILE_SIZE) {
        return { success: false, error: "Attached file exceeds the maximum size limit of 25MB." };
      }

      const originalName = file.name || "homework_file";
      const ext = (path.extname(originalName).slice(1) || "").toLowerCase();

      if (ext && !ALLOWED_EXTENSIONS.has(ext)) {
        return {
          success: false,
          error: `File type .${ext} is not supported. Please upload a PDF, Word document, Excel spreadsheet, PowerPoint, text file, or image.`
        };
      }

      try {
        fileUrl = await saveHomeworkFile(file);
      } catch (uploadErr) {
        console.error("Homework file upload error:", uploadErr);
        return { success: false, error: "Failed to upload attached homework file. Please try again." };
      }
    }

    const subjectName = subject.name;

    // Set deadline to end of day (23:59:59) so students have the full day before auto-delete
    const deadlineDate = new Date(deadline.includes("T") ? deadline : `${deadline}T23:59:59`);

    // Create the homework / assignment
    const assignment = await prisma.assignment.create({
      data: {
        title,
        description: description || null,
        deadline: deadlineDate,
        classId,
        subjectId: subjectId && subjectId.trim() !== "" ? subjectId : null,
        teacherId,
        fileUrl: fileUrl || null
      },
      include: {
        class: true,
        subject: true,
        teacher: {
          include: { user: true }
        }
      }
    });

    // Start work conversation if requested
    if (startConversation && session?.user?.id) {
      const introMessage = `📢 **Home Work Notice for Parents & Students**\n\n**Subject:** ${subjectName || assignment.subject?.name || "General"}\n**Class:** ${assignment.class.name} - ${assignment.class.section}\n**Due Date:** ${deadlineDate.toLocaleDateString()}\n\n${description ? `**Instructions:**\n${description}\n\n` : ""}Parents and students, please feel free to post any questions or updates regarding this homework here!`;

      await prisma.homeworkComment.create({
        data: {
          assignmentId: assignment.id,
          userId: session.user.id,
          authorName: session.user.name || assignment.teacher.user.name || "Teacher",
          authorRole: "TEACHER",
          content: introMessage
        }
      });
    }

    // Notify parents of students in this class
    try {
      const students = await prisma.student.findMany({
        where: { classId, isActive: true },
        select: {
          parents: {
            select: {
              parent: {
                select: { userId: true }
              }
            }
          }
        }
      });

      const parentUserIds = Array.from(new Set(
        students.flatMap(s => s.parents.map(p => p.parent.userId)).filter(Boolean)
      ));

      if (parentUserIds.length > 0) {
        await sendInstantPortalNotification({
          targetUserIds: parentUserIds,
          category: "HOMEWORK",
          title: `📚 New Homework: ${title}`,
          body: `${subjectName ? `[${subjectName}] ` : ""}${title} assigned for ${assignment.class.name} - ${assignment.class.section}. Due: ${deadlineDate.toLocaleDateString()}.`,
          link: "/dashboard/parent/homework",
          tag: `homework-${assignment.id}`,
          priority: "HIGH",
        });
      }
    } catch (notifErr) {
      console.warn("Could not send homework notifications:", notifErr);
    }

    revalidatePath("/dashboard/teacher/assignments");
    revalidatePath("/dashboard/teacher/homework");
    revalidatePath("/dashboard/parent/assignments");
    revalidatePath("/dashboard/parent/homework");

    return { success: true, assignmentId: assignment.id, fileUrl: assignment.fileUrl };
  } catch (error: unknown) {
    console.error("Error creating homework:", error);
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to create home work." };
  }
}

export async function deleteAssignment(assignmentId: string) {
  if (!assignmentId) {
    return { success: false, error: "Missing assignment ID" };
  }

  try {
    const session = await getServerSession(getAuthOptions());
    if (!session?.user) {
      return { success: false, error: "Unauthorized" };
    }

    // Check if the assignment exists
    const assignment = await prisma.assignment.findUnique({
      where: { id: assignmentId },
      include: {
        teacher: true,
        subject: true
      }
    });

    if (!assignment) {
      return { success: false, error: "Home work not found" };
    }

    // Permission check: only admin or current assigned subject teacher (or original creator) can delete
    const currentTeacher = await prisma.teacher.findUnique({
      where: { userId: session.user.id },
      select: { id: true }
    });

    const isCurrentSubjectTeacher = Boolean(
      assignment.subject?.teacherId && currentTeacher?.id === assignment.subject.teacherId
    );
    const isAssigningTeacher = assignment.teacher.userId === session.user.id;
    const isAdmin = session.user.role === "ADMIN";

    if (!isAdmin && !isCurrentSubjectTeacher && !isAssigningTeacher) {
      return {
        success: false,
        error: "Only the assigned subject staff can delete this home work. Class teachers cannot delete homework for other subjects."
      };
    }

    // Delete associated submissions & comments first
    await prisma.homeworkComment.deleteMany({
      where: { assignmentId }
    });

    await prisma.submission.deleteMany({
      where: { assignmentId }
    });

    // Delete the assignment
    await prisma.assignment.delete({
      where: { id: assignmentId }
    });

    revalidatePath("/dashboard/teacher/assignments");
    revalidatePath("/dashboard/teacher/homework");
    revalidatePath("/dashboard/parent/assignments");
    revalidatePath("/dashboard/parent/homework");

    return { success: true };
  } catch (error: unknown) {
    console.error("Error deleting homework:", error);
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to delete home work." };
  }
}

export async function getHomeworkComments(assignmentId: string) {
  if (!assignmentId) return [];

  try {
    const comments = await prisma.homeworkComment.findMany({
      where: { assignmentId },
      orderBy: { createdAt: "asc" },
      include: {
        user: {
          select: { id: true, name: true, role: true }
        }
      }
    });

    return comments.map(c => ({
      id: c.id,
      content: c.content,
      createdAt: c.createdAt.toISOString(),
      authorName: c.authorName || c.user?.name || "User",
      authorRole: c.authorRole || c.user?.role || "USER",
      userId: c.userId
    }));
  } catch (err) {
    console.error("Error fetching homework comments:", err);
    return [];
  }
}

export async function addHomeworkComment(assignmentId: string, content: string) {
  const cleanContent = content?.trim();
  if (!assignmentId || !cleanContent) {
    return { success: false, error: "Message content cannot be empty" };
  }

  try {
    const session = await getServerSession(getAuthOptions());
    if (!session?.user) {
      return { success: false, error: "Unauthorized" };
    }

    const comment = await prisma.homeworkComment.create({
      data: {
        assignmentId,
        userId: session.user.id,
        authorName: session.user.name || "User",
        authorRole: session.user.role || "USER",
        content: cleanContent
      }
    });

    revalidatePath(`/dashboard/teacher/assignments/${assignmentId}`);
    revalidatePath(`/dashboard/teacher/homework/${assignmentId}`);
    revalidatePath("/dashboard/teacher/assignments");
    revalidatePath("/dashboard/teacher/homework");
    revalidatePath("/dashboard/parent/assignments");
    revalidatePath("/dashboard/parent/homework");

    return {
      success: true,
      comment: {
        id: comment.id,
        content: comment.content,
        createdAt: comment.createdAt.toISOString(),
        authorName: comment.authorName,
        authorRole: comment.authorRole,
        userId: comment.userId
      }
    };
  } catch (error: unknown) {
    console.error("Error adding homework comment:", error);
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to post message." };
  }
}

export async function deleteHomeworkComment(commentId: string) {
  if (!commentId) {
    return { success: false, error: "Missing comment ID" };
  }

  try {
    const session = await getServerSession(getAuthOptions());
    if (!session?.user) {
      return { success: false, error: "Unauthorized" };
    }

    const comment = await prisma.homeworkComment.findUnique({
      where: { id: commentId },
      include: {
        assignment: {
          include: { teacher: true }
        }
      }
    });

    if (!comment) {
      return { success: false, error: "Comment not found" };
    }

    // Can delete if author, assigning teacher, or admin
    const isAuthor = comment.userId === session.user.id;
    const isTeacher = comment.assignment?.teacher?.userId === session.user.id;
    const isAdmin = session.user.role === "ADMIN";

    if (!isAuthor && !isTeacher && !isAdmin) {
      return { success: false, error: "Not authorized to delete this message" };
    }

    await prisma.homeworkComment.delete({
      where: { id: commentId }
    });

    revalidatePath("/dashboard/teacher/assignments");
    revalidatePath("/dashboard/teacher/homework");
    revalidatePath("/dashboard/parent/assignments");
    revalidatePath("/dashboard/parent/homework");

    return { success: true };
  } catch (error: unknown) {
    console.error("Error deleting comment:", error);
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "Failed to delete message." };
  }
}
