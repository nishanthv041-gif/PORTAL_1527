import { prisma } from "@/backend/db/prisma";
import { autoDeleteExpiredHomework } from "@/backend/api/actions/dashboard/teacher/assignments/actions";
import styles from "../../dashboard.module.css";
import { getParentAndSelectedChild } from "../parentChildHelper";
import ParentChildBanner from "../ParentChildBanner";
import ParentHomeworkList, { ParentAssignmentItem } from "./ParentHomeworkList";

export const metadata = {
  title: "Home Work | Parent Portal",
  description: "View homework assignments, subject instructions, and discuss questions with subject teachers."
};

export default async function ParentAssignmentsPage({
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
        <h1 className={styles.title}>Home Work</h1>
        <p>No children linked to your account.</p>
      </div>
    );
  }

  // Automatically delete all expired homework records past deadline
  await autoDeleteExpiredHomework();

  // School Portal Home Work (Active tasks assigned to the child's class)
  const rawAssignments = selectedChild.classId ? await prisma.assignment.findMany({
    where: { classId: selectedChild.classId },
    include: {
      teacher: {
        include: { user: true }
      },
      class: true,
      subject: true,
      _count: {
        select: { comments: true }
      }
    },
    orderBy: { deadline: 'desc' }
  }) : [];

  const formattedAssignments: ParentAssignmentItem[] = rawAssignments.map(a => ({
    id: a.id,
    title: a.title,
    description: a.description,
    deadline: a.deadline.toISOString(),
    createdAt: a.createdAt.toISOString(),
    fileUrl: a.fileUrl,
    teacher: {
      id: a.teacher.id,
      user: {
        name: a.teacher.user.name || "Subject Teacher"
      }
    },
    class: {
      id: a.class.id,
      name: a.class.name,
      section: a.class.section
    },
    subject: a.subject ? {
      id: a.subject.id,
      name: a.subject.name,
      code: a.subject.code
    } : null,
    _count: a._count
  }));

  return (
    <div className={styles.dashboard}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 className={styles.title} style={{ margin: 0 }}>Home Work</h1>
          <p style={{ color: 'var(--text-secondary)', margin: '0.25rem 0 0 0', fontSize: '0.9rem' }}>
            Daily tasks, worksheets, and subject guidelines for <strong>{selectedChild.firstName} {selectedChild.lastName}</strong>. Automatically deletes after deadline.
          </p>
        </div>
      </div>

      <div style={{ marginTop: '0.5rem' }}>
        <ParentChildBanner 
          selectedChild={selectedChild} 
          studentList={children} 
          activePage="other" 
        />
      </div>

      <div className={styles.chartsContainer} style={{ marginTop: '1.25rem' }}>
        <div className={styles.chartCard} style={{ gridColumn: '1 / -1', padding: '1.5rem' }}>
          <ParentHomeworkList
            assignments={formattedAssignments}
            childName={`${selectedChild.firstName} ${selectedChild.lastName}`}
            currentUser={{
              id: session.user.id,
              name: session.user.name || "Parent",
              role: session.user.role || "PARENT"
            }}
          />
        </div>
      </div>
    </div>
  );
}
