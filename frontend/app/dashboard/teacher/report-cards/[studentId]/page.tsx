import { getCachedServerSession } from "@/backend/auth/sessionCache";
import { prisma } from "@/backend/db/prisma";
import IndividualReportCardClient from "@/frontend/components/ReportCards/IndividualReportCardClient";

export default async function TeacherIndividualReportCardPage({ 
  params 
}: { 
  params: Promise<{ studentId: string }> 
}) {
  const session = await getCachedServerSession();
  if (!session || session.user.role !== "TEACHER") return null;

  const { studentId } = await params;

  // Verify the teacher teaches this student's class
  const [teacher, student] = await Promise.all([
    prisma.teacher.findUnique({
      where: { userId: session.user.id },
      include: { classes: true }
    }),
    prisma.student.findUnique({
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
    })
  ]);

  if (!student || !student.class || !teacher) {
    return <div style={{ padding: '2rem' }}>Student not found.</div>;
  }

  const teachesClass = teacher.classes.some(c => c.id === student.classId);
  if (!teachesClass) {
    return <div style={{ padding: '2rem', color: 'var(--danger)' }}>Unauthorized. You do not teach this student&apos;s class.</div>;
  }

  // Fetch all exams, subjects, and marks in parallel
  const [exams, subjects, marks] = await Promise.all([
    prisma.exam.findMany({
      where: { classId: student.classId! },
      orderBy: { date: 'asc' }
    }),
    prisma.subject.findMany({
      where: { classId: student.classId! },
      orderBy: { name: 'asc' }
    }),
    prisma.mark.findMany({
      where: { studentId: studentId }
    })
  ]);

  const parentAccounts = student.parents;

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

  const linkedParents = student.parents.map(ps => ({
    id: ps.parent.id,
    user: {
      name: ps.parent.user.name,
      email: ps.parent.user.email
    },
    phone: ps.parent.phone
  }));

  return (
    <div style={{ padding: '2rem' }}>
      <IndividualReportCardClient 
        student={{
          id: student.id,
          firstName: student.firstName,
          lastName: student.lastName,
          rollNumber: student.rollNumber,
          class: student.class,
          parents: linkedParents
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
