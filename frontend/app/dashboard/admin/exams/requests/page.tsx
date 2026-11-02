import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import { redirect } from "next/navigation";
import AdminExamRequestsClient, { AdminExamRequestItem } from "./AdminExamRequestsClient";

export default async function AdminExamRequestsPage() {
  const session = await getServerSession(getAuthOptions());
  if (!session || !session.user) {
    redirect("/login");
  }

  const role = (session.user.role || "").toUpperCase();
  if (role !== "ADMIN") {
    redirect("/dashboard");
  }

  const requests = await prisma.examRequest.findMany({
    include: {
      class: true,
      requestedByStaff: {
        include: {
          user: true,
        },
      },
      teacher: {
        include: {
          user: true,
        },
      },
      requestSubjects: {
        include: {
          subject: true,
          teacher: {
            include: {
              user: true,
            },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const serializedRequests: AdminExamRequestItem[] = requests.map((r) => {
    const requesterUser = r.requestedByStaff?.user || r.teacher?.user;
    return {
      id: r.id,
      title: r.title,
      examType: r.examType,
      classId: r.classId,
      className: r.class?.name || "Class",
      section: r.sectionId || r.class?.section || "A",
      requestedByName: requesterUser?.name || "Staff / Teacher",
      requestedByEmail: requesterUser?.email || null,
      status: r.status,
      adminRemark: r.adminRemark || r.declineReason || null,
      createdAt: r.createdAt.toISOString(),
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
    };
  });

  return (
    <div style={{ padding: "clamp(0.5rem, 2vw, 1.5rem)" }}>
      <AdminExamRequestsClient requests={serializedRequests} />
    </div>
  );
}
