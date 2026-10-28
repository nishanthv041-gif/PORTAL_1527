import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import { autoDeleteExpiredHomework } from "@/backend/api/actions/dashboard/teacher/assignments/actions";
import HomeworkClientPage, { ClassWithSubjects, AssignmentItem } from "./HomeworkClientPage";

export const metadata = {
  title: "Home Work | Teacher Portal",
  description: "Manage classes, assign subject homework, connect with parents, and view history."
};

export default async function TeacherAssignmentsPage() {
  const session = await getServerSession(getAuthOptions());
  if (!session?.user) return null;

  // Automatically delete all expired homework records past deadline
  await autoDeleteExpiredHomework();

  // Fetch teacher profile including directly assigned classes and subjects
  const teacher = await prisma.teacher.findUnique({
    where: { userId: session.user.id },
    include: {
      user: true,
      classes: {
        include: {
          subjects: true
        }
      },
      subjects: {
        include: {
          class: {
            include: {
              subjects: true
            }
          }
        }
      }
    }
  });

  if (!teacher) {
    return (
      <div style={{ padding: "2rem", textAlign: "center" }}>
        <h2>Teacher Profile Not Found</h2>
        <p style={{ opacity: 0.7 }}>Please contact the administrator to configure your teacher profile.</p>
      </div>
    );
  }

  // Build unique consolidated list of classes assigned to this teacher
  const classMap = new Map<string, ClassWithSubjects>();

  // 1. Classes where this teacher is primary or class teacher
  teacher.classes.forEach((c) => {
    if (!classMap.has(c.id)) {
      classMap.set(c.id, {
        id: c.id,
        name: c.name,
        section: c.section,
        subjects: c.subjects.map(s => ({
          id: s.id,
          name: s.name,
          code: s.code,
          teacherId: s.teacherId
        }))
      });
    }
  });

  // 2. Classes where this teacher teaches a subject
  teacher.subjects.forEach((s) => {
    if (s.class && !classMap.has(s.class.id)) {
      classMap.set(s.class.id, {
        id: s.class.id,
        name: s.class.name,
        section: s.class.section,
        subjects: s.class.subjects.map(sub => ({
          id: sub.id,
          name: sub.name,
          code: sub.code,
          teacherId: sub.teacherId
        }))
      });
    }
  });

  const classesList: ClassWithSubjects[] = Array.from(classMap.values());

  // Fetch all active assignments created by this teacher
  const rawAssignments = await prisma.assignment.findMany({
    where: {
      teacherId: teacher.id
    },
    include: {
      class: {
        select: { id: true, name: true, section: true }
      },
      subject: {
        select: { id: true, name: true, code: true }
      },
      _count: {
        select: {
          comments: true
        }
      }
    },
    orderBy: {
      createdAt: 'desc'
    }
  });

  const formattedAssignments: AssignmentItem[] = rawAssignments.map(a => ({
    id: a.id,
    title: a.title,
    description: a.description,
    deadline: a.deadline.toISOString(),
    createdAt: a.createdAt.toISOString(),
    fileUrl: a.fileUrl,
    class: a.class,
    subject: a.subject,
    _count: a._count
  }));

  return (
    <HomeworkClientPage
      teacher={{
        id: teacher.id,
        userId: session.user.id,
        name: teacher.user?.name || "Teacher"
      }}
      classes={classesList}
      initialAssignments={formattedAssignments}
    />
  );
}
