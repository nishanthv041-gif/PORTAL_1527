import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import { autoDeleteExpiredHomework } from "@/backend/api/actions/dashboard/teacher/assignments/actions";
import Link from "next/link";
import HomeworkConsoleClient, { ConsoleComment } from "./HomeworkConsoleClient";

export const metadata = {
  title: "Home Work Console | Teacher Portal",
  description: "Home work information for parents and immediate work conversation console."
};

export default async function TeacherAssignmentDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerSession(getAuthOptions());
  if (!session?.user) return null;

  // Automatically delete any expired homework before loading
  await autoDeleteExpiredHomework();

  const teacher = await prisma.teacher.findUnique({
    where: { userId: session.user.id },
    select: { id: true }
  });

  const assignment = await prisma.assignment.findUnique({
    where: { id: id },
    include: {
      class: {
        select: { id: true, name: true, section: true }
      },
      subject: {
        select: {
          id: true,
          name: true,
          code: true,
          teacherId: true,
          teacher: {
            include: { user: true }
          }
        }
      },
      teacher: {
        include: { user: true }
      },
      comments: {
        orderBy: { createdAt: "asc" },
        include: {
          user: {
            select: { id: true, name: true, role: true }
          }
        }
      }
    }
  });

  if (!assignment) {
    return (
      <div style={{ padding: "3rem 1.5rem", textAlign: "center" }}>
        <h2>Home Work Not Found or Expired</h2>
        <p style={{ opacity: 0.7, maxWidth: "480px", margin: "0.5rem auto 1.5rem auto" }}>
          This home work either does not exist or has been automatically deleted after its submission deadline passed.
        </p>
        <Link
          href="/dashboard/teacher/assignments"
          style={{
            display: "inline-flex",
            alignItems: "center",
            padding: "0.65rem 1.25rem",
            borderRadius: "8px",
            backgroundColor: "var(--primary)",
            color: "var(--primary-fg)",
            textDecoration: "none",
            fontWeight: 600
          }}
        >
          Return to Home Work
        </Link>
      </div>
    );
  }

  const formattedComments: ConsoleComment[] = assignment.comments.map(c => ({
    id: c.id,
    content: c.content,
    createdAt: c.createdAt.toISOString(),
    authorName: c.authorName || c.user?.name || "User",
    authorRole: c.authorRole || c.user?.role || "USER",
    userId: c.userId
  }));

  const isCurrentSubjectTeacher = Boolean(
    assignment.subject?.teacherId && teacher?.id === assignment.subject.teacherId
  );
  const isOriginalCreator = assignment.teacher.userId === session.user.id;
  const isAdmin = session.user.role === "ADMIN";
  const canManage = isAdmin || isCurrentSubjectTeacher || isOriginalCreator;

  const assignedStaffName = assignment.subject?.teacher?.user?.name || assignment.teacher.user.name || "Subject Staff";

  return (
    <HomeworkConsoleClient
      assignment={{
        id: assignment.id,
        title: assignment.title,
        description: assignment.description,
        deadline: assignment.deadline.toISOString(),
        createdAt: assignment.createdAt.toISOString(),
        class: assignment.class,
        subject: assignment.subject,
        teacher: {
          id: assignment.teacher.id,
          userId: assignment.teacher.userId,
          user: {
            name: assignment.teacher.user.name || "Teacher"
          }
        }
      }}
      currentUser={{
        id: session.user.id,
        name: session.user.name || "Teacher",
        role: session.user.role || "TEACHER"
      }}
      initialComments={formattedComments}
      canManage={canManage}
      assignedStaffName={assignedStaffName}
    />
  );
}
