"use server";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

export async function sendReportCardToParentAction(studentId: string) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user.role !== "ADMIN" && session.user.role !== "TEACHER")) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const student = await prisma.student.findUnique({
      where: { id: studentId },
      include: {
        parents: {
          include: {
            parent: {
              include: {
                user: true
              }
            }
          }
        }
      }
    });

    if (!student) {
      return { success: false, error: "Student not found" };
    }

    if (student.parents.length === 0) {
      return { success: false, error: "No parents linked to this student" };
    }

    // Create a notification for each parent
    for (const parentStudent of student.parents) {
      const parentUser = parentStudent.parent.user;
      if (parentUser && parentUser.notificationsEnabled) {
        await prisma.notification.create({
          data: {
            userId: parentUser.id,
            title: "Report Card Available",
            content: `The report card for ${student.firstName} ${student.lastName} has been generated and is now available for viewing.`,
            type: "REPORT_CARD",
            link: `/dashboard/parent/report-cards/${student.id}`
          }
        });
      }
    }

    return { success: true };
  } catch (error: unknown) {
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "An unexpected error occurred" };
  }
}
