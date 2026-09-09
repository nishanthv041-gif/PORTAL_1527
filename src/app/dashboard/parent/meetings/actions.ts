"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function requestMeetingAction(formData: FormData) {
  try {
    const parentId = formData.get("parentId") as string;
    const teacherId = formData.get("teacherId") as string;
    const agenda = formData.get("agenda") as string;
    const dateStr = formData.get("date") as string;
    const time = formData.get("time") as string;

    if (!parentId || !teacherId || !agenda || !dateStr || !time) {
      return { error: "Missing required fields" };
    }

    const meeting = await prisma.meeting.create({
      data: {
        parents: {
          connect: [{ id: parentId }]
        },
        teachers: {
          connect: [{ id: teacherId }]
        },
        agenda,
        date: new Date(dateStr),
        time,
        // Location and link will be filled by the teacher
        location: "To be determined",
      },
      include: {
        teachers: true
      }
    });

    if (meeting.teachers.length > 0) {
      const teacherUser = await prisma.user.findUnique({
        where: { id: meeting.teachers[0].userId },
        select: { notificationsEnabled: true }
      });
      if (teacherUser?.notificationsEnabled) {
        await prisma.notification.create({
          data: {
            userId: meeting.teachers[0].userId,
            title: "New Meeting Request",
            content: `A parent has requested a meeting: ${agenda} on ${dateStr} at ${time}.`,
            type: "MEETING",
            link: "/dashboard/teacher/meetings"
          }
        });
      }
    }

    revalidatePath("/dashboard/parent/meetings");
    return { success: true };
  } catch (error) {
    return { error: (error instanceof Error ? error.message : String(error)) || "Failed to request meeting" };
  }
}
