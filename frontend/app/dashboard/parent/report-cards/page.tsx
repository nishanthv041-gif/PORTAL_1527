import { prisma } from "@/backend/db/prisma";
import styles from "../../dashboard.module.css";
import ParentReportCardsClient from "./ParentReportCardsClient";
import { getParentAndSelectedChild } from "../parentChildHelper";
import { getSystemSettings } from "@/backend/api/actions/dashboard/admin/settings/actions";
import { ProfessionalReportCardData } from "@/frontend/components/ReportCards/ProfessionalReportCard";

export default async function ParentReportCardsPage({
  searchParams
}: {
  searchParams: Promise<{ childId?: string }>
}) {
  const resolvedSearchParams = await searchParams;
  const { session, parent, children, selectedChild } = await getParentAndSelectedChild(resolvedSearchParams?.childId);
  if (!session) return null;

  if (!parent || children.length === 0 || !selectedChild) {
    return (
      <div className={styles.dashboard}>
        <h1 className={styles.title}>Report Cards</h1>
        <p>No children linked to your account.</p>
      </div>
    );
  }

  const [reportCards, settings] = await Promise.all([
    prisma.reportCard.findMany({
      where: { 
        studentId: selectedChild.id,
        published: true 
      },
      include: {
        exam: {
          include: {
            marks: {
              where: { studentId: selectedChild.id },
              include: { subject: true }
            }
          }
        },
        student: {
          include: {
            class: true
          }
        }
      },
      orderBy: {
        exam: { date: 'desc' }
      }
    }),
    getSystemSettings()
  ]);

  const fullName = `${selectedChild.firstName} ${selectedChild.lastName}`.trim();

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
      rollNumber: selectedChild.rollNumber,
      className: selectedChild.class ? `${selectedChild.class.name} - ${selectedChild.class.section}` : "Class",
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
    <div className={styles.dashboard}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '0.5rem' }}>
        <div>
          <h1 className={styles.title} style={{ margin: 0 }}>Official Report Cards</h1>
          <p style={{ color: 'var(--text-secondary)', margin: '0.25rem 0 0 0', fontSize: '0.9rem' }}>
            Viewing academic performance &amp; verification for <strong>{fullName}</strong> ({selectedChild.rollNumber})
          </p>
        </div>
      </div>

      <ParentReportCardsClient 
        reportCards={formattedCards} 
        studentName={fullName}
      />
    </div>
  );
}
