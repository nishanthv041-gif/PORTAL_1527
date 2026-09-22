"use server";

import { prisma } from "@/backend/db/prisma";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";

export async function createMeetingAction(formData: FormData) {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session || session.user.role !== 'ADMIN') return { error: "Unauthorized" };

    const teacherIds = formData.getAll("teacherIds") as string[];
    const parentMode = formData.get("parentMode") as string;
    
    const date = formData.get("date") as string;
    const time = formData.get("time") as string;
    const agenda = formData.get("agenda") as string;
    const location = formData.get("location") as string;
    const link = formData.get("link") as string;

    if (!teacherIds.length || !date || !time || !agenda) {
      return { error: "Teachers, Date, Time, and Agenda are required." };
    }

    let parentsToConnect: { id: string }[] = [];
    let teachersToConnect = [...teacherIds];
    
    if (parentMode === "SELECTED_PARENTS") {
      const parentIds = formData.getAll("parentIds") as string[];
      parentsToConnect = parentIds.map(id => ({ id }));
    } else if (parentMode === "SINGLE_CLASS") {
      const classId = formData.get("classId") as string;
      if (classId) {
        const parents = await prisma.parent.findMany({
          where: { children: { some: { student: { classId } } } },
          select: { id: true, userId: true }
        });
        parentsToConnect = parents.map(p => ({ id: p.id }));
      }
    } else if (parentMode === "ALL_STUDENTS") {
      const parents = await prisma.parent.findMany({ select: { id: true } });
      parentsToConnect = parents.map(p => ({ id: p.id }));
    } else if (parentMode === "ALL_TEACHERS") {
      const allTeachers = await prisma.teacher.findMany({ select: { id: true } });
      teachersToConnect = allTeachers.map(t => t.id);
    }

    const meeting = await prisma.meeting.create({
      data: {
        date: new Date(date),
        time,
        agenda,
        location,
        link,
        teachers: {
          connect: teachersToConnect.map(id => ({ id }))
        },
        parents: {
          connect: parentsToConnect
        }
      },
      include: {
        teachers: true,
        parents: true
      }
    });

    // Create notifications for all teachers
    if (teacherIds.length > 0) {
      const eligibleUsers = await prisma.user.findMany({
        where: { id: { in: meeting.teachers.map(t => t.userId) }, notificationsEnabled: true },
        select: { id: true }
      });
      const eligibleUserIds = new Set(eligibleUsers.map(u => u.id));
      
      const notifyData = meeting.teachers.filter(t => eligibleUserIds.has(t.userId)).map(t => ({
        userId: t.userId,
        title: "New Meeting Scheduled",
        content: `You have been scheduled for a meeting: ${agenda} on ${date} at ${time}.`,
        type: "MEETING",
        link: "/dashboard/teacher/meetings"
      }));

      if (notifyData.length > 0) {
        await prisma.notification.createMany({ data: notifyData });
      }
    }

    // Create notifications for all parents
    if (parentsToConnect.length > 0) {
      const eligibleUsers = await prisma.user.findMany({
        where: { id: { in: meeting.parents.map(p => p.userId) }, notificationsEnabled: true },
        select: { id: true }
      });
      const eligibleUserIds = new Set(eligibleUsers.map(u => u.id));

      const notifyData = meeting.parents.filter(p => eligibleUserIds.has(p.userId)).map(p => ({
        userId: p.userId,
        title: "New Meeting Scheduled",
        content: `A meeting has been scheduled: ${agenda} on ${date} at ${time}.`,
        type: "MEETING",
        link: "/dashboard/parent/meetings"
      }));

      if (notifyData.length > 0) {
        await prisma.notification.createMany({ data: notifyData });
      }
    }

    revalidatePath("/dashboard/admin/meetings");
    return { success: true };
  } catch (error: unknown) {
    if (error instanceof Error) {
      return { error: error.message || "Failed to create meeting." };
    }
    return { error: "Failed to create meeting." };
  }
}

export async function deleteMeetingAction(id: string) {
  try {
    await prisma.meeting.delete({ where: { id } });
    revalidatePath("/dashboard/admin/meetings");
    return { success: true };
  } catch (error: unknown) {
    if (error instanceof Error) {
      return { error: error.message || "Failed to delete meeting." };
    }
    return { error: "Failed to delete meeting." };
  }
}
