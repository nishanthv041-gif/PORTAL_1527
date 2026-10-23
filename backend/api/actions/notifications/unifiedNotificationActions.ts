"use server";

import { prisma } from "@/backend/db/prisma";
import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";

export type UnifiedNotification = {
  id: string;
  category: "ANNOUNCEMENT" | "INSTRUCTION" | "MEETING" | "MESSAGE" | "REPORT_CARD" | "ASSIGNMENT" | "ATTENDANCE" | "SYSTEM" | "GENERAL";
  title: string;
  description: string;
  senderOrAuthor?: string;
  targetName?: string;
  timestamp: string;
  link: string;
  isRead: boolean;
  priority?: string;
  badgeLabel: string;
  badgeColors: {
    bg: string;
    text: string;
    border: string;
  };
};

export async function getUnifiedNotificationsAction(): Promise<UnifiedNotification[]> {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session || !session.user) return [];

    const userId = session.user.id;
    const userRole = (session.user.role || "").toUpperCase();

    const items: UnifiedNotification[] = [];

    // 1. Direct Notifications from Notification table
    const dbNotifications = await prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 15
    });

    for (const notif of dbNotifications) {
      const typeStr = (notif.type || "").toUpperCase();
      const titleLower = notif.title.toLowerCase();
      const contentLower = notif.content.toLowerCase();

      let category: UnifiedNotification["category"] = "GENERAL";
      let badgeLabel = "Notification";
      let badgeColors = { bg: "rgba(99, 102, 241, 0.12)", text: "#6366f1", border: "rgba(99, 102, 241, 0.25)" };

      if (typeStr.includes("MEETING") || titleLower.includes("meeting") || contentLower.includes("meeting")) {
        category = "MEETING";
        badgeLabel = "Meeting";
        badgeColors = { bg: "rgba(245, 158, 11, 0.12)", text: "#d97706", border: "rgba(245, 158, 11, 0.3)" };
      } else if (
        typeStr.includes("INSTRUCT") || 
        typeStr.includes("CIRCULAR") || 
        titleLower.includes("instruction") || 
        contentLower.includes("instruction") ||
        titleLower.includes("circular") ||
        contentLower.includes("circular") ||
        titleLower.includes("notice") ||
        contentLower.includes("notice")
      ) {
        category = "INSTRUCTION";
        badgeLabel = "Instruction";
        badgeColors = { bg: "rgba(16, 185, 129, 0.12)", text: "#059669", border: "rgba(16, 185, 129, 0.3)" };
      } else if (typeStr.includes("REPORT") || typeStr.includes("CARD")) {
        category = "REPORT_CARD";
        badgeLabel = "Report Card";
        badgeColors = { bg: "rgba(37, 99, 235, 0.12)", text: "#2563eb", border: "rgba(37, 99, 235, 0.25)" };
      } else if (typeStr.includes("ASSIGN") || typeStr.includes("HOMEWORK") || titleLower.includes("homework")) {
        category = "ASSIGNMENT";
        badgeLabel = "Assessment / Task";
        badgeColors = { bg: "rgba(16, 185, 129, 0.12)", text: "#059669", border: "rgba(16, 185, 129, 0.25)" };
      } else if (typeStr.includes("ATTEND")) {
        category = "ATTENDANCE";
        badgeLabel = "Attendance";
        badgeColors = { bg: "rgba(245, 158, 11, 0.12)", text: "#d97706", border: "rgba(245, 158, 11, 0.25)" };
      } else if (typeStr.includes("ANNOUNCE")) {
        category = "ANNOUNCEMENT";
        badgeLabel = "Announcement";
        badgeColors = { bg: "rgba(139, 92, 246, 0.12)", text: "#7c3aed", border: "rgba(139, 92, 246, 0.25)" };
      } else if (typeStr.includes("MESSAGE")) {
        category = "MESSAGE";
        badgeLabel = "Message";
        badgeColors = { bg: "rgba(6, 182, 212, 0.12)", text: "#0284c7", border: "rgba(6, 182, 212, 0.25)" };
      }

      items.push({
        id: `notif-${notif.id}`,
        category,
        title: notif.title,
        description: notif.content,
        timestamp: notif.createdAt.toISOString(),
        link: notif.link || (userRole === "PARENT" ? "/dashboard/parent/notifications" : userRole === "TEACHER" ? "/dashboard/teacher/notifications" : "/dashboard/admin/notifications"),
        isRead: notif.isRead,
        badgeLabel,
        badgeColors
      });
    }

    // 2. Scheduled Meetings for this user
    try {
      let userMeetings: any[] = [];
      if (userRole === "ADMIN") {
        // Admin sees all recent/upcoming meetings
        userMeetings = await prisma.meeting.findMany({
          orderBy: { date: "desc" },
          take: 6,
          include: {
            teachers: { include: { user: { select: { name: true } } } },
            parents: { include: { user: { select: { name: true } } } }
          }
        });
      } else if (userRole === "TEACHER") {
        const teacher = await prisma.teacher.findUnique({ where: { userId } });
        if (teacher) {
          userMeetings = await prisma.meeting.findMany({
            where: { teachers: { some: { id: teacher.id } } },
            orderBy: { date: "desc" },
            take: 6,
            include: {
              parents: { include: { user: { select: { name: true } } } }
            }
          });
        }
      } else if (userRole === "PARENT") {
        const parent = await prisma.parent.findUnique({ where: { userId } });
        if (parent) {
          userMeetings = await prisma.meeting.findMany({
            where: { parents: { some: { id: parent.id } } },
            orderBy: { date: "desc" },
            take: 6,
            include: {
              teachers: { include: { user: { select: { name: true } } } }
            }
          });
        }
      }

      for (const m of userMeetings) {
        const dateFormatted = new Date(m.date).toLocaleDateString(undefined, {
          weekday: "short",
          month: "short",
          day: "numeric",
          year: "numeric"
        });

        const locationText = m.location ? ` | Location: ${m.location}` : "";
        const linkText = m.link ? ` | Link: ${m.link}` : "";
        const desc = `Scheduled for ${dateFormatted} at ${m.time}.${locationText}${linkText} Agenda: ${m.agenda}`;

        items.push({
          id: `meeting-${m.id}`,
          category: "MEETING",
          title: `Meeting: ${m.agenda}`,
          description: desc,
          timestamp: m.date.toISOString(),
          link: userRole === "PARENT" ? "/dashboard/parent/meetings" : userRole === "TEACHER" ? "/dashboard/teacher/meetings" : "/dashboard/admin/meetings",
          isRead: false,
          priority: "HIGH",
          badgeLabel: "Meeting",
          badgeColors: { bg: "rgba(245, 158, 11, 0.12)", text: "#d97706", border: "rgba(245, 158, 11, 0.3)" }
        });
      }
    } catch (meetingErr) {
      console.error("Error fetching meetings for notifications:", meetingErr);
    }

    // 3. School Announcements & Instructions
    try {
      let announcementCondition: any = {};

      if (userRole === "ADMIN") {
        // Admin sees all announcements, instructions, and circulars
        announcementCondition = {};
      } else if (userRole === "TEACHER") {
        const teacher = await prisma.teacher.findUnique({
          where: { userId },
          include: { classes: { select: { id: true } } }
        });
        const teacherClassIds = teacher?.classes.map(c => c.id) || [];

        announcementCondition = {
          OR: [
            { targetType: "ALL" },
            { targetType: "TEACHERS" },
            { targetType: "CLASS", targetId: { in: teacherClassIds } }
          ]
        };
      } else if (userRole === "PARENT") {
        const parent = await prisma.parent.findUnique({
          where: { userId },
          include: { children: { select: { student: { select: { classId: true } } } } }
        });
        const childClassIds = parent?.children
          .map(c => c.student.classId)
          .filter(Boolean) as string[] || [];

        announcementCondition = {
          OR: [
            { targetType: "ALL" },
            { targetType: "PARENTS" },
            { targetType: "CLASS", targetId: { in: childClassIds } }
          ]
        };
      } else {
        announcementCondition = { targetType: "ALL" };
      }

      const announcements = await prisma.announcement.findMany({
        where: announcementCondition,
        orderBy: { createdAt: "desc" },
        take: 10
      });

      for (const ann of announcements) {
        const titleLower = ann.title.toLowerCase();
        const contentLower = ann.content.toLowerCase();

        let category: UnifiedNotification["category"] = "ANNOUNCEMENT";
        let badgeLabel = "Announcement";
        let badgeColors = { bg: "rgba(139, 92, 246, 0.12)", text: "#7c3aed", border: "rgba(139, 92, 246, 0.25)" };

        if (titleLower.includes("meeting") || contentLower.includes("meeting")) {
          category = "MEETING";
          badgeLabel = "Meeting Notice";
          badgeColors = { bg: "rgba(245, 158, 11, 0.12)", text: "#d97706", border: "rgba(245, 158, 11, 0.3)" };
        } else if (
          titleLower.includes("instruction") || 
          contentLower.includes("instruction") ||
          titleLower.includes("circular") || 
          contentLower.includes("circular") ||
          titleLower.includes("guideline") ||
          titleLower.includes("rule") ||
          titleLower.includes("notice") ||
          titleLower.includes("welfare") ||
          titleLower.includes("homework") ||
          titleLower.includes("home work")
        ) {
          category = "INSTRUCTION";
          badgeLabel = "Instruction";
          badgeColors = { bg: "rgba(16, 185, 129, 0.12)", text: "#059669", border: "rgba(16, 185, 129, 0.3)" };
        }

        items.push({
          id: `ann-${ann.id}`,
          category,
          title: ann.title,
          description: ann.content,
          timestamp: ann.createdAt.toISOString(),
          link: userRole === "PARENT" ? "/dashboard/parent/announcements" : userRole === "TEACHER" ? "/dashboard/teacher/announcements" : "/dashboard/admin/announcements",
          isRead: false,
          priority: ann.priority,
          badgeLabel,
          badgeColors
        });
      }
    } catch (annErr) {
      console.error("Error fetching announcements for notifications:", annErr);
    }

    // 4. Direct Messages sent to this user
    const messages = await prisma.message.findMany({
      where: { receiverId: userId },
      include: { sender: { select: { name: true, role: true } } },
      orderBy: { createdAt: "desc" },
      take: 4
    });

    for (const msg of messages) {
      items.push({
        id: `msg-${msg.id}`,
        category: "MESSAGE",
        title: `Message from ${msg.sender.name}`,
        description: msg.content,
        senderOrAuthor: msg.sender.name,
        timestamp: msg.createdAt.toISOString(),
        link: userRole === "PARENT" ? "/dashboard/parent/messages" : userRole === "TEACHER" ? "/dashboard/teacher/messages" : "/dashboard/admin/messages",
        isRead: msg.isRead,
        badgeLabel: "Message",
        badgeColors: { bg: "rgba(6, 182, 212, 0.12)", text: "#0284c7", border: "rgba(6, 182, 212, 0.25)" }
      });
    }

    // 5. Role-Specific Alerts: If Parent, check children's published report cards and assignments
    if (userRole === "PARENT") {
      const parentRecord = await prisma.parent.findUnique({
        where: { userId },
        include: {
          children: {
            include: {
              student: {
                include: {
                  class: true
                }
              }
            }
          }
        }
      });

      if (parentRecord && parentRecord.children.length > 0) {
        for (const childRel of parentRecord.children) {
          const student = childRel.student;

          // Check published report cards for this child
          const reportCards = await prisma.reportCard.findMany({
            where: { studentId: student.id, published: true },
            include: { exam: true },
            orderBy: { exam: { date: "desc" } },
            take: 2
          });

          for (const rc of reportCards) {
            const alreadyHasNotif = items.some(i => i.title.includes(rc.exam.name) && i.title.includes(student.firstName));
            if (!alreadyHasNotif) {
              items.push({
                id: `rc-${rc.id}`,
                category: "REPORT_CARD",
                title: `Report Card: ${student.firstName} ${student.lastName}`,
                description: `Academic results published for ${rc.exam.name}. Total Marks: ${rc.totalMarks} | Grade: ${rc.grade} (${rc.percentage}%). ${rc.remarks ? "Teacher Remarks: " + rc.remarks : ""}`,
                targetName: `${student.firstName} ${student.lastName}`,
                timestamp: rc.exam.date.toISOString(),
                link: `/dashboard/parent/report-cards/${student.id}`,
                isRead: rc.parentVerified,
                badgeLabel: "Report Card",
                badgeColors: { bg: "rgba(37, 99, 235, 0.12)", text: "#2563eb", border: "rgba(37, 99, 235, 0.25)" }
              });
            }
          }

          // Check assignments for child's class
          if (student.classId) {
            const assignments = await prisma.assignment.findMany({
              where: { classId: student.classId },
              include: { teacher: { include: { user: true } } },
              orderBy: { deadline: "desc" },
              take: 3
            });

            for (const asg of assignments) {
              const alreadyHasAsg = items.some(i => i.id === `asg-${asg.id}`);
              if (!alreadyHasAsg) {
                items.push({
                  id: `asg-${asg.id}`,
                  category: "ASSIGNMENT",
                  title: `Instruction/Task: ${asg.title}`,
                  description: `${asg.description || "Academic assignment task."} Teacher: ${asg.teacher.user.name}. Due: ${new Date(asg.deadline).toLocaleDateString()}`,
                  targetName: student.class?.name || "Class",
                  timestamp: asg.deadline.toISOString(),
                  link: `/dashboard/parent/assignments?childId=${student.id}`,
                  isRead: false,
                  badgeLabel: "Task / Instruction",
                  badgeColors: { bg: "rgba(16, 185, 129, 0.12)", text: "#059669", border: "rgba(16, 185, 129, 0.25)" }
                });
              }
            }
          }
        }
      }
    }

    // 6. Deduplicate items by title or ID
    const seenKeys = new Set<string>();
    const uniqueItems: UnifiedNotification[] = [];

    for (const item of items) {
      const dedupeKey = `${item.category}-${item.title.trim().toLowerCase()}`;
      if (!seenKeys.has(dedupeKey)) {
        seenKeys.add(dedupeKey);
        uniqueItems.push(item);
      }
    }

    // Sort all notifications by timestamp descending (newest first)
    uniqueItems.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return uniqueItems;
  } catch (error) {
    console.error("Error fetching unified notifications:", error);
    return [];
  }
}

export async function markNotificationReadAction(notificationId: string) {
  try {
    if (notificationId.startsWith("notif-")) {
      const realId = notificationId.replace("notif-", "");
      await prisma.notification.updateMany({
        where: { id: realId },
        data: { isRead: true }
      });
    } else if (notificationId.startsWith("msg-")) {
      const realId = notificationId.replace("msg-", "");
      await prisma.message.updateMany({
        where: { id: realId },
        data: { isRead: true }
      });
    } else if (notificationId.startsWith("rc-")) {
      const realId = notificationId.replace("rc-", "");
      await prisma.reportCard.updateMany({
        where: { id: realId },
        data: { parentVerified: true }
      });
    }
    return { success: true };
  } catch (error) {
    return { error: "Failed to mark as read" };
  }
}
