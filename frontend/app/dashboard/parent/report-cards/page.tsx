import { prisma } from "@/backend/db/prisma";
import styles from "../../dashboard.module.css";
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
          <p style={{ color: 'var(--text-secondary)', margin: '0.25rem 0 0 0', fontSize: '0.9rem' }}>
            Viewing and verifying report cards for <strong>{selectedChild.firstName} {selectedChild.lastName}</strong>
          </p>
        </div>
      </div>

      <ParentReportCardsClient reportCards={reportCards} />
    </div>
  );
}
