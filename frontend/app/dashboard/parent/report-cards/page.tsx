import { prisma } from "@/backend/db/prisma";
import styles from "../../dashboard.module.css";
import ChildSwitcher from "../ChildSwitcher";
import ParentReportCardsClient from "./ParentReportCardsClient";
import { getParentAndSelectedChild } from "../parentChildHelper";

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

  const reportCards = await prisma.reportCard.findMany({
    where: { 
      studentId: selectedChild.id,
      published: true 
    },
    include: {
      exam: true
    },
    orderBy: {
      exam: { date: 'desc' }
    }
  });

  return (
    <div className={styles.dashboard}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 className={styles.title} style={{ margin: 0 }}>Report Cards</h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem' }}>View and verify report cards for {selectedChild.firstName}.</p>
        </div>
        <ChildSwitcher studentList={children} selectedChildId={selectedChild.id} />
      </div>

      <ParentReportCardsClient reportCards={reportCards} />
    </div>
  );
}
