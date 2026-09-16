import { getServerSession } from "next-auth/next";
import { authOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import IndividualReportCardClient from "@/frontend/components/ReportCards/IndividualReportCardClient";

export default async function ParentIndividualReportCardPage({ 
  params 
}: { 
  params: Promise<{ studentId: string }> 
}) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "PARENT") return null;

  const { studentId } = await params;

  // Authorization check: Is this parent linked to this student?
  const parent = await prisma.parent.findUnique({
    where: { userId: session.user.id },
    include: {
      children: true
    }
  });

  if (!parent) return <div style={{ padding: '2rem' }}>Parent profile not found.</div>;

  const isLinked = parent.children.some(child => child.studentId === studentId);
  if (!isLinked) {
    return <div style={{ padding: '2rem', color: 'var(--danger)' }}>Unauthorized. You can only view your own child&apos;s report card.</div>;
  }

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: { class: true }
  });

  if (!student || !student.class) {
    return <div style={{ padding: '2rem' }}>Student not found.</div>;
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
        sentAt={null} // Parent doesn't need to see "Sent at"
        baseUrl="/dashboard/parent/report-cards"
        isReadOnly={true}
      />
    </div>
  );
}
