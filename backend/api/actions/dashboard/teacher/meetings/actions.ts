"use server";

import { prisma } from "@/backend/db/prisma";
import { revalidatePath } from "next/cache";
import { sendInstantPortalNotification } from "@/lib/pushDispatcher";

export async function scheduleMeetingAction(formData: FormData) {
  try {
    const teacherId = formData.get("teacherId") as string;
    const parentId = formData.get("parentId") as string;
    const agenda = formData.get("agenda") as string;
    const dateStr = formData.get("date") as string;
    const time = formData.get("time") as string;
    const location = formData.get("location") as string;
    const link = formData.get("link") as string;

    if (!teacherId || !parentId || !agenda || !dateStr || !time) {
      return { error: "Missing required fields" };
    }

    const meeting = await prisma.meeting.create({
      data: {
        teachers: {
          connect: [{ id: teacherId }]
        },
        parents: {
          connect: [{ id: parentId }]
        },
        agenda,
        date: new Date(dateStr),
        time,
        location: location || null,
        link: link || null,
      },
      include: {
        parents: true
      }
    });

    if (meeting.parents.length > 0) {
      await sendInstantPortalNotification({
        targetUserIds: [meeting.parents[0].userId],
        category: "MEETING",
        title: "New Meeting Scheduled",
        body: `A teacher has scheduled a meeting: ${agenda} on ${dateStr} at ${time}. Venue: ${location || link || "School Campus"}`,
        link: "/dashboard/parent/meetings",
        tag: `meeting-sched-${meeting.id}`,
        priority: "HIGH",
      }).catch(() => {});
    }

    revalidatePath("/dashboard/teacher/meetings");
    return { success: true };
  } catch (error) {
    return { error: (error instanceof Error ? error.message : String(error)) || "Failed to schedule meeting" };
  }
}
