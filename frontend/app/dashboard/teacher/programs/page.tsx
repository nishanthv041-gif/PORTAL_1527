import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import styles from "../../dashboard.module.css";
import ProgramsTeacherClient from "./ProgramsTeacherClient";
import { redirect } from "next/navigation";

import { getTeacherByUserId } from "../teacherHelper";

export default async function TeacherProgramsPage() {
  const session = await getServerSession(getAuthOptions());
  if (!session) {
    redirect("/login");
  }
  if (session.user.role.toUpperCase() !== "TEACHER") {
    redirect("/dashboard");
  }

  const teacher = await getTeacherByUserId(session.user.id);

  // Teachers view published school programs
  const programs = await prisma.calendarEvent.findMany({
    where: { 
      type: "PROGRAM",
      isPublished: true 
    },
    orderBy: { date: "asc" }
  });

  return (
    <div className={styles.dashboard}>
      <div style={{ marginBottom: "2rem" }}>
        <h1 className={styles.title} style={{ margin: 0, marginBottom: "0.5rem" }}>School Programs</h1>
        <p style={{ color: "var(--text-secondary)", margin: 0 }}>
          View school programs, ceremonies, functions, and events targeted to your classes or school-wide.
        </p>
      </div>

      <ProgramsTeacherClient 
        programs={programs} 
        teacherClasses={teacher?.classes || []} 
      />
    </div>
  );
}
