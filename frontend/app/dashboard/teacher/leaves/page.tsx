import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import styles from "../../dashboard.module.css";
import TeacherLeavesClient from "./TeacherLeavesClient";

export default async function TeacherLeavesPage() {
  const session = await getServerSession(getAuthOptions());
  if (!session || session.user.role !== "TEACHER") return null;

  const teacher = await prisma.teacher.findUnique({
    where: { userId: session.user.id },
    include: {
      classTeacherOf: {
        include: {
          students: {
            select: { id: true },
          },
        },
      },
    },
  });

  if (!teacher || !teacher.classTeacherOf) {
    return (
      <div className={styles.dashboard}>
        <h1 className={styles.title}>Leave Applications</h1>
        <div className={styles.chartCard}>
          <p style={{ opacity: 0.7 }}>You are not assigned as a Class Teacher to any class.</p>
        </div>
      </div>
    );
  }

  const studentIds = teacher.classTeacherOf.students.map((s) => s.id);

  const leaves = await prisma.leaveRequest.findMany({
    where: {
      studentId: { in: studentIds },
    },
    include: {
      student: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          rollNumber: true,
          classId: true,
        },
      },
    },
    orderBy: { startDate: "desc" },
  });

  return (
    <div className={styles.dashboard}>
      <h1 className={styles.title} style={{ marginBottom: "1.5rem" }}>Leave Applications</h1>

      <TeacherLeavesClient initialLeaves={leaves} />
    </div>
  );
}
