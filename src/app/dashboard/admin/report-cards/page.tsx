import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { Exam, Subject, Mark } from "@prisma/client";
import ClassSelector from "../ClassSelector";
import ReportCardsClient from "@/components/ReportCards/ReportCardsClient";

export default async function AdminReportCardsPage({
  searchParams
}: {
  searchParams: Promise<{ classId?: string }>
}) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") return null;

  const resolvedSearchParams = await searchParams;
  const classId = resolvedSearchParams.classId;

  // Fetch all classes for the selector
  const classes = await prisma.class.findMany({
    where: { isActive: true },
    orderBy: [{ name: 'asc' }, { section: 'asc' }]
  });

  let classData = null;
  let exams: Exam[] = [];
  let subjects: Subject[] = [];
  let marks: Mark[] = [];

  if (classId) {
    classData = await prisma.class.findUnique({
      where: { id: classId },
      include: {
        students: {
          orderBy: { firstName: 'asc' }
        }
      }
    });

    if (classData) {
      exams = await prisma.exam.findMany({
        where: { classId: classId },
        orderBy: { date: 'asc' }
      });

      subjects = await prisma.subject.findMany({
        where: { classId: classId },
        orderBy: { name: 'asc' }
      });

      marks = await prisma.mark.findMany({
        where: {
          student: { classId: classId }
        }
      });
    }
  }

  return (
    <div style={{ padding: '2rem' }}>
      <h1 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: '0.5rem' }}>Report Cards</h1>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>View and generate consolidated report cards for students.</p>

      <ClassSelector classes={classes} />

      {classId && classData ? (
        <div style={{ marginTop: '2rem' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1.5rem' }}>
            Class {classData.name} - {classData.section}
          </h2>
          <ReportCardsClient 
            classData={classData}
            exams={exams}
            subjects={subjects}
            marks={marks}
            baseUrl="/dashboard/admin/report-cards"
          />
        </div>
      ) : (
        <div style={{ marginTop: '2rem', padding: '3rem', textAlign: 'center', background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '12px', color: 'var(--text-secondary)' }}>
          Please select a class from the dropdown above to view report cards.
        </div>
      )}
    </div>
  );
}
