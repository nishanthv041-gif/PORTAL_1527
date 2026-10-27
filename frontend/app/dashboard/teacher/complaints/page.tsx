import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import styles from "../../dashboard.module.css";
import TeacherComplaintsClient from "./TeacherComplaintsClient";

import { getTeacherWithStudents } from "../teacherHelper";

export default async function TeacherComplaintsPage() {
  const session = await getServerSession(getAuthOptions());
  if (!session) return null;

  const teacher = await getTeacherWithStudents(session.user.id);

  if (!teacher) return null;

  // Extract unique students
  const studentMap = new Map();
  teacher.classes.forEach(c => {
    c.students.forEach(s => {
      if (!studentMap.has(s.id)) {
        studentMap.set(s.id, {
          id: s.id,
          name: `${s.firstName} ${s.lastName}`,
          rollNo: s.rollNumber,
          className: `${c.name} - ${c.section}`
        });
      }
    });
  });

  const students = Array.from(studentMap.values());

  const complaints = await prisma.complaint.findMany({
    where: { teacherId: teacher.id },
    include: { student: true },
    orderBy: { date: 'desc' }
  });

  return (
    <div className={styles.dashboard}>
      <h1 className={styles.title}>Complaints & Issues</h1>
      
      <TeacherComplaintsClient
        complaints={complaints}
        teacherId={teacher.id}
        students={students}
      />
    </div>
  );
}
