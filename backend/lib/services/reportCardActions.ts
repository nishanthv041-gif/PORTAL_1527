"use server";

import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import { sendStudentReportCardEmail, ReportCardEmailSubjectMark } from "@/backend/lib/services/emailService";
import { revalidatePath } from "next/cache";

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

      // 1. In-app notification for the parent (unconditional, no skipping)
      try {
        await prisma.notification.create({
          data: {
            userId: parentUser.id,
            title: "Report Card Available",
            content: `The official report card for ${studentFullName} has been generated and is now available for viewing.`,
            type: "REPORT_CARD",
            link: `/dashboard/parent/report-cards/${student.id}`
          }
        });
      } catch (notifErr) {
        console.error("Failed to create in-app notification for parent:", parentUser.id, notifErr);
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

        // In-app notification
        try {
          await prisma.notification.create({
            data: {
              userId: parentUser.id,
              title: "Report Card Available",
              content: `The official report card for ${studentFullName} has been generated and is now available for viewing.`,
              type: "REPORT_CARD",
              link: `/dashboard/parent/report-cards/${student.id}`
            }
          });
        } catch (err) {
          console.error("Failed to create in-app notification:", parentUser.id, err);
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
        include: { classes: true }
      });
      const teachesClass = teacher?.classes.some(c => c.id === classId);
      if (!teachesClass) {
        return { success: false, error: "Unauthorized: You do not teach this class" };
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
      const passMarks = sub?.passMarks ?? 35;
      const isFail = score < passMarks;

      totalScore += score;
      maxTotal += maxScore;

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

      // In-app Notification
      try {
        await prisma.notification.create({
          data: {
            userId: parentUser.id,
            title: `Report Card: ${studentFullName}`,
            content: `The official academic report card for ${examName.trim()} has been published. Total: ${totalScore}/${maxTotal} (${percentage}% - Grade ${grade}).`,
            type: "REPORT_CARD",
            link: `/dashboard/parent/report-cards`
          }
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
        student: true,
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
        include: { classes: true }
      });
      const teaches = teacher?.classes.some(c => c.id === reportCard.student.classId);
      if (!teaches) {
        return { success: false, error: "You are not authorized to delete report cards for this class" };
      }
    }

    await prisma.reportCard.delete({
      where: { id: reportCardId }
    });

    revalidatePath("/dashboard/teacher/report-cards");
    revalidatePath("/dashboard/parent/report-cards");
    revalidatePath(`/dashboard/parent/report-cards/${reportCard.studentId}`);

    return { success: true, message: "Report card deleted successfully from history." };
  } catch (error: any) {
    console.error("Error deleting report card:", error);
    return { success: false, error: error.message || "Failed to delete report card" };
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

