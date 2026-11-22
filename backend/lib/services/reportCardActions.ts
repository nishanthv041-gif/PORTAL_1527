"use server";

import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import { sendStudentReportCardEmail, ReportCardEmailSubjectMark } from "@/backend/lib/services/emailService";
import { revalidatePath } from "next/cache";
import { sendInstantPortalNotification } from "@/lib/pushDispatcher";

export async function sendReportCardToParentAction(studentId: string) {
  const session = await getServerSession(getAuthOptions());
  if (!session || (session.user.role !== "ADMIN" && session.user.role !== "TEACHER")) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const student = await prisma.student.findUnique({
      where: { id: studentId },
      include: {
        class: true,
        parents: {
          include: {
            parent: {
              include: {
                user: true
              }
            }
          }
        },
        marks: {
          include: {
            subject: true,
            exam: true
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

    // Compute marks summary if any exist
    let totalScore = 0;
    let maxTotal = 0;
    const subjectMarks: ReportCardEmailSubjectMark[] = [];
    let examName: string | undefined;

    if (student.marks && student.marks.length > 0) {
      examName = student.marks[0]?.exam?.name;
      for (const m of student.marks) {
        if (m.remarks === 'Absent') {
          maxTotal += (m.subject?.maxMarks || m.maxScore);
          subjectMarks.push({
            subjectName: m.subject?.name || "Subject",
            score: 0,
            maxScore: m.maxScore,
            isFail: true,
            remarks: "Absent"
          });
        } else {
          totalScore += m.score;
          maxTotal += m.maxScore;
          const isFail = m.subject ? m.score < m.subject.passMarks : m.score < 35;
          subjectMarks.push({
            subjectName: m.subject?.name || "Subject",
            score: m.score,
            maxScore: m.maxScore,
            isFail,
            remarks: m.remarks
          });
        }
      }
    }

    const percentage = maxTotal > 0 ? ((totalScore / maxTotal) * 100).toFixed(1) : undefined;
    let grade: string | undefined;
    if (percentage) {
      const p = parseFloat(percentage);
      if (p >= 90) grade = "A+";
      else if (p >= 80) grade = "A";
      else if (p >= 70) grade = "B";
      else if (p >= 60) grade = "C";
      else if (p >= 50) grade = "D";
      else grade = "E";
    }

    const className = student.class ? `${student.class.name} - ${student.class.section}` : "Class";
    const studentFullName = `${student.firstName} ${student.lastName}`.trim();
    const sentRecipients: string[] = [];

    // Deliver to EVERY linked parent evenly without missing anyone
    for (const parentStudent of student.parents) {
      const parentUser = parentStudent.parent.user;
      if (!parentUser) continue;

      // 1. In-app notification & Native Lock-screen Push for the parent
      try {
        await sendInstantPortalNotification({
          targetUserIds: [parentUser.id],
          category: "REPORT_CARD",
          title: `Report Card: ${studentFullName}`,
          body: `The official report card for ${studentFullName} has been generated and is now available for viewing.`,
          link: `/dashboard/parent/report-cards/${student.id}`,
          tag: `report-card-${student.id}`,
          priority: "HIGH",
        });
      } catch (notifErr) {
        console.error("Failed to dispatch report card notification to parent:", parentUser.id, notifErr);
      }

      // 2. Email dispatch to parent's email address
      if (parentUser.email && parentUser.email.includes("@")) {
        try {
          const emailRes = await sendStudentReportCardEmail({
            parentEmail: parentUser.email,
            parentName: parentUser.name,
            studentName: studentFullName,
            rollNumber: student.rollNumber,
            className,
            examName,
            totalScore: maxTotal > 0 ? totalScore : undefined,
            maxTotal: maxTotal > 0 ? maxTotal : undefined,
            percentage,
            grade,
            subjectMarks,
            reportCardUrl: `https://nipoportal.vercel.app/dashboard/parent/report-cards/${student.id}`,
            ccAdmin: false,
          });
          if (emailRes.success) {
            sentRecipients.push(parentUser.email);
          }
        } catch (emailErr) {
          console.error("Failed to send report card email to parent:", parentUser.email, emailErr);
        }
      }
    }

    return {
      success: true,
      sentCount: sentRecipients.length,
      recipients: sentRecipients,
      totalParents: student.parents.length,
      message: sentRecipients.length > 0
        ? `Report card emailed to all ${sentRecipients.length} parent recipient(s): ${sentRecipients.join(", ")}`
        : `Report card notification generated for ${student.parents.length} parent(s).`
    };
  } catch (error: unknown) {
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "An unexpected error occurred while sending report card" };
  }
}

export async function sendClassReportCardsToAllParentsAction(classId: string) {
  const session = await getServerSession(getAuthOptions());
  if (!session || (session.user.role !== "ADMIN" && session.user.role !== "TEACHER")) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const classData = await prisma.class.findUnique({
      where: { id: classId },
      include: {
        students: {
          where: { isActive: true },
          include: {
            class: true,
            parents: {
              include: {
                parent: {
                  include: {
                    user: true
                  }
                }
              }
            },
            marks: {
              include: {
                subject: true,
                exam: true
              }
            }
          }
        }
      }
    });

    if (!classData) {
      return { success: false, error: "Class not found" };
    }

    if (classData.students.length === 0) {
      return { success: false, error: "No active students in this class" };
    }

    let totalEmailsSent = 0;
    const allRecipients: string[] = [];
    const studentsSent: string[] = [];

    for (const student of classData.students) {
      if (student.parents.length === 0) continue;

      let totalScore = 0;
      let maxTotal = 0;
      const subjectMarks: ReportCardEmailSubjectMark[] = [];
      let examName: string | undefined;

      if (student.marks && student.marks.length > 0) {
        examName = student.marks[0]?.exam?.name;
        for (const m of student.marks) {
          if (m.remarks === 'Absent') {
            maxTotal += (m.subject?.maxMarks || m.maxScore);
            subjectMarks.push({
              subjectName: m.subject?.name || "Subject",
              score: 0,
              maxScore: m.maxScore,
              isFail: true,
              remarks: "Absent"
            });
          } else {
            totalScore += m.score;
            maxTotal += m.maxScore;
            const isFail = m.subject ? m.score < m.subject.passMarks : m.score < 35;
            subjectMarks.push({
              subjectName: m.subject?.name || "Subject",
              score: m.score,
              maxScore: m.maxScore,
              isFail,
              remarks: m.remarks
            });
          }
        }
      }

      const percentage = maxTotal > 0 ? ((totalScore / maxTotal) * 100).toFixed(1) : undefined;
      let grade: string | undefined;
      if (percentage) {
        const p = parseFloat(percentage);
        if (p >= 90) grade = "A+";
        else if (p >= 80) grade = "A";
        else if (p >= 70) grade = "B";
        else if (p >= 60) grade = "C";
        else if (p >= 50) grade = "D";
        else grade = "E";
      }

      const className = `${classData.name} - ${classData.section}`;
      const studentFullName = `${student.firstName} ${student.lastName}`.trim();

      for (const parentStudent of student.parents) {
        const parentUser = parentStudent.parent.user;
        if (!parentUser) continue;

        // In-app notification & Native Lock-screen Push
        try {
          await sendInstantPortalNotification({
            targetUserIds: [parentUser.id],
            category: "REPORT_CARD",
            title: `Report Card: ${studentFullName}`,
            body: `The official report card for ${studentFullName} has been generated and is now available for viewing.`,
            link: `/dashboard/parent/report-cards/${student.id}`,
            tag: `report-card-${student.id}`,
            priority: "HIGH",
          });
        } catch (err) {
          console.error("Failed to dispatch report card notification:", parentUser.id, err);
        }

        // Email sending
        if (parentUser.email && parentUser.email.includes("@")) {
          try {
            const emailRes = await sendStudentReportCardEmail({
              parentEmail: parentUser.email,
              parentName: parentUser.name,
              studentName: studentFullName,
              rollNumber: student.rollNumber,
              className,
              examName,
              totalScore: maxTotal > 0 ? totalScore : undefined,
              maxTotal: maxTotal > 0 ? maxTotal : undefined,
              percentage,
              grade,
              subjectMarks,
              reportCardUrl: `https://nipoportal.vercel.app/dashboard/parent/report-cards/${student.id}`,
              ccAdmin: false,
            });
            if (emailRes.success) {
              totalEmailsSent++;
              if (!allRecipients.includes(parentUser.email)) {
                allRecipients.push(parentUser.email);
              }
            }
          } catch (err) {
            console.error("Failed to email parent:", parentUser.email, err);
          }
        }
      }

      studentsSent.push(studentFullName);
    }

    return {
      success: true,
      totalEmailsSent,
      studentsCount: studentsSent.length,
      recipients: allRecipients,
      message: `Report cards evenly dispatched to ${allRecipients.length} parent recipient(s) across ${studentsSent.length} student(s): ${allRecipients.join(", ")}`
    };
  } catch (error: unknown) {
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "An unexpected error occurred while sending class report cards" };
  }
}

export interface CreateReportCardSubjectMark {
  subjectId: string;
  score: number;
  maxScore: number;
  passMarks?: number;
  remarks?: string;
}

export interface CreateReportCardPayload {
  studentId: string;
  classId: string;
  examName: string;
  examDate: string; // ISO date string e.g. "2026-10-27"
  marks: CreateReportCardSubjectMark[];
  remarks?: string;
}

/**
 * Creates/updates exam and subject marks, automatically calculates totals,
 * generates the official report card, notifies parent(s) via in-app & email,
 * and saves into teacher's and parent's history.
 */
export async function createAndSendReportCardAction(payload: CreateReportCardPayload) {
  const session = await getServerSession(getAuthOptions());
  if (!session || (session.user.role !== "ADMIN" && session.user.role !== "TEACHER")) {
    return { success: false, error: "Unauthorized" };
  }

  const { studentId, classId, examName, examDate, marks, remarks } = payload;
  if (!studentId || !classId || !examName?.trim() || !examDate) {
    return { success: false, error: "Please provide student, class, exam name, and date." };
  }

  try {
    // 1. Verify student and class
    const student = await prisma.student.findUnique({
      where: { id: studentId },
      include: {
        class: true,
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

    if (!student || student.classId !== classId) {
      return { success: false, error: "Student not found in the selected class" };
    }

    // 2. If TEACHER, verify authorization
    if (session.user.role === "TEACHER") {
      const teacher = await prisma.teacher.findUnique({
        where: { userId: session.user.id },
        include: { classes: true, classTeacherOf: true }
      });
      const teachesClass = teacher?.classes.some(c => c.id === classId) || teacher?.classTeacherOf?.id === classId;
      if (!teachesClass) {
        return { success: false, error: "Unauthorized: You do not teach or manage this class" };
      }
    }

    // 3. Find or create Exam for this class
    const parsedDate = new Date(examDate);
    const validDate = isNaN(parsedDate.getTime()) ? new Date() : parsedDate;

    let exam = await prisma.exam.findFirst({
      where: {
        classId: classId,
        name: examName.trim()
      }
    });

    if (!exam) {
      exam = await prisma.exam.create({
        data: {
          name: examName.trim(),
          date: validDate,
          classId: classId,
          isPublished: true
        }
      });
    } else {
      await prisma.exam.update({
        where: { id: exam.id },
        data: { date: validDate, isPublished: true }
      });
    }

    // 4. Fetch subjects for pass marks and calculate totals
    const classSubjects = await prisma.subject.findMany({
      where: { classId }
    });
    const subjectMap = new Map(classSubjects.map(s => [s.id, s]));

    let totalScore = 0;
    let maxTotal = 0;
    const emailSubjectMarks: ReportCardEmailSubjectMark[] = [];

    for (const m of marks) {
      const sub = subjectMap.get(m.subjectId);
      const score = Math.max(0, Number(m.score) || 0);
      const maxScore = Math.max(1, Number(m.maxScore) || sub?.maxMarks || 100);
      const passMarks = m.passMarks !== undefined ? Number(m.passMarks) : (sub?.passMarks ?? 35);
      const isFail = score < passMarks;

      totalScore += score;
      maxTotal += maxScore;

      // Keep Subject defaults updated if teacher customized pass or max marks
      if (sub && (sub.maxMarks !== Math.round(maxScore) || sub.passMarks !== Math.round(passMarks))) {
        try {
          await prisma.subject.update({
            where: { id: m.subjectId },
            data: {
              maxMarks: Math.round(maxScore),
              passMarks: Math.round(passMarks)
            }
          });
        } catch {
          // ignore concurrent update errors
        }
      }

      await prisma.mark.upsert({
        where: {
          studentId_examId_subjectId: {
            studentId,
            examId: exam.id,
            subjectId: m.subjectId
          }
        },
        update: {
          score,
          maxScore,
          remarks: m.remarks || null
        },
        create: {
          studentId,
          examId: exam.id,
          subjectId: m.subjectId,
          score,
          maxScore,
          remarks: m.remarks || null
        }
      });

      emailSubjectMarks.push({
        subjectName: sub?.name || "Subject",
        score,
        maxScore,
        isFail,
        remarks: m.remarks
      });
    }

    const percentage = maxTotal > 0 ? parseFloat(((totalScore / maxTotal) * 100).toFixed(1)) : 0;
    let grade = "F";
    if (percentage >= 90) grade = "A+";
    else if (percentage >= 80) grade = "A";
    else if (percentage >= 70) grade = "B";
    else if (percentage >= 60) grade = "C";
    else if (percentage >= 50) grade = "D";

    // 5. Upsert ReportCard in database
    const reportCard = await prisma.reportCard.upsert({
      where: {
        studentId_examId: {
          studentId,
          examId: exam.id
        }
      },
      update: {
        totalMarks: totalScore,
        percentage,
        grade,
        remarks: remarks?.trim() || null,
        published: true,
        parentVerified: false
      },
      create: {
        studentId,
        examId: exam.id,
        totalMarks: totalScore,
        percentage,
        grade,
        remarks: remarks?.trim() || null,
        published: true,
        parentVerified: false
      }
    });

    // 6. Deliver notifications & emails to all linked parents
    const studentFullName = `${student.firstName} ${student.lastName}`.trim();
    const className = student.class ? `${student.class.name} - ${student.class.section}` : "Class";
    const sentRecipients: string[] = [];

    const { invalidateUserNotifCache } = await import("@/backend/api/actions/notifications/unifiedNotificationActions");

    for (const parentStudent of student.parents) {
      const parentUser = parentStudent.parent?.user;
      if (!parentUser) continue;

      // In-app Notification & Native Lock-screen Push
      try {
        await sendInstantPortalNotification({
          targetUserIds: [parentUser.id],
          category: "REPORT_CARD",
          title: `Report Card: ${studentFullName}`,
          body: `The official academic report card for ${examName.trim()} has been published. Total: ${totalScore}/${maxTotal} (${percentage}% - Grade ${grade}).`,
          link: `/dashboard/parent/report-cards`,
          tag: `exam-report-${student.id}`,
          priority: "HIGH",
        });
        await invalidateUserNotifCache(parentUser.id);
      } catch (notifErr) {
        console.error("Failed to create in-app notification:", parentUser.id, notifErr);
      }

      // Email dispatch
      if (parentUser.email && parentUser.email.includes("@")) {
        try {
          const emailRes = await sendStudentReportCardEmail({
            parentEmail: parentUser.email,
            parentName: parentUser.name,
            studentName: studentFullName,
            rollNumber: student.rollNumber,
            className,
            examName: examName.trim(),
            totalScore,
            maxTotal,
            percentage,
            grade,
            subjectMarks: emailSubjectMarks,
            remarks: remarks?.trim() || null,
            reportCardUrl: `https://nipoportal.vercel.app/dashboard/parent/report-cards`,
            ccAdmin: false
          });
          if (emailRes.success) {
            sentRecipients.push(parentUser.email);
          }
        } catch (emailErr) {
          console.error("Failed to email report card to parent:", parentUser.email, emailErr);
        }
      }
    }

    revalidatePath("/dashboard/teacher/report-cards");
    revalidatePath("/dashboard/parent/report-cards");
    revalidatePath(`/dashboard/parent/report-cards/${studentId}`);

    return {
      success: true,
      reportCardId: reportCard.id,
      totalMarks: totalScore,
      maxTotal,
      percentage,
      grade,
      parentCount: student.parents.length,
      sentCount: sentRecipients.length,
      recipients: sentRecipients,
      message: `Report card for ${studentFullName} successfully saved and sent to ${student.parents.length} parent(s)!`
    };
  } catch (error: any) {
    console.error("Error in createAndSendReportCardAction:", error);
    return { success: false, error: error.message || "Failed to create and send report card" };
  }
}

/**
 * Deletes a report card from teacher history and database.
 * Also cleans up dependent subjects, audit logs, and parent notifications.
 * Only authorized for TEACHERS and ADMINS.
 */
export async function deleteReportCardAction(reportCardId: string) {
  const session = await getServerSession(getAuthOptions());
  if (!session || (session.user.role !== "ADMIN" && session.user.role !== "TEACHER")) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const reportCard = await prisma.reportCard.findUnique({
      where: { id: reportCardId },
      include: {
        student: {
          include: {
            parents: {
              include: { parent: true }
            }
          }
        },
        exam: true
      }
    });

    if (!reportCard) {
      return { success: false, error: "Report card not found" };
    }

    // If teacher, verify authorization for this class
    if (session.user.role === "TEACHER") {
      const teacher = await prisma.teacher.findUnique({
        where: { userId: session.user.id },
        include: { classes: true, classTeacherOf: true }
      });
      const teaches = !!reportCard.student.classId && (teacher?.classes.some(c => c.id === reportCard.student.classId) || teacher?.classTeacherOf?.id === reportCard.student.classId);
      if (!teaches) {
        return { success: false, error: "You are not authorized to delete report cards for this class" };
      }
    }

    // Clean up dependent subjects and audit logs
    await prisma.reportCardSubject.deleteMany({
      where: { reportCardId }
    });
    await prisma.reportCardAuditLog.deleteMany({
      where: { reportCardId }
    });

    await prisma.reportCard.delete({
      where: { id: reportCardId }
    });

    // Clean up notifications for this student's parents regarding this exam
    const parentUserIds = reportCard.student?.parents?.map(p => p.parent?.userId).filter(Boolean) as string[] || [];
    if (parentUserIds.length > 0 && reportCard.exam?.name) {
      try {
        await prisma.notification.deleteMany({
          where: {
            userId: { in: parentUserIds },
            type: "REPORT_CARD",
            OR: [
              { title: { contains: reportCard.exam.name, mode: "insensitive" } },
              { content: { contains: reportCard.exam.name, mode: "insensitive" } }
            ]
          }
        });
        const { invalidateUserNotifCache } = await import("@/backend/api/actions/notifications/unifiedNotificationActions");
        for (const uid of parentUserIds) {
          await invalidateUserNotifCache(uid);
        }
      } catch (e) {
        console.error("Failed to clean up single report card notification:", e);
      }
    }

    // Update exam studentCount
    if (reportCard.examId) {
      const remainingCount = await prisma.reportCard.count({
        where: { examId: reportCard.examId, published: true }
      });
      await prisma.exam.update({
        where: { id: reportCard.examId },
        data: { studentCount: remainingCount }
      }).catch(() => {});
    }

    revalidatePath("/dashboard/teacher/report-cards");
    revalidatePath("/dashboard/parent/report-cards");
    revalidatePath(`/dashboard/parent/report-cards/${reportCard.studentId}`);
    revalidatePath("/dashboard/parent");
    revalidatePath("/dashboard/admin/report-cards");

    return { success: true, message: "Report card deleted successfully from history." };
  } catch (error: any) {
    console.error("Error deleting report card:", error);
    return { success: false, error: error.message || "Failed to delete report card" };
  }
}

export interface DeleteExamGroupReportCardsPayload {
  examId?: string;
  classId?: string;
  examName?: string;
  reportCardIds: string[];
}

/**
 * Deletes all report cards for an entire exam group / batch.
 * Removes the records from teacher history and parent portals,
 * cleans up notifications, and updates exam metrics while safely
 * preserving student historical marks and academic performance trends.
 */
export async function deleteExamGroupReportCardsAction(payload: DeleteExamGroupReportCardsPayload) {
  const session = await getServerSession(getAuthOptions());
  if (!session || (session.user.role !== "ADMIN" && session.user.role !== "TEACHER")) {
    return { success: false, error: "Unauthorized" };
  }

  const { examId, classId, examName, reportCardIds } = payload;
  if ((!reportCardIds || reportCardIds.length === 0) && !examId) {
    return { success: false, error: "No report cards specified for deletion." };
  }

  try {
    const reportCards = await prisma.reportCard.findMany({
      where: {
        OR: [
          ...(reportCardIds && reportCardIds.length > 0 ? [{ id: { in: reportCardIds } }] : []),
          ...(examId ? [{ examId }] : [])
        ]
      },
      include: {
        student: {
          include: {
            parents: {
              include: { parent: true }
            }
          }
        },
        exam: true
      }
    });

    if (reportCards.length === 0) {
      return { success: false, error: "No report cards found to delete." };
    }

    // Teacher authorization check
    if (session.user.role === "TEACHER") {
      const teacher = await prisma.teacher.findUnique({
        where: { userId: session.user.id },
        include: { classes: true, classTeacherOf: true }
      });

      const allowedClassIds = new Set<string>();
      teacher?.classes.forEach(c => allowedClassIds.add(c.id));
      if (teacher?.classTeacherOf) allowedClassIds.add(teacher.classTeacherOf.id);

      const hasUnauthorized = reportCards.some(rc => !rc.student.classId || !allowedClassIds.has(rc.student.classId));
      if (hasUnauthorized) {
        return { success: false, error: "Unauthorized: You do not teach one or more classes in this batch." };
      }
    }

    const idsToDelete = reportCards.map(rc => rc.id);
    const affectedExamIds = Array.from(new Set(reportCards.map(rc => rc.examId).filter(Boolean)));
    const affectedStudentIds = Array.from(new Set(reportCards.map(rc => rc.studentId)));

    // 1. Delete dependent ReportCardSubject and ReportCardAuditLog
    await prisma.reportCardSubject.deleteMany({
      where: { reportCardId: { in: idsToDelete } }
    });

    await prisma.reportCardAuditLog.deleteMany({
      where: { reportCardId: { in: idsToDelete } }
    });

    // 2. Delete the ReportCard records
    const deleteResult = await prisma.reportCard.deleteMany({
      where: { id: { in: idsToDelete } }
    });

    // 3. Clean up in-app notifications for parents regarding this exam
    const parentUserIds = new Set<string>();
    reportCards.forEach(rc => {
      rc.student?.parents?.forEach(p => {
        if (p.parent?.userId) parentUserIds.add(p.parent.userId);
      });
    });

    const targetExamName = examName || reportCards[0]?.exam?.name;
    if (parentUserIds.size > 0 && targetExamName) {
      try {
        await prisma.notification.deleteMany({
          where: {
            userId: { in: Array.from(parentUserIds) },
            type: "REPORT_CARD",
            OR: [
              { title: { contains: targetExamName, mode: "insensitive" } },
              { content: { contains: targetExamName, mode: "insensitive" } }
            ]
          }
        });

        const { invalidateUserNotifCache } = await import("@/backend/api/actions/notifications/unifiedNotificationActions");
        for (const uid of parentUserIds) {
          await invalidateUserNotifCache(uid);
        }
      } catch (notifErr) {
        console.error("Failed to clean up exam notifications for parents:", notifErr);
      }
    }

    // 4. Update exam studentCount
    for (const eid of affectedExamIds) {
      try {
        const remainingCount = await prisma.reportCard.count({
          where: { examId: eid, published: true }
        });
        await prisma.exam.update({
          where: { id: eid },
          data: { studentCount: remainingCount }
        });
      } catch {}
    }

    // 5. Revalidate paths for instant UI sync
    revalidatePath("/dashboard/teacher/report-cards");
    revalidatePath("/dashboard/parent/report-cards");
    revalidatePath("/dashboard/parent");
    revalidatePath("/dashboard/admin/report-cards");
    for (const sid of affectedStudentIds) {
      revalidatePath(`/dashboard/parent/report-cards/${sid}`);
    }

    return {
      success: true,
      deletedCount: deleteResult.count,
      message: `Successfully deleted ${deleteResult.count} report card(s) for "${targetExamName}".`
    };
  } catch (error: any) {
    console.error("Error deleting exam group report cards:", error);
    return { success: false, error: error.message || "Failed to delete exam report cards." };
  }
}

/**
 * Allows a parent to officially verify a published report card.
 * Accessible ONLY to PARENT accounts.
 */
export async function verifyReportCardAction(reportCardId: string) {
  const session = await getServerSession(getAuthOptions());
  if (!session || session.user.role !== "PARENT") {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const parentUser = await prisma.parent.findUnique({
      where: { userId: session.user.id },
      include: { children: true }
    });

    if (!parentUser) {
      return { success: false, error: "Parent profile not found" };
    }

    const reportCard = await prisma.reportCard.findUnique({
      where: { id: reportCardId }
    });

    if (!reportCard) {
      return { success: false, error: "Report card not found" };
    }

    const isChild = parentUser.children.some(c => c.studentId === reportCard.studentId);
    if (!isChild) {
      return { success: false, error: "Unauthorized: This report card does not belong to your child." };
    }

    const updated = await prisma.reportCard.update({
      where: { id: reportCardId },
      data: { parentVerified: true }
    });

    revalidatePath("/dashboard/parent/report-cards");
    revalidatePath(`/dashboard/parent/report-cards/${reportCard.studentId}`);

    return { success: true, reportCard: updated };
  } catch (error: any) {
    console.error("Error verifying report card:", error);
    return { success: false, error: error.message || "Failed to verify report card" };
  }
}

