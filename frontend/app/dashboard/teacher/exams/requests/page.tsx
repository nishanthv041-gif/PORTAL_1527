import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import { redirect } from "next/navigation";
import TeacherExamRequestsClient, {
  AvailableClass,
  ExamRequestRecord,
} from "./TeacherExamRequestsClient";

export default async function TeacherExamRequestsPage() {
  const session = await getServerSession(getAuthOptions());
  if (!session || !session.user) {
    redirect("/login");
  }

  const role = (session.user.role || "").toUpperCase();
  if (role !== "TEACHER" && role !== "ADMIN") {
    redirect("/dashboard");
  }

  const teacher = await prisma.teacher.findUnique({
    where: { userId: session.user.id },
    include: {
      user: true,
      classTeacherOf: {
        include: {
          subjects: {
            where: { isActive: true },
            include: { teacher: { include: { user: true } } },
            orderBy: { name: "asc" },
          },
        },
      },
      classes: {
        where: { isActive: true },
        include: {
          subjects: {
            where: { isActive: true },
            include: { teacher: { include: { user: true } } },
            orderBy: { name: "asc" },
          },
        },
      },
    },
  });

  if (!teacher && role !== "ADMIN") {
    return (
      <div style={{ padding: "2rem", textAlign: "center" }}>
        <h2>Teacher Profile Not Found</h2>
        <p style={{ color: "var(--text-secondary)" }}>
          Please ensure your account has a valid faculty profile configured.
        </p>
      </div>
    );
  }

  // Combine classes where teacher is either class teacher or subject teacher
  const rawClasses = [
    ...(teacher?.classTeacherOf ? [teacher.classTeacherOf] : []),
    ...(teacher?.classes || []),
  ];

  // If admin, load all active classes as well
  let allClasses = rawClasses;
  if (role === "ADMIN" && rawClasses.length === 0) {
    allClasses = await prisma.class.findMany({
      where: { isActive: true },
      include: {
        subjects: {
          where: { isActive: true },
          include: { teacher: { include: { user: true } } },
          orderBy: { name: "asc" },
        },
      },
      orderBy: [{ name: "asc" }, { section: "asc" }],
    });
  }

  const uniqueClassMap = new Map<string, typeof allClasses[0]>();
  allClasses.forEach((c) => {
    if (c && !uniqueClassMap.has(c.id)) {
      uniqueClassMap.set(c.id, c);
    }
  });

  const availableClasses: AvailableClass[] = Array.from(uniqueClassMap.values()).map((c) => ({
    id: c.id,
    name: c.name,
    section: c.section,
    isClassTeacher: c.id === teacher?.classTeacherOf?.id,
    subjects: c.subjects.map((s) => ({
      id: s.id,
      name: s.name,
      code: s.code,
      maxMarks: s.maxMarks || 100,
      passMarks: s.passMarks || 35,
      teacherName: s.teacher?.user?.name || null,
    })),
  }));

  // Fetch all exam requests raised by this teacher or for their class
  const classIds = availableClasses.map((c) => c.id);
  const requests = await prisma.examRequest.findMany({
    where: {
      OR: [
        ...(teacher ? [{ requestedByStaffId: teacher.id }] : []),
        ...(teacher ? [{ teacherId: teacher.id }] : []),
        ...(classIds.length > 0 ? [{ classId: { in: classIds } }] : []),
      ],
    },
    include: {
      class: true,
      requestSubjects: {
        include: {
          subject: true,
          teacher: { include: { user: true } },
        },
      },
      exam: {
        select: {
          id: true,
          status: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const serializedRequests: ExamRequestRecord[] = requests.map((r) => ({
    id: r.id,
    title: r.title,
    examType: r.examType,
    classId: r.classId,
    className: r.class?.name || "Class",
    section: r.sectionId || r.class?.section || "A",
    status: r.status,
    adminRemark: r.adminRemark || r.declineReason || null,
    createdAt: r.createdAt.toISOString(),
    examDates: r.examDates,
    remarks: r.remarks,
    subjects: r.requestSubjects.map((rs) => ({
      id: rs.id,
      subjectId: rs.subjectId,
      subjectName: rs.subject?.name || "Subject",
      maxMarks: rs.maxMarks,
      passMark: rs.passMark,
      examDate: rs.examDate ? rs.examDate.toISOString() : null,
      teacherName: rs.teacher?.user?.name || null,
    })),
    exam: r.exam,
  }));

  return (
    <div style={{ padding: "clamp(0.5rem, 2vw, 1.5rem)" }}>
      <TeacherExamRequestsClient
        classes={availableClasses}
        requests={serializedRequests}
      />
    </div>
  );
}
