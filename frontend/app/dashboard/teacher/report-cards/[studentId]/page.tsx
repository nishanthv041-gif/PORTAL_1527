import { getServerSession } from "next-auth/next";
import { authOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import IndividualReportCardClient from "@/frontend/components/ReportCards/IndividualReportCardClient";

export default async function TeacherIndividualReportCardPage({ 
  params 
}: { 
  params: Promise<{ studentId: string }> 
}) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "TEACHER") return null;

  const { studentId } = await params;

  // Verify the teacher teaches this student's class
  const teacher = await prisma.teacher.findUnique({
    where: { userId: session.user.id },
    include: { classes: true }
  });

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: { class: true }
  });

  if (!student || !student.class || !teacher) {
    return <div style={{ padding: '2rem' }}>Student not found.</div>;
  }

  const teachesClass = teacher.classes.some(c => c.id === student.classId);
  if (!teachesClass) {
    return <div style={{ padding: '2rem', color: 'var(--danger)' }}>Unauthorized. You do not teach this student&apos;s class.</div>;
  }

  // Fetch all exams for this class
  const exams = await prisma.exam.findMany({
    where: { classId: student.classId! },
    orderBy: { date: 'asc' }
  });

  // Fetch all subjects for this class
  const subjects = await prisma.subject.findMany({
    where: { classId: student.classId! },
    orderBy: { name: 'asc' }
  });

  // Fetch marks for this student
  const marks = await prisma.mark.findMany({
    where: { studentId: studentId }
  });

  const parentAccounts = await prisma.parentStudent.findMany({
    where: { studentId: studentId },
    include: { parent: true }
  });

  let sentAt: Date | null = null;
  if (parentAccounts.length > 0) {
    const parentUserIds = parentAccounts.map(p => p.parent.userId);
    const latestNotification = await prisma.notification.findFirst({
      where: {
        userId: { in: parentUserIds },
        type: "REPORT_CARD",
        content: { contains: student.firstName }
      },
      orderBy: { createdAt: 'desc' }
    });
    if (latestNotification) {
      sentAt = latestNotification.createdAt;
    }
  }

  return (
    <div style={{ padding: '2rem' }}>
      <IndividualReportCardClient 
        student={{
          id: student.id,
          firstName: student.firstName,
          lastName: student.lastName,
          rollNumber: student.rollNumber,
          class: student.class
        }}
        exams={exams}
        subjects={subjects}
        marks={marks}
        sentAt={sentAt}
        baseUrl="/dashboard/teacher/report-cards"
      />
    </div>
  );
}
