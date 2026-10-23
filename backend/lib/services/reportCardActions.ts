"use server";

import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import { sendStudentReportCardEmail, ReportCardEmailSubjectMark } from "@/backend/lib/services/emailService";

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
            reportCardUrl: `https://nipoportal.vercel.app/dashboard/parent/report-cards/${student.id}`
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
              reportCardUrl: `https://nipoportal.vercel.app/dashboard/parent/report-cards/${student.id}`
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
