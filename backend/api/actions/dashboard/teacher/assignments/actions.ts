"use server";

import { prisma } from "@/backend/db/prisma";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";

export async function createAssignment(formData: FormData) {
  const title = (formData.get("title") as string)?.trim();
  const description = (formData.get("description") as string)?.trim();
  const deadline = formData.get("deadline") as string;
  const classId = formData.get("classId") as string;
  const subjectId = (formData.get("subjectId") as string) || null;
  const teacherId = formData.get("teacherId") as string;
  const startConversation = formData.get("startConversation") !== "false";

  if (!title || !deadline || !classId || !teacherId) {
    return { success: false, error: "Missing required fields (Title, Deadline, Class, or Teacher)" };
  }

  try {
    const session = await getServerSession(getAuthOptions());

    // Fetch subject details if provided
    let subjectName = "";
    if (subjectId) {
      const subject = await prisma.subject.findUnique({
        where: { id: subjectId },
        select: { name: true }
      });
      if (subject) subjectName = subject.name;
    }

    // Create the homework / assignment
    const assignment = await prisma.assignment.create({
      data: {
        title,
        description: description || null,
        deadline: new Date(deadline),
        classId,
        subjectId: subjectId && subjectId.trim() !== "" ? subjectId : null,
        teacherId
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
      const introMessage = `👋 **Home Work Discussion Started**\n\n**Subject:** ${subjectName || assignment.subject?.name || "General"}\n**Class:** ${assignment.class.name} - ${assignment.class.section}\n**Due Date:** ${new Date(deadline).toLocaleDateString()}\n\n${description ? `**Instructions:**\n${description}\n\n` : ""}Welcome students & parents! Please feel free to ask questions or discuss homework queries here with the teacher.`;

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
        await prisma.notification.createMany({
          data: parentUserIds.map(userId => ({
            userId,
            title: `New Home Work: ${title}`,
            content: `${subjectName ? `[${subjectName}] ` : ""}${title} assigned for ${assignment.class.name} - ${assignment.class.section}. Due on ${new Date(deadline).toLocaleDateString()}.`,
            type: "HOMEWORK",
            link: "/dashboard/parent/assignments"
          }))
        });
      }
    } catch (notifErr) {
      console.warn("Could not send homework notifications:", notifErr);
    }

    revalidatePath("/dashboard/teacher/assignments");
    revalidatePath("/dashboard/teacher/homework");
    revalidatePath("/dashboard/parent/assignments");
    revalidatePath("/dashboard/parent/homework");

    return { success: true, assignmentId: assignment.id };
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
        teacher: true
      }
    });

    if (!assignment) {
      return { success: false, error: "Home work not found" };
    }

    // Permission check: only admin or the assigning teacher can delete
    if (session.user.role !== "ADMIN" && assignment.teacher.userId !== session.user.id) {
      return { success: false, error: "You are not authorized to delete this home work." };
    }

    // Delete associated submissions & comments first if not cascading
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
