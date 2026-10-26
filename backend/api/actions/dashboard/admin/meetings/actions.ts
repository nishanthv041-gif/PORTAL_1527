"use server";

import { prisma } from "@/backend/db/prisma";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { invalidateUserNotifCache } from "@/backend/api/actions/notifications/unifiedNotificationActions";

export interface CreateMeetingInput {
  meetingType: "PARENTS" | "TEACHERS";
  topic: string;
  description?: string;
  date: string;
  startTime: string;
  endTime?: string;
  mode: "OFFLINE" | "ONLINE";
  place?: string;
  link?: string;
  staffInchargeId: string;
  additionalTeacherIds?: string[];
  // Parents audience
  parentAudienceType?: "ALL" | "CLASS" | "SELECTED";
  classId?: string;
  parentIds?: string[];
  // Teachers audience
  teacherAudienceType?: "ALL" | "SELECTED";
  selectedTeacherIds?: string[];
  notifyAttendees?: boolean;
  syncCalendar?: boolean;
}

export async function createMeetingAction(formData: FormData) {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session || session.user.role !== 'ADMIN') return { error: "Unauthorized access." };

    const meetingType = ((formData.get("meetingType") as string) || "PARENTS").toUpperCase() as "PARENTS" | "TEACHERS";
    const mode = ((formData.get("mode") as string) || "OFFLINE").toUpperCase() as "OFFLINE" | "ONLINE";
    const topic = (formData.get("topic") as string || formData.get("agenda") as string || "").trim();
    const description = ((formData.get("description") as string) || "").trim();
    const date = (formData.get("date") as string || "").trim();
    const startTime = (formData.get("startTime") as string || formData.get("time") as string || "").trim();
    const endTime = ((formData.get("endTime") as string) || "").trim();
    const place = ((formData.get("place") as string || formData.get("location") as string) || "").trim();
    const link = ((formData.get("link") as string) || "").trim();
    const staffInchargeId = ((formData.get("staffInchargeId") as string) || (formData.get("teacherId") as string) || "").trim();

    const notifyAttendees = formData.get("notifyAttendees") !== "false";
    const syncCalendar = formData.get("syncCalendar") !== "false";

    // Basic Validation
    if (!topic) return { error: "Meeting topic/agenda is required." };
    if (!date) return { error: "Meeting date is required." };
    if (!startTime) return { error: "Meeting start time is required." };
    if (!staffInchargeId) return { error: "Staff In-charge must be selected." };

    if (mode === "OFFLINE" && !place) {
      return { error: "Meeting place/venue is required for offline meetings." };
    }
    if (mode === "ONLINE" && !link) {
      return { error: "Meeting link URL is required for online meetings." };
    }

    // Verify Staff In-charge
    const staffIncharge = await prisma.teacher.findUnique({
      where: { id: staffInchargeId },
      include: { user: true }
    });
    if (!staffIncharge) {
      return { error: "Selected Staff In-charge not found." };
    }

    let teachersToConnect = new Set<string>();
    teachersToConnect.add(staffInchargeId);

    let parentsToConnect = new Set<string>();
    let audienceDescription = "";

    if (meetingType === "TEACHERS") {
      const teacherAudienceType = (formData.get("teacherAudienceType") as string) || "ALL";
      if (teacherAudienceType === "ALL") {
        const allTeachers = await prisma.teacher.findMany({
          where: { isActive: true },
          select: { id: true }
        });
        allTeachers.forEach(t => teachersToConnect.add(t.id));
        audienceDescription = `All Faculty Members (${allTeachers.length} teachers)`;
      } else {
        const selectedTeacherIds = formData.getAll("selectedTeacherIds") as string[];
        selectedTeacherIds.forEach(id => { if (id) teachersToConnect.add(id); });
        audienceDescription = `${teachersToConnect.size} Selected Teachers`;
      }
    } else {
      // PARENTS Meeting
      const parentAudienceType = (formData.get("parentAudienceType") as string) || "ALL";
      const additionalTeachers = formData.getAll("additionalTeacherIds") as string[];
      additionalTeachers.forEach(id => { if (id) teachersToConnect.add(id); });

      if (parentAudienceType === "ALL") {
        const allParents = await prisma.parent.findMany({
          where: { isActive: true },
          select: { id: true }
        });
        allParents.forEach(p => parentsToConnect.add(p.id));
        audienceDescription = `All Parents (School-wide, ${allParents.length} parents)`;
      } else if (parentAudienceType === "CLASS") {
        const classId = (formData.get("classId") as string) || "";
        if (!classId) return { error: "Class must be selected for Class-wise Parents meeting." };

        const targetClass = await prisma.class.findUnique({
          where: { id: classId },
          select: { name: true, section: true }
        });

        const classParents = await prisma.parent.findMany({
          where: {
            isActive: true,
            children: {
              some: {
                student: {
                  classId,
                  isActive: true
                }
              }
            }
          },
          select: { id: true }
        });

        classParents.forEach(p => parentsToConnect.add(p.id));
        audienceDescription = `${targetClass ? `${targetClass.name} - ${targetClass.section}` : "Selected Class"} Parents (${classParents.length} parents)`;
      } else if (parentAudienceType === "SELECTED") {
        const parentIds = formData.getAll("parentIds") as string[];
        parentIds.forEach(id => { if (id) parentsToConnect.add(id); });
        audienceDescription = `${parentsToConnect.size} Selected Parents`;
      }
    }

    const formattedTime = endTime ? `${startTime} - ${endTime}` : startTime;
    const formattedLocation = mode === "OFFLINE" ? place : (link ? "Online Meeting" : "Virtual");
    const formattedLink = mode === "ONLINE" ? link : null;

    // Structured metadata inside summary
    const summaryPayload = {
      meetingType,
      mode,
      topic,
      description,
      startTime,
      endTime,
      place: mode === "OFFLINE" ? place : "",
      link: mode === "ONLINE" ? link : "",
      staffInchargeId: staffIncharge.id,
      staffInchargeName: staffIncharge.user.name,
      audienceDescription
    };

    const meeting = await prisma.meeting.create({
      data: {
        date: new Date(date),
        time: formattedTime,
        agenda: topic,
        location: formattedLocation,
        link: formattedLink,
        summary: JSON.stringify(summaryPayload),
        teachers: {
          connect: Array.from(teachersToConnect).map(id => ({ id }))
        },
        parents: {
          connect: Array.from(parentsToConnect).map(id => ({ id }))
        }
      },
      include: {
        teachers: { include: { user: true } },
        parents: { include: { user: true } }
      }
    });

    // Date formatting helper
    const dateFormatted = new Date(date).toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric"
    });

    let notificationsCreated = 0;

    // Dispatch Database Notifications for Pop-up & Bell
    if (notifyAttendees) {
      const notificationsToInsert: {
        userId: string;
        title: string;
        content: string;
        type: string;
        link: string;
        isRead: boolean;
      }[] = [];

      // Parents notifications
      meeting.parents.forEach(p => {
        if (p.userId) {
          notificationsToInsert.push({
            userId: p.userId,
            title: `📢 Parents Meeting: ${topic}`,
            content: `Scheduled on ${dateFormatted} (${formattedTime}). Mode: ${mode === "ONLINE" ? "Online" : "In-Person"}. ${mode === "ONLINE" ? `Meeting Link: ${link}` : `Place: ${place}`}. Staff In-charge: ${staffIncharge.user.name}.${description ? ` Agenda: ${description}` : ""}`,
            type: "MEETING",
            link: "/dashboard/parent/meetings",
            isRead: false
          });
        }
      });

      // Teachers notifications
      meeting.teachers.forEach(t => {
        if (t.userId) {
          const isIncharge = t.id === staffIncharge.id;
          notificationsToInsert.push({
            userId: t.userId,
            title: isIncharge
              ? `🗓️ Staff In-charge Assignment: ${topic}`
              : `👥 ${meetingType === "PARENTS" ? "Parents-Faculty Meeting" : "Teachers Meeting"}: ${topic}`,
            content: `Scheduled on ${dateFormatted} (${formattedTime}). Mode: ${mode === "ONLINE" ? "Online" : "In-Person"}. ${mode === "ONLINE" ? `Meeting Link: ${link}` : `Place: ${place}`}. ${isIncharge ? "You are designated as Staff In-charge." : `Staff In-charge: ${staffIncharge.user.name}.`}${description ? ` Agenda: ${description}` : ""}`,
            type: "MEETING",
            link: "/dashboard/teacher/meetings",
            isRead: false
          });
        }
      });

      if (notificationsToInsert.length > 0) {
        await prisma.notification.createMany({
          data: notificationsToInsert
        }).catch(err => console.error("Error creating notifications:", err));
        notificationsCreated = notificationsToInsert.length;

        // Invalidate notification cache so pop-up appears immediately
        await invalidateUserNotifCache();
      }
    }

    // Sync with Calendar if enabled
    if (syncCalendar) {
      try {
        await prisma.calendarEvent.create({
          data: {
            title: `[${meetingType === "PARENTS" ? "Parents Meeting" : "Teachers Meeting"}] ${topic}`,
            type: "MEETING",
            date: new Date(date),
            startTime,
            endTime: endTime || startTime,
            location: mode === "ONLINE" ? (link || "Online") : (place || "Campus"),
            description: `Staff In-charge: ${staffIncharge.user.name}\nMode: ${mode}\n${description || topic}`,
            organizer: staffIncharge.user.name,
            audience: meetingType === "PARENTS" ? "ALL" : "TEACHER",
            status: "UPCOMING",
            isPublished: true
          }
        });
      } catch (calErr) {
        console.error("CalendarEvent creation warning:", calErr);
      }
    }

    // Revalidate paths
    revalidatePath("/dashboard/admin/meetings");
    revalidatePath("/dashboard/admin/activity-centre");
    revalidatePath("/dashboard/teacher/meetings");
    revalidatePath("/dashboard/parent/meetings");
    revalidatePath("/dashboard/admin/calendar");
    revalidatePath("/dashboard/parent/calendar");
    revalidatePath("/dashboard/teacher/calendar");
    revalidatePath("/dashboard/parent/notifications");
    revalidatePath("/dashboard/teacher/notifications");
    revalidatePath("/dashboard/admin/notifications");
    revalidatePath("/dashboard");

    return {
      success: true,
      meetingId: meeting.id,
      notificationsCreated
    };
  } catch (error: unknown) {
    console.error("createMeetingAction error:", error);
    if (error instanceof Error) {
      return { error: error.message || "Failed to schedule meeting." };
    }
    return { error: "Failed to schedule meeting." };
  }
}

/**
 * Re-send or manually push real-time notification pop-up for an existing meeting
 */
export async function sendMeetingNotificationAction(meetingId: string) {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session || session.user.role !== 'ADMIN') return { error: "Unauthorized access." };

    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
      include: {
        teachers: { include: { user: true } },
        parents: { include: { user: true } }
      }
    });

    if (!meeting) return { error: "Meeting not found." };

    let meta: any = {};
    if (meeting.summary) {
      try {
        meta = JSON.parse(meeting.summary);
      } catch {
        meta = { description: meeting.summary };
      }
    }

    const meetingType = meta.meetingType || (meeting.parents.length > 0 ? "PARENTS" : "TEACHERS");
    const mode = meta.mode || (meeting.link ? "ONLINE" : "OFFLINE");
    const place = meta.place || meeting.location || "";
    const link = meta.link || meeting.link || "";
    const inchargeName = meta.staffInchargeName || (meeting.teachers[0]?.user.name || "School Administration");
    const description = meta.description || meeting.agenda;

    const dateFormatted = new Date(meeting.date).toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric"
    });

    const notifs: {
      userId: string;
      title: string;
      content: string;
      type: string;
      link: string;
      isRead: boolean;
    }[] = [];

    // Parents
    meeting.parents.forEach(p => {
      if (p.userId) {
        notifs.push({
          userId: p.userId,
          title: `🔔 Reminder: Parents Meeting - ${meeting.agenda}`,
          content: `📅 Date: ${dateFormatted} (${meeting.time}). Mode: ${mode === "ONLINE" ? "Online" : "In-Person"}. ${mode === "ONLINE" ? `Link: ${link}` : `Place: ${place}`}. Staff In-charge: ${inchargeName}.${description ? ` Agenda: ${description}` : ""}`,
          type: "MEETING",
          link: "/dashboard/parent/meetings",
          isRead: false
        });
      }
    });

    // Teachers
    meeting.teachers.forEach(t => {
      if (t.userId) {
        notifs.push({
          userId: t.userId,
          title: `🔔 Reminder: ${meetingType === "PARENTS" ? "Parents-Faculty Meeting" : "Teachers Meeting"} - ${meeting.agenda}`,
          content: `📅 Date: ${dateFormatted} (${meeting.time}). Mode: ${mode === "ONLINE" ? "Online" : "In-Person"}. ${mode === "ONLINE" ? `Link: ${link}` : `Place: ${place}`}. Staff In-charge: ${inchargeName}.${description ? ` Agenda: ${description}` : ""}`,
          type: "MEETING",
          link: "/dashboard/teacher/meetings",
          isRead: false
        });
      }
    });

    if (notifs.length === 0) {
      return { error: "No attendees found for this meeting to notify." };
    }

    await prisma.notification.createMany({ data: notifs });
    await invalidateUserNotifCache();

    revalidatePath("/dashboard/admin/meetings");
    revalidatePath("/dashboard/teacher/meetings");
    revalidatePath("/dashboard/parent/meetings");
    revalidatePath("/dashboard/parent/notifications");
    revalidatePath("/dashboard/teacher/notifications");
    revalidatePath("/dashboard/admin/notifications");
    revalidatePath("/dashboard");

    return { success: true, count: notifs.length };
  } catch (error: unknown) {
    console.error("sendMeetingNotificationAction error:", error);
    if (error instanceof Error) {
      return { error: error.message || "Failed to dispatch notifications." };
    }
    return { error: "Failed to dispatch notifications." };
  }
}

export async function deleteMeetingAction(id: string) {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session || session.user.role !== 'ADMIN') return { error: "Unauthorized access." };

    const meeting = await prisma.meeting.findUnique({
      where: { id },
      select: { agenda: true, date: true }
    });

    await prisma.meeting.delete({ where: { id } });

    // Clean up related CalendarEvent if one exists with matching title/date
    if (meeting) {
      await prisma.calendarEvent.deleteMany({
        where: {
          type: "MEETING",
          title: { contains: meeting.agenda },
          date: meeting.date
        }
      }).catch(() => {});
    }

    revalidatePath("/dashboard/admin/meetings");
    revalidatePath("/dashboard/admin/activity-centre");
    revalidatePath("/dashboard/teacher/meetings");
    revalidatePath("/dashboard/parent/meetings");
    revalidatePath("/dashboard/admin/calendar");
    revalidatePath("/dashboard/parent/calendar");
    revalidatePath("/dashboard/teacher/calendar");
    revalidatePath("/dashboard");

    return { success: true };
  } catch (error: unknown) {
    if (error instanceof Error) {
      return { error: error.message || "Failed to delete meeting." };
    }
    return { error: "Failed to delete meeting." };
  }
}

