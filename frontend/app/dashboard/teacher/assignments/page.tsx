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

  // Fetch teacher profile
  const teacher = await prisma.teacher.findUnique({
    where: { userId: session.user.id },
    include: {
      user: true,
      classes: {
        select: { id: true, name: true, section: true }
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

  // 1. Fetch ONLY subjects where this teacher is the assigned teacher.
  // Class teacher status does NOT allow managing or creating homework for other teachers' subjects!
  const assignedSubjects = await prisma.subject.findMany({
    where: {
      teacherId: teacher.id,
      isActive: true
    },
    include: {
      class: {
        select: { id: true, name: true, section: true }
      }
    },
    orderBy: [
      { class: { name: 'asc' } },
      { name: 'asc' }
    ]
  });

  // Group strictly assigned subjects by class
  const classMap = new Map<string, ClassWithSubjects>();
  assignedSubjects.forEach((s) => {
    if (!s.class) return;
    if (!classMap.has(s.class.id)) {
      classMap.set(s.class.id, {
        id: s.class.id,
        name: s.class.name,
        section: s.class.section,
        subjects: []
      });
    }
    classMap.get(s.class.id)!.subjects.push({
      id: s.id,
      name: s.name,
      code: s.code,
      teacherId: s.teacherId
    });
  });

  const classesList: ClassWithSubjects[] = Array.from(classMap.values());

  // 2. Fetch active assignments for this teacher's assigned subjects (History & Control)
  // When an admin reassigns a subject's teacher, subject.teacherId immediately transfers control to the new teacher!
  const rawMyAssignments = await prisma.assignment.findMany({
    where: {
      OR: [
        { subject: { teacherId: teacher.id } },
        { teacherId: teacher.id, subjectId: null }
      ]
    },
    include: {
      class: {
        select: { id: true, name: true, section: true }
      },
      subject: {
        select: { id: true, name: true, code: true, teacherId: true }
      },
      teacher: {
        include: { user: true }
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

  const formattedMyAssignments: AssignmentItem[] = rawMyAssignments.map(a => ({
    id: a.id,
    title: a.title,
    description: a.description,
    deadline: a.deadline.toISOString(),
    createdAt: a.createdAt.toISOString(),
    fileUrl: a.fileUrl,
    class: a.class,
    subject: a.subject ? {
      id: a.subject.id,
      name: a.subject.name,
      code: a.subject.code,
      teacherId: a.subject.teacherId,
      teacherName: a.teacher?.user?.name || teacher.user?.name || "Teacher"
    } : null,
    teacherName: a.teacher?.user?.name || "Teacher",
    teacherId: a.teacherId,
    isOwner: true,
    _count: a._count
  }));

  // 3. Class Portal: Find all classes this teacher is involved with (Class Teacher OR Subject Teacher)
  const involvedClassIds = Array.from(new Set([
    ...teacher.classes.map(c => c.id),
    ...assignedSubjects.map(s => s.classId)
  ]));

  // Query all active homework across these classes for the Class Portal "Today's Home Work" view
  const rawClassPortalAssignments = await prisma.assignment.findMany({
    where: {
      classId: { in: involvedClassIds }
    },
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
      _count: {
        select: { comments: true }
      }
    },
    orderBy: {
      createdAt: 'desc'
    }
  });

  const formattedClassPortalAssignments: AssignmentItem[] = rawClassPortalAssignments.map(a => {
    const isOwner = Boolean(
      (a.subject?.teacherId && a.subject.teacherId === teacher.id) ||
      a.teacherId === teacher.id
    );

    return {
      id: a.id,
      title: a.title,
      description: a.description,
      deadline: a.deadline.toISOString(),
      createdAt: a.createdAt.toISOString(),
      fileUrl: a.fileUrl,
      class: a.class,
      subject: a.subject ? {
        id: a.subject.id,
        name: a.subject.name,
        code: a.subject.code,
        teacherId: a.subject.teacherId,
        teacherName: a.subject.teacher?.user?.name || a.teacher?.user?.name || "Subject Staff"
      } : null,
      teacherName: a.teacher?.user?.name || "Teacher",
      teacherId: a.teacherId,
      isOwner,
      _count: a._count
    };
  });

  const involvedClasses = await prisma.class.findMany({
    where: { id: { in: involvedClassIds }, isActive: true },
    select: { id: true, name: true, section: true },
    orderBy: { name: 'asc' }
  });

  return (
    <HomeworkClientPage
      teacher={{
        id: teacher.id,
        userId: session.user.id,
        name: teacher.user?.name || "Teacher"
      }}
      classes={classesList}
      initialAssignments={formattedMyAssignments}
      classPortalAssignments={formattedClassPortalAssignments}
      involvedClasses={involvedClasses}
    />
  );
}
