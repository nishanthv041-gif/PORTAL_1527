import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import ParentReportCardsClient from "../ParentReportCardsClient";
import { getSystemSettings } from "@/backend/api/actions/dashboard/admin/settings/actions";
import { ProfessionalReportCardData } from "@/frontend/components/ReportCards/ProfessionalReportCard";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default async function ParentIndividualReportCardPage({ 
  params 
}: { 
  params: Promise<{ studentId: string }> 
}) {
  const session = await getServerSession(getAuthOptions());
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

  const [student, reportCards, settings] = await Promise.all([
    prisma.student.findUnique({
      where: { id: studentId },
      include: { class: true }
    }),
    prisma.reportCard.findMany({
      where: { 
        studentId: studentId,
        published: true 
      },
      include: {
        exam: {
          include: {
            marks: {
              where: { studentId: studentId },
              include: { subject: true }
            }
          }
        }
      },
      orderBy: {
        exam: { date: 'desc' }
      }
    }),
    getSystemSettings()
  ]);

  if (!student) {
    return <div style={{ padding: '2rem' }}>Student not found.</div>;
  }

  const fullName = `${student.firstName} ${student.lastName}`.trim();

  const formattedCards: ProfessionalReportCardData[] = reportCards.map(rc => {
    const studentMarks = (rc.exam.marks || []).map(m => ({
      id: m.id,
      subjectName: m.subject?.name || "Subject",
      score: m.score,
      maxScore: m.maxScore,
      passMarks: m.subject?.passMarks || 35,
      remarks: m.remarks
    }));

    return {
      id: rc.id,
      studentId: rc.studentId,
      studentName: fullName,
      rollNumber: student.rollNumber,
      className: student.class ? `${student.class.name} - ${student.class.section}` : "Class",
      examId: rc.examId,
      examName: rc.exam.name,
      examDate: rc.exam.date.toISOString(),
      totalMarks: rc.totalMarks,
      percentage: rc.percentage,
      grade: rc.grade,
      remarks: rc.remarks,
      parentVerified: rc.parentVerified,
      marks: studentMarks,
      schoolLogo: settings.SCHOOL_LOGO || null
    };
  });

  return (
    <div style={{ padding: 'clamp(0.5rem, 2vw, 1.5rem)' }}>
      <div style={{ marginBottom: '1rem' }}>
        <Link 
          href="/dashboard/parent/report-cards"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.4rem',
            color: 'var(--primary)',
            fontWeight: 700,
            textDecoration: 'none',
            fontSize: '0.88rem'
          }}
        >
          <ArrowLeft size={16} /> Back to All Report Cards
        </Link>
      </div>

      <ParentReportCardsClient 
        reportCards={formattedCards} 
        studentName={fullName}
      />
    </div>
  );
}
