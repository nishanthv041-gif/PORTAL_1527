"use server";

import { prisma } from "@/backend/db/prisma";
import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { setClassTeacher } from "@/backend/api/actions/dashboard/admin/classes/classTeacherActions";
import { revalidatePath } from "next/cache";

export async function submitClassTeacherRequestAction(classId: string): Promise<{
  success?: boolean;
  error?: string;
  isPending?: boolean;
}> {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session || session.user.role !== "TEACHER") {
      return { error: "Teacher session required." };
    }

    const teacher = await prisma.teacher.findUnique({
      where: { userId: session.user.id },
      include: { user: { select: { id: true, name: true } } }
    });

    if (!teacher) {
      return { error: "Teacher profile not found." };
    }

    const targetClass = await prisma.class.findUnique({
      where: { id: classId },
      select: { id: true, name: true, section: true }
    });

    if (!targetClass) {
      return { error: "Class not found." };
    }

    // Check for existing pending request
    const existing = await prisma.classTeacherRequest.findFirst({
      where: {
        teacherId: teacher.id,
        classId: targetClass.id,
        status: "PENDING"
      }
    });

    if (existing) {
      return { success: true, isPending: true };
    }

    // Create new request
    await prisma.classTeacherRequest.create({
      data: {
        teacherId: teacher.id,
        classId: targetClass.id,
        status: "PENDING"
      }
    });

    // Notify Administrators
    const admins = await prisma.user.findMany({
      where: { role: "ADMIN", status: "ACTIVE" },
      select: { id: true }
    });

    if (admins.length > 0) {
      const notifData = admins.map((adm) => ({
        userId: adm.id,
        type: "CLASS_TEACHER_REQUEST",
        title: "Class Teacher Request",
        content: `${teacher.user.name} requested to be designated as Class Teacher for ${targetClass.name} - ${targetClass.section}.`,
        link: "/dashboard/admin/classes/reconciliation",
        isRead: false
      }));

      await prisma.notification.createMany({
        data: notifData
      });
    }

    revalidatePath("/dashboard/teacher/birthdays");
    revalidatePath("/dashboard/teacher/birthdays/missing");
    revalidatePath("/dashboard/admin/classes/reconciliation");

    return { success: true, isPending: true };
  } catch (err: unknown) {
    console.error("submitClassTeacherRequestAction error:", err);
    return { error: err instanceof Error ? err.message : "Failed to submit request." };
  }
}

export async function getTeacherPendingClassRequestsAction(): Promise<string[]> {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session || session.user.role !== "TEACHER") return [];

    const teacher = await prisma.teacher.findUnique({
      where: { userId: session.user.id },
      select: { id: true }
    });

    if (!teacher) return [];

    const requests = await prisma.classTeacherRequest.findMany({
      where: { teacherId: teacher.id, status: "PENDING" },
      select: { classId: true }
    });

    return requests.map((r) => r.classId);
  } catch {
    return [];
  }
}

export async function reviewClassTeacherRequestAction(params: {
  requestId: string;
  approved: boolean;
  reviewNote?: string;
}): Promise<{ success: boolean; message: string }> {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session || session.user.role !== "ADMIN") {
      throw new Error("Admin authorization required.");
    }

    const request = await prisma.classTeacherRequest.findUnique({
      where: { id: params.requestId },
      include: {
        teacher: { include: { user: { select: { id: true, name: true } } } },
        class: { select: { id: true, name: true, section: true } }
      }
    });

    if (!request) {
      throw new Error("Request not found.");
    }

    if (params.approved) {
      // Execute assignment via canonical setClassTeacher
      const setRes = await setClassTeacher(request.classId, request.teacherId, { confirmReplace: true });
      if (setRes.error) {
        throw new Error(setRes.error);
      }

      await prisma.classTeacherRequest.update({
        where: { id: params.requestId },
        data: {
          status: "APPROVED",
          reviewedAt: new Date(),
          reviewedBy: session.user.id,
          reviewNote: params.reviewNote || "Approved by Administrator"
        }
      });

      // Notify the teacher
      await prisma.notification.create({
        data: {
          userId: request.teacher.user.id,
          type: "CLASS_TEACHER_APPROVAL",
          title: "Class Teacher Request Approved 🎉",
          content: `You are now designated as the Class Teacher for ${request.class.name} - ${request.class.section}. You now have full access to student birthday records.`,
          link: `/dashboard/teacher/birthdays/missing?classId=${request.classId}`,
          isRead: false
        }
      });

      return { success: true, message: `Approved ${request.teacher.user.name} as Class Teacher for ${request.class.name} - ${request.class.section}.` };
    } else {
      await prisma.classTeacherRequest.update({
        where: { id: params.requestId },
        data: {
          status: "REJECTED",
          reviewedAt: new Date(),
          reviewedBy: session.user.id,
          reviewNote: params.reviewNote || "Declined by Administrator"
        }
      });

      // Notify the teacher
      await prisma.notification.create({
        data: {
          userId: request.teacher.user.id,
          type: "CLASS_TEACHER_DECLINED",
          title: "Class Teacher Request Update",
          content: `Your request for ${request.class.name} - ${request.class.section} was reviewed by the school administrator: ${params.reviewNote || "Not approved at this time."}`,
          link: "/dashboard/teacher",
          isRead: false
        }
      });

      return { success: true, message: `Declined request for ${request.teacher.user.name}.` };
    }
  } catch (err: unknown) {
    console.error("reviewClassTeacherRequestAction error:", err);
    throw err;
  }
}
