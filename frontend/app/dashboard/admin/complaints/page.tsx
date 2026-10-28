import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import styles from "../../dashboard.module.css";
import ComplaintsClient, { AdminComplaintItem, StudentLookupOption } from "./ComplaintsClient";

export const metadata = {
  title: "Complaints & Inquiries | Admin Portal",
  description: "Review complaints, converse with parents and teachers in real-time, and log complaints for any student."
};

export default async function AdminComplaintsPage() {
  const session = await getServerSession(getAuthOptions());
  if (!session || session.user.role !== 'ADMIN') return null;

  const [complaints, allStudents] = await Promise.all([
    prisma.complaint.findMany({
      include: {
        teacher: { include: { user: true } },
        parent: { include: { user: true } },
        student: {
          include: {
            class: true,
            parents: { include: { parent: { include: { user: true } } } }
          }
        },
        messages: {
          orderBy: { createdAt: 'asc' },
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
      orderBy: { date: 'desc' }
    }),
    prisma.student.findMany({
      where: { isActive: true },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        rollNumber: true,
        class: {
          select: { id: true, name: true, section: true }
        }
      },
      orderBy: [
        { class: { name: 'asc' } },
        { firstName: 'asc' }
      ]
    })
  ]);

  const formattedComplaints: AdminComplaintItem[] = complaints.map(c => ({
    id: c.id,
    title: c.title,
    description: c.description,
    category: c.category,
    severity: c.severity,
    status: c.status,
    date: c.date.toISOString(),
    remarks: c.remarks,
    authorRole: c.authorRole,
    authorId: c.authorId,
    teacher: c.teacher ? {
      id: c.teacher.id,
      user: { name: c.teacher.user.name }
    } : null,
    parent: c.parent ? {
      id: c.parent.id,
      user: { name: c.parent.user.name }
    } : null,
    student: {
      id: c.student.id,
      firstName: c.student.firstName,
      lastName: c.student.lastName,
      rollNumber: c.student.rollNumber,
      class: c.student.class ? {
        id: c.student.class.id,
        name: c.student.class.name,
        section: c.student.class.section
      } : null,
      parents: c.student.parents.map(p => ({
        parent: {
          id: p.parent.id,
          user: { name: p.parent.user.name }
        }
      }))
    },
    messages: c.messages.map(m => ({
      ...m,
      createdAt: m.createdAt.toISOString()
    })),
    _count: c._count
  }));

  const studentsList: StudentLookupOption[] = allStudents.map(s => ({
    id: s.id,
    firstName: s.firstName,
    lastName: s.lastName,
    rollNumber: s.rollNumber,
    class: s.class ? {
      id: s.class.id,
      name: s.class.name,
      section: s.class.section
    } : null
  }));

  return (
    <div className={styles.dashboard}>
      <ComplaintsClient
        complaints={formattedComplaints}
        studentsList={studentsList}
        currentUser={{
          id: session.user.id,
          name: session.user.name || "School Administration",
          role: "ADMIN"
        }}
      />
    </div>
  );
}
