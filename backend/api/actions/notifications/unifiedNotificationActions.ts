"use server";

import { prisma } from "@/backend/db/prisma";
import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";

export type UnifiedNotification = {
  id: string;
  category: "ANNOUNCEMENT" | "MESSAGE" | "REPORT_CARD" | "ASSIGNMENT" | "ATTENDANCE" | "SYSTEM" | "GENERAL";
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
      take: 8
    });

    for (const notif of dbNotifications) {
      const typeStr = (notif.type || "").toUpperCase();
      let category: UnifiedNotification["category"] = "GENERAL";
      let badgeLabel = "Notification";
      let badgeColors = { bg: "rgba(99, 102, 241, 0.12)", text: "#6366f1", border: "rgba(99, 102, 241, 0.25)" };

      if (typeStr.includes("REPORT") || typeStr.includes("CARD")) {
        category = "REPORT_CARD";
        badgeLabel = "Report Card";
        badgeColors = { bg: "rgba(37, 99, 235, 0.12)", text: "#2563eb", border: "rgba(37, 99, 235, 0.25)" };
      } else if (typeStr.includes("ASSIGN") || typeStr.includes("HOMEWORK") || typeStr.includes("EXAM")) {
        category = "ASSIGNMENT";
        badgeLabel = "Assessment";
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

    // 2. Active School Announcements
    const targetTypeCondition = userRole === "PARENT" 
      ? [{ targetType: "ALL" }, { targetType: "PARENTS" }]
      : userRole === "TEACHER"
      ? [{ targetType: "ALL" }, { targetType: "TEACHERS" }]
      : [{ targetType: "ALL" }];

    const announcements = await prisma.announcement.findMany({
      where: {
        OR: targetTypeCondition
      },
      orderBy: { createdAt: "desc" },
      take: 4
    });

    for (const ann of announcements) {
      items.push({
        id: `ann-${ann.id}`,
        category: "ANNOUNCEMENT",
        title: ann.title,
        description: ann.content,
        timestamp: ann.createdAt.toISOString(),
        link: userRole === "PARENT" ? "/dashboard/parent/announcements" : userRole === "TEACHER" ? "/dashboard/teacher/announcements" : "/dashboard/admin/announcements",
        isRead: false,
        priority: ann.priority,
        badgeLabel: "Announcement",
        badgeColors: { bg: "rgba(139, 92, 246, 0.12)", text: "#7c3aed", border: "rgba(139, 92, 246, 0.25)" }
      });
    }

    // 3. Direct Messages sent to this user
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

    // 4. Role-Specific Alerts: If Parent, check children's published report cards and assignments
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
            // Avoid duplicate if notification already exists
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
              take: 2
            });

            for (const asg of assignments) {
              const alreadyHasAsg = items.some(i => i.id === `asg-${asg.id}`);
              if (!alreadyHasAsg) {
                items.push({
                  id: `asg-${asg.id}`,
                  category: "ASSIGNMENT",
                  title: `Assessment: ${asg.title}`,
                  description: `${asg.description || "New homework/assignment assigned."} Assigned by: ${asg.teacher.user.name}. Due Date: ${new Date(asg.deadline).toLocaleDateString()}`,
                  targetName: student.class?.name || "Class",
                  timestamp: asg.deadline.toISOString(),
                  link: `/dashboard/parent/assignments?childId=${student.id}`,
                  isRead: false,
                  badgeLabel: "Assessment",
                  badgeColors: { bg: "rgba(16, 185, 129, 0.12)", text: "#059669", border: "rgba(16, 185, 129, 0.25)" }
                });
              }
            }
          }
        }
      }
    }

    // Sort all notifications by timestamp descending (newest first)
    items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return items;
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
