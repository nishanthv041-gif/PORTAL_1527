import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import { getParentAndSelectedChild } from "../parentChildHelper";
import ParentComplaintsClient, { 
  ParentChildOption, 
  ParentComplaintItem 
} from "./ParentComplaintsClient";
import styles from "../../dashboard.module.css";

export const metadata = {
  title: "Complaints & Inquiries | Parent Portal",
  description: "File complaints, select students, track issue status, and communicate with administration."
};

export default async function ParentComplaintsPage({
  searchParams
}: {
  searchParams?: Promise<{ childId?: string }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const { session, parent, children } = await getParentAndSelectedChild(resolvedSearchParams?.childId);

  if (!session || !session.user) return null;

  if (!parent || children.length === 0) {
    return (
      <div className={styles.dashboard}>
        <h1 className={styles.title}>Complaints & Inquiries</h1>
        <div className={styles.chartCard} style={{ padding: "3rem 1.5rem", textAlign: "center", color: "var(--text-secondary)" }}>
          <p style={{ margin: 0 }}>No children are linked to your parent account.</p>
        </div>
      </div>
    );
  }

  const childrenIds = children.map(c => c.id);

  // Fetch complaints for this parent's children or submitted by this parent
  const rawComplaints = await prisma.complaint.findMany({
    where: {
      OR: [
        { studentId: { in: childrenIds } },
        { parentId: parent.id },
        { authorId: session.user.id }
      ]
    },
    include: {
      student: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          rollNumber: true,
          class: {
            select: {
              name: true,
              section: true
            }
          }
        }
      },
      messages: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          content: true,
          createdAt: true,
          authorName: true,
          authorRole: true,
          userId: true
        }
      },
      _count: {
        select: { messages: true }
      }
    },
    orderBy: {
      date: "desc"
    }
  });

  const formattedComplaints: ParentComplaintItem[] = rawComplaints.map(c => ({
    id: c.id,
    title: c.title,
    description: c.description,
    category: c.category,
    severity: c.severity,
    status: c.status,
    date: c.date.toISOString(),
    remarks: c.remarks,
    student: c.student,
    messages: c.messages.map(m => ({
      ...m,
      createdAt: m.createdAt.toISOString()
    })),
    _count: c._count
  }));

  const childrenOptions: ParentChildOption[] = children.map(c => ({
    id: c.id,
    firstName: c.firstName,
    lastName: c.lastName,
    rollNumber: c.rollNumber,
    class: c.class ? {
      id: c.class.id,
      name: c.class.name,
      section: c.class.section
    } : null
  }));

  return (
    <ParentComplaintsClient
      childrenList={childrenOptions}
      initialComplaints={formattedComplaints}
      currentUser={{
        id: session.user.id,
        name: session.user.name || "Parent",
        role: session.user.role || "PARENT"
      }}
    />
  );
}
