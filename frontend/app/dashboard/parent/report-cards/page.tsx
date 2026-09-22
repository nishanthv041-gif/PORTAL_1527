import { getServerSession } from "next-auth/next";
import { authOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import styles from "../../dashboard.module.css";
import ChildSwitcher from "../ChildSwitcher";
import ParentReportCardsClient from "./ParentReportCardsClient";

export default async function ParentReportCardsPage({
  searchParams
}: {
  searchParams: Promise<{ childId?: string }>
}) {
  const session = await getServerSession(authOptions);
  if (!session) return null;
  const resolvedSearchParams = await searchParams;

  const parent = await prisma.parent.findUnique({
    where: { userId: session.user.id },
    include: {
      children: {
        include: {
          student: true
        }
      }
    }
  });

  if (!parent || parent.children.length === 0) {
    return <p>No children linked to your account.</p>;
  }

  const children = parent.children.map(s => s.student);
  
  let selectedChild = children[0];
  if (resolvedSearchParams.childId) {
    const found = children.find(c => c.id === resolvedSearchParams.childId);
    if (found) selectedChild = found;
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
